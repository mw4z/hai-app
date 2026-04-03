import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Cache for 5 minutes — neighborhoods rarely change
let cache: { data: any; ts: number } | null = null
const CACHE_TTL = 5 * 60 * 1000

export async function GET() {
  try {
    if (cache && Date.now() - cache.ts < CACHE_TTL) {
      return NextResponse.json(cache.data)
    }

    const neighborhoods = await db.neighborhood.findMany({
      where: { hidden: false },
      select: {
        id: true,
        name: true,
        nameEn: true,
        lat: true,
        lng: true,
        city: { select: { name: true, nameEn: true } },
      },
      orderBy: { name: 'asc' },
    })

    const result = neighborhoods.map(n => ({
      id: n.id,
      name: n.name,
      nameEn: n.nameEn,
      lat: n.lat,
      lng: n.lng,
      cityName: n.city.name,
      cityNameEn: n.city.nameEn,
    }))

    cache = { data: result, ts: Date.now() }
    return NextResponse.json(result)
  } catch (error) {
    console.error('neighborhoods/all error:', error)
    return NextResponse.json([], { status: 500 })
  }
}
