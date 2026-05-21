import { NextRequest, NextResponse } from 'next/server'
import { fetchPlacePhoto } from '@/lib/places/googlePlaces'

export const dynamic = 'force-dynamic'

/**
 * GET /api/places/photo?name=places/.../photos/...&w=640
 *
 * Streams a Google Places photo through our server so we never
 * re-host or permanently cache Google imagery (Places ToS). The
 * Google key stays server-side. Public (no auth) so <img> tags can
 * load it directly, but it only proxies validated Google photo
 * resource names — it can't be turned into a generic fetch proxy.
 *
 * Cached at the edge for a day to keep the per-view Google photo
 * cost down without persisting bytes ourselves.
 */
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name') || ''
  const w = Number(req.nextUrl.searchParams.get('w') || '640')

  // Only Google place photo resource names — "places/<id>/photos/<ref>".
  if (!name.startsWith('places/') || !name.includes('/photos/')) {
    return new NextResponse('bad_request', { status: 400 })
  }

  const photo = await fetchPlacePhoto(name, Number.isFinite(w) ? w : 640)
  if (!photo) return new NextResponse('not_found', { status: 404 })

  return new NextResponse(photo.body, {
    status: 200,
    headers: {
      'Content-Type': photo.contentType,
      // Edge-cache a day; Google photo refs are stable for a place.
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  })
}
