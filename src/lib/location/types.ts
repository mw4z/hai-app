/**
 * Shared location types — platform-agnostic.
 * Used by web collector now, portable to iOS/Android later.
 */

export interface LocationSample {
  lat: number
  lng: number
  accuracy: number // meters
  timestamp: number // ms since epoch
}

export type LocationStatus =
  | 'prompt'           // permission not yet requested
  | 'granted'          // permission granted, collecting
  | 'denied'           // user explicitly denied
  | 'unavailable'      // device has no location capability
  | 'timeout'          // location request timed out
  | 'low_accuracy'     // got a reading but accuracy is poor
  | 'success'          // got a usable reading

export type LocationConfidence = 'high' | 'medium' | 'low'

export interface LocationDecision {
  sample: LocationSample
  confidence: LocationConfidence
  status: LocationStatus
  requiresConfirmation: boolean
}

export interface LocationResolutionRequest {
  lat: number
  lng: number
  accuracy: number
  confidence: LocationConfidence
  status: LocationStatus
}

export interface LocationResolutionResponse {
  neighborhoodId: string | null
  name: string
  nameEn: string
  cityName: string
  cityNameEn: string
  distanceKm: number
  confidence: LocationConfidence
  requiresConfirmation: boolean
}

// Thresholds — tuned for mobile web (WiFi/cell often returns 50-500m+)
export const ACCURACY_HIGH = 100    // meters — auto-assign, no confirmation
export const ACCURACY_MEDIUM = 5000 // meters (5km) — suggest neighborhood, ask confirmation
// > 5km = low — retry only
