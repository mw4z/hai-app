import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { formatSaudiPhone, signToken } from '@/lib/auth'
import { apiError } from '@/lib/validation'
import { verifyOTP } from '@/lib/sms'

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MINUTES = 15

export async function POST(req: NextRequest) {
  try {
    const { phone, code } = await req.json()

    if (!phone || !code) {
      return NextResponse.json(apiError('بيانات ناقصة', 400), { status: 400 })
    }

    const formattedPhone = formatSaudiPhone(phone)

    // Brute force protection
    const lockoutWindow = new Date(Date.now() - LOCKOUT_MINUTES * 60_000)
    const recentFailed = await db.otpCode.count({
      where: {
        phone: formattedPhone,
        verified: false,
        createdAt: { gte: lockoutWindow },
      },
    })

    if (recentFailed >= MAX_FAILED_ATTEMPTS) {
      const anySuccess = await db.otpCode.findFirst({
        where: {
          phone: formattedPhone,
          verified: true,
          createdAt: { gte: lockoutWindow },
        },
      })
      if (!anySuccess) {
        return NextResponse.json(
          apiError('محاولات كثيرة، انتظر 15 دقيقة', 429, 'OTP_LOCKOUT'),
          { status: 429 }
        )
      }
    }

    // Verify via Twilio Verify API
    const isValid = await verifyOTP(formattedPhone, code)

    // Mark DB record
    if (isValid) {
      const latestOtp = await db.otpCode.findFirst({
        where: { phone: formattedPhone, verified: false },
        orderBy: { createdAt: 'desc' },
      })
      if (latestOtp) {
        await db.otpCode.update({ where: { id: latestOtp.id }, data: { verified: true } })
      }
    }

    if (!isValid) {
      return NextResponse.json(
        apiError('رمز التحقق غير صحيح أو منتهي', 400, 'OTP_INVALID'),
        { status: 400 }
      )
    }

    // Get user
    const user = await db.user.findUnique({ where: { phone: formattedPhone } })
    if (!user) {
      return NextResponse.json(apiError('المستخدم غير موجود', 404), { status: 404 })
    }

    // Mark phone as verified
    const isNewUser = !user.isVerified
    await db.user.update({
      where: { id: user.id },
      data: { isVerified: true },
    })

    // Issue JWT
    const token = await signToken({
      userId: user.id,
      phone: formattedPhone,
      role: user.role,
    })

    // Set cookie (7 days — was 30, see audit H-4 + signToken comment)
    const { cookies } = await import('next/headers')
    cookies().set('hai_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })

    return NextResponse.json({ success: true, isNewUser })
  } catch (error) {
    console.error('[ERROR] verify-otp:', error)
    return NextResponse.json(apiError('خطأ في الخادم', 500), { status: 500 })
  }
}
