import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { code } = await req.json()

  if (!code) {
    return NextResponse.json({ error: 'الرمز مطلوب' }, { status: 400 })
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      emailVerifyToken: true,
      emailVerifyExpiry: true,
    },
  })

  if (!user) {
    return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 })
  }

  // Check token matches and is not expired
  if (
    !user.emailVerifyToken ||
    user.emailVerifyToken !== code ||
    !user.emailVerifyExpiry ||
    user.emailVerifyExpiry < new Date()
  ) {
    return NextResponse.json({ error: 'رمز خاطئ أو منتهي الصلاحية' }, { status: 400 })
  }

  // Mark email as verified, clear token
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
