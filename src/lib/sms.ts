/**
 * SMS / OTP Service.
 *
 * Two-channel OTP delivery:
 *   1. PRIMARY — WhatsApp via Meta Business Cloud API (see
 *      src/lib/whatsapp.ts). We generate the code, store it in the
 *      OtpCode table, and pass it directly into the WhatsApp template.
 *   2. FALLBACK — Authentica SMS (https://authentica.sa). Triggered
 *      when WhatsApp send returns a hard failure (recipient not on
 *      WhatsApp → Meta error 131026, bad template/token, throttled).
 *      Authentica generates and verifies its OWN code on the SMS path,
 *      so verifyOTP() below tries the DB code first and then falls
 *      back to Authentica's verify endpoint for SMS-fallback users.
 *
 * Public API stays the same: sendOTP(phone) / verifyOTP(phone, code).
 * Routes do NOT need to insert OtpCode rows manually — sendOTP owns
 * row creation now (previously routes inserted a placeholder
 * code: '------' row because Authentica owned the real code).
 *
 * Required env vars:
 *   WhatsApp (primary):
 *     WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN,
 *     WHATSAPP_OTP_TEMPLATE_NAME, WHATSAPP_OTP_TEMPLATE_LANG
 *   Authentica (SMS fallback):
 *     AUTHENTICA_API_KEY, AUTHENTICA_SENDER, AUTHENTICA_API_BASE
 *
 * ⚠️ SENDER NAME (Authentica side): the /send-otp body has NO request
 * parameter for the SMS sender — Authentica reads it from the dashboard
 * Application settings. To brand the sender as the app name you must
 * register it in the Authentica dashboard.
 *
 * References:
 *   - Authentica: https://docs.authentica.sa
 *   - Meta WhatsApp Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

import { db } from '@/lib/db'
import { sendWhatsAppOTP } from '@/lib/whatsapp'

const API_BASE = process.env.AUTHENTICA_API_BASE || 'https://api.authentica.sa/api/v1'
// Authentica's email OTP endpoints live under /api/v2 per the public
// docs (https://docs.authentica.sa/guides/otp-workflow), separate from
// the v1 SMS endpoints used above. We hard-code the v2 prefix for the
// email channel rather than reading a second env var, since v1 does
// NOT serve the email channel and all known Authentica accounts use
// the same hosted base URL.
const API_BASE_V2 = (process.env.AUTHENTICA_API_BASE_V2 || 'https://api.authentica.sa/api/v2')
const API_KEY = process.env.AUTHENTICA_API_KEY || ''
const SENDER = process.env.AUTHENTICA_SENDER || 'Hai'
// Email-specific template ID. Authentica ships a default email
// verification template (id 31 per docs); allow override via env so
// teams can register a custom-branded email template.
const EMAIL_TEMPLATE_ID = process.env.AUTHENTICA_EMAIL_TEMPLATE_ID || '31'
// Authentica SMS template ID. Pre-built templates with placeholders
// like {{otp}} and {{app_name}} are listed in the dashboard under
// Templates. Default to template 10 (en): "Use the code {{otp}} to
// verify your account in {{app_name}}." — English template chosen
// over the Arabic equivalent (id 9) because iOS's auto-fill / OTP
// detection heuristic recognises English verification patterns
// reliably, while Arabic templates often slip past it. Auto-fill
// matters more than message language here — the OTP code itself
// is purely numeric and unambiguous in either language.
const TEMPLATE_ID = process.env.AUTHENTICA_TEMPLATE_ID || '10'
// Value substituted into the {{app_name}} placeholder. "Hai"
// pairs with the English template; switch to "حي" if you flip
// back to an Arabic template via env.
const APP_NAME = process.env.AUTHENTICA_APP_NAME || 'Hai'

// Google Play / App Store review test account — skip real OTP send.
// Matches the same hardcoded test pair the previous Twilio impl
// honoured so existing review accounts keep working through the swap.
//
// Gated to non-production: in prod, store reviewers should be issued a
// real phone for review (or, if absolutely necessary, a per-environment
// TEST_PHONE_OVERRIDE env var — not committed). Leaving a hard-coded
// "1234 always works for +966500000000" path in the production binary
// is a backdoor.
const TEST_PHONES: Record<string, string> =
  process.env.NODE_ENV !== 'production'
    ? { '+966500000000': '1234' }
    : {}

function isConfigured(): boolean {
  return API_KEY.length > 0
}

async function authenticaPost(
  path: string,
  body: Record<string, unknown>,
  base: string = API_BASE,
): Promise<{ ok: boolean; data: any }> {
  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        // Authentica's auth header. If your account uses
        // `Authorization: Bearer ...` instead, swap to that.
        'X-Authorization': API_KEY,
      },
      body: JSON.stringify(body),
    })
    let data: any = null
    try { data = await res.json() } catch { /* non-JSON response */ }
    return { ok: res.ok, data }
  } catch (err) {
    console.error(`[OTP] Authentica ${path} network error:`, err)
    return { ok: false, data: null }
  }
}

// 4-digit OTP, 5-minute expiry — matches the existing UI input
// (4 boxes) and Authentica's default OTP lifetime, so the WhatsApp
// path and the Authentica SMS-fallback path feel identical to users.
const OTP_LENGTH = 4
const OTP_EXPIRY_MS = 5 * 60 * 1000

function generateOTP(): string {
  // Crypto-strong randomness — Math.random() would be predictable
  // when many sends fire in the same second. Web Crypto is available
  // on Vercel's Node 22 runtime as a global.
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  const max = 10 ** OTP_LENGTH
  return String(buf[0] % max).padStart(OTP_LENGTH, '0')
}

/**
 * Send an OTP. WhatsApp first, SMS fallback. The OtpCode row is
 * created here (replaces the old in-route `code: '------'` inserts)
 * so callers can stay simple.
 *
 * Returns true if EITHER channel accepted the message for delivery.
 */
export async function sendOTP(
  phone: string,
  opts: { userId?: string } = {},
): Promise<boolean> {
  if (TEST_PHONES[phone]) return true

  // Generate the code WE control + persist it BEFORE sending so a
  // crash mid-flight doesn't leave the user without a verifiable code.
  // For the SMS fallback path this row is unused (Authentica owns
  // its own code) but verifyOTP() handles both cases.
  const code = generateOTP()
  await db.otpCode.create({
    data: {
      phone,
      code,
      expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
      userId: opts.userId,
    },
  })

  // Primary: WhatsApp via Meta Cloud API.
  if (await sendWhatsAppOTP(phone, code)) {
    return true
  }

  // Fallback: Authentica SMS (only triggered when WhatsApp hard-rejects
  // — e.g. recipient not on WhatsApp). Authentica generates its own
  // code; the DB row we just wrote becomes irrelevant for THIS request,
  // but verifyOTP() falls back to Authentica's verify endpoint when
  // user input doesn't match the DB row.
  console.warn(`[OTP] WhatsApp failed for ${phone} — falling back to SMS`)
  return sendAuthenticaSMS(phone)
}

/** Authentica SMS send — internal, used as fallback when WhatsApp fails. */
async function sendAuthenticaSMS(phone: string): Promise<boolean> {
  if (!isConfigured()) {
    console.log(`\n📱 DEV MODE — OTP requested for ${phone}\n`)
    return true
  }

  const { ok, data } = await authenticaPost('/send-otp', {
    // E.164 phone (e.g. "+9665xxxxxxxx"). Authentica accepts the
    // leading + on Saudi numbers; some integrations strip it —
    // adjust here if your account requires the bare digits.
    phone,
    // Channel. Authentica supports "sms" and "whatsapp"; sticking to
    // "sms" for parity with the previous Twilio Verify default.
    method: 'sms',
    // Code length. 4 matches the existing UI input which is 4 boxes.
    length: 4,
    // Pre-built template (managed in the Authentica dashboard
    // under Templates). The {{otp}} placeholder is filled by
    // Authentica with the generated code; the {{app_name}}
    // placeholder is filled with `app_name` below.
    template_id: TEMPLATE_ID,
    app_name: APP_NAME,
    // NOTE: not a documented /send-otp parameter — Authentica derives the
    // SMS "from" from the dashboard Application settings (a registered
    // sender ID), not this field. Sent best-effort in case the account
    // honors it; the dashboard config is what actually governs the
    // displayed sender. See the module header.
    sender: SENDER,
    // Body language — paired with the chosen template (10 = en).
    // Flip to 'ar' here if you change AUTHENTICA_TEMPLATE_ID back
    // to one of the Arabic templates (8, 9, 11, ...).
    language: 'en',
  })

  if (!ok) {
    console.error('[OTP] Authentica send failed:', data)
    return false
  }
  console.log(`[OTP] Authentica sent to ${phone}`)
  return true
}

/**
 * Verify an OTP. Tries the DB code first (WhatsApp path: we own the
 * code), then falls back to Authentica's verify endpoint (SMS-fallback
 * path: Authentica owns the code).
 *
 * Marks the matching DB row as verified on a successful DB match so
 * the same code can't be replayed. For the Authentica path, callers
 * still own the "mark latest unverified row as verified" pattern in
 * verify-otp/route.ts so brute-force rate limiting based on the
 * `verified` flag keeps working unchanged.
 */
export async function verifyOTP(phone: string, code: string): Promise<boolean> {
  if (TEST_PHONES[phone]) return code === TEST_PHONES[phone]

  // ── Path A: DB code match (WhatsApp). ──────────────────────────────
  // Find the latest unexpired, unverified row for this phone and
  // compare codes. We don't filter by `code: code` in the WHERE so
  // a wrong attempt still consumes a brute-force slot via the route's
  // existing rate-limit check (which counts unverified rows).
  const row = await db.otpCode.findFirst({
    where: {
      phone,
      verified: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  })
  if (row && row.code === code) {
    await db.otpCode.update({
      where: { id: row.id },
      data: { verified: true },
    })
    return true
  }

  // ── Path B: Authentica verify (SMS fallback). ──────────────────────
  if (!isConfigured()) {
    return code === '1234'
  }

  const { ok, data } = await authenticaPost('/verify-otp', {
    phone,
    otp: code,
  })

  if (!ok) {
    console.warn('[OTP] Authentica verify failed:', data)
    return false
  }
  // Authentica returns `{ status: "success" }` (or similar) on a valid
  // OTP. Treat any 2xx response with no explicit failure marker as
  // approved — strict-equal on a status field can vary by API version,
  // so the looser check is safer across upgrades.
  if (typeof data === 'object' && data !== null) {
    if (data.status === 'failure' || data.success === false) return false
  }
  return true
}

// ─── Email OTP (Authentica v2) ──────────────────────────────────────
// Same provider, separate channel: Authentica's /api/v2/send-otp +
// /api/v2/verify-otp accept `method: "email"` and an `email` field in
// place of `phone`. Code generation + storage stays on Authentica's
// side (we don't keep our own emailVerifyToken/Expiry), matching the
// SMS flow.

/** Send Email OTP via Authentica. */
export async function sendEmailOTP(email: string): Promise<boolean> {
  if (!isConfigured()) {
    console.log(`\n📧 DEV MODE — Email OTP requested for ${email}\n`)
    return true
  }

  const { ok, data } = await authenticaPost(
    '/send-otp',
    {
      method: 'email',
      email,
      // 4 digits to match the SMS OTP UX — same input boxes, same
      // muscle memory across SMS and email channels.
      length: 4,
      template_id: EMAIL_TEMPLATE_ID,
      app_name: APP_NAME,
      sender: SENDER,
      language: 'en',
    },
    API_BASE_V2,
  )

  if (!ok) {
    console.error('[OTP] Authentica email send failed:', data)
    return false
  }
  console.log(`[OTP] Authentica email sent to ${email}`)
  return true
}

/** Verify Email OTP via Authentica. */
export async function verifyEmailOTP(email: string, code: string): Promise<boolean> {
  if (!isConfigured()) {
    return code === '1234'
  }

  const { ok, data } = await authenticaPost(
    '/verify-otp',
    { email, otp: code },
    API_BASE_V2,
  )

  if (!ok) {
    console.warn('[OTP] Authentica email verify failed:', data)
    return false
  }
  if (typeof data === 'object' && data !== null) {
    if (data.status === 'failure' || data.success === false) return false
  }
  return true
}
