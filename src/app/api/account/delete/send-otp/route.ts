import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { sendOTP } from '@/lib/sms'

/**
 * POST /api/account/delete/send-otp
 *
 * Pre-step for self-service account deletion. Sends a fresh OTP to
 * the user's stored phone number. The user must then submit the code
 * with the actual DELETE request below to confirm intent.
 *
 * Why: account deletion is irreversible and (per audit C-2) was
 * previously protected only by the session cookie. A stolen / leaked
 * session token could wipe the account in one call. Requiring a fresh
 * OTP every time means an attacker who steals the cookie still needs
 * physical access to the user's phone to confirm.
 *
 * Rate limit: lean on Authentica's per-phone OTP rate limit (3/10min).
 * No additional client-side throttle here — repeated calls are cheap
 * for us and Authentica refuses excess sends with their own 429.
 */
export async function POST(_req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { phone: true, deletedAt: true },
  })
  if (!user) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  if (user.deletedAt) {
    return NextResponse.json({ error: 'already_deleted' }, { status: 400 })
  }
  if (!user.phone || user.phone.startsWith('deleted_')) {
    return NextResponse.json({ error: 'no_phone_on_file' }, { status: 400 })
  }

  const ok = await sendOTP(user.phone)
  if (!ok) {
    return NextResponse.json({ error: 'otp_send_failed' }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
