import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { gatePublicRoute } from '@/lib/places/routeGate'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { PlaceReportType } from '@prisma/client'
import { validateMessage, REPORT_DAILY_MAX } from '@/lib/places/validation'

export const dynamic = 'force-dynamic'

const VALID_TYPES = new Set<string>(Object.values(PlaceReportType))

/** POST /api/directory/[id]/report
 *  Body: { type: PlaceReportType, message?: string }
 *  Daily cap of 10 reports per user across all places. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, status: true, neighborhoodId: true },
  })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const gate = gatePublicRoute(user.role)
  if (gate) return gate

  const isSuper = isSuperAdminRole(user.role)
  if (!isSuper && (user.status === 'BANNED_TEMP' || user.status === 'BANNED_PERM')) {
    return NextResponse.json({ error: 'حسابك موقوف' }, { status: 403 })
  }

  const place = await db.placeListing.findUnique({
    where: { id: params.id },
    select: { id: true, neighborhoodId: true },
  })
  if (!place) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (!isSuper && place.neighborhoodId !== user.neighborhoodId) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const body = (await req.json().catch(() => ({}))) as { type?: string; message?: string }
  if (typeof body.type !== 'string' || !VALID_TYPES.has(body.type)) {
    return NextResponse.json({ error: 'invalid_type' }, { status: 400 })
  }
  const msg = validateMessage(body.message)
  if (msg === false) return NextResponse.json({ error: 'الرسالة طويلة جداً' }, { status: 400 })

  // Daily rate limit.
  if (!isSuper) {
    const since = new Date(Date.now() - 24 * 3600 * 1000)
    const recent = await db.placeReport.count({
      where: { userId: user.id, createdAt: { gte: since } },
    })
    if (recent >= REPORT_DAILY_MAX) {
      return NextResponse.json(
        { error: 'وصلت الحد الأقصى للبلاغات اليوم' },
        { status: 429 },
      )
    }
  }

  await db.placeReport.create({
    data: {
      placeId: place.id,
      userId: user.id,
      type: body.type as PlaceReportType,
      message: msg,
    },
    select: { id: true },
  })

  return NextResponse.json({ ok: true })
}
