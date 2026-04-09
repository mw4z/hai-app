// SMS OTP Service — Twilio Verify
import twilio from 'twilio'

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)
const VERIFY_SID = process.env.TWILIO_VERIFY_SERVICE_SID!

// Google Play review test account — skip real SMS
const TEST_PHONES: Record<string, string> = {
  '+966500000000': '1234',
}

/** Send OTP via Twilio Verify */
export async function sendOTP(phone: string): Promise<boolean> {
  if (TEST_PHONES[phone]) return true

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.log(`\n📱 DEV MODE — OTP requested for ${phone}\n`)
    return true
  }

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

/** Verify OTP via Twilio Verify API */
export async function verifyOTP(phone: string, code: string): Promise<boolean> {
  if (TEST_PHONES[phone]) return code === TEST_PHONES[phone]

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return code === '1234'
  }

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
