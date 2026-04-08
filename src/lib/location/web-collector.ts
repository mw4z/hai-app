/**
 * Location collector — uses Capacitor Geolocation on native, browser API on web.
 *
 * Strategy: coarse-first (WiFi/cell), then refine with GPS.
 */

import type { LocationSample } from './types'

const LOG_PREFIX = '[LOCATION]'
const DEBUG = process.env.NODE_ENV !== 'production'
function log(...args: unknown[]) { if (DEBUG) console.log(LOG_PREFIX, ...args) }

function isNative(): boolean {
  return typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.()
}

/** Check permission state */
export async function checkPermissionState(): Promise<'granted' | 'denied' | 'prompt' | 'unavailable'> {
  if (isNative()) {
    try {
      const { Geolocation } = await import('@capacitor/geolocation')
      const perm = await Geolocation.checkPermissions()
      log('Native permission state:', perm.location)
      if (perm.location === 'denied') return 'denied'
      if (perm.location === 'granted') return 'granted'
      return 'prompt'
    } catch {
      log('Native permission check failed, falling back to web')
    }
  }

  if (!navigator.geolocation) {
    log('Geolocation API not available')
    return 'unavailable'
  }

  if (navigator.permissions) {
    try {
      const perm = await navigator.permissions.query({ name: 'geolocation' })
      log('Permission state:', perm.state)
      if (perm.state === 'denied') return 'denied'
      if (perm.state === 'granted') return 'granted'
      return 'prompt'
    } catch {
      log('Permissions API not supported, falling back')
    }
  }

  return 'prompt'
}

/** Request location permissions on native */
async function requestNativePermissions(): Promise<void> {
  if (!isNative()) return
  try {
    const { Geolocation } = await import('@capacitor/geolocation')
    await Geolocation.requestPermissions()
  } catch {
    log('Native permission request failed')
  }
}

/** Single position reading — uses Capacitor on native, browser API on web */
function getPosition(opts: PositionOptions): Promise<LocationSample | null> {
  if (isNative()) {
    return getPositionNative(opts)
  }
  return getPositionWeb(opts)
}

async function getPositionNative(opts: PositionOptions): Promise<LocationSample | null> {
  try {
    const { Geolocation } = await import('@capacitor/geolocation')
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: opts.enableHighAccuracy ?? false,
      timeout: opts.timeout ?? 10000,
      maximumAge: opts.maximumAge ?? 0,
    })
    const sample: LocationSample = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      timestamp: pos.timestamp,
    }
    log(`Native sample: ${sample.lat.toFixed(5)}, ${sample.lng.toFixed(5)}, accuracy=${Math.round(sample.accuracy)}m`)
    return sample
  } catch (e: any) {
    if (e?.message?.includes('denied') || e?.message?.includes('permission')) {
      throw { code: 1, reason: 'denied' }
    }
    log('Native position error:', e)
    return null
  }
}

function getPositionWeb(opts: PositionOptions): Promise<LocationSample | null> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const sample: LocationSample = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        }
        log(`Web sample: ${sample.lat.toFixed(5)}, ${sample.lng.toFixed(5)}, accuracy=${Math.round(sample.accuracy)}m`)
        resolve(sample)
      },
      (err) => {
        if (err.code === 1) {
          log('Permission DENIED by user')
          reject({ code: 1, reason: 'denied' })
        } else if (err.code === 2) {
          log('Position UNAVAILABLE:', err.message)
          resolve(null)
        } else {
          log('Position TIMEOUT')
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

  // On native, explicitly request permissions before first position call
  if (prePerm === 'prompt') {
    await requestNativePermissions()
  }

  const firstCallTimeout = prePerm === 'granted' ? 8_000 : 30_000

  try {
    // Step 1: coarse position
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

    // Step 2: high-accuracy GPS reading
    if (!cancelled()) {
      log('Requesting high-accuracy position...')
      try {
        const fine = await getPosition({ enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 })
        if (!cancelled()) addSample(fine)
      } catch { /* GPS timeout is OK */ }
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

    log(`Collection done: ${samples.length} samples, best accuracy=${Math.round(Math.min(...samples.map(s => s.accuracy)))}m`)
    return { samples, permissionState: 'granted' }
  } catch (e: any) {
    if (e?.code === 1) {
      log('Collection failed: permission denied')
      return { samples, permissionState: 'denied' }
    }
    log('Collection error:', e)
    return { samples, permissionState: samples.length > 0 ? 'granted' : 'unavailable' }
  }
}
