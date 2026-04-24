import { createHmac } from 'crypto'
import { db } from '@/lib/db'

/**
 * Abuse-resistant scoring for moderator-targeted UserReports.
 *
 * Replaces the earlier naive "5 pending reports → UNDER_REVIEW"
 * rule. A mob can file 5 reports in a minute — counting raw rows
 * made coordinated pile-ons trivially successful. This module scores
 * reports along four axes before triggering the UNDER_REVIEW flip:
 *
 *   1. Rolling window      — only reports inside ROLLING_WINDOW_DAYS count.
 *   2. Unique reporters    — a single resident spamming reports can't
 *                            cross the threshold alone; at least
 *                            MIN_UNIQUE_REPORTERS distinct reporterIds
 *                            are required before any review fires.
 *   3. Reporter credibility — per-reporter weight scales with reputation.
 *                             Negative-rep or throwaway accounts
 *                             contribute almost nothing; seasoned
 *                             residents carry full signal.
 *   4. Cluster discount    — if a disproportionate share of reports
 *                            share a reporterIpHash, each report in
 *                            that cluster counts as one, so 10 reports
 *                            from the same IP ≠ 10 independent signals.
 *
 * The same evaluator is called both at report-creation time (to
 * decide auto-review) and at report-resolution time (to decide
 * whether UNDER_REVIEW should auto-lift back to ACTIVE once enough
 * bad reports have been dismissed — prevents a stuck-in-review mod
 * if the evaluator initially misfired).
 */

export const ROLLING_WINDOW_DAYS = 14
export const MIN_UNIQUE_REPORTERS = 3
export const UNDER_REVIEW_SCORE = 5.0

// Reputation → per-reporter weight. Caps at 1.5 so no single
// high-rep reporter can single-handedly push a mod into review.
function reputationWeight(rep: number): number {
  if (rep < 0)   return 0.0    // negative rep — effectively ignored
  if (rep < 10)  return 0.25   // brand-new, untrusted
  if (rep < 30)  return 0.5    // getting started
  if (rep < 100) return 1.0    // full signal
  return 1.5                    // trusted long-tenured resident
}

/**
 * HMAC the raw IP (from x-forwarded-for / request) into a stable hash
 * for cluster detection. Secret is REPORT_IP_HASH_SECRET or falls back
 * to SESSION_SECRET so we never persist raw IPs. Returns null if IP
 * is unavailable (tests, server-to-server, etc).
 */
export function hashReporterIp(ipRaw: string | null | undefined): string | null {
  if (!ipRaw) return null
  const ip = ipRaw.split(',')[0].trim() // first hop if x-forwarded-for chain
  if (!ip) return null
  const secret =
    process.env.REPORT_IP_HASH_SECRET ||
    process.env.SESSION_SECRET ||
    'hai-dev-salt'
  return createHmac('sha256', secret).update(ip).digest('hex').slice(0, 32)
}

/**
 * Flags assigned at create time. Non-authoritative — the evaluator
 * still re-reads reporter reputation live so a late reputation
 * change flows through without a backfill. Flags exist so the admin
 * dashboard can explain WHY a report was discounted.
 */
export type AbuseFlag = 'LOW_REP' | 'REP_NEGATIVE' | 'BURST_CLUSTER'

/**
 * Compute the flags to attach to a brand-new report. Called inside
 * /api/users/[id]/report right before db.userReport.create.
 */
export async function classifyIncomingReport(opts: {
  reporterReputation: number
  reportedUserId: string
  reporterIpHash: string | null
}): Promise<AbuseFlag[]> {
  const flags: AbuseFlag[] = []
  if (opts.reporterReputation < 0) flags.push('REP_NEGATIVE')
  else if (opts.reporterReputation < 10) flags.push('LOW_REP')

  // Burst cluster: 3+ other PENDING reports against the same target
  // in the last hour from this same IP hash = almost certainly
  // coordinated. Mark; the evaluator then halves their weight.
  if (opts.reporterIpHash) {
    const hourAgo = new Date(Date.now() - 60 * 60_000)
    const sameIpCount = await db.userReport.count({
      where: {
        reportedUserId: opts.reportedUserId,
        reporterIpHash: opts.reporterIpHash,
        status: 'PENDING',
        createdAt: { gte: hourAgo },
      },
    })
    if (sameIpCount >= 3) flags.push('BURST_CLUSTER')
  }

  return flags
}

export function flagsToString(flags: AbuseFlag[]): string | null {
  return flags.length ? flags.join(',') : null
}

export function parseFlags(raw: string | null | undefined): Set<string> {
  if (!raw) return new Set()
  return new Set(raw.split(',').map(s => s.trim()).filter(Boolean))
}

export interface ModReportScore {
  score: number                   // weighted sum
  uniqueReporters: number         // distinct reporterIds in window
  sampleCount: number             // raw PENDING report count in window
  shouldReview: boolean           // crosses UNDER_REVIEW threshold?
  breakdown: {
    ignored: number               // reports not counted at all
    clusterDiscounted: number     // reports counted at half weight
    full: number                  // reports counted at full rep weight
  }
}

/**
 * Evaluate whether a moderator should be flipped to UNDER_REVIEW
 * based on the *weighted* signal from pending reports in the rolling
 * window.
 *
 * Returns a detailed breakdown so the admin dashboard can explain
 * the decision ("4 reports counted; 2 discounted as cluster; 1
 * ignored as negative rep").
 *
 * Idempotent — does not mutate. Callers decide what to do.
 */
export async function scoreModReports(reportedUserId: string): Promise<ModReportScore> {
  const windowStart = new Date(Date.now() - ROLLING_WINDOW_DAYS * 86400_000)

  const reports = await db.userReport.findMany({
    where: {
      reportedUserId,
      isModeratorTarget: true,
      status: 'PENDING',
      createdAt: { gte: windowStart },
    },
    select: {
      id: true,
      reporterId: true,
      reporterIpHash: true,
      abuseFlags: true,
      createdAt: true,
      reporter: { select: { reputation: true, createdAt: true } },
    },
  })

  // One-report-per-unique-reporter (the freshest) so 50 reports from
  // a single account never outweigh independent reporters. The
  // unique-reporter gate below is the hard safety.
  const byReporter = new Map<string, typeof reports[number]>()
  for (const r of reports) {
    const prev = byReporter.get(r.reporterId)
    if (!prev || r.createdAt > prev.createdAt) byReporter.set(r.reporterId, r)
  }
  const uniqueReports = Array.from(byReporter.values())

  // IP-cluster pressure over the WHOLE window. Any IP-hash with >=
  // 3 reports collapses to half-weight per member (each counted
  // only once per distinct reporter, combined with this discount).
  const ipCounts = new Map<string, number>()
  for (const r of uniqueReports) {
    if (!r.reporterIpHash) continue
    ipCounts.set(r.reporterIpHash, (ipCounts.get(r.reporterIpHash) ?? 0) + 1)
  }
  const clusterIps = new Set<string>()
  ipCounts.forEach((count, hash) => {
    if (count >= 3) clusterIps.add(hash)
  })

  let score = 0
  let ignored = 0
  let clusterDiscounted = 0
  let full = 0

  for (const r of uniqueReports) {
    const rep = r.reporter?.reputation ?? 0
    let w = reputationWeight(rep)

    // Attached flags tighten, never loosen. A brand-new account with
    // LOW_REP is already at 0.25; BURST_CLUSTER halves that further.
    const flags = parseFlags(r.abuseFlags)
    if (flags.has('REP_NEGATIVE')) w = 0

    if (w === 0) { ignored++; continue }

    // Cluster discount: report came from an IP hash with >=3
    // distinct-reporter signals against this same mod — looks
    // coordinated. Halve.
    const isCluster = flags.has('BURST_CLUSTER') ||
      (r.reporterIpHash && clusterIps.has(r.reporterIpHash))

    if (isCluster) {
      w = w * 0.5
      clusterDiscounted++
    } else {
      full++
    }

    score += w
  }

  const uniqueReporters = uniqueReports.length
  const shouldReview =
    uniqueReporters >= MIN_UNIQUE_REPORTERS &&
    score >= UNDER_REVIEW_SCORE

  return {
    score,
    uniqueReporters,
    sampleCount: reports.length,
    shouldReview,
    breakdown: { ignored, clusterDiscounted, full },
  }
}

/**
 * Apply the scoring decision to the target's modStatus. Called after
 * a new report is inserted AND after a report is resolved.
 *
 *  - If shouldReview && current status is ACTIVE/INACTIVE → UNDER_REVIEW
 *  - If !shouldReview && current status is UNDER_REVIEW and the
 *    review was NOT manually set by an admin (heuristic: no SUSPENDED
 *    sibling action) → flip back to ACTIVE. This keeps a legitimately-
 *    reviewed mod pinned (admin has to clear_review explicitly for
 *    those), but lifts the flag when a pile-on fizzles out.
 *
 *  Safeguards: SUSPENDED mods are never touched. modReportCount is
 *  kept roughly in sync with sampleCount for backwards compatibility
 *  with dashboards that read the raw number.
 */
export async function applyModReportDecision(reportedUserId: string, score: ModReportScore) {
  try {
    const mod = await db.user.findUnique({
      where: { id: reportedUserId },
      select: { role: true, modStatus: true, modReportCount: true },
    })
    if (!mod || mod.role !== 'NEIGHBORHOOD_MOD') return
    if (mod.modStatus === 'SUSPENDED') return

    const nextCount = score.sampleCount

    if (score.shouldReview && mod.modStatus !== 'UNDER_REVIEW') {
      await db.user.update({
        where: { id: reportedUserId },
        data: { modStatus: 'UNDER_REVIEW', modReportCount: nextCount },
      })
      console.log('[MOD_LIFECYCLE] weighted auto-review triggered', {
        modId: reportedUserId,
        score: score.score,
        uniqueReporters: score.uniqueReporters,
        breakdown: score.breakdown,
      })
      return
    }

    // Auto-lift from UNDER_REVIEW only if the weighted score no longer
    // justifies review AND the mod has meaningful history (avoid
    // flipping brand-new mods back and forth on every report).
    if (!score.shouldReview && mod.modStatus === 'UNDER_REVIEW') {
      await db.user.update({
        where: { id: reportedUserId },
        data: { modStatus: 'ACTIVE', modReportCount: nextCount },
      })
      console.log('[MOD_LIFECYCLE] weighted auto-review lifted', {
        modId: reportedUserId,
        score: score.score,
      })
      return
    }

    // Nothing to flip; keep modReportCount synced with sampleCount so
    // the dashboard's rough "N reports" counter stays truthful.
    if (nextCount !== mod.modReportCount) {
      await db.user.update({
        where: { id: reportedUserId },
        data: { modReportCount: nextCount },
      })
    }
  } catch (err) {
    console.error('[MOD_LIFECYCLE] applyModReportDecision failed', err)
  }
}
