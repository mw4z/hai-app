import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { pointInPolygon, pointInBbox, distanceToPolygonEdge } from '@/lib/location/polygon'

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * GET /api/admin/debug-location?lat=21.4080&lng=39.7580&accuracy=50
 *
 * Returns detailed diagnostic info about neighborhood resolution.
 * No auth required — for dev/debug only.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = parseFloat(searchParams.get('lat') || '')
  const lng = parseFloat(searchParams.get('lng') || '')
  const accuracy = parseFloat(searchParams.get('accuracy') || '50')

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 })
  }

  const neighborhoods = await db.neighborhood.findMany({
    include: { city: { select: { name: true, nameEn: true } } },
  })

  // Polygon checks
  const polygonResults: {
    name: string
    nameEn: string
    city: string
    bboxHit: boolean
    insidePolygon: boolean
    edgeDistanceM: number | null
  }[] = []

  let polygonMatch: typeof neighborhoods[0] | null = null

  for (const n of neighborhoods) {
    if (!n.boundary || !n.bbox) continue

    const bbox = n.bbox as [number, number, number, number]
    const polygon = n.boundary as number[][]
    const bboxHit = pointInBbox(lat, lng, bbox, 0.005)

    if (bboxHit) {
      const inside = pointInPolygon(lat, lng, polygon)
      const edgeDist = inside ? Math.round(distanceToPolygonEdge(lat, lng, polygon)) : null

      polygonResults.push({
        name: n.name,
        nameEn: n.nameEn,
        city: n.city.name,
        bboxHit: true,
        insidePolygon: inside,
        edgeDistanceM: edgeDist,
      })

      if (inside && !polygonMatch) polygonMatch = n
    }
  }

  // Haversine top 5
  const haversineTop = neighborhoods
    .filter(n => n.lat != null && n.lng != null)
    .map(n => ({
      name: n.name,
      nameEn: n.nameEn,
      city: n.city.name,
      distanceKm: Math.round(haversineKm(lat, lng, n.lat!, n.lng!) * 100) / 100,
      hasBoundary: n.boundary !== null,
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 5)

  // Stats
  const totalWithBoundary = neighborhoods.filter(n => n.boundary !== null).length

  return NextResponse.json({
    input: { lat, lng, accuracy },
    stats: {
      totalNeighborhoods: neighborhoods.length,
      withPolygonBoundary: totalWithBoundary,
      withoutBoundary: neighborhoods.length - totalWithBoundary,
    },
    polygonMatch: polygonMatch ? {
      name: polygonMatch.name,
      nameEn: polygonMatch.nameEn,
      city: polygonMatch.city.name,
      matchType: 'polygon',
      confidence: 'high',
    } : null,
    polygonCandidates: polygonResults,
    haversineTop5: haversineTop,
    fallbackReason: !polygonMatch
      ? (polygonResults.length > 0
        ? 'bbox hit but not inside any polygon'
        : 'no polygon boundaries near this location')
      : null,
  })
}
