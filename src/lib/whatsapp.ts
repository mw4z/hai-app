/**
 * WhatsApp Business Cloud API (Meta) — OTP delivery.
 *
 * Direct integration with Meta's Graph API, NOT through Authentica's
 * WhatsApp channel. Lets us own the OTP code (so verifyOTP can match
 * against OtpCode.code locally) and use a WhatsApp template registered
 * in our own Meta Business account.
 *
 * Required envs (set on Vercel):
 *   WHATSAPP_PHONE_NUMBER_ID     — Phone Number ID from Meta WA Business
 *   WHATSAPP_ACCESS_TOKEN        — Permanent System User access token
 *   WHATSAPP_OTP_TEMPLATE_NAME   — Approved AUTHENTICATION template name
 *   WHATSAPP_OTP_TEMPLATE_LANG   — Template language code, default "en"
 *   WHATSAPP_GRAPH_VERSION       — Optional, default "v21.0"
 *
 * Template requirements (configure in Meta Business Suite):
 *   - Category: AUTHENTICATION  (lower cost than UTILITY/MARKETING and
 *     unlocks the native "copy code" button)
 *   - One body text variable: the OTP code
 *   - One copy-code button variable: same code (Meta auto-pastes it)
 *
 * Behaviour:
 *   - Returns true ONLY when the Graph API accepts the message for
 *     delivery. Hard-rejects (recipient not on WhatsApp → error code
 *     131026, bad template/token, throttle) come back as 4xx and we
 *     return false so the caller can fall back to SMS.
 *   - Returns false (without throwing) when envs are missing so the
 *     caller's SMS fallback engages cleanly in dev/staging environments
 *     that haven't been provisioned with WhatsApp credentials yet.
 */

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || ''
const ACCESS_TOKEN    = process.env.WHATSAPP_ACCESS_TOKEN || ''
const TEMPLATE_NAME   = process.env.WHATSAPP_OTP_TEMPLATE_NAME || ''
const TEMPLATE_LANG   = process.env.WHATSAPP_OTP_TEMPLATE_LANG || 'en'
const GRAPH_VERSION   = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0'

function isConfigured(): boolean {
  return PHONE_NUMBER_ID.length > 0 && ACCESS_TOKEN.length > 0 && TEMPLATE_NAME.length > 0
}

export async function sendWhatsAppOTP(phone: string, code: string): Promise<boolean> {
  if (!isConfigured()) {
    console.warn('[OTP] WhatsApp not configured — skipping WhatsApp send')
    return false
  }

  // Meta's Graph API accepts the recipient as either +9665xxxxxxxxx or
  // 9665xxxxxxxxx. Strip the leading + to match the format Meta echoes
  // in their docs (avoids any encoding pitfalls in older Graph versions).
  const to = phone.replace(/^\+/, '')
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: TEMPLATE_NAME,
          language: { code: TEMPLATE_LANG },
          components: [
            // Body — fills the {{1}} placeholder in the approved
            // template with the OTP code.
            {
              type: 'body',
              parameters: [{ type: 'text', text: code }],
            },
            // Copy-code button — required by AUTHENTICATION-category
            // templates that have the "copy code" button enabled.
            // Same code value as the body, Meta auto-pastes it into
            // the user's clipboard on tap. If the template has no
            // button, Graph API silently ignores this component.
            {
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [{ type: 'text', text: code }],
            },
          ],
        },
      }),
    })

    if (!res.ok) {
      let body: unknown = null
      try { body = await res.json() } catch { /* non-JSON response */ }
      console.error(`[OTP] WhatsApp send failed (${res.status}):`, body)
      return false
    }
    console.log(`[OTP] WhatsApp sent to ${phone}`)
    return true
  } catch (err) {
    console.error('[OTP] WhatsApp network error:', err)
    return false
  }
}
