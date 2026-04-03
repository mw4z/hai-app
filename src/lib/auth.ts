import { SignJWT, jwtVerify } from 'jose'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-secret-change-in-production'
)

export interface JWTPayload {
  userId: string
  phone: string
  role: string
}

export async function signToken(payload: JWTPayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(JWT_SECRET)
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as unknown as JWTPayload
  } catch {
    return null
  }
}

// Track last seen — throttle to once per 30s to avoid DB spam
const lastSeenCache = new Map<string, number>()

export async function getSession(): Promise<JWTPayload | null> {
  const { cookies } = await import('next/headers')
  const cookieStore = cookies()
  const token = cookieStore.get('hai_token')?.value
  if (!token) return null
  const session = await verifyToken(token)
  if (session) {
    const now = Date.now()
    const last = lastSeenCache.get(session.userId) || 0
    if (now - last > 30_000) {
      lastSeenCache.set(session.userId, now)
      // Fire-and-forget — don't block the request
      import('@/lib/db').then(({ db }) => {
        db.user.update({
          where: { id: session.userId },
          data: { lastSeenAt: new Date() },
        }).catch(() => {})
      })
    }
  }
  return session
}


export function formatSaudiPhone(phone: string): string {
  // Normalize Saudi phone: 0512345678 → +966512345678
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.startsWith('966')) return `+${cleaned}`
  if (cleaned.startsWith('0')) return `+966${cleaned.slice(1)}`
  return `+966${cleaned}`
}

export function isValidSaudiPhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '')
  // Saudi mobile: 05xxxxxxxx (10 digits) or 5xxxxxxxx (9 digits)
  return /^(0?5[0-9]{8})$/.test(cleaned)
}
