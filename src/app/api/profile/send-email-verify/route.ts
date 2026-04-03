import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { email } = await req.json()

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!email || !emailRegex.test(email)) {
    return NextResponse.json({ error: 'البريد الإلكتروني غير صحيح' }, { status: 400 })
  }

  // Generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString()

  // Expiry: 10 minutes from now
  const expiry = new Date(Date.now() + 10 * 60 * 1000)

  // Save to user record
  await db.user.update({
    where: { id: session.userId },
    data: {
      email: email.trim().toLowerCase(),
      emailVerified: false,
      emailVerifyToken: code,
      emailVerifyExpiry: expiry,
    },
  })

  // In dev: log the code to console
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Email verification code for ${email}: ${code}`)
  }

  return NextResponse.json({ success: true })
}
