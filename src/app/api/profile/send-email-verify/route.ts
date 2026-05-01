import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { sendEmailOTP } from '@/lib/sms'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { email } = await req.json()

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!email || !emailRegex.test(email)) {
    return NextResponse.json({ error: 'البريد الإلكتروني غير صحيح' }, { status: 400 })
  }

  const normalized = email.trim().toLowerCase()

  // Save the candidate email (unverified) on the user record so the
  // verify step can re-read it later. Code lifecycle is owned by
  // Authentica — we no longer keep emailVerifyToken/Expiry locally.
  await db.user.update({
    where: { id: session.userId },
    data: {
      email: normalized,
      emailVerified: false,
      emailVerifyToken: null,
      emailVerifyExpiry: null,
    },
  })

  const sent = await sendEmailOTP(normalized)
  if (!sent) {
    return NextResponse.json({ error: 'تعذر إرسال الرمز' }, { status: 502 })
  }

  return NextResponse.json({ success: true })
}
