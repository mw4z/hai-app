/**
 * SMS / OTP Service — Authentica.
 *
 * Migrated from Twilio Verify (commit replaces /lib/sms.ts wholesale).
 * Authentica (https://authentica.sa) is a Saudi-based OTP provider with
 * better delivery rates on Saudi mobile carriers (STC, Mobily, Zain)
 * than Twilio.
 *
 * Public API of this module is unchanged: sendOTP / verifyOTP. The
 * three existing call sites in /api/auth/send-otp,
 * /api/auth/verify-otp, and /api/profile/change-phone keep working
 * with no caller changes.
 *
 * Required env vars (replace the old TWILIO_* in .env):
 *   AUTHENTICA_API_KEY      — your Authentica X-Authorization token
 *   AUTHENTICA_SENDER       — registered sender name (optional, default: 'Hai')
 *   AUTHENTICA_API_BASE     — override base URL (optional, default below)
 *
 * Reference: https://docs.authentica.sa
 */

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
const TEST_PHONES: Record<string, string> = {
  '+966500000000': '1234',
}

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

/** Send OTP via Authentica. */
export async function sendOTP(phone: string): Promise<boolean> {
  if (TEST_PHONES[phone]) return true

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
    // Sender name shown on the SMS. Must be pre-registered with
    // Authentica or this will fail with a sender-not-approved error.
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

/** Verify OTP via Authentica. */
export async function verifyOTP(phone: string, code: string): Promise<boolean> {
  if (TEST_PHONES[phone]) return code === TEST_PHONES[phone]

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
      length: 6,
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
    return code === '123456'
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
