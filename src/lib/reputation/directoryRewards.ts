/**
 * Pure reward logic for Directory contributions. NO db import, so it's
 * fully unit-testable. The DB write (idempotent award + daily cap) lives
 * in awardDirectoryReputation.ts.
 *
 * Reputation is awarded ONLY for an APPROVED contribution. Every other
 * status (PENDING_REVIEW / REJECTED / DUPLICATE / NEEDS_EDIT) yields 0.
 */

export type ContributionType =
  | 'CREATE_PLACE' | 'EDIT_PLACE' | 'ADD_PHOTO' | 'FIX_LOCATION'
  | 'ADD_CONTACT' | 'REPORT_DUPLICATE' | 'REPORT_CLOSED'

export type ContributionStatus =
  | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'DUPLICATE' | 'NEEDS_EDIT'

export type ReputationReason =
  | 'DIRECTORY_PLACE_APPROVED'
  | 'DIRECTORY_PLACE_HIGH_QUALITY_APPROVED'
  | 'DIRECTORY_EDIT_APPROVED'
  | 'DIRECTORY_PHOTO_APPROVED'
  | 'DIRECTORY_LOCATION_FIX_APPROVED'
  | 'DIRECTORY_CONTACT_APPROVED'
  | 'DIRECTORY_DUPLICATE_REPORT_ACCEPTED'
  | 'DIRECTORY_CLOSED_REPORT_ACCEPTED'

/** Max reputation a user can earn from Directory contributions per day. */
export const DIRECTORY_DAILY_CAP = 15
/** sourceType written to ReputationEvent for all directory rewards. */
export const DIRECTORY_SOURCE_TYPE = 'directory_contribution'

/** After this many REJECTED contributions inside the window, the user is
 *  rate-limited from submitting new ones (or de-prioritized). */
export const REJECTED_RESTRICTION_THRESHOLD = 3
export const REJECTED_RESTRICTION_WINDOW_DAYS = 7
export const REJECTED_RESTRICTION_HOURS = 24

/**
 * Base points for a contribution. Returns 0 unless status === 'APPROVED'.
 * High quality only lifts CREATE_PLACE (+5 → +8).
 */
export function pointsForContribution(
  type: ContributionType,
  status: ContributionStatus,
  highQuality = false,
): number {
  if (status !== 'APPROVED') return 0
  switch (type) {
    case 'CREATE_PLACE':     return highQuality ? 8 : 5
    case 'FIX_LOCATION':     return 3
    case 'REPORT_DUPLICATE': return 3
    case 'REPORT_CLOSED':    return 3
    case 'EDIT_PLACE':       return 2
    case 'ADD_CONTACT':      return 2
    case 'ADD_PHOTO':        return 2
    default:                 return 0
  }
}

export function reasonForContribution(type: ContributionType, highQuality = false): ReputationReason {
  switch (type) {
    case 'CREATE_PLACE':     return highQuality ? 'DIRECTORY_PLACE_HIGH_QUALITY_APPROVED' : 'DIRECTORY_PLACE_APPROVED'
    case 'EDIT_PLACE':       return 'DIRECTORY_EDIT_APPROVED'
    case 'ADD_PHOTO':        return 'DIRECTORY_PHOTO_APPROVED'
    case 'FIX_LOCATION':     return 'DIRECTORY_LOCATION_FIX_APPROVED'
    case 'ADD_CONTACT':      return 'DIRECTORY_CONTACT_APPROVED'
    case 'REPORT_DUPLICATE': return 'DIRECTORY_DUPLICATE_REPORT_ACCEPTED'
    case 'REPORT_CLOSED':    return 'DIRECTORY_CLOSED_REPORT_ACCEPTED'
  }
}

/**
 * Clamp an award to the remaining daily allowance. Never negative.
 *   already=15 → 0; already=14, pts=5 → 1; already=0, pts=8 → 8.
 */
export function cappedAward(dailyTotal: number, points: number, cap = DIRECTORY_DAILY_CAP): number {
  if (points <= 0) return 0
  if (dailyTotal >= cap) return 0
  return Math.min(points, cap - dailyTotal)
}

/**
 * The full award decision as a pure function — so idempotency, the
 * per-(place,type) anti-farm guard, and the daily cap are all unit-
 * testable. awardDirectoryReputation gathers the real facts from the DB
 * and calls this.
 */
export function decideAward(opts: {
  base: number             // pointsForContribution(...) — already 0 unless APPROVED
  alreadyAwarded: boolean  // a ReputationEvent already exists for this source (re-approve)
  priorSamePlaceType: boolean // user already has an APPROVED contribution for this place+type
  dailyTotal: number       // directory points already earned today
  cap?: number
}): { award: number; reason: 'ok' | 'no_points' | 'already' | 'dup_place_type' | 'capped' } {
  if (opts.base <= 0) return { award: 0, reason: 'no_points' }
  if (opts.alreadyAwarded) return { award: 0, reason: 'already' }
  if (opts.priorSamePlaceType) return { award: 0, reason: 'dup_place_type' }
  const award = cappedAward(opts.dailyTotal, opts.base, opts.cap ?? DIRECTORY_DAILY_CAP)
  return { award, reason: award > 0 ? 'ok' : 'capped' }
}

/**
 * High-quality place heuristic — drives +8 vs +5 on CREATE_PLACE.
 * Requires NOT a duplicate plus ≥4 of 5 content signals. Never required
 * to APPROVE; only affects the reward size.
 */
export function assessPlaceQuality(p: {
  name?: string | null
  category?: string | null
  latitude?: number | null
  longitude?: number | null
  addressText?: string | null
  description?: string | null
  phone?: string | null
  whatsapp?: string | null
  website?: string | null
  instagram?: string | null
  potentialDuplicate?: boolean | null
}): boolean {
  if (p.potentialDuplicate) return false
  const signals = [
    !!(p.name && p.name.trim().length >= 3),
    !!(p.category && p.category !== 'OTHER'),
    p.latitude != null && p.longitude != null,
    !!(p.addressText?.trim() || p.description?.trim()),
    !!(p.phone || p.whatsapp || p.website || p.instagram),
  ]
  return signals.filter(Boolean).length >= 4
}
