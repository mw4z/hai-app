/**
 * Web-specific location collector.
 * Adapts browser Geolocation API into shared LocationSample types.
 *
 * Strategy: coarse-first (WiFi/cell), then refine with GPS.
 * Works reliably on Safari, Chrome, Firefox.
 */

import type { LocationSample } from './types'

const LOG_PREFIX = '[WEB-LOCATION]'
const DEBUG = process.env.NODE_ENV !== 'production'
function log(...args: unknown[]) { if (DEBUG) console.log(LOG_PREFIX, ...args) }

/** Check permission state via Permissions API (where supported) */
export async function checkPermissionState(): Promise<'granted' | 'denied' | 'prompt' | 'unavailable'> {
  if (!navigator.geolocation) {
    log( 'Geolocation API not available')
    return 'unavailable'
  }

  // Permissions API — supported in Chrome, Firefox. Safari ignores it.
  if (navigator.permissions) {
    try {
      const perm = await navigator.permissions.query({ name: 'geolocation' })
      log( 'Permission state:', perm.state)
      if (perm.state === 'denied') return 'denied'
      if (perm.state === 'granted') return 'granted'
      return 'prompt'
    } catch {
      // Safari throws on permissions.query for geolocation
      log( 'Permissions API not supported, falling back')
    }
  }

  return 'prompt' // assume prompt if we can't check
}

/** Single getCurrentPosition wrapped in a promise */
function getPosition(opts: PositionOptions): Promise<LocationSample | null> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const sample: LocationSample = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        }
        log( `Sample: ${sample.lat.toFixed(5)}, ${sample.lng.toFixed(5)}, accuracy=${Math.round(sample.accuracy)}m`)
        resolve(sample)
      },
      (err) => {
        if (err.code === 1) {
          log( 'Permission DENIED by user')
          reject({ code: 1, reason: 'denied' })
        } else if (err.code === 2) {
          log( 'Position UNAVAILABLE:', err.message)
          resolve(null)
        } else {
          log( 'Position TIMEOUT')
          resolve(null)
        }
      },
      opts,
    )
  })
}

export interface CollectionResult {
  samples: LocationSample[]
  permissionState: 'granted' | 'denied' | 'unavailable'
}

/**
 * Collect location samples using coarse-first strategy.
 *
 * 1. Check permission state
 * 2. Coarse reading (WiFi/cell, cached OK) — fast
 * 3. 1-2 high-accuracy GPS readings — slower but more precise
 * 4. Return all samples for the shared decision layer
 *
 * @param onSample - callback for each sample (for UI progress)
 * @param signal - AbortController signal to cancel
 */
export async function collectSamples(
  onSample?: (count: number) => void,
  signal?: AbortSignal,
): Promise<CollectionResult> {
  const samples: LocationSample[] = []
  let sampleCount = 0

  function addSample(s: LocationSample | null) {
    if (s) {
      samples.push(s)
      sampleCount++
      onSample?.(sampleCount)
    }
  }

  function cancelled() {
    return signal?.aborted ?? false
  }

  // Pre-check permission
  const prePerm = await checkPermissionState()
  log('Permission pre-check:', prePerm)
  if (prePerm === 'unavailable') {
    return { samples: [], permissionState: 'unavailable' }
  }
  if (prePerm === 'denied') {
    return { samples: [], permissionState: 'denied' }
  }

  // If permission is 'prompt' (first visit), the browser will show a dialog.
  // User needs time to read and tap Allow, so use a long timeout.
  // If already 'granted', the position returns instantly — long timeout has no cost.
  const firstCallTimeout = prePerm === 'granted' ? 8_000 : 30_000

  try {
    // Step 1: coarse position — WiFi/cell, allow 5-min cache
    log('Requesting coarse position... (timeout:', firstCallTimeout, 'ms)')
    const coarse = await getPosition({
      enableHighAccuracy: false,
      timeout: firstCallTimeout,
      maximumAge: 300_000,
    })
    if (cancelled()) return { samples, permissionState: 'granted' }
    addSample(coarse)

    // If coarse gave us high accuracy (≤100m), just confirm with one more
    if (coarse && coarse.accuracy <= 100) {
      log('Coarse was high accuracy, getting one confirmation...')
      try {
        const confirm = await getPosition({ enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 })
        if (!cancelled()) addSample(confirm)
      } catch { /* OK */ }
      return { samples, permissionState: 'granted' }
    }

    // If coarse is medium (≤150m), it's usable — still try to improve with GPS
    // Step 2: high-accuracy GPS reading
    if (!cancelled()) {
      log('Requesting high-accuracy position...')
      try {
        const fine = await getPosition({ enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 })
        if (!cancelled()) addSample(fine)
      } catch { /* GPS timeout is OK, we still have coarse */ }
    }

    // Step 3: one more attempt only if still above medium threshold
    const bestSoFar = Math.min(...samples.map(s => s.accuracy))
    if (!cancelled() && bestSoFar > 100) {
      log('Requesting one more high-accuracy reading...')
      try {
        const fine2 = await getPosition({ enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 })
        if (!cancelled()) addSample(fine2)
      } catch { /* OK */ }
    }

    log( `Collection done: ${samples.length} samples, best accuracy=${Math.round(Math.min(...samples.map(s => s.accuracy)))}m`)
    return { samples, permissionState: 'granted' }
  } catch (e: any) {
    if (e?.code === 1) {
      log( 'Collection failed: permission denied')
      return { samples, permissionState: 'denied' }
    }
    // Any other error — return what we have
    log( 'Collection error:', e)
    return { samples, permissionState: samples.length > 0 ? 'granted' : 'unavailable' }
  }
}
