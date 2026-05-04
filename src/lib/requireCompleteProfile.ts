import { NextResponse } from 'next/server'
import { db } from './db'
import { cacheGet, cacheSet, cacheDelete } from './cache'

/**
 * Server-side guard for actions that require a fully-onboarded user.
 *
 * A user is "complete" when `User.name` is non-null AND, after trim,
 * has at least 2 characters. The OTP flow creates User rows BEFORE
 * onboarding (so we have somewhere to attach the JWT), and a user can
 * close the app between OTP verify and onboarding submission — those
 * accounts must not access feed / posting / DM / etc.
 *
 * Usage:
 *   const gate = await requireCompleteProfile(session.userId)
 *   if (gate) return gate  // returns a 403 NextResponse
 *
 * Returns null when the profile is complete — continue normally.
 * Returns a 403 NextResponse with error='profile_incomplete' otherwise.
 *
 * Mirrors requireVerified.ts in shape so call sites can stack both
 * gates (incomplete → complete → verified) consistently.
 */
export async function requireCompleteProfile(userId: string): Promise<NextResponse | null> {
  const cacheKey = `complete:${userId}`
  const cached = cacheGet<{ complete: boolean; isSuperAdmin: boolean }>(cacheKey)
  let complete: boolean
  let isSuperAdmin: boolean
  if (cached === null) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { name: true, role: true },
    })
    complete = !!user?.name && user.name.trim().length >= 2
    isSuperAdmin = user?.role === 'SUPER_ADMIN'
    cacheSet(cacheKey, { complete, isSuperAdmin }, 30_000)
  } else {
    complete = cached.complete
    isSuperAdmin = cached.isSuperAdmin
  }

  // SUPER_ADMIN bypasses — same exemption pattern as requireVerified.
  if (isSuperAdmin) return null

  if (!complete) {
    return NextResponse.json(
      {
        error: 'profile_incomplete',
        message: 'يجب إكمال البيانات الشخصية أولاً',
      },
      { status: 403 },
    )
  }
  return null
}

/** Invalidate the complete-profile cache for a user (call after onboarding submit). */
export function invalidateCompleteProfileCache(userId: string) {
  cacheDelete(`complete:${userId}`)
}
