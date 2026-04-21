/**
 * Shared wrapper around "give me a single GPS fix" that checks the
 * Capacitor permission state FIRST and short-circuits if the user has
 * already granted location (typically during signup). Without this,
 * every feature that asked for a fix re-prompted the Android user
 * even though they'd already said yes once.
 *
 * On web, falls back to navigator.geolocation — the browser handles
 * its own permission caching.
 */

function isNative(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!(window as any).Capacitor?.isNativePlatform?.()
  )
}

export interface SafePosition {
  coords: { latitude: number; longitude: number; accuracy?: number }
}

export interface SafePositionOptions {
  enableHighAccuracy?: boolean
  timeout?: number
  maximumAge?: number
}

export async function getCurrentPositionSafe(
  opts: SafePositionOptions = {},
): Promise<SafePosition> {
  if (isNative()) {
    const { Geolocation } = await import('@capacitor/geolocation')
    const current = await Geolocation.checkPermissions()
    let state: string = current.location || current.coarseLocation || 'prompt'
    if (state !== 'granted') {
      const requested = await Geolocation.requestPermissions()
      state = requested.location || requested.coarseLocation || 'prompt'
    }
    if (state !== 'granted') {
      throw Object.assign(new Error('permission_denied'), { code: 1 })
    }
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: !!opts.enableHighAccuracy,
      timeout: opts.timeout ?? 10_000,
      maximumAge: opts.maximumAge ?? 0,
    })
    return {
      coords: {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      },
    }
  }

  return new Promise<SafePosition>((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(Object.assign(new Error('unavailable'), { code: 2 }))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        coords: {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        },
      }),
      (err) => reject(err),
      {
        enableHighAccuracy: !!opts.enableHighAccuracy,
        timeout: opts.timeout ?? 10_000,
        maximumAge: opts.maximumAge ?? 0,
      },
    )
  })
}
