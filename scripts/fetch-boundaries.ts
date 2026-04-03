/**
 * Fetch neighborhoods with polygon boundaries from Balady and INSERT them into the DB.
 * This is the PRIMARY source of neighborhood data — no legacy cities.ts dependency.
 *
 * Also inserts community-defined neighborhoods (الزايدي, الملك فهد Mecca).
 *
 * Usage: npx tsx scripts/fetch-boundaries.ts
 */

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

// Load .env.local
function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return
  const content = fs.readFileSync(filePath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let val = trimmed.slice(eqIdx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}
loadEnvFile(path.resolve('.env.local'))
loadEnvFile(path.resolve('.env'))

const DATABASE_URL = process.env.DIRECT_URL || process.env.DATABASE_URL || 'postgresql://postgres:1999**@localhost:5432/hai_db'
const adapter = new PrismaPg({ connectionString: DATABASE_URL })
const db = new PrismaClient({ adapter } as any)

const PROXY_BASE = 'https://umaps.balady.gov.sa/newProxyUDP/proxy.ashx?'
const SERVICE_URL = 'https://umapsudp.momrah.gov.sa/server/rest/services/Umaps/UMaps_AdministrativeData/MapServer/0/query'

// Balady AMANA_IDs for our target cities
const CITY_AMANA: Record<string, string[]> = {
  'مكة المكرمة': ['002001', '002002', '002003'],
  'جدة':         ['001001', '001002', '009001'],
  'الرياض':      ['001001', '001002'],
}

// We filter to neighborhoods whose AMANA_ID starts with these prefixes
const TARGET_AMANA_PREFIXES = ['001', '002', '005', '009']

interface GeoJSONFeature {
  type: 'Feature'
  geometry: { type: string; coordinates: any }
  properties: {
    OBJECTID: number
    DISTRICTNAME_AR: string
    DISTRICTNAME_EN: string
    DISTRICT_ID: string
    AMANA_ID?: string
    CITY_ID?: string
    AREAKM?: number
  }
}

async function fetchFeatures(whereClause: string, offset = 0): Promise<GeoJSONFeature[]> {
  const params = new URLSearchParams({
    where: whereClause,
    outFields: 'OBJECTID,DISTRICTNAME_AR,DISTRICTNAME_EN,DISTRICT_ID,AMANA_ID,CITY_ID',
    returnGeometry: 'true',
    f: 'geojson',
    resultRecordCount: '2000',
    resultOffset: offset.toString(),
    outSR: '4326',
  })

  const url = `${PROXY_BASE}${SERVICE_URL}?${params}`
  console.log(`  Fetching offset=${offset}...`)

  const res = await fetch(url, { headers: { 'Referer': 'https://umaps.balady.gov.sa/' } })
  if (!res.ok) return []

  const data = await res.json()
  const features: GeoJSONFeature[] = data.features || []
  console.log(`  Got ${features.length} features`)

  if (features.length === 2000) {
    const more = await fetchFeatures(whereClause, offset + 2000)
    return [...features, ...more]
  }
  return features
}

function extractPolygon(feature: GeoJSONFeature): number[][] | null {
  const geo = feature.geometry
  let ring: number[][]
  if (geo.type === 'Polygon') {
    ring = geo.coordinates[0]
  } else if (geo.type === 'MultiPolygon') {
    const polys = geo.coordinates as number[][][][]
    ring = polys.reduce((lg: number[][], p: number[][][]) => p[0].length > lg.length ? p[0] : lg, polys[0][0])
  } else {
    return null
  }
  return ring && ring.length >= 3 ? ring : null
}

function computeBbox(coords: number[][]): number[] {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng; if (lat < minLat) minLat = lat
    if (lng > maxLng) maxLng = lng; if (lat > maxLat) maxLat = lat
  }
  return [minLng, minLat, maxLng, maxLat]
}

function centroid(coords: number[][]): { lat: number; lng: number } {
  let cLat = 0, cLng = 0
  for (const [lng, lat] of coords) { cLng += lng; cLat += lat }
  return { lat: Math.round(cLat / coords.length * 10000) / 10000, lng: Math.round(cLng / coords.length * 10000) / 10000 }
}

// ── Community-defined neighborhoods ─────────────────────────────────────────
const COMMUNITY_NEIGHBORHOODS = [
  {
    name: 'الزايدي', nameEn: 'Al Zaidi', cityName: 'مكة المكرمة',
    boundary: [
      [39.71221676444793, 21.42384515188037],[39.693713854202116, 21.417822952220604],
      [39.69593976821682, 21.406878749561756],[39.69552240933976, 21.37980613673882],
      [39.70651285978565, 21.36652706745828],[39.72160733919543, 21.369118199939763],
      [39.73510194290853, 21.387513921908138],[39.73384986627573, 21.39619279055168],
      [39.73322382795931, 21.404353047927813],[39.729119798995356, 21.414649865423343],
      [39.72432017190039, 21.418405756588626],[39.71743375041842, 21.413808014500063],
      [39.71221676444793, 21.42384515188037],
    ],
  },
  {
    name: 'الملك فهد', nameEn: 'King Fahd', cityName: 'مكة المكرمة',
    boundary: [
      [39.784633979091154, 21.375923895604416],[39.783488052806405, 21.383434423645085],
      [39.78013842212721, 21.386143044099512],[39.776744717359094, 21.391929474341595],
      [39.7756428651623, 21.39783878384928],[39.762817305586395, 21.397100133219055],
      [39.76184767565263, 21.396402515309802],[39.76449212092601, 21.380971997903558],
      [39.769516566945754, 21.36779731647222],[39.78181323746682, 21.375595557717602],
      [39.784633979091154, 21.375923895604416],
    ],
  },
]

async function main() {
  console.log('🗺️  Loading neighborhoods from Balady + community...\n')

  // Get cities
  const cities = await db.city.findMany({ select: { id: true, name: true } })
  const cityMap = new Map(cities.map(c => [c.name, c.id]))
  console.log('Cities:', cities.map(c => c.name).join(', '))

  // Map Balady AMANA prefixes to our city names
  // Mecca Amanah: 002xxx, Jeddah: 001xxx in Mecca region, Riyadh: 001xxx in Riyadh region
  // We'll use spatial matching instead — assign to nearest city

  // Fetch ALL Balady neighborhoods
  console.log('\nFetching ALL neighborhoods from Balady...')
  const allFeatures = await fetchFeatures('1=1')
  console.log(`Total Balady features: ${allFeatures.length}\n`)

  // Map Balady AMANA_ID prefixes to our cities
  // Mecca Amanah: 002xxx, Jeddah Amanah: 001xxx (in Mecca region) + 009xxx, Riyadh: 001xxx (in Riyadh region)
  // Use AMANA_ID to determine city — more reliable than lat/lng bounding boxes
  const AMANA_TO_CITY: Record<string, string> = {
    '002001': 'مكة المكرمة', '002002': 'مكة المكرمة', '002003': 'مكة المكرمة',
    '002004': 'مكة المكرمة', '002005': 'مكة المكرمة',
    '001001': 'الرياض',       // Riyadh main amanah
    '001002': 'الرياض', '001003': 'الرياض',
  }

  function assignCity(amanaId: string | undefined, lat: number, lng: number): string | null {
    // For Mecca region (AMANA 002), use coordinates to distinguish Jeddah vs Mecca
    if (amanaId && amanaId.startsWith('002')) {
      // Jeddah is west (lng < 39.45), Mecca is east (lng >= 39.45)
      if (lng < 39.45) return 'جدة'
      return 'مكة المكرمة'
    }
    // Riyadh
    if (amanaId) {
      const p3 = amanaId.substring(0, 3)
      if (p3 === '001' && lat > 24) return 'الرياض'
    }
    // Fallback to coordinates
    if (lat > 21.0 && lat < 22.0 && lng > 38.8 && lng < 39.45) return 'جدة'
    if (lat > 21.0 && lat < 22.0 && lng >= 39.45 && lng < 40.5) return 'مكة المكرمة'
    if (lat > 24.0 && lat < 25.5 && lng > 46.0 && lng < 47.5) return 'الرياض'
    return null
  }

  // Build set of existing neighborhoods to avoid duplicates
  const existingNbhds = await db.neighborhood.findMany({ select: { name: true, cityId: true } })
  const existingKeys = new Set(existingNbhds.map(n => `${n.name}|${n.cityId}`))
  console.log(`Existing neighborhoods: ${existingNbhds.length}`)

  let created = 0
  let skipped = 0
  const seenDistricts = new Set<string>()
  const seenNameCity = new Set<string>(existingKeys)

  for (const feature of allFeatures) {
    const ar = feature.properties.DISTRICTNAME_AR
    const en = feature.properties.DISTRICTNAME_EN
    const districtId = feature.properties.DISTRICT_ID
    if (!ar || !districtId) continue
    if (seenDistricts.has(districtId)) continue

    const polygon = extractPolygon(feature)
    if (!polygon) continue

    const bbox = computeBbox(polygon)
    const center = centroid(polygon)
    const cityName = assignCity(feature.properties.AMANA_ID, center.lat, center.lng)
    if (!cityName) continue

    const cityId = cityMap.get(cityName)
    if (!cityId) continue

    // Skip if already exists in DB or already seen in this run
    const nameCityKey = `${ar}|${cityId}`
    if (seenNameCity.has(nameCityKey)) { skipped++; continue }
    seenNameCity.add(nameCityKey)

    seenDistricts.add(districtId)

    await db.neighborhood.create({
      data: {
        name: ar,
        nameEn: en || ar,
        lat: center.lat,
        lng: center.lng,
        boundary: polygon,
        bbox: bbox,
        source: 'balady',
        baladyId: districtId,
        cityId: cityId,
      },
    })
    created++
  }
  console.log(`✅ Created ${created} Balady neighborhoods`)

  // Insert community neighborhoods
  for (const cn of COMMUNITY_NEIGHBORHOODS) {
    const cityId = cityMap.get(cn.cityName)
    if (!cityId) { console.log(`❌ City not found: ${cn.cityName}`); continue }

    const bbox = computeBbox(cn.boundary)
    const center = centroid(cn.boundary)

    // Check if it already exists (by name + city)
    const existing = await db.neighborhood.findFirst({
      where: { name: cn.name, cityId },
      select: { id: true },
    })

    if (existing) {
      await db.neighborhood.update({
        where: { id: existing.id },
        data: { boundary: cn.boundary, bbox, lat: center.lat, lng: center.lng, source: 'community', baladyId: null },
      })
      console.log(`🔄 Updated community: ${cn.name}`)
    } else {
      await db.neighborhood.create({
        data: {
          name: cn.name, nameEn: cn.nameEn,
          lat: center.lat, lng: center.lng,
          boundary: cn.boundary, bbox,
          source: 'community', baladyId: null,
          cityId,
        },
      })
      console.log(`✅ Created community: ${cn.name}`)
    }
  }

  // Final report
  const total = await db.neighborhood.count()
  const byCities = await db.city.findMany({ select: { name: true, _count: { select: { neighborhoods: true } } } })
  console.log(`\n📊 Created: ${created} | Skipped (existing): ${skipped} | Total: ${total}`)
  for (const c of byCities) console.log(`   ${c.name}: ${c._count.neighborhoods}`)
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
