// SMS OTP Service — Custom SMS via toll-free number, Twilio Verify as fallback
import twilio from 'twilio'

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)
const VERIFY_SID = process.env.TWILIO_VERIFY_SERVICE_SID!

// Google Play review test account — skip real SMS
const TEST_PHONE = '+966500000000'
const TEST_OTP = '123456'

/** Generate a random 6-digit OTP code */
export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

/** Send OTP via custom SMS (toll-free number) */
export async function sendOTP(phone: string, code: string): Promise<boolean> {
  if (phone === TEST_PHONE) return true

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.log(`\n📱 DEV MODE — OTP for ${phone}: ${code}\n`)
    return true
  }

  try {
    const msg = await client.messages.create({
      body: `Your Hai verification code is: ${code}\n\nرمز التحقق لتطبيق حي: ${code}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone,
    })
    console.log(`[OTP] SMS sent to ${phone}, sid: ${msg.sid}`)
    return msg.status !== 'failed'
  } catch (error: any) {
    console.error('[OTP] SMS send error:', error?.message || error)
    return false
  }
}

/** Verify OTP — always checked against DB (code stored when sent) */
export async function verifyOTP(phone: string, code: string): Promise<boolean> {
  if (phone === TEST_PHONE) return code === TEST_OTP

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return code === '123456'
  }

  // Verified against DB in the route handler
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
