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
    select: { role: true, neighborhood: { select: { lat: true, lng: true } } },
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

  // "Near first" bias: prefer client-sent device coords (rides passes
  // these); otherwise fall back to the user's neighborhood center so
  // the directory still ranks nearby places first without prompting
  // for location.
  const bodyLat = Number(raw?.lat)
  const bodyLng = Number(raw?.lng)
  const bias =
    Number.isFinite(bodyLat) && Number.isFinite(bodyLng)
      ? { lat: bodyLat, lng: bodyLng }
      : user.neighborhood?.lat != null && user.neighborhood?.lng != null
        ? { lat: user.neighborhood.lat, lng: user.neighborhood.lng }
        : null

  const suggestions = await placesAutocomplete(input, sessionToken, lang, bias)
  return NextResponse.json({ suggestions: suggestions ?? [] })
}
