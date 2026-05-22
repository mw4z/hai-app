/**
 * Pure helpers for the "مساهماتي" contribution history — filtering, the
 * status badge a row should show, and a SAFE changed-field summary. No DB,
 * no PII: only the fields a contributor may see about their own work.
 */

export type ContribType =
  | 'CREATE_PLACE' | 'EDIT_PLACE' | 'ADD_PHOTO' | 'FIX_LOCATION'
  | 'ADD_CONTACT' | 'REPORT_DUPLICATE' | 'REPORT_CLOSED'
export type ContribStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'DUPLICATE' | 'NEEDS_EDIT'
export type ContribFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'places' | 'corrections' | 'reports'

/** The badge a row shows. APPROVED report contributions read as "actioned"
 *  (تم اتخاذ إجراء); other APPROVED read as "approved" (مقبول). */
export type StatusBadge = 'pending' | 'approved' | 'actioned' | 'rejected' | 'duplicate'

export function statusBadge(type: ContribType, status: ContribStatus): StatusBadge {
  if (status === 'PENDING_REVIEW' || status === 'NEEDS_EDIT') return 'pending'
  if (status === 'REJECTED') return 'rejected'
  if (status === 'DUPLICATE') return 'duplicate'
  // APPROVED
  return type === 'REPORT_DUPLICATE' || type === 'REPORT_CLOSED' ? 'actioned' : 'approved'
}

export function matchesFilter(c: { type: ContribType; status: ContribStatus }, f: ContribFilter): boolean {
  switch (f) {
    case 'all': return true
    case 'pending': return c.status === 'PENDING_REVIEW' || c.status === 'NEEDS_EDIT'
    case 'approved': return c.status === 'APPROVED'
    case 'rejected': return c.status === 'REJECTED' || c.status === 'DUPLICATE'
    case 'places': return c.type === 'CREATE_PLACE'
    case 'corrections': return c.type === 'EDIT_PLACE' || c.type === 'ADD_CONTACT' || c.type === 'FIX_LOCATION'
    case 'reports': return c.type === 'REPORT_DUPLICATE' || c.type === 'REPORT_CLOSED'
    default: return true
  }
}

export interface ChangedField { key: string; oldValue: string; suggestedValue: string }

/**
 * SAFE changed-field summary from a suggestion's payloadJson. Only the
 * contributor's own proposed values + the prior public value — never any
 * internal field. Coerces to display strings. Returns [] for non-
 * suggestions (CREATE_PLACE / reports carry no field diffs).
 */
export function extractChangedFields(payloadJson: unknown): ChangedField[] {
  if (!payloadJson || typeof payloadJson !== 'object') return []
  const fields = (payloadJson as { fields?: unknown }).fields
  if (!Array.isArray(fields)) return []
  const ALLOWED = new Set(['name', 'category', 'description', 'addressText', 'phone', 'whatsapp', 'website', 'instagram', 'latitude', 'longitude'])
  const out: ChangedField[] = []
  for (const f of fields) {
    if (!f || typeof f !== 'object') continue
    const key = (f as any).key
    if (typeof key !== 'string' || !ALLOWED.has(key)) continue
    out.push({
      key,
      oldValue: String((f as any).oldValue ?? ''),
      suggestedValue: String((f as any).suggestedValue ?? ''),
    })
  }
  return out
}

/** Today's earned directory points, clamped so the summary never claims
 *  more than the cap (e.g. a legacy over-grant). */
export function dailyCapEarned(earnedToday: number, cap = 15): number {
  return Math.max(0, Math.min(earnedToday, cap))
}
