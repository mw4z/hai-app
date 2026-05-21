import type { PlaceCategory } from '@prisma/client'

/**
 * Google → Hai converters used when enriching a listing from a
 * Google Places pick: place types → our category enum, and Google's
 * opening-hours `periods` → the exact Arabic `openingHours` string
 * the OpeningHoursPicker produces (so parseOpeningHours +
 * computePlacePill keep working and the open/closed pill lights up).
 */

// ── Category ─────────────────────────────────────────────────────

// Google place type → Hai PlaceCategory. Checked against primaryType
// first, then every entry in `types`. First hit wins; falls back to
// SHOP_SERVICES (a sensible catch-all for retail), then OTHER only
// when there are no types at all.
const TYPE_MAP: Record<string, PlaceCategory> = {
  restaurant: 'RESTAURANT_CAFE',
  cafe: 'RESTAURANT_CAFE',
  coffee_shop: 'RESTAURANT_CAFE',
  bakery: 'RESTAURANT_CAFE',
  meal_takeaway: 'RESTAURANT_CAFE',
  meal_delivery: 'RESTAURANT_CAFE',
  bar: 'RESTAURANT_CAFE',
  food: 'RESTAURANT_CAFE',
  ice_cream_shop: 'RESTAURANT_CAFE',

  pharmacy: 'PHARMACY',
  drugstore: 'PHARMACY',

  supermarket: 'SUPERMARKET',
  grocery_store: 'SUPERMARKET',
  grocery_or_supermarket: 'SUPERMARKET',
  convenience_store: 'SUPERMARKET',

  car_wash: 'CAR_WASH',

  laundry: 'LAUNDRY',

  doctor: 'CLINIC',
  hospital: 'CLINIC',
  dentist: 'CLINIC',
  physiotherapist: 'CLINIC',
  medical_lab: 'CLINIC',
  health: 'CLINIC',

  school: 'SCHOOL_KINDERGARTEN',
  primary_school: 'SCHOOL_KINDERGARTEN',
  secondary_school: 'SCHOOL_KINDERGARTEN',
  preschool: 'SCHOOL_KINDERGARTEN',

  gas_station: 'GAS_STATION',

  gym: 'GYM_CENTER',
  fitness_center: 'GYM_CENTER',
  sports_complex: 'GYM_CENTER',

  hair_care: 'SALON',
  hair_salon: 'SALON',
  beauty_salon: 'SALON',
  barber_shop: 'SALON',
  spa: 'SALON',

  store: 'SHOP_SERVICES',
  shopping_mall: 'SHOP_SERVICES',
  clothing_store: 'SHOP_SERVICES',
  electronics_store: 'SHOP_SERVICES',
  hardware_store: 'SHOP_SERVICES',
  furniture_store: 'SHOP_SERVICES',
  home_goods_store: 'SHOP_SERVICES',
  book_store: 'SHOP_SERVICES',
  florist: 'SHOP_SERVICES',
}

export function googleTypeToCategory(
  types: string[] | undefined,
  primaryType: string | undefined,
): PlaceCategory | null {
  if (primaryType && TYPE_MAP[primaryType]) return TYPE_MAP[primaryType]
  for (const t of types ?? []) {
    if (TYPE_MAP[t]) return TYPE_MAP[t]
  }
  // Has types but none mapped → generic shop; truly empty → null
  // (caller keeps the user's current category).
  if ((types && types.length > 0) || primaryType) return 'SHOP_SERVICES'
  return null
}

// ── Opening hours ────────────────────────────────────────────────

export interface GooglePeriod {
  open?: { day?: number; hour?: number; minute?: number }
  close?: { day?: number; hour?: number; minute?: number }
}

// Google week: 0=Sun … 6=Sat. Hai week: 0=Sat … 6=Fri.
//   appDay = (googleDay + 1) % 7
function googleDayToApp(g: number): number {
  return (g + 1) % 7
}

const DAY_AR = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة']

/** 24h "HH:MM" → "9 ص" / "9:30 م" — matches OpeningHoursPicker.formatTime (ar). */
function formatTimeAr(hour24: number, minute: number): string {
  const h = Math.max(0, Math.min(23, hour24))
  const m = Math.max(0, Math.min(59, minute))
  const isPM = h >= 12
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  const mm = m === 0 ? '' : `:${m.toString().padStart(2, '0')}`
  return `${h12}${mm} ${isPM ? 'م' : 'ص'}`
}

/** Matches OpeningHoursPicker.formatDays (ar). days are app indices. */
function formatDaysAr(sorted: number[]): string {
  if (sorted.length === 7) return 'يومياً'
  const isContig =
    sorted.length >= 2 && sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1)
  if (isContig) return `${DAY_AR[sorted[0]]} - ${DAY_AR[sorted[sorted.length - 1]]}`
  if (sorted.length === 6 && !sorted.includes(6)) return 'السبت - الخميس'
  return sorted.map((d) => DAY_AR[d]).join('، ')
}

/**
 * Convert Google `regularOpeningHours.periods` into the Arabic
 * `openingHours` string the picker emits. Returns null when there's
 * nothing convertible.
 *
 * Strategy: derive each day's shift list, take the DOMINANT shift
 * signature (the one covering the most days) and emit those days +
 * shifts. The app format assumes one shift-set shared across the
 * listed days, so days with a different pattern (e.g. a special
 * Friday) are dropped — a pragmatic approximation that keeps the
 * pill working for the common case.
 */
export function googleHoursToApp(periods: GooglePeriod[] | undefined): string | null {
  if (!periods || periods.length === 0) return null

  // 24/7: a single open with no close (Google's convention).
  if (
    periods.length === 1 &&
    periods[0].open &&
    !periods[0].close &&
    (periods[0].open.hour ?? 0) === 0 &&
    (periods[0].open.minute ?? 0) === 0
  ) {
    return '24 ساعة طوال الأسبوع'
  }

  // Group shifts by the open day (app index). Overnight shifts are
  // attributed to their open day.
  const byDay = new Map<number, { open: string; close: string }[]>()
  for (const p of periods) {
    if (!p.open || !p.close) continue
    const day = googleDayToApp(p.open.day ?? 0)
    const open = formatTimeAr(p.open.hour ?? 0, p.open.minute ?? 0)
    const close = formatTimeAr(p.close.hour ?? 0, p.close.minute ?? 0)
    const list = byDay.get(day) ?? []
    list.push({ open, close })
    byDay.set(day, list)
  }
  if (byDay.size === 0) return null

  // Signature per day = its shifts joined; group days by signature.
  const bySig = new Map<string, { days: number[]; shifts: { open: string; close: string }[] }>()
  for (const [day, shifts] of Array.from(byDay.entries())) {
    const sig = shifts.map((s) => `${s.open}-${s.close}`).join('|')
    const entry = bySig.get(sig)
    if (entry) entry.days.push(day)
    else bySig.set(sig, { days: [day], shifts })
  }

  // Dominant signature = most days (tie → earliest day).
  let best: { days: number[]; shifts: { open: string; close: string }[] } | null = null
  for (const entry of Array.from(bySig.values())) {
    if (!best || entry.days.length > best.days.length) best = entry
  }
  if (!best) return null

  const days = [...best.days].sort((a, b) => a - b)
  const dayPart = formatDaysAr(days)
  const shiftParts = best.shifts.map((s) => `${s.open} - ${s.close}`)
  return `${dayPart} ${shiftParts.join('، ')}`
}
