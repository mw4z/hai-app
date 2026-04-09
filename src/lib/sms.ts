// SMS OTP Service — Twilio Verify (primary) with custom SMS fallback for iOS autofill
import twilio from 'twilio'

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)
const VERIFY_SID = process.env.TWILIO_VERIFY_SERVICE_SID!
const APP_DOMAIN = 'hai-app.net'

// Google Play review test account — skip real SMS
const TEST_PHONE = '+966500000000'
const TEST_OTP = '123456'

/** Generate a random 6-digit OTP code */
export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

/** Send OTP — tries custom SMS with iOS autofill hint first, falls back to Twilio Verify */
export async function sendOTP(phone: string, code: string): Promise<boolean> {
  if (phone === TEST_PHONE) return true

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.log(`\n📱 DEV MODE — OTP for ${phone}: ${code}\n`)
    return true
  }

  // Try custom SMS first (enables iOS autofill with domain hint)
  if (process.env.TWILIO_PHONE_NUMBER) {
    try {
      const msg = await client.messages.create({
        body: `رمز التحقق لحي: ${code}\n\n@${APP_DOMAIN} #${code}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phone,
      })
      console.log(`[OTP] Custom SMS sent to ${phone}, sid: ${msg.sid}`)
      return msg.status !== 'failed'
    } catch (error) {
      console.warn('[OTP] Custom SMS failed, falling back to Twilio Verify:', error)
    }
  }

  // Fallback: Twilio Verify (always works, no phone number needed)
  try {
    const verification = await client.verify.v2
      .services(VERIFY_SID)
      .verifications.create({ to: phone, channel: 'sms' })
    console.log(`[OTP] Verify sent to ${phone}, status: ${verification.status}`)
    return verification.status === 'pending'
  } catch (error) {
    console.error('[OTP] Verify send error:', error)
    return false
  }
}

/** Verify OTP — checks DB first, falls back to Twilio Verify */
export async function verifyOTP(phone: string, code: string): Promise<boolean> {
  if (phone === TEST_PHONE) return code === TEST_OTP

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.log(`\n📱 DEV MODE — Verifying ${code} for ${phone}\n`)
    return code === '123456'
  }

  // If no TWILIO_PHONE_NUMBER, OTP was sent via Verify — verify with Verify API
  if (!process.env.TWILIO_PHONE_NUMBER) {
    try {
      const check = await client.verify.v2
        .services(VERIFY_SID)
        .verificationChecks.create({ to: phone, code })
      console.log(`[OTP] Verify check ${phone}, status: ${check.status}`)
      return check.status === 'approved'
    } catch (error) {
      console.error('[OTP] Verify check error:', error)
      return false
    }
  }

  // Custom SMS was used — code is verified against DB (handled in route)
  return true
}

/** Send a general SMS message (for urgent alerts) */
export async function sendSMS(phone: string, message: string): Promise<boolean> {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.log(`\n📱 DEV MODE — SMS to ${phone}: ${message}\n`)
    return true
  }

  try {
    const msg = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone,
    })
    return msg.status !== 'failed'
  } catch (error) {
    console.error('SMS send error:', error)
    return false
  }
}
