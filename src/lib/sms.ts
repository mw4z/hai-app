// SMS OTP Service — custom codes sent via Twilio SMS
// Includes Apple domain-bound format for iOS auto-fill
import twilio from 'twilio'

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

const APP_DOMAIN = 'hai-app.net'

// Google Play review test account — skip real SMS
const TEST_PHONE = '+966500000000'
const TEST_OTP = '123456'

/** Generate a random 6-digit OTP code */
export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

/** Send OTP via Twilio SMS with iOS auto-fill domain hint */
export async function sendOTP(phone: string, code: string): Promise<boolean> {
  if (phone === TEST_PHONE) return true

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.log(`\n📱 DEV MODE — OTP for ${phone}: ${code}\n`)
    return true
  }

  try {
    const msg = await client.messages.create({
      body: `رمز التحقق لحي: ${code}\n\n@${APP_DOMAIN} #${code}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone,
    })

    console.log(`[OTP] Sent to ${phone}, sid: ${msg.sid}`)
    return msg.status !== 'failed'
  } catch (error) {
    console.error('[OTP] Send error:', error)
    return false
  }
}

/** Verify OTP code against stored value */
export function verifyOTPCode(storedCode: string, inputCode: string, phone: string): boolean {
  if (phone === TEST_PHONE) return inputCode === TEST_OTP
  return storedCode === inputCode
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
