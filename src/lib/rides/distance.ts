/**
 * Distance and duration calculation between two coordinates.
 */

/**
 * Haversine distance in kilometers.
 */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Estimate driving duration in minutes from distance.
 * Uses average speed assumptions for Saudi urban/highway mix.
 */
export function estimateDuration(distanceKm: number): number {
  if (distanceKm <= 5) {
    // City driving: ~25 km/h average (traffic, stops)
    return Math.round(distanceKm / 25 * 60)
  }
  if (distanceKm <= 30) {
    // Urban mix: ~35 km/h
    return Math.round(distanceKm / 35 * 60)
  }
  // Highway: ~80 km/h
  return Math.round(distanceKm / 80 * 60)
}

/**
 * Calculate distance and duration between two points.
 */
export function calculateRoute(
  pickupLat: number, pickupLng: number,
  dropoffLat: number, dropoffLng: number,
): { distanceKm: number; durationMin: number } {
  const km = Math.round(haversineKm(pickupLat, pickupLng, dropoffLat, dropoffLng) * 10) / 10
  const min = estimateDuration(km)
  return { distanceKm: km, durationMin: min }
}

/**
 * Validate that pickup and dropoff are sufficiently apart.
 */
export function validateDistance(distanceKm: number): { valid: boolean; error?: string } {
  if (distanceKm < 0.5) {
    return { valid: false, error: 'Pickup and dropoff must be at least 500m apart' }
  }
  if (distanceKm > 500) {
    return { valid: false, error: 'Maximum ride distance is 500 km' }
  }
  return { valid: true }
}
