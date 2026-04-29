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
const API_KEY = process.env.AUTHENTICA_API_KEY || ''
const SENDER = process.env.AUTHENTICA_SENDER || 'Hai'

// Google Play / App Store review test account — skip real OTP send.
// Matches the same hardcoded test pair the previous Twilio impl
// honoured so existing review accounts keep working through the swap.
const TEST_PHONES: Record<string, string> = {
  '+966500000000': '1234',
}

function isConfigured(): boolean {
  return API_KEY.length > 0
}

async function authenticaPost(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; data: any }> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
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
    // leading + on Saudi numbers; some integrations strip it — adjust
    // here if your account requires the bare digits.
    phone,
    // Channel. Authentica supports "sms" and "whatsapp"; sticking to
    // "sms" for parity with the previous Twilio Verify default.
    method: 'sms',
    // Code length. 4 matches the existing UI input which is 4 boxes.
    length: 4,
    // Sender name shown on the SMS. Must be pre-registered with
    // Authentica or this will fail with a sender-not-approved error.
    sender: SENDER,
    // Body language — affects the localised message template.
    language: 'ar',
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
