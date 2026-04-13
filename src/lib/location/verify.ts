/**
 * Server-side neighborhood assignment verifier.
 *
 * Guards /api/auth/complete-profile against a bypassed client sending
 * an arbitrary neighborhoodId. Re-runs the same logic as the /detect
 * endpoint but against the specific neighborhood the user is claiming.
 *
 * Two accept paths:
 *   - precise:  user's coordinates land inside the neighborhood polygon
 *   - fallback: user's coordinates are within FALLBACK_RADIUS_KM of the
 *               neighborhood's centroid — used when GPS is low-accuracy
 *               and we still want to let the user pick from a short
 *               nearby list
 */

import { pointInPolygon, pointInBbox } from './polygon'

// ─── Tunable constants ────────────────────────────────────────────────────
/** Max distance (km) from neighborhood center for a fallback (low-accuracy) match */
export const FALLBACK_RADIUS_KM = 8
/** Max number of nearby neighborhoods shown to users after low-accuracy GPS */
export const MAX_NEARBY_RESULTS = 6
/** Accuracy threshold (meters) above which we treat the reading as low-accuracy fallback */
export const LOW_ACCURACY_THRESHOLD_M = 150

export type VerifyResult = 'precise' | 'fallback' | 'rejected'

export interface NeighborhoodForVerify {
  id: string
  lat: number | null
  lng: number | null
  boundary: unknown
  bbox: unknown
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Verify a user's claim that they belong to a specific neighborhood.
 * Call on the server immediately before persisting `User.neighborhoodId`.
 */
export function verifyNeighborhoodAssignment(
  lat: number,
  lng: number,
  accuracy: number,
  neighborhood: NeighborhoodForVerify,
): VerifyResult {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return 'rejected'
  }

  // ── Strategy 1: polygon match (precise) ────────────────────────────────
  if (neighborhood.boundary && neighborhood.bbox) {
    try {
      const bbox = neighborhood.bbox as [number, number, number, number]
      if (pointInBbox(lat, lng, bbox, 0.005)) {
        const polygon = neighborhood.boundary as number[][]
        if (pointInPolygon(lat, lng, polygon)) {
          return 'precise'
        }
      }
    } catch {
      // Malformed boundary — fall through to centroid distance check
    }
  }

  // ── Strategy 2: centroid distance (fallback) ───────────────────────────
  if (neighborhood.lat == null || neighborhood.lng == null) {
    return 'rejected'
  }
  const distanceKm = haversineKm(lat, lng, neighborhood.lat, neighborhood.lng)

  // When GPS was precise but the user still landed outside the polygon,
  // require a tight radius. When GPS was known-imprecise (low_accuracy),
  // allow the full fallback radius — matches what the client offered.
  const maxKm =
    accuracy > LOW_ACCURACY_THRESHOLD_M
      ? FALLBACK_RADIUS_KM
      : Math.min(FALLBACK_RADIUS_KM, 2)

  if (distanceKm <= maxKm) return 'fallback'
  return 'rejected'
}
