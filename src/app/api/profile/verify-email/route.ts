import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { verifyEmailOTP } from '@/lib/sms'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { code } = await req.json()
  if (!code) {
    return NextResponse.json({ error: 'الرمز مطلوب' }, { status: 400 })
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { email: true },
  })
  if (!user || !user.email) {
    return NextResponse.json({ error: 'لم يتم إرسال رمز' }, { status: 400 })
  }

  const ok = await verifyEmailOTP(user.email, String(code).trim())
  if (!ok) {
    return NextResponse.json({ error: 'رمز خاطئ أو منتهي الصلاحية' }, { status: 400 })
  }

  await db.user.update({
    where: { id: session.userId },
    data: {
      emailVerified: true,
      emailVerifyToken: null,
      emailVerifyExpiry: null,
    },
  })

  return NextResponse.json({ success: true })
}
