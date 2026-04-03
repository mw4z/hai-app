/**
 * Fix unmatched neighborhoods by spatial lookup against Balady.
 * For each legacy neighborhood with a center point, asks Balady:
 * "Which official neighborhood contains this point?"
 * Then copies that boundary data.
 *
 * Usage: npx tsx scripts/fix-unmatched.ts
 */

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const DATABASE_URL = 'postgresql://postgres:1999**@localhost:5432/hai_db'
const adapter = new PrismaPg({ connectionString: DATABASE_URL })
const db = new PrismaClient({ adapter } as any)

const PROXY_BASE = 'https://umaps.balady.gov.sa/newProxyUDP/proxy.ashx?'
const SERVICE_URL = 'https://umapsudp.momrah.gov.sa/server/rest/services/Umaps/UMaps_AdministrativeData/MapServer/0/query'

async function spatialLookup(lat: number, lng: number): Promise<{
  name: string; nameEn: string; districtId: string; boundary: number[][]; bbox: number[]
} | null> {
  const geom = encodeURIComponent(JSON.stringify({
    x: lng, y: lat, spatialReference: { wkid: 4326 },
  }))
  const url = `${PROXY_BASE}${SERVICE_URL}?geometry=${geom}&geometryType=esriGeometryPoint&spatialRel=esriSpatialRelIntersects&outFields=DISTRICTNAME_AR,DISTRICTNAME_EN,DISTRICT_ID&returnGeometry=true&f=geojson&outSR=4326`

  const res = await fetch(url, { headers: { Referer: 'https://umaps.balady.gov.sa/' } })
  if (!res.ok) return null

  const data = await res.json()
  if (!data.features || data.features.length === 0) return null

  const f = data.features[0]
  let outerRing: number[][]
  if (f.geometry.type === 'Polygon') {
    outerRing = f.geometry.coordinates[0]
  } else if (f.geometry.type === 'MultiPolygon') {
    const polys = f.geometry.coordinates as number[][][][]
    outerRing = polys.reduce((largest: number[][], poly: number[][][]) =>
      poly[0].length > largest.length ? poly[0] : largest
    , polys[0][0])
  } else {
    return null
  }

  // Compute bbox
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
  for (const [pLng, pLat] of outerRing) {
    if (pLng < minLng) minLng = pLng
    if (pLat < minLat) minLat = pLat
    if (pLng > maxLng) maxLng = pLng
    if (pLat > maxLat) maxLat = pLat
  }

  return {
    name: f.properties.DISTRICTNAME_AR,
    nameEn: f.properties.DISTRICTNAME_EN,
    districtId: f.properties.DISTRICT_ID,
    boundary: outerRing,
    bbox: [minLng, minLat, maxLng, maxLat],
  }
}

async function main() {
  const all = await db.neighborhood.findMany({
    include: { city: { select: { name: true } } },
  })
  const unmatched = all.filter((n: any) => n.boundary === null && n.lat && n.lng)

  console.log(`🔍 Fixing ${unmatched.length} unmatched neighborhoods via spatial lookup...\n`)

  let fixed = 0
  let notInBalady = 0

  for (const n of unmatched) {
    const result = await spatialLookup(n.lat!, n.lng!)

    if (result) {
      // Compute center from boundary
      let cLat = 0, cLng = 0
      for (const [pLng, pLat] of result.boundary) { cLng += pLng; cLat += pLat }
      cLat /= result.boundary.length
      cLng /= result.boundary.length

      await db.neighborhood.update({
        where: { id: n.id },
        data: {
          boundary: result.boundary,
          bbox: result.bbox,
          lat: Math.round(cLat * 10000) / 10000,
          lng: Math.round(cLng * 10000) / 10000,
          source: 'balady',
          baladyId: result.districtId,
          // Keep our local name (users know it as الزايدي, not الملك فهد)
          // but log what Balady calls it
        },
      })
      fixed++
      console.log(`✅ ${n.name} → Balady: "${result.name}" (${result.nameEn}), ID: ${result.districtId}`)
    } else {
      notInBalady++
      console.log(`❌ ${n.name} — not inside any Balady polygon (holy site or unmapped)`)
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 200))
  }

  console.log(`\n📊 Fixed: ${fixed}, Not in Balady: ${notInBalady}`)
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
