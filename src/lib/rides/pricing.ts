/**
 * Ride price estimation — guidance only, not binding.
 *
 * Formula:
 *   base = 5 SAR (first 3 km included)
 *   perKm = 1.5 SAR/km (after 3 km)
 *   perMin = 0.3 SAR/min
 *   timeMultiplier: peak 1.3x, late-night 1.5x, normal 1.0x
 *
 *   estimated = (base + extraKm * perKm + min * perMin) * multiplier
 *   minPrice = estimated * 0.7
 *   maxPrice = estimated * 1.4
 */

const BASE_RATE = 5       // SAR, includes first 3 km
const FREE_KM = 3
const PER_KM = 1.5        // SAR per km after free tier
const PER_MIN = 0.3       // SAR per minute
const MIN_PRICE = 5       // absolute floor

function getTimeMultiplier(hour: number): number {
  // Peak: 7-9 AM, 4-7 PM
  if ((hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19)) return 1.3
  // Late night: 11 PM - 5 AM
  if (hour >= 23 || hour <= 5) return 1.5
  return 1.0
}

export interface PriceEstimate {
  min: number
  max: number
  estimated: number
}

/**
 * Estimate price range for a ride.
 * @param distanceKm - distance in kilometers
 * @param durationMin - estimated duration in minutes
 * @param departureHour - hour of departure (0-23), defaults to current hour
 */
export function estimatePrice(
  distanceKm: number,
  durationMin: number,
  departureHour?: number,
): PriceEstimate {
  const hour = departureHour ?? new Date().getHours()
  const multiplier = getTimeMultiplier(hour)

  const extraKm = Math.max(0, distanceKm - FREE_KM)
  const raw = (BASE_RATE + extraKm * PER_KM + durationMin * PER_MIN) * multiplier

  const estimated = Math.max(MIN_PRICE, Math.round(raw))
  const min = Math.max(MIN_PRICE, Math.round(raw * 0.7))
  const max = Math.round(raw * 1.4)

  return { min, max, estimated }
}

/**
 * Validate an offer price against the estimate.
 * Returns warning flags, never blocks.
 */
export function validateOfferPrice(
  price: number,
  estimatedMin: number,
  estimatedMax: number,
): { tooLow: boolean; tooHigh: boolean; blocked: boolean; reason?: string } {
  // Hard block: below 30% of min estimate (likely spam)
  if (price < estimatedMin * 0.3) {
    return { tooLow: true, tooHigh: false, blocked: true, reason: 'Price unrealistically low' }
  }
  // Hard block: above 300% of max estimate (likely spam)
  if (price > estimatedMax * 3.0) {
    return { tooLow: false, tooHigh: true, blocked: true, reason: 'Price unrealistically high' }
  }
  // Soft warnings
  return {
    tooLow: price < estimatedMin,
    tooHigh: price > estimatedMax,
    blocked: false,
  }
}
