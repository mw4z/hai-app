/**
 * Server-side wrappers for Google Places API (New).
 *
 * The API key lives ONLY here (server env GOOGLE_PLACES_API_KEY) and
 * never reaches the browser — the client talks to our own
 * /api/places/* routes, which call these. That keeps the key off the
 * wire (no referrer-restricted public key to leak) and lets us cap
 * cost with auth + our own rate limits.
 *
 * Cost control: autocomplete + details share a `sessionToken` (a
 * client-generated UUID). Google bills the autocomplete keystrokes
 * + the final details call as ONE session instead of per-request,
 * as long as the same token is sent to both and a details call ends
 * the session. See https://developers.google.com/maps/documentation/places/web-service/session-tokens
 *
 * If GOOGLE_PLACES_API_KEY is unset, every helper returns null so the
 * UI degrades gracefully (autocomplete box hides, manual entry stays).
 */

import type { PlaceCategory } from '@prisma/client'
import { googleTypeToCategory, googleHoursToApp, type GooglePeriod } from './googleConvert'

const PLACES_BASE = 'https://places.googleapis.com/v1'

export function placesEnabled(): boolean {
  return !!process.env.GOOGLE_PLACES_API_KEY
}

function key(): string | null {
  return process.env.GOOGLE_PLACES_API_KEY || null
}

export interface AutocompleteSuggestion {
  placeId: string
  primary: string
  secondary: string
}

/** CLDR language code passthrough — Google accepts ar/en/ur. */
function lc(lang: string): string {
  return lang === 'en' ? 'en' : lang === 'ur' ? 'ur' : 'ar'
}

export interface AutocompleteArea {
  /** Soft "near first" bias circle. */
  bias?: { lat: number; lng: number; radiusM?: number }
  /** Hard rectangle restriction — results OUTSIDE this box are
   *  dropped entirely. Used for add-place (neighborhood-only). */
  restrictRect?: { lowLat: number; lowLng: number; highLat: number; highLng: number }
}

export async function placesAutocomplete(
  input: string,
  sessionToken: string,
  lang: string,
  area?: AutocompleteArea | null,
): Promise<AutocompleteSuggestion[] | null> {
  const k = key()
  if (!k) return null
  // Build the location qualifier: a hard rectangle restriction wins
  // (add-place must stay inside the neighborhood); else a soft bias
  // circle ("near first"); else just restrict to KSA by region.
  let locationField: Record<string, unknown>
  if (area?.restrictRect) {
    const r = area.restrictRect
    locationField = {
      locationRestriction: {
        rectangle: {
          low: { latitude: r.lowLat, longitude: r.lowLng },
          high: { latitude: r.highLat, longitude: r.highLng },
        },
      },
    }
  } else if (area?.bias) {
    locationField = {
      locationBias: {
        circle: {
          center: { latitude: area.bias.lat, longitude: area.bias.lng },
          radius: area.bias.radiusM ?? 30000,
        },
      },
    }
  } else {
    locationField = { includedRegionCodes: ['sa'] }
  }
  try {
    const res = await fetch(`${PLACES_BASE}/places:autocomplete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': k },
      body: JSON.stringify({
        input,
        sessionToken,
        languageCode: lc(lang),
        regionCode: 'SA',
        ...locationField,
      }),
    })
    if (!res.ok) return []
    const data = (await res.json()) as {
      suggestions?: Array<{
        placePrediction?: {
          placeId?: string
          structuredFormat?: {
            mainText?: { text?: string }
            secondaryText?: { text?: string }
          }
          text?: { text?: string }
        }
      }>
    }
    return (data.suggestions ?? [])
      .map((s) => {
        const p = s.placePrediction
        if (!p?.placeId) return null
        return {
          placeId: p.placeId,
          primary: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
          secondary: p.structuredFormat?.secondaryText?.text ?? '',
        }
      })
      .filter((x): x is AutocompleteSuggestion => x !== null)
  } catch {
    return []
  }
}

export interface GoogleReview {
  author: string | null
  rating: number | null
  text: string | null
  relativeTime: string | null
}

export interface PlaceDetails {
  name: string
  address: string | null
  latitude: number | null
  longitude: number | null
  phone: string | null
  website: string | null
  mapUrl: string | null
  /** Detected Hai category from Google place types (null = keep current). */
  category: PlaceCategory | null
  // Google snapshot (attribution-required; refresh within ~30d).
  rating: number | null
  ratingCount: number | null
  hours: string | null // weekdayDescriptions joined by \n (display fallback)
  /** Google hours converted into the app's openingHours string so the
   *  open/closed pill works. null when not convertible. */
  appHours: string | null
  photoRefs: string[] // up to 3 Google photo resource names
  reviews: GoogleReview[] // up to 5 Google reviews
}

const DETAILS_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'nationalPhoneNumber',
  'websiteUri',
  'googleMapsUri',
  'primaryType',
  'types',
  'rating',
  'userRatingCount',
  'regularOpeningHours',
  'photos',
  'reviews',
].join(',')

interface RawPlace {
  displayName?: { text?: string }
  formattedAddress?: string
  location?: { latitude?: number; longitude?: number }
  nationalPhoneNumber?: string
  websiteUri?: string
  googleMapsUri?: string
  primaryType?: string
  types?: string[]
  rating?: number
  userRatingCount?: number
  regularOpeningHours?: { weekdayDescriptions?: string[]; periods?: GooglePeriod[] }
  photos?: Array<{ name?: string }>
  reviews?: Array<{
    rating?: number
    text?: { text?: string }
    originalText?: { text?: string }
    authorAttribution?: { displayName?: string }
    relativePublishTimeDescription?: string
  }>
}

function mapPlace(d: RawPlace): PlaceDetails {
  // Normalize the Saudi national phone ("055 123 4567") to the bare
  // 05xxxxxxxx the form + validators expect.
  const phone = d.nationalPhoneNumber
    ? d.nationalPhoneNumber.replace(/\D/g, '') || null
    : null
  const hours =
    d.regularOpeningHours?.weekdayDescriptions &&
    d.regularOpeningHours.weekdayDescriptions.length > 0
      ? d.regularOpeningHours.weekdayDescriptions.join('\n')
      : null
  const appHours = googleHoursToApp(d.regularOpeningHours?.periods)
  const photoRefs = (d.photos ?? [])
    .map((p) => p.name)
    .filter((n): n is string => typeof n === 'string' && n.startsWith('places/'))
    .slice(0, 3)
  const reviews: GoogleReview[] = (d.reviews ?? [])
    .slice(0, 5)
    .map((r) => ({
      author: r.authorAttribution?.displayName ?? null,
      rating: typeof r.rating === 'number' ? r.rating : null,
      text: r.text?.text ?? r.originalText?.text ?? null,
      relativeTime: r.relativePublishTimeDescription ?? null,
    }))
    .filter((r) => r.text || r.rating != null)
  return {
    name: d.displayName?.text ?? '',
    address: d.formattedAddress ?? null,
    latitude: typeof d.location?.latitude === 'number' ? d.location.latitude : null,
    longitude: typeof d.location?.longitude === 'number' ? d.location.longitude : null,
    phone,
    website: d.websiteUri ?? null,
    mapUrl: d.googleMapsUri ?? null,
    category: googleTypeToCategory(d.types, d.primaryType),
    rating: typeof d.rating === 'number' ? d.rating : null,
    ratingCount: typeof d.userRatingCount === 'number' ? d.userRatingCount : null,
    hours,
    appHours,
    photoRefs,
    reviews,
  }
}

export async function placeDetails(
  placeId: string,
  sessionToken: string,
  lang: string,
): Promise<PlaceDetails | null> {
  const k = key()
  if (!k) return null
  try {
    const url =
      `${PLACES_BASE}/places/${encodeURIComponent(placeId)}` +
      `?sessionToken=${encodeURIComponent(sessionToken)}&languageCode=${lc(lang)}`
    const res = await fetch(url, {
      headers: { 'X-Goog-Api-Key': k, 'X-Goog-FieldMask': DETAILS_FIELD_MASK },
    })
    if (!res.ok) return null
    return mapPlace((await res.json()) as RawPlace)
  } catch {
    return null
  }
}

/**
 * Authoritative server-side snapshot for a place_id, with NO session
 * token (a standalone billable lookup). Used on submit so we trust
 * Google's own rating/hours/photos rather than client-sent values a
 * user could forge. lang fixed to Arabic for the stored snapshot.
 */
export async function placeSnapshot(placeId: string): Promise<PlaceDetails | null> {
  const k = key()
  if (!k) return null
  try {
    const url = `${PLACES_BASE}/places/${encodeURIComponent(placeId)}?languageCode=ar`
    const res = await fetch(url, {
      headers: { 'X-Goog-Api-Key': k, 'X-Goog-FieldMask': DETAILS_FIELD_MASK },
    })
    if (!res.ok) return null
    return mapPlace((await res.json()) as RawPlace)
  } catch {
    return null
  }
}

/**
 * Fetch the bytes for a Google photo resource name and return them
 * for the /api/places/photo proxy to stream. ToS-compliant: we never
 * persist the image, just relay it per request. Returns null on any
 * failure so the proxy can 404 cleanly.
 */
export async function fetchPlacePhoto(
  photoName: string,
  maxWidthPx: number,
): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  const k = key()
  if (!k) return null
  if (!photoName.startsWith('places/')) return null
  try {
    const w = Math.min(Math.max(maxWidthPx, 80), 1600)
    const url = `${PLACES_BASE}/${photoName}/media?maxWidthPx=${w}&key=${encodeURIComponent(k)}`
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') || 'image/jpeg'
    const body = await res.arrayBuffer()
    return { body, contentType }
  } catch {
    return null
  }
}
