/**
 * Single source of truth for the legacy → v2 category mapping.
 *
 * The SQL backfill in
 * prisma/migrations/20260427_phase2_post_classification_backfill
 * is the authoritative form for already-stored rows. THIS file is the
 * runtime helper for any code path that still receives a legacy
 * category value (e.g. seed data, an old client, a deprecated API
 * route) and needs to translate it into the v2 fields.
 *
 * Keep these two in lockstep — the SQL and the TS must produce
 * identical results for every legacy input.
 */

import type {
  PostCategory,
  PostCategoryV2,
  PostIntent,
  PostPriority,
  PostAudience,
} from '@prisma/client'

export interface ClassifiedPost {
  category: PostCategoryV2
  intent: PostIntent
  priority: PostPriority
  audience: PostAudience
}

/** Default classification for unknown / missing legacy values. */
const FALLBACK: ClassifiedPost = {
  category: 'GENERAL',
  intent: 'NORMAL',
  priority: 'NORMAL',
  audience: 'ALL',
}

/**
 * Map a legacy PostCategory to the v2 (category, intent, priority,
 * audience) tuple. Use this anywhere you receive a legacy value at
 * runtime. Mirror of the Phase 2 SQL.
 */
export function classifyLegacy(legacy: PostCategory): ClassifiedPost {
  switch (legacy) {
    case 'FOOD_HOME':
      return { category: 'HOME_BUSINESSES', intent: 'NORMAL',  priority: 'NORMAL', audience: 'ALL' }
    case 'MARKETPLACE':
      return { category: 'MARKETPLACE',     intent: 'NORMAL',  priority: 'NORMAL', audience: 'ALL' }
    case 'SERVICES':
      return { category: 'SERVICES',        intent: 'NORMAL',  priority: 'NORMAL', audience: 'ALL' }
    case 'REAL_ESTATE':
      return { category: 'REAL_ESTATE',     intent: 'NORMAL',  priority: 'NORMAL', audience: 'ALL' }
    case 'LOST_FOUND':
      return { category: 'LOST_FOUND',      intent: 'NORMAL',  priority: 'HIGH',   audience: 'ALL' }
    case 'RIDE_REQUEST':
      return { category: 'RIDES',           intent: 'REQUEST', priority: 'NORMAL', audience: 'ALL' }
    case 'LOOKING_FOR':
      return { category: 'SERVICES',        intent: 'REQUEST', priority: 'NORMAL', audience: 'ALL' }
    case 'NEIGHBORHOOD_ISSUE':
      return { category: 'NEIGHBORHOOD_REPORTS', intent: 'NORMAL', priority: 'HIGH', audience: 'ALL' }
    case 'ALERT':
      // ALERT is the legacy "neighborhood-wide notification" bucket —
      // CRITICAL is reserved for the EmergencyAlert model, so we use
      // HIGH here. Override at the call site if a specific post needs
      // CRITICAL.
      return { category: 'NEIGHBORHOOD_REPORTS', intent: 'NORMAL', priority: 'HIGH', audience: 'ALL' }
    case 'MOSQUE':
    case 'EID_RAMADAN':
      return { category: 'EVENTS',          intent: 'NORMAL',  priority: 'NORMAL', audience: 'ALL' }
    case 'CONTESTS':
      return { category: 'COMPETITIONS',    intent: 'NORMAL',  priority: 'NORMAL', audience: 'ALL' }
    case 'WOMEN_ONLY':
      return { category: 'SERVICES',        intent: 'NORMAL',  priority: 'NORMAL', audience: 'WOMEN' }
    case 'GENERAL':
      return FALLBACK
    default:
      // exhaustiveness check — if a new legacy value ever appears, this
      // branch keeps the app running with the safe fallback while a
      // log line surfaces the miss.
      console.warn('[postCategory] unknown legacy category, falling back to GENERAL:', legacy)
      return FALLBACK
  }
}

/**
 * Reverse map for read-side compatibility: when a frontend still sends
 * legacy category names but the backend stores v2, translate v2 →
 * closest legacy value so the wire format stays stable. Drops once
 * Phase 4 ships.
 */
export function legacyOf(v2: PostCategoryV2): PostCategory {
  switch (v2) {
    case 'HOME_BUSINESSES':       return 'FOOD_HOME'
    case 'MARKETPLACE':           return 'MARKETPLACE'
    case 'SERVICES':              return 'SERVICES'
    case 'RIDES':                 return 'RIDE_REQUEST'
    case 'REAL_ESTATE':           return 'REAL_ESTATE'
    case 'LOST_FOUND':            return 'LOST_FOUND'
    case 'NEIGHBORHOOD_REPORTS':  return 'NEIGHBORHOOD_ISSUE'
    case 'EVENTS':                return 'EID_RAMADAN'
    case 'COMPETITIONS':          return 'CONTESTS'
    case 'GENERAL':               return 'GENERAL'
    default:
      // Defensive fallback. The exhaustive switch above covers every
      // PostCategoryV2 enum value; this branch only executes if a new
      // enum value is added without updating this map.
      return 'GENERAL'
  }
}
