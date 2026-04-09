/**
 * Location collector — uses Capacitor Geolocation on native, browser API on web.
 * Includes diagnostic logging for TestFlight debugging.
 */

import type { LocationSample } from './types'

const LOG = '[LOCATION]'

function isNative(): boolean {
  return typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.()
}

/** Check permission state */
export async function checkPermissionState(): Promise<'granted' | 'denied' | 'prompt' | 'unavailable'> {
  console.log(LOG, 'checkPermissionState — isNative:', isNative())

  if (isNative()) {
    try {
      const { Geolocation } = await import('@capacitor/geolocation')
      console.log(LOG, 'Capacitor Geolocation loaded OK')
      const perm = await Geolocation.checkPermissions()
      console.log(LOG, 'Native permission:', perm.location, perm.coarseLocation)
      if (perm.location === 'denied') return 'denied'
      if (perm.location === 'granted') return 'granted'
      return 'prompt'
    } catch (e) {
      console.warn(LOG, 'Native permission check failed:', e)
      // Fall through to web check
    }
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    console.log(LOG, 'Geolocation API not available')
    return 'unavailable'
  }

  if (navigator.permissions) {
    try {
      const perm = await navigator.permissions.query({ name: 'geolocation' })
      console.log(LOG, 'Web permission state:', perm.state)
      if (perm.state === 'denied') return 'denied'
      if (perm.state === 'granted') return 'granted'
      return 'prompt'
    } catch {
      console.log(LOG, 'Permissions API not supported (Safari)')
    }
  }

  return 'prompt'
}

/** Request location permissions on native — MUST be called before getCurrentPosition */
async function requestNativePermissions(): Promise<boolean> {
  if (!isNative()) return false
  try {
    const { Geolocation } = await import('@capacitor/geolocation')
    console.log(LOG, 'Requesting native permissions...')
    const result = await Geolocation.requestPermissions({ permissions: ['location'] })
    console.log(LOG, 'Permission request result:', result.location, result.coarseLocation)
    return result.location === 'granted'
  } catch (e) {
    console.warn(LOG, 'Permission request failed:', e)
    return false
  }
}

/** Single position reading — tries Capacitor first on native, falls back to browser API */
async function getPosition(opts: PositionOptions): Promise<LocationSample | null> {
  // Try native first
  if (isNative()) {
    try {
      const sample = await getPositionNative(opts)
      if (sample) return sample
    } catch (e: any) {
      if (e?.code === 1) throw e // permission denied — bubble up
      console.warn(LOG, 'Native getPosition failed, trying web fallback:', e)
    }
  }
  // Fallback to web API
  return getPositionWeb(opts)
}

async function getPositionNative(opts: PositionOptions): Promise<LocationSample | null> {
  const { Geolocation } = await import('@capacitor/geolocation')
  console.log(LOG, 'Native getCurrentPosition...', { enableHighAccuracy: opts.enableHighAccuracy, timeout: opts.timeout })
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
  console.log(LOG, `Native sample: ${sample.lat.toFixed(5)}, ${sample.lng.toFixed(5)}, accuracy=${Math.round(sample.accuracy)}m`)
  return sample
}

function getPositionWeb(opts: PositionOptions): Promise<LocationSample | null> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      console.warn(LOG, 'navigator.geolocation not available')
      resolve(null)
      return
    }
    console.log(LOG, 'Web getCurrentPosition...', { enableHighAccuracy: opts.enableHighAccuracy, timeout: opts.timeout })
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const sample: LocationSample = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        }
        console.log(LOG, `Web sample: ${sample.lat.toFixed(5)}, ${sample.lng.toFixed(5)}, accuracy=${Math.round(sample.accuracy)}m`)
        resolve(sample)
      },
      (err) => {
        console.warn(LOG, 'Web position error:', err.code, err.message)
        if (err.code === 1) {
          reject({ code: 1, reason: 'denied' })
        } else if (err.code === 2) {
          resolve(null)
        } else {
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

  function cancelled() { return signal?.aborted ?? false }

  // Pre-check permission
  const prePerm = await checkPermissionState()
  console.log(LOG, 'Pre-check result:', prePerm)

  if (prePerm === 'unavailable') {
    return { samples: [], permissionState: 'unavailable' }
  }
  if (prePerm === 'denied') {
    return { samples: [], permissionState: 'denied' }
  }

  // On native, request permissions BEFORE any position call
  if (isNative() && prePerm === 'prompt') {
    const granted = await requestNativePermissions()
    if (!granted) {
      console.log(LOG, 'Native permission not granted after request')
      // Re-check — might be 'denied' now
      const recheck = await checkPermissionState()
      if (recheck === 'denied') return { samples: [], permissionState: 'denied' }
      // If still prompt, try anyway — the getCurrentPosition call will trigger the system dialog
    }
  }

  const firstCallTimeout = prePerm === 'granted' ? 8_000 : 30_000

  try {
    // Step 1: coarse position
    console.log(LOG, 'Step 1: coarse position (timeout:', firstCallTimeout, 'ms)')
    const coarse = await getPosition({
      enableHighAccuracy: false,
      timeout: firstCallTimeout,
      maximumAge: 300_000,
    })
    if (cancelled()) return { samples, permissionState: 'granted' }
    addSample(coarse)

    // If coarse was high accuracy, one confirmation is enough
    if (coarse && coarse.accuracy <= 100) {
      console.log(LOG, 'Coarse was high accuracy, confirming...')
      try {
        const confirm = await getPosition({ enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 })
        if (!cancelled()) addSample(confirm)
      } catch { /* OK */ }
      return { samples, permissionState: 'granted' }
    }

    // Step 2: high-accuracy GPS
    if (!cancelled()) {
      console.log(LOG, 'Step 2: high-accuracy GPS...')
      try {
        const fine = await getPosition({ enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 })
        if (!cancelled()) addSample(fine)
      } catch { /* GPS timeout is OK */ }
    }

    // Step 3: one more if still above threshold
    const bestSoFar = samples.length > 0 ? Math.min(...samples.map(s => s.accuracy)) : Infinity
    if (!cancelled() && bestSoFar > 100) {
      console.log(LOG, 'Step 3: one more attempt...')
      try {
        const fine2 = await getPosition({ enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 })
        if (!cancelled()) addSample(fine2)
      } catch { /* OK */ }
    }

    console.log(LOG, `Done: ${samples.length} samples, best accuracy=${samples.length > 0 ? Math.round(Math.min(...samples.map(s => s.accuracy))) : 'none'}m`)
    return { samples, permissionState: 'granted' }
  } catch (e: any) {
    if (e?.code === 1) {
      console.log(LOG, 'Collection failed: permission denied')
      return { samples, permissionState: 'denied' }
    }
    console.warn(LOG, 'Collection error:', e)
    return { samples, permissionState: samples.length > 0 ? 'granted' : 'unavailable' }
  }
}
