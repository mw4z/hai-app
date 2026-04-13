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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = parseFloat(searchParams.get('lat') || '')
  const lng = parseFloat(searchParams.get('lng') || '')
  const accuracy = parseFloat(searchParams.get('accuracy') || '999')

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'إحداثيات غير صالحة' }, { status: 400 })
  }

  const neighborhoods = await db.neighborhood.findMany({
    where: { hidden: false },
    include: { city: { select: { id: true, name: true, nameEn: true } } },
  })

  // Sort: community neighborhoods first so they take priority over Balady
  // when polygons overlap (e.g. الزايدي is a community area inside a larger Balady district)
  const sorted = [...neighborhoods].sort((a, b) => {
    if (a.source === 'community' && b.source !== 'community') return -1
    if (b.source === 'community' && a.source !== 'community') return 1
    return 0
  })

  // ─── Strategy 1: Polygon match (preferred, when boundary data exists) ────
  let polygonMatch: typeof sorted[0] | null = null
  let edgeDistanceMeters: number | null = null

  for (const n of sorted) {
    if (!n.boundary || !n.bbox) continue

    const bbox = n.bbox as [number, number, number, number]
    if (!pointInBbox(lat, lng, bbox, 0.005)) continue

    const polygon = n.boundary as number[][]
    if (pointInPolygon(lat, lng, polygon)) {
      polygonMatch = n
      edgeDistanceMeters = distanceToPolygonEdge(lat, lng, polygon)
      break
    }
  }

  // ?nearby=true → return nearby neighborhoods sorted by distance. Used by
  // the onboarding fallback picker when precise GPS failed. Must ALWAYS
  // return at least one candidate when any neighborhood centroid exists,
  // so the user is never left with an empty list after a location miss.
  if (searchParams.get('nearby') === 'true') {
    const FALLBACK_RADIUS_KM = 8
    const MAX_RESULTS = 6

    const scored = neighborhoods
      .filter(n => n.lat != null && n.lng != null)
      .map(n => ({
        id: n.id,
        name: n.name,
        nameEn: n.nameEn,
        distanceKm: Math.round(haversineKm(lat, lng, n.lat!, n.lng!) * 10) / 10,
        city: n.city,
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)

    // First, the ones within the fallback radius
    let withinRadius = scored.filter(n => n.distanceKm <= FALLBACK_RADIUS_KM)

    // If nothing is within radius but we have neighborhoods at all, fall
    // back to the 3 closest (still bounded — never the whole database).
    // This matches the product rule: the user must always have a real
    // next step, but the list stays small and deterministic.
    if (withinRadius.length === 0 && scored.length > 0) {
      withinRadius = scored.slice(0, 3)
    }

    return NextResponse.json(withinRadius.slice(0, MAX_RESULTS))
  }

  // ─── If polygon match found ──────────────────────────────────────────────
  if (polygonMatch) {
    const distanceKm = polygonMatch.lat && polygonMatch.lng
      ? Math.round(haversineKm(lat, lng, polygonMatch.lat, polygonMatch.lng) * 10) / 10
      : 0

    let confidence: 'high' | 'medium' | 'low' = 'high'
    if (edgeDistanceMeters !== null && edgeDistanceMeters < accuracy) {
      confidence = 'medium'
    }

    console.log(`[DETECT] polygon match: ${polygonMatch.name} (${polygonMatch.nameEn}), confidence=${confidence}, edgeDist=${Math.round(edgeDistanceMeters ?? 0)}m, accuracy=${Math.round(accuracy)}m`)

    return NextResponse.json({
      id: polygonMatch.id,
      name: polygonMatch.name,
      nameEn: polygonMatch.nameEn,
      distanceKm,
      city: polygonMatch.city,
      confidence,
      requiresConfirmation: confidence !== 'high',
      accuracy: Math.round(accuracy),
      matchType: 'polygon',
      source: polygonMatch.source,
    })
  }

  // ─── Strategy 2: Haversine fallback (no polygon data for this area) ──────
  const withDistances = neighborhoods
    .filter(n => n.lat != null && n.lng != null)
    .map(n => ({
      ...n,
      distanceKm: Math.round(haversineKm(lat, lng, n.lat!, n.lng!) * 100) / 100,
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)

  if (withDistances.length === 0) {
    return NextResponse.json({ error: 'لا توجد أحياء' }, { status: 404 })
  }

  const closest = withDistances[0]

  // Fallback confidence: never "high" since we're guessing by distance
  let confidence: 'high' | 'medium' | 'low'
  if (accuracy <= 100 && closest.distanceKm < 2) {
    confidence = 'medium' // decent GPS + close, but no polygon confirmation
  } else if (accuracy <= 5000 && closest.distanceKm < 10) {
    confidence = 'medium'
  } else {
    confidence = 'low'
  }

  console.log(`[DETECT] haversine fallback: ${closest.name} (${closest.nameEn}), dist=${closest.distanceKm}km, confidence=${confidence}, accuracy=${Math.round(accuracy)}m, source=${closest.source}`)

  return NextResponse.json({
    id: closest.id,
    name: closest.name,
    nameEn: closest.nameEn,
    distanceKm: Math.round(closest.distanceKm * 10) / 10,
    city: closest.city,
    confidence,
    requiresConfirmation: true,
    accuracy: Math.round(accuracy),
    matchType: 'haversine',
    source: closest.source,
  })
}
