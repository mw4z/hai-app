import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const cities = await db.city.findMany({
      include: {
        neighborhoods: {
          select: { id: true, name: true, nameEn: true, lat: true, lng: true },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(cities)
  } catch (error) {
    console.error('cities error:', error)
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}
