import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, formatSaudiPhone, isValidSaudiPhone } from '@/lib/auth'
import { sendOTP, verifyOTP } from '@/lib/sms'

const OTP_EXPIRY_MS = 5 * 60 * 1000

// POST /api/profile/change-phone — two-step: send OTP, then verify
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { step, phone, code } = await req.json()

  // Step 1: send OTP to new phone
  if (step === 'send') {
    if (!phone || !isValidSaudiPhone(phone)) {
      return NextResponse.json({ error: 'رقم جوال غير صحيح' }, { status: 400 })
    }

    const formatted = formatSaudiPhone(phone)

    // Check if phone is already taken by another user
    const existing = await db.user.findUnique({ where: { phone: formatted } })
    if (existing && existing.id !== session.userId) {
      return NextResponse.json({ error: 'الرقم مستخدم من حساب آخر' }, { status: 409 })
    }

    // Check if same as current
    const currentUser = await db.user.findUnique({ where: { id: session.userId }, select: { phone: true } })
    if (currentUser?.phone === formatted) {
      return NextResponse.json({ error: 'هذا رقمك الحالي' }, { status: 400 })
    }

    await db.otpCode.create({
      data: {
        phone: formatted,
        code: '------',
        expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
        userId: session.userId,
      },
    })

    const sent = await sendOTP(formatted)
    if (!sent) return NextResponse.json({ error: 'فشل إرسال الرمز' }, { status: 500 })

    return NextResponse.json({ success: true, formatted })
  }

  // Step 2: verify OTP and change phone
  if (step === 'verify') {
    if (!phone || !code) return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 })

    const formatted = formatSaudiPhone(phone)

    const isValid = await verifyOTP(formatted, code)
    if (!isValid) {
      return NextResponse.json({ error: 'رمز التحقق غير صحيح أو منتهي' }, { status: 400 })
    }

    // Mark DB record as verified
    const latestOtp = await db.otpCode.findFirst({
      where: { phone: formatted, verified: false },
      orderBy: { createdAt: 'desc' },
    })
    if (latestOtp) {
      await db.otpCode.update({ where: { id: latestOtp.id }, data: { verified: true } })
    }

    // Update phone number
    await db.user.update({ where: { id: session.userId }, data: { phone: formatted } })

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Invalid step' }, { status: 400 })
}
