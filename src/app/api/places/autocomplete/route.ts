import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { gatePublicRoute } from '@/lib/places/routeGate'
import { placesAutocomplete, placesEnabled } from '@/lib/places/googlePlaces'

export const dynamic = 'force-dynamic'

/**
 * POST /api/places/autocomplete
 *   body: { input: string, sessionToken: string, lang?: string }
 *
 * Proxies Google Places Autocomplete (New) server-side so the API
 * key stays private. Auth-gated to logged-in residents (same gate
 * as the rest of the directory) — keeps anonymous traffic off our
 * billed key.
 *
 * Returns { suggestions: [{ placeId, primary, secondary }] }, or
 * { suggestions: [] } when Places isn't configured / input too short.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, neighborhood: { select: { lat: true, lng: true, bbox: true } } },
  })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const gate = gatePublicRoute(user.role)
  if (gate) return gate

  if (!placesEnabled()) return NextResponse.json({ suggestions: [] })

  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const input = typeof raw?.input === 'string' ? raw.input.trim().slice(0, 120) : ''
  const sessionToken =
    typeof raw?.sessionToken === 'string' ? raw.sessionToken.slice(0, 64) : ''
  const lang = typeof raw?.lang === 'string' ? raw.lang : 'ar'

  // Two-char floor — single keystrokes are noise and still bill.
  if (input.length < 2 || !sessionToken) {
    return NextResponse.json({ suggestions: [] })
  }

  // Area qualifier:
  //  - restrict=true (add-place): HARD-limit to the neighborhood's
  //    bounding box so far places never appear.
  //  - else: soft "near first" bias toward client device coords
  //    (rides) or the neighborhood center (directory search).
  const bbox = user.neighborhood?.bbox as number[] | null | undefined
  const hasBbox = Array.isArray(bbox) && bbox.length === 4 && bbox.every((n) => Number.isFinite(n))
  let area: import('@/lib/places/googlePlaces').AutocompleteArea | null = null

  if (raw?.restrict === true && hasBbox) {
    // bbox = [minLng, minLat, maxLng, maxLat]
    area = {
      restrictRect: { lowLat: bbox![1], lowLng: bbox![0], highLat: bbox![3], highLng: bbox![2] },
    }
  } else {
    const bodyLat = Number(raw?.lat)
    const bodyLng = Number(raw?.lng)
    if (Number.isFinite(bodyLat) && Number.isFinite(bodyLng)) {
      area = { bias: { lat: bodyLat, lng: bodyLng } }
    } else if (user.neighborhood?.lat != null && user.neighborhood?.lng != null) {
      area = { bias: { lat: user.neighborhood.lat, lng: user.neighborhood.lng } }
    }
  }

  const suggestions = await placesAutocomplete(input, sessionToken, lang, area)
  return NextResponse.json({ suggestions: suggestions ?? [] })
}
