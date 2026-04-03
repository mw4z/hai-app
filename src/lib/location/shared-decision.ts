/**
 * Shared location decision logic — platform-agnostic.
 * Zero dependency on browser APIs. Portable to native later.
 */

import type { LocationSample, LocationConfidence, LocationDecision, LocationStatus } from './types'
import { ACCURACY_HIGH, ACCURACY_MEDIUM } from './types'

/** Classify accuracy into confidence level */
export function classifyAccuracy(meters: number): LocationConfidence {
  if (meters <= ACCURACY_HIGH) return 'high'    // ≤30m
  if (meters <= ACCURACY_MEDIUM) return 'medium' // ≤150m
  return 'low'                                    // >150m
}

/** Pick the best sample from a set of readings.
 *  Prefers accuracy, but within 10m difference prefers the fresher reading. */
export function pickBestSample(samples: LocationSample[]): LocationSample | null {
  if (samples.length === 0) return null

  const sorted = [...samples].sort((a, b) => {
    const accDiff = a.accuracy - b.accuracy
    // Within 10m accuracy difference, prefer the fresher reading
    if (Math.abs(accDiff) < 10) {
      return b.timestamp - a.timestamp
    }
    return accDiff
  })

  return sorted[0]
}

/** Make the final location decision from collected samples */
export function makeDecision(
  samples: LocationSample[],
  permissionStatus: 'granted' | 'denied' | 'prompt' | 'unavailable'
): LocationDecision | { status: LocationStatus; sample: null; confidence: null; requiresConfirmation: boolean } {
  if (permissionStatus === 'denied') {
    return { status: 'denied', sample: null, confidence: null, requiresConfirmation: true }
  }
  if (permissionStatus === 'unavailable') {
    return { status: 'unavailable', sample: null, confidence: null, requiresConfirmation: true }
  }
  if (samples.length === 0) {
    return { status: 'timeout', sample: null, confidence: null, requiresConfirmation: true }
  }

  const best = pickBestSample(samples)!
  const confidence = classifyAccuracy(best.accuracy)

  // Low confidence (>150m) — truly unusable, retry required
  if (confidence === 'low') {
    return {
      status: 'low_accuracy',
      sample: best,
      confidence: 'low',
      requiresConfirmation: true,
    }
  }

  // High (≤30m) — auto-assign
  // Medium (30-150m) — suggest + confirm
  return {
    status: 'success',
    sample: best,
    confidence,
    requiresConfirmation: confidence === 'medium',
  }
}

export function formatResolutionRequest(decision: LocationDecision) {
  return {
    lat: decision.sample.lat,
    lng: decision.sample.lng,
    accuracy: decision.sample.accuracy,
    confidence: decision.confidence,
    status: decision.status,
  }
}
