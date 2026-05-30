import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify, SignJWT } from 'jose'

/*
 * Sessions use a 7-day SLIDING expiration: active users remain
 * signed in, while inactive sessions still expire after 7 days.
 *
 * The cookie + JWT TTL is unchanged (7 days base) — see
 * src/lib/auth.ts signToken and src/app/api/auth/verify-otp.
 * This middleware re-signs the JWT and rewrites the cookie on the
 * NEXT authenticated request that comes in after the token has
 * aged past REFRESH_AFTER_S (currently 24 h). Result:
 *   - Daily user → never logs out. Each daily request bumps the
 *     7-day window forward.
 *   - User who returns on day 7 → still signed in, gets a fresh
 *     7 days starting from that visit.
 *   - User who returns on day 8 → JWT exp has passed, jwtVerify
 *     rejects it, no refresh happens, session is logged out
 *     (correct behaviour).
 *   - Stolen token → still capped at 7 days from last legitimate
 *     use, not promoted to 30 days as the simple bump alternative
 *     would have done.
 */

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || '')

// Don't rewrite the cookie on EVERY request — only once a day per
// user. Comparing JWT iat (issued-at) to now and only refreshing
// when the token has aged past this threshold means a chatty user
// hitting 50 API calls/minute generates at most one Set-Cookie
// per 24 h.
const REFRESH_AFTER_S = 24 * 60 * 60       // 24 hours
const SESSION_TTL_S   = 7 * 24 * 60 * 60   // 7 days (base TTL — unchanged)

interface JWTPayloadLite {
  userId: string
  phone: string
  role: string
  iat?: number
}

async function maybeRefreshSession(req: NextRequest, res: NextResponse): Promise<NextResponse> {
  const token = req.cookies.get('hai_token')?.value
  if (!token) return res                            // (req 9) Unauthenticated → no refresh.

  let payload: JWTPayloadLite
  try {
    const verified = await jwtVerify(token, JWT_SECRET)
    payload = verified.payload as unknown as JWTPayloadLite
  } catch {
    // (req 8) Invalid OR expired token. jwtVerify throws on any
    // exp/iat/signature failure. We leave the cookie alone so the
    // route handler can see "no session" via getSession().
    return res
  }

  if (!payload.iat) return res                      // Token without iat — don't risk a refresh.
  const nowS = Math.floor(Date.now() / 1000)
  const ageS = nowS - payload.iat
  // (req 4) Only refresh tokens older than ~24 h so we don't write
  // a Set-Cookie on every authenticated request.
  if (ageS < REFRESH_AFTER_S) return res

  // (req 5) Re-sign with a fresh 7-day window from NOW.
  const fresh = await new SignJWT({
    userId: payload.userId,
    phone: payload.phone,
    role: payload.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET)

  // (req 6, 7) Cookie attributes mirror src/app/api/auth/verify-otp/route.ts.
  res.cookies.set('hai_token', fresh, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL_S,
    path: '/',
  })
  return res
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname
  const ua = req.headers.get('user-agent') || ''
  const isNative = ua.includes('HaiNativeApp')
  const isApi = pathname.startsWith('/api/')

  // Browser redirect — applies only to page routes. API requests
  // and native-app requests fall through to the auth-refresh
  // path below. The marketing-site bounce is a UX choice, not a
  // security gate, so leaving APIs out of it is fine.
  if (!isNative && !isApi) {
    return NextResponse.redirect('https://hai-app.net')
  }

  // (req 3, 10) Sliding refresh runs for native app pages AND for
  // every API request the matcher already filters down to. Static
  // assets, /_next, favicons, manifests, sw.js, well-known files,
  // public share routes, and anything with a file extension are
  // excluded by the matcher config below — so this never fires on
  // /favicon.ico, /icon-192.png, /sw.js, etc.
  const res = NextResponse.next()
  return maybeRefreshSession(req, res)
}

export const config = {
  // Matcher unchanged for browser-redirect logic EXCEPT that the
  // 'api' exclusion was removed so sliding refresh ALSO covers
  // API endpoints (most authenticated traffic on the app is API
  // calls, so excluding them would defeat the purpose). Static
  // assets and public pages are still excluded.
  matcher: [
    '/((?!_next|favicon|icons|images|manifest|sw|workbox|privacy|contact|child-safety|i/|s/|\\.well-known|.*\\.).*)',
  ],
}
