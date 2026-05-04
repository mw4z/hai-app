import { NextResponse } from 'next/server'
import { requireUserReady } from './requireUserReady'

/**
 * Single-purpose helper: enforces JUST location verification, NOT
 * profile completeness. Exists for the rare endpoint that legitimately
 * needs to run for a profile-incomplete user (e.g. the location-
 * verification endpoint itself, or an admin tool that records
 * verification state).
 *
 * Most authenticated endpoints want BOTH gates — call requireUserReady
 * directly with default opts. This helper is the explicit-name option
 * when only the location half is needed.
 */
export async function requireLocationVerified(userId: string): Promise<NextResponse | null> {
  const result = await requireUserReady(userId, { requireProfile: false, requireLocation: true })
  return result.ok ? null : result.response
}
