/**
 * Point-in-polygon detection using ray-casting algorithm.
 * Platform-agnostic — works on both server and client.
 */

/**
 * Check if a point is inside a polygon using ray-casting.
 * @param lat - latitude of the point
 * @param lng - longitude of the point
 * @param polygon - array of [lng, lat] coordinates (GeoJSON order)
 * @returns true if point is inside the polygon
 */
export function pointInPolygon(lat: number, lng: number, polygon: number[][]): boolean {
  let inside = false
  const n = polygon.length

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = polygon[i] // [lng, lat]
    const [xj, yj] = polygon[j]

    // Ray-casting: count intersections of a horizontal ray from the point
    if ((yi > lat) !== (yj > lat) &&
        lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) {
      inside = !inside
    }
  }

  return inside
}

/**
 * Check if a point is within a bounding box.
 * Fast pre-check before expensive polygon test.
 * @param lat - latitude
 * @param lng - longitude
 * @param bbox - [minLng, minLat, maxLng, maxLat]
 * @param marginDegrees - optional margin to expand the bbox (for near-boundary checks)
 */
export function pointInBbox(
  lat: number,
  lng: number,
  bbox: [number, number, number, number],
  marginDegrees = 0,
): boolean {
  const [minLng, minLat, maxLng, maxLat] = bbox
  return (
    lng >= minLng - marginDegrees &&
    lng <= maxLng + marginDegrees &&
    lat >= minLat - marginDegrees &&
    lat <= maxLat + marginDegrees
  )
}

/**
 * Approximate distance from a point to the nearest edge of a polygon.
 * Returns distance in meters. Used for near-boundary confidence checks.
 */
export function distanceToPolygonEdge(lat: number, lng: number, polygon: number[][]): number {
  let minDist = Infinity

  for (let i = 0; i < polygon.length - 1; i++) {
    const [x1, y1] = polygon[i]     // [lng, lat]
    const [x2, y2] = polygon[i + 1]
    const dist = pointToSegmentDistance(lng, lat, x1, y1, x2, y2)
    if (dist < minDist) minDist = dist
  }

  // Convert degrees to approximate meters (at Saudi latitudes ~21-25°N)
  return minDist * 111_000
}

/** Distance from point to line segment (in degrees) */
function pointToSegmentDistance(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy

  if (lenSq === 0) {
    // Segment is a point
    return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2)
  }

  // Project point onto the segment
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))

  const projX = x1 + t * dx
  const projY = y1 + t * dy

  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2)
}
