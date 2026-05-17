/**
 * Pure reputation level/badge/benefit functions — safe for client components.
 * No database imports. Used by feed scoring, post limits, report thresholds.
 *
 * Tiers:
 *   new      (0–49)     — just joined, building trust
 *   active   (50–149)   — participating regularly
 *   trusted  (150–399)  — proven contributor
 *   top      (400+)     — established community leader
 */

export type RepLevel = 'new' | 'active' | 'trusted' | 'top'

// ─── Tier Thresholds ────────────────────────────────────────────────────────

const TIERS: { level: RepLevel; min: number }[] = [
  { level: 'top',     min: 400 },
  { level: 'trusted', min: 150 },
  { level: 'active',  min: 50 },
  { level: 'new',     min: 0 },
]

export function getRepLevel(rep: number): RepLevel {
  for (const t of TIERS) {
    if (rep >= t.min) return t.level
  }
  return 'new'
}

// ─── Tier Metadata ──────────────────────────────────────────────────────────
//
// Visual system: unified dot badge (●) with tier color.
// No mixed emoji styles. Same shape, only color changes.
//   new     → gray dot (hidden — no badge shown)
//   active  → blue dot
//   trusted → green dot
//   top     → amber dot

interface TierInfo {
  level: RepLevel
  ar: string
  en: string
  ur: string
  dot: string           // colored dot character for inline display
  color: string         // tailwind text color
  bgColor: string       // tailwind bg for badge pill
  dotColor: string      // tailwind for the dot itself
}

const TIER_INFO: Record<RepLevel, TierInfo> = {
  top:     { level: 'top',     ar: 'عضو مميز',   en: 'Distinguished',    ur: 'ممتاز رکن',     dot: '●', color: 'text-amber-600 dark:text-amber-400',  bgColor: 'bg-amber-50 dark:bg-amber-900/20',  dotColor: 'text-amber-500' },
  trusted: { level: 'trusted', ar: 'موثوق',      en: 'Trusted',         ur: 'قابل اعتماد',   dot: '●', color: 'text-green-600 dark:text-green-400',  bgColor: 'bg-green-50 dark:bg-green-900/20',  dotColor: 'text-green-500' },
  active:  { level: 'active',  ar: 'نشط',        en: 'Active',          ur: 'سرگرم',         dot: '●', color: 'text-blue-600 dark:text-blue-400',   bgColor: 'bg-blue-50 dark:bg-blue-900/20',   dotColor: 'text-blue-500' },
  new:     { level: 'new',     ar: 'جديد',        en: 'New',             ur: 'نیا',            dot: '',  color: 'text-gray-400',                      bgColor: 'bg-gray-50 dark:bg-gray-800',      dotColor: 'text-gray-300' },
}

export function getRepBadge(rep: number): TierInfo {
  return TIER_INFO[getRepLevel(rep)]
}

// ─── Progress Tracking ──────────────────────────────────────────────────────

interface TierProgress {
  current: TierInfo
  next: TierInfo | null
  currentRep: number
  nextThreshold: number | null
  progress: number
  remaining: number | null
}

export function getTierProgress(rep: number): TierProgress {
  const currentLevel = getRepLevel(rep)
  const current = TIER_INFO[currentLevel]

  const currentMin = TIERS.find(t => t.level === currentLevel)!.min
  const nextTier = TIERS.find(t => t.min > currentMin && rep < t.min)
    ? TIERS.filter(t => t.min > currentMin).sort((a, b) => a.min - b.min)[0]
    : null

  if (!nextTier) {
    return { current, next: null, currentRep: rep, nextThreshold: null, progress: 100, remaining: null }
  }

  const rangeSize = nextTier.min - currentMin
  const withinRange = rep - currentMin
  const progress = Math.min(100, Math.round((withinRange / rangeSize) * 100))

  return {
    current,
    next: TIER_INFO[nextTier.level],
    currentRep: rep,
    nextThreshold: nextTier.min,
    progress,
    remaining: nextTier.min - rep,
  }
}

// ─── Functional Benefits ────────────────────────────────────────────────────

/**
 * Feed boost: subtle addition to feed score.
 * Reduced to prevent ranking domination.
 *   new=0, active=1.2, trusted=1.5, top=1.8
 */
export function getFeedBoost(rep: number): number {
  const level = getRepLevel(rep)
  switch (level) {
    case 'top':     return 1.8
    case 'trusted': return 1.5
    case 'active':  return 1.2
    default:        return 0
  }
}

/** Daily post limit per tier */
export function getPostLimit(rep: number): number {
  const level = getRepLevel(rep)
  switch (level) {
    case 'top':     return 12
    case 'trusted': return 8
    case 'active':  return 5
    default:        return 3
  }
}

/**
 * Report weight: how much a single report from this user counts.
 * Used with a constant threshold (REPORT_HIDE_THRESHOLD = 4.0 weighted points).
 *
 * Example: 3 reports from "new" users = 3.0 weight → not hidden.
 *          3 reports from "trusted" users = 3.6 weight → not hidden.
 *          4 reports from "new" users = 4.0 weight → hidden.
 *          3 "trusted" + 1 "new" = 4.6 → hidden.
 *
 * This prevents coordinated abuse: you need real volume OR trusted reporters.
 */
export const REPORT_HIDE_THRESHOLD = 4.0

export function getReportWeight(rep: number): number {
  const level = getRepLevel(rep)
  switch (level) {
    case 'top':     return 1.4
    case 'trusted': return 1.2
    default:        return 1.0  // new + active both = 1.0
  }
}

/**
 * Author-tier-aware HIDE threshold (weighted units) for posts.
 *
 *   weightedScore   = Σ getReportWeight(reporter.reputation) over distinct reporters
 *   shouldHide      = weightedScore ≥ getAuthorHideThreshold(author.reputation)
 *   shouldRemove    = weightedScore ≥ getAuthorRemoveThreshold(author.reputation)
 *
 * Calibrated so that at the floor reporter weight (1.0 for new+active),
 * the COUNT of reports needed to hide matches the legacy count-based
 * thresholds: new=2, active=4, trusted=5, top=6. Higher-tier reporters
 * (trusted=1.2x, top=1.4x) reach thresholds with fewer total reports —
 * which is the entire point of weighting. The maximum single-reporter
 * weight (1.4) is below every author tier's hide threshold ≥ 2.0, so
 * one report can NEVER auto-hide a post on its own.
 *
 * Reviews intentionally do NOT use this — see PlaceReview report
 * route for the flat-3-distinct-reporters rule, kept simpler until
 * we have more operational confidence.
 */
export function getAuthorHideThreshold(authorRep: number): number {
  const level = getRepLevel(authorRep)
  switch (level) {
    case 'top':     return 6.0
    case 'trusted': return 5.0
    case 'active':  return 4.0
    default:        return 2.0  // new
  }
}

export function getAuthorRemoveThreshold(authorRep: number): number {
  return getAuthorHideThreshold(authorRep) + 2.0
}

/** @deprecated Use getReportWeight + getAuthorHideThreshold instead.
 *  Kept exported for any legacy caller — the posts/report route has
 *  migrated to the weighted system. */
export function getReportThreshold(rep: number): number {
  const level = getRepLevel(rep)
  switch (level) {
    case 'top':     return 6
    case 'trusted': return 5
    case 'active':  return 4
    default:        return 2
  }
}

/**
 * Rating weight: reduced bias, used only as tie-break / confidence signal.
 *   new/active: 1.0x
 *   trusted: 1.1x
 *   top: 1.2x
 *   new accounts (<7 days): 0.5x
 */
export function getRatingWeight(rep: number, accountAgeDays: number): number {
  if (accountAgeDays < 7) return 0.5
  const level = getRepLevel(rep)
  switch (level) {
    case 'top':     return 1.2  // was 1.5
    case 'trusted': return 1.1  // was 1.2
    default:        return 1.0
  }
}
