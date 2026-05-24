/**
 * Neighborhood membership — single source of truth for what each
 * membership state may do. Pure functions (no Prisma import) so routes
 * (server enforcement) AND the UI (show/hide) AND unit tests all share
 * the exact same rules. NEVER gate on UI alone — every sensitive action
 * calls these on the server.
 *
 *   VERIFIED_RESIDENT — GPS- or mod-confirmed; full rights.
 *   CLAIMED_RESIDENT  — picked this hood as home while outside; limited
 *                       (feed + comment + REQUEST-only posts) until verified.
 *   OUTSIDE           — no resident claim (visitor / pre-onboarding).
 */

export type Membership = 'VERIFIED_RESIDENT' | 'CLAIMED_RESIDENT' | 'OUTSIDE'

/** Cooldown before a user may change their claimed home again (30 days). */
export const HOME_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000

export function isVerifiedResident(m: Membership | null | undefined): boolean {
  return m === 'VERIFIED_RESIDENT'
}

/** Has a home at all (verified OR claimed) — the bar to act in a hood. */
export function hasHomeClaim(m: Membership | null | undefined): boolean {
  return m === 'VERIFIED_RESIDENT' || m === 'CLAIMED_RESIDENT'
}

// ── Per-action permissions ────────────────────────────────────────────
// VERIFIED-only (trust-sensitive):
export function canCreateEmergencyAlert(m: Membership): boolean { return m === 'VERIFIED_RESIDENT' }
export function canSetHighPriority(m: Membership): boolean { return m === 'VERIFIED_RESIDENT' }
export function canVote(m: Membership): boolean { return m === 'VERIFIED_RESIDENT' }
export function canCreatePoll(m: Membership): boolean { return m === 'VERIFIED_RESIDENT' }
/** Counted as a real resident for trust-sensitive logic (quorum, etc.). */
export function countsAsVerifiedResident(m: Membership): boolean { return m === 'VERIFIED_RESIDENT' }

// CLAIMED + VERIFIED:
export function canComment(m: Membership): boolean { return hasHomeClaim(m) }
export function canCreatePost(m: Membership): boolean { return hasHomeClaim(m) }
/** A claimed resident's posts are restricted exactly like an outside
 *  request: REQUEST intent only, no HIGH/CRITICAL, no marketplace. */
export function postsRestrictedToRequest(m: Membership): boolean { return m === 'CLAIMED_RESIDENT' }
/** Directory suggestions from a claimed resident must be reviewed. */
export function directorySuggestionNeedsReview(m: Membership): boolean { return m !== 'VERIFIED_RESIDENT' }

// ── Badge ────────────────────────────────────────────────────────────
export interface MembershipBadge { state: 'verified' | 'claimed' | 'outside'; ar: string; en: string; ur: string }

export function membershipBadge(m: Membership): MembershipBadge | null {
  switch (m) {
    case 'VERIFIED_RESIDENT':
      return { state: 'verified', ar: 'ساكن مؤكد', en: 'Verified resident', ur: 'تصدیق شدہ رہائشی' }
    case 'CLAIMED_RESIDENT':
      return { state: 'claimed', ar: 'مرتبط بالحي', en: 'Linked to neighborhood', ur: 'محلے سے منسلک' }
    case 'OUTSIDE':
      return { state: 'outside', ar: 'من خارج الحي', en: 'Outside', ur: 'محلے سے باہر' }
  }
}
