'use client'

import { useLanguage } from '@/hooks/useLanguage'
import { StatePill } from '@/lib/state-render'

/**
 * Ride status → semantic state + bilingual label.
 *
 * Business state is the single source of truth; appearance is
 * resolved entirely through the design system via
 * StatePill via the design-system state primitive. No colors live in TS.
 */
type StateKey =
  | 'open' | 'awaiting' | 'confirmed' | 'en-route' | 'arrived'
  | 'in-progress' | 'resolved' | 'cancelled' | 'expired' | 'disputed'

const STATUS_CONFIG: Record<string, { ar: string; en: string; state: StateKey }> = {
  RIDE_OPEN:               { ar: 'مفتوح',           en: 'Open',              state: 'open' },
  RIDE_SELECTED:           { ar: 'بانتظار التأكيد', en: 'Awaiting Confirm',  state: 'awaiting' },
  RIDE_CONFIRMED:          { ar: 'مؤكد',            en: 'Confirmed',         state: 'confirmed' },
  RIDE_EN_ROUTE:           { ar: 'في الطريق',       en: 'En Route',          state: 'en-route' },
  RIDE_ARRIVED:            { ar: 'وصل',              en: 'Arrived',           state: 'arrived' },
  RIDE_IN_PROGRESS:        { ar: 'جاري',            en: 'In Progress',       state: 'in-progress' },
  RIDE_PENDING_COMPLETION: { ar: 'بانتظار التأكيد', en: 'Pending Confirm',   state: 'awaiting' },
  RIDE_COMPLETED:          { ar: 'مكتملة',          en: 'Completed',         state: 'resolved' },
  RIDE_CANCELLED:          { ar: 'ملغاة',           en: 'Cancelled',         state: 'cancelled' },
  RIDE_EXPIRED:            { ar: 'منتهية',          en: 'Expired',           state: 'expired' },
  RIDE_DISPUTED:           { ar: 'قيد المراجعة',    en: 'Disputed',          state: 'disputed' },
}

export default function StatusBadge({ status }: { status: string }) {
  const { lang } = useLanguage()
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.RIDE_OPEN
  return (
    <StatePill state={config.state} label={lang !== 'en' ? config.ar : config.en} />
  )
}
