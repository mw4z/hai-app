/**
 * Notification preset → per-category push spec.
 *
 * Setting a preset writes these values into NotificationPreference rows.
 * canSendNotification reads ONLY the per-category rows; the preset is
 * a UI-side concept that batches the writes. MANUAL is not in this map
 * because it doesn't define a row state — it preserves whatever rows
 * already exist.
 *
 * Decision rules (locked):
 *   URGENT_ONLY: NEIGHBORHOOD_REPORTS + LOST_FOUND only. SERVICES/RIDES
 *                are OFF here, but the gate's intent override allows
 *                REQUEST + priority=HIGH posts in those buckets to
 *                punch through (see canSendNotification.intentOverride).
 *   BALANCED:    everything except MARKETPLACE / REAL_ESTATE / COMPETITIONS
 *                (commercial-discovery buckets — keep out of push by default).
 *   EVERYTHING:  every category except GENERAL (admin-only fallback bucket).
 */

import type { NotificationPreset, PostCategory } from '@prisma/client'

export const PRESET_PUSH: Record<
  Exclude<NotificationPreset, 'MANUAL'>,
  Record<PostCategory, boolean>
> = {
  URGENT_ONLY: {
    NEIGHBORHOOD_REPORTS: true,
    LOST_FOUND:           true,
    SERVICES:             false,
    RIDES:                false,
    EVENTS:               false,
    HOME_BUSINESSES:      false,
    MARKETPLACE:          false,
    REAL_ESTATE:          false,
    COMPETITIONS:         false,
    GENERAL:              false,
  },
  BALANCED: {
    NEIGHBORHOOD_REPORTS: true,
    LOST_FOUND:           true,
    SERVICES:             true,
    RIDES:                true,
    EVENTS:               true,
    HOME_BUSINESSES:      true,
    MARKETPLACE:          false,
    REAL_ESTATE:          false,
    COMPETITIONS:         false,
    GENERAL:              false,
  },
  EVERYTHING: {
    NEIGHBORHOOD_REPORTS: true,
    LOST_FOUND:           true,
    SERVICES:             true,
    RIDES:                true,
    EVENTS:               true,
    HOME_BUSINESSES:      true,
    MARKETPLACE:          true,
    REAL_ESTATE:          true,
    COMPETITIONS:         true,
    GENERAL:              false,
  },
}

export const ALL_CATEGORIES: PostCategory[] = Object.keys(
  PRESET_PUSH.BALANCED,
) as PostCategory[]

/**
 * Categories where a REQUEST + HIGH-priority post can override a category
 * mute for URGENT_ONLY users. Single source of truth for the intent
 * override list — keeps canSendNotification's logic from drifting from
 * the documented contract.
 */
export const URGENT_REQUEST_CATEGORIES: ReadonlySet<PostCategory> = new Set<PostCategory>([
  'SERVICES',
  'RIDES',
  'LOST_FOUND',
])
