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

/** One Google opening period. Stored raw on the listing and used by
 *  openState.computeFromGooglePeriods for an accurate pill that
 *  handles shifts + per-day-varying hours (the single-schedule
 *  openingHours string can't represent those). */
export interface GooglePeriod {
  open?: { day?: number; hour?: number; minute?: number }
  close?: { day?: number; hour?: number; minute?: number }
}
