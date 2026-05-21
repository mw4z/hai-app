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

export async function placesAutocomplete(
  input: string,
  sessionToken: string,
  lang: string,
): Promise<AutocompleteSuggestion[] | null> {
  const k = key()
  if (!k) return null
  try {
    const res = await fetch(`${PLACES_BASE}/places:autocomplete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': k },
      body: JSON.stringify({
        input,
        sessionToken,
        languageCode: lc(lang),
        // Bias + restrict to Saudi Arabia — the directory is KSA-only.
        regionCode: 'SA',
        includedRegionCodes: ['sa'],
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

export interface PlaceDetails {
  name: string
  address: string | null
  latitude: number | null
  longitude: number | null
  phone: string | null
  website: string | null
  mapUrl: string | null
}

export async function placeDetails(
  placeId: string,
  sessionToken: string,
  lang: string,
): Promise<PlaceDetails | null> {
  const k = key()
  if (!k) return null
  try {
    const fields =
      'id,displayName,formattedAddress,location,nationalPhoneNumber,websiteUri,googleMapsUri'
    const url =
      `${PLACES_BASE}/places/${encodeURIComponent(placeId)}` +
      `?sessionToken=${encodeURIComponent(sessionToken)}&languageCode=${lc(lang)}`
    const res = await fetch(url, {
      headers: { 'X-Goog-Api-Key': k, 'X-Goog-FieldMask': fields },
    })
    if (!res.ok) return null
    const d = (await res.json()) as {
      displayName?: { text?: string }
      formattedAddress?: string
      location?: { latitude?: number; longitude?: number }
      nationalPhoneNumber?: string
      websiteUri?: string
      googleMapsUri?: string
    }
    // Normalize the Saudi national phone ("055 123 4567") to the bare
    // 05xxxxxxxx the form + validators expect.
    const phone = d.nationalPhoneNumber
      ? d.nationalPhoneNumber.replace(/\D/g, '') || null
      : null
    return {
      name: d.displayName?.text ?? '',
      address: d.formattedAddress ?? null,
      latitude: typeof d.location?.latitude === 'number' ? d.location.latitude : null,
      longitude: typeof d.location?.longitude === 'number' ? d.location.longitude : null,
      phone,
      website: d.websiteUri ?? null,
      mapUrl: d.googleMapsUri ?? null,
    }
  } catch {
    return null
  }
}
