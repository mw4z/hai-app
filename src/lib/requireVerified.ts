import { NextResponse } from 'next/server'
import { db } from './db'
import { cacheGet, cacheSet, cacheDelete } from './cache'

/**
 * Server-side guard for actions that require a location-verified user.
 *
 * A user is "verified" when `User.addressVerified === true` — set only
 * when their GPS coordinates passed verifyNeighborhoodAssignment() in
 * the /api/auth/complete-profile route.
 *
 * Users who entered via the "continue with limited access" path have
 * addressVerified = false. They can browse, but any action that affects
 * other users or neighborhood content must be gated by this helper.
 *
 * Usage:
 *   const gate = await requireVerified(session.userId)
 *   if (gate) return gate  // returns a 403 NextResponse
 *
 * Returns null when the user is verified — continue normally.
 * Returns a 403 NextResponse with error='not_verified' otherwise.
 */
export async function requireVerified(userId: string): Promise<NextResponse | null> {
  // Tiny 30s cache to avoid re-querying on every write within a short window
  const cacheKey = `verify:${userId}`
  const cached = cacheGet<boolean>(cacheKey)
  let verified: boolean
  if (cached === null) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { addressVerified: true },
    })
    verified = !!user?.addressVerified
    cacheSet(cacheKey, verified, 30_000)
  } else {
    verified = cached
  }

  if (!verified) {
    return NextResponse.json(
      {
        error: 'not_verified',
        message: 'التحقق من الموقع مطلوب لهذه الميزة',
      },
      { status: 403 },
    )
  }
  return null
}

/** Invalidate the verify cache for a user (call after setting addressVerified=true) */
export function invalidateVerifiedCache(userId: string) {
  cacheDelete(`verify:${userId}`)
}
