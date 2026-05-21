import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { gatePublicRoute } from '@/lib/places/routeGate'
import { placeDetails, placesEnabled } from '@/lib/places/googlePlaces'

export const dynamic = 'force-dynamic'

/**
 * POST /api/places/details
 *   body: { placeId: string, sessionToken: string, lang?: string }
 *
 * Resolves a Places Autocomplete selection to the fields we autofill
 * (name, address, lat/lng, phone, website, maps URL). Sending the
 * SAME sessionToken used for the autocomplete keystrokes closes the
 * session so Google bills it as one unit, not per-request.
 *
 * Returns { details } or { details: null } when unavailable.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true },
  })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const gate = gatePublicRoute(user.role)
  if (gate) return gate

  if (!placesEnabled()) return NextResponse.json({ details: null })

  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const placeId = typeof raw?.placeId === 'string' ? raw.placeId.slice(0, 200) : ''
  const sessionToken =
    typeof raw?.sessionToken === 'string' ? raw.sessionToken.slice(0, 64) : ''
  const lang = typeof raw?.lang === 'string' ? raw.lang : 'ar'

  if (!placeId) return NextResponse.json({ details: null })

  const details = await placeDetails(placeId, sessionToken, lang)
  return NextResponse.json({ details })
}
