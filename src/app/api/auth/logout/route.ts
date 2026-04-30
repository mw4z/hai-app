import { NextResponse } from 'next/server'

/**
 * POST /api/auth/logout
 *
 * Clears the hai_token cookie. Uses an explicit Set-Cookie with
 * matching attributes + epoch expiry rather than `cookies().delete()`
 * — some Android WebViews (Capacitor, older Chrome) ignore the
 * cleared cookie unless every attribute (path, sameSite, secure)
 * matches the original Set-Cookie. Belt-and-suspenders: maxAge 0 +
 * expires epoch.
 */
export async function POST() {
  const { cookies } = await import('next/headers')
  cookies().set('hai_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  })
  return NextResponse.json({ success: true })
}
