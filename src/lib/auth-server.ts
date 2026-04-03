import { getSession } from './auth'
import { db } from './db'
import type { JWTPayload } from './auth'

/** getSession + verify user is not deleted/banned. Use in API routes only. */
export async function getValidatedSession(): Promise<JWTPayload | null> {
  const session = await getSession()
  if (!session) return null

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { status: true, deletedAt: true },
  })
  if (!user || user.deletedAt || user.status === 'BANNED_PERM') {
    return null
  }

  return session
}
