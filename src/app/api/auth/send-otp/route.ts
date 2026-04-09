import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendOTP, generateOTP } from '@/lib/sms'
import { formatSaudiPhone, isValidSaudiPhone } from '@/lib/auth'

const OTP_EXPIRY_MS = 5 * 60 * 1000 // 5 minutes

export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json()

    if (!phone || !isValidSaudiPhone(phone)) {
      return NextResponse.json({ error: 'رقم الجوال غير صحيح' }, { status: 400 })
    }

    const formattedPhone = formatSaudiPhone(phone)

    // Rate limit: max 3 OTPs per phone per 10 minutes
    const recentOtps = await db.otpCode.count({
      where: {
        phone: formattedPhone,
        createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
      },
    })

    if (recentOtps >= 3) {
      console.log(`[RATE_LIMIT] OTP 10min: phone=${formattedPhone}, count=${recentOtps}`)
      return NextResponse.json(
        { error: 'طلبات كثيرة، انتظر 10 دقائق' },
        { status: 429 }
      )
    }

    // Hourly limit: max 5 per phone per hour
    const hourlyOtps = await db.otpCode.count({
      where: { phone: formattedPhone, createdAt: { gte: new Date(Date.now() - 3600_000) } },
    })
    if (hourlyOtps >= 5) {
      console.log(`[RATE_LIMIT] OTP hourly: phone=${formattedPhone}, count=${hourlyOtps}`)
      return NextResponse.json(
        { error: 'حاول لاحقاً' },
        { status: 429 }
      )
    }

    // Find or create user
    let user = await db.user.findUnique({ where: { phone: formattedPhone } })
    if (!user) {
      user = await db.user.create({ data: { phone: formattedPhone } })
    }

    // Generate code and store in DB
    const code = generateOTP()
    await db.otpCode.create({
      data: {
        phone: formattedPhone,
        code,
        expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
        userId: user.id,
      },
    })

    // Send via Twilio SMS (not Verify) — includes iOS auto-fill domain hint
    const sent = await sendOTP(formattedPhone, code)
    if (!sent) {
      return NextResponse.json({ error: 'فشل إرسال الرمز' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('send-otp error:', error)
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}
