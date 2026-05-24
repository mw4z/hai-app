import { NextResponse } from 'next/server'

/**
 * Pure decision + transport layer for the auth gate.
 *
 * Lives in its own file (separate from requireUserReady.ts) so unit
 * tests can import it without dragging in the Prisma client. db.ts
 * throws at load time when DATABASE_URL is unset — fine for the app,
 * blocks `node --test` runs that don't set up a fixture DB.
 *
 * The convenience helper requireUserReady (in requireUserReady.ts)
 * is the I/O layer: fetches user from DB, calls into the pure
 * functions here. `withUserReady` route wrapper builds on that.
 */

export type UserReadyErrorCode =
  | 'PROFILE_INCOMPLETE'
  | 'LOCATION_UNVERIFIED'
  | 'UNAUTHORIZED'

export type Membership = 'VERIFIED_RESIDENT' | 'CLAIMED_RESIDENT' | 'OUTSIDE'

export interface UserReadyUser {
  id: string
  name: string | null
  role: string
  addressVerified: boolean
  membership: Membership
}

export type UserReadyDecision =
  | { ok: true; user: UserReadyUser }
  | { ok: false; code: UserReadyErrorCode }

export interface UserReadyOpts {
  requireProfile?: boolean
  requireLocation?: boolean
}

interface UserSnapshot {
  id: string
  name: string | null
  role: string
  addressVerified: boolean
  membership?: Membership
}

/**
 * Pure decision: pass an already-fetched user record (or null), get a
 * decision back. No I/O, no NextResponse, fully deterministic.
 *
 * SUPER_ADMIN bypasses LOCATION verification but NEVER profile
 * completeness — completeness is identity, not a permission. A blank-
 * named admin renders as nothing in the UI, which is an integrity bug
 * we'd rather catch than silently allow.
 */
export function requireUserReadyDecision(
  user: UserSnapshot | null,
  opts: UserReadyOpts = { requireProfile: true, requireLocation: true },
): UserReadyDecision {
  if (!user) {
    return { ok: false, code: 'UNAUTHORIZED' }
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN'

  if (opts.requireProfile !== false) {
    const trimmed = user.name?.trim() ?? ''
    if (trimmed.length < 2) {
      if (isSuperAdmin) {
        console.warn(
          '[requireUserReady] SUPER_ADMIN with incomplete profile blocked',
          { userId: user.id },
        )
      }
      return { ok: false, code: 'PROFILE_INCOMPLETE' }
    }
  }

  if (opts.requireLocation !== false && !isSuperAdmin) {
    // The bar to ACT in a neighborhood is a home claim (verified OR
    // claimed). OUTSIDE (no claim) can't post/comment yet. CLAIMED users
    // pass here; trust-sensitive routes add their own VERIFIED-only check
    // (see src/lib/membership.ts). Legacy data without membership falls
    // back to addressVerified so nothing regresses pre-migration.
    const hasClaim = user.membership
      ? user.membership !== 'OUTSIDE'
      : user.addressVerified
    if (!hasClaim) {
      return { ok: false, code: 'LOCATION_UNVERIFIED' }
    }
  }

  return {
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      addressVerified: user.addressVerified,
      membership: user.membership ?? (user.addressVerified ? 'VERIFIED_RESIDENT' : 'OUTSIDE'),
    },
  }
}

/**
 * Transport mapping: decision code → wire-format NextResponse. The
 * ONLY place that knows the public { error, next } contract.
 */
export function toUserReadyResponse(code: UserReadyErrorCode): NextResponse {
  switch (code) {
    case 'PROFILE_INCOMPLETE':
      return NextResponse.json(
        { error: 'profile_incomplete', next: '/onboarding' },
        { status: 403 },
      )
    case 'LOCATION_UNVERIFIED':
      return NextResponse.json(
        { error: 'location_unverified', next: '/onboarding' },
        { status: 403 },
      )
    case 'UNAUTHORIZED':
      return NextResponse.json(
        { error: 'unauthorized', next: '/login' },
        { status: 401 },
      )
  }
}
