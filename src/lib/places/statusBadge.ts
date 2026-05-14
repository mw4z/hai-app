import type { PlaceStatus } from '@prisma/client'

/**
 * Trilingual label + visual tone for every PlaceStatus value.
 *
 * COMMUNITY_VERIFIED is intentionally NOT in this map — it's not
 * in the MVP enum (Phase 1.5). If a row somehow surfaces with that
 * value at runtime (e.g., after Phase 1.5 ships) getStatusBadge
 * falls back to VISIBLE_UNVERIFIED's badge so the UI doesn't
 * blank out.
 */
export interface PlaceStatusBadge {
  /** Arabic / English / Urdu label, stored in canonical order. */
  labelAr: string
  labelEn: string
  labelUr: string
  /** Tailwind tone class — used by PlaceStatusBadge component to
   *  pick a coordinated bg/text pair. */
  tone: 'gray' | 'amber' | 'sky' | 'emerald' | 'rose'
  /** Whether the status counts as "publicly visible" — drives the
   *  default WHERE clause for the directory list query. */
  publiclyVisible: boolean
}

const BADGES: Record<PlaceStatus, PlaceStatusBadge> = {
  PENDING: {
    labelAr: 'قيد المراجعة',
    labelEn: 'Pending review',
    labelUr: 'زیر جائزہ',
    tone: 'gray',
    publiclyVisible: false,
  },
  VISIBLE_UNVERIFIED: {
    labelAr: 'غير مؤكد',
    labelEn: 'Unverified',
    labelUr: 'غیر تصدیق شدہ',
    tone: 'amber',
    publiclyVisible: true,
  },
  MOD_VERIFIED: {
    labelAr: 'مؤكد من المشرف',
    labelEn: 'Verified by moderator',
    labelUr: 'موڈریٹر سے تصدیق شدہ',
    tone: 'sky',
    publiclyVisible: true,
  },
  CLAIMED_BY_OWNER: {
    labelAr: 'مُدار من صاحب المكان',
    labelEn: 'Managed by owner',
    labelUr: 'مالک کے زیر انتظام',
    tone: 'emerald',
    publiclyVisible: true,
  },
  REJECTED: {
    labelAr: 'مرفوض',
    labelEn: 'Rejected',
    labelUr: 'مسترد',
    tone: 'rose',
    publiclyVisible: false,
  },
  REMOVED: {
    labelAr: 'محذوف',
    labelEn: 'Removed',
    labelUr: 'حذف شدہ',
    tone: 'rose',
    publiclyVisible: false,
  },
}

export function getStatusBadge(status: PlaceStatus): PlaceStatusBadge {
  return BADGES[status] ?? BADGES.VISIBLE_UNVERIFIED
}

/** Statuses safe to expose to non-mod readers in the default list
 *  query. Mod / creator / SUPER_ADMIN paths see everything. */
export const PUBLIC_PLACE_STATUSES: PlaceStatus[] = (
  Object.entries(BADGES) as [PlaceStatus, PlaceStatusBadge][]
)
  .filter(([, b]) => b.publiclyVisible)
  .map(([k]) => k)
