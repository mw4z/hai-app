/**
 * Location picker — opens the shared MapPicker overlay and returns a
 * `📍 ...` text snippet ready to embed in a chat message or comment
 * body. SmartText / LocationChip detects the snippet at render time
 * and renders an interactive map card with "Open in Maps" actions.
 *
 * Why a text snippet (not a typed message field): comments don't have
 * lat/lng columns, and adding them would mean a schema change + API
 * version. Snippets ride inside the existing `body` string and work
 * everywhere `SmartText` already renders — no DB/API change needed.
 * Chat messages also use this for consistency, even though the schema
 * has lat/lng fields, so both surfaces render identically.
 */

type PickedLocation = { name: string; lat: number; lng: number } | null

function getPlatform(): string {
  return (typeof window !== 'undefined' && (window as any).Capacitor?.getPlatform?.()) || 'web'
}

/**
 * Attempt to get a sensible default map center: user's GPS first
 * (if granted), fall back to a regional default if not. Returns
 * coords for openMapPicker's centerLat/centerLng.
 */
async function getDefaultCenter(fallback: { lat: number; lng: number }): Promise<{ lat: number; lng: number }> {
  try {
    if (getPlatform() !== 'web') {
      const { getCurrentPositionSafe } = await import('@/lib/location/getCurrentPositionSafe')
      const pos = await getCurrentPositionSafe({ enableHighAccuracy: false, timeout: 5_000, maximumAge: 60_000 })
      return { lat: pos.coords.latitude, lng: pos.coords.longitude }
    }
    // Web: best-effort, short timeout — if user hasn't granted, fall back fast
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      if (!('geolocation' in navigator)) return reject(new Error('no geolocation'))
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false, timeout: 4_000, maximumAge: 60_000,
      })
    })
    return { lat: pos.coords.latitude, lng: pos.coords.longitude }
  } catch {
    return fallback
  }
}

/**
 * Open the map picker, return a `📍 Name\nhttps://maps.google.com/?q=lat,lng`
 * snippet string. Returns null if the user cancels or the picker fails
 * to open.
 *
 * Pass `defaultCenter` when the caller has a better starting point
 * than GPS — e.g. the user's neighborhood centroid for a comment on
 * a neighborhood-scoped post.
 */
export async function attachLocation(opts: {
  lang: string
  defaultCenter?: { lat: number; lng: number }
}): Promise<string | null> {
  if (typeof window === 'undefined') return null
  const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY || ''
  // Default to the centroid of Saudi Arabia if nothing else is given —
  // the picker will still let the user pan freely.
  const fallback = opts.defaultCenter || { lat: 24.7, lng: 46.7 }
  const center = await getDefaultCenter(fallback)

  const { openMapPicker } = await import('@/components/rides/openMapPicker')
  const result = await openMapPicker({
    centerLat: center.lat,
    centerLng: center.lng,
    lang: opts.lang,
    maptilerKey,
  })
  if (!result) return null
  // Prefer the short area name ("الزايدي") over the full reverse-
  // geocoded address ("شارع... حي الزايدي... مكة") for a clean
  // single-line label inside the chip.
  const name = result.area || result.address?.split(',')[0] || ''
  return formatLocationSnippet({ name, lat: result.lat, lng: result.lng })
}

/**
 * Format a picked location as a plain-text snippet. The snippet is
 * detected by parseMessageSegments() at render time and replaced by
 * a LocationChip. The trailing maps URL is also a working link, so
 * legacy renderers (notifications, email digests, copy-to-clipboard)
 * still let the user open the location even when the chip isn't
 * available.
 */
export function formatLocationSnippet(loc: { name?: string; lat: number; lng: number }): string {
  const url = `https://maps.google.com/?q=${loc.lat},${loc.lng}`
  const cleanName = (loc.name || '').trim().replace(/\n/g, ' ')
  if (cleanName) return `📍 ${cleanName}\n${url}`
  return `📍 ${url}`
}
