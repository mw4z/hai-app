import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { gateModRoute } from '@/lib/places/routeGate'

export const dynamic = 'force-dynamic'

/**
 * GET /api/mod/directory/suggestions — pending resident correction
 * suggestions (EDIT_PLACE / ADD_CONTACT / FIX_LOCATION), neighborhood-
 * scoped. The client groups rows by payloadJson.groupId to render one card
 * per suggestion (current → suggested per field) with approve/reject.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const user = await db.user.findUnique({ where: { id: session.userId }, select: { role: true, neighborhoodId: true } })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const gate = gateModRoute(user.role)
  if (gate) return gate

  const cross = isSuperAdminRole(user.role) || user.role === 'PLATFORM_MOD'
  const rows = await db.directoryContribution.findMany({
    where: {
      status: 'PENDING_REVIEW',
      type: { in: ['EDIT_PLACE', 'ADD_CONTACT', 'FIX_LOCATION'] },
      ...(cross ? {} : { neighborhoodId: user.neighborhoodId ?? '__none__' }),
    },
    orderBy: { createdAt: 'asc' },
    take: 100,
    select: {
      id: true, type: true, payloadJson: true, createdAt: true,
      place: { select: { id: true, name: true } },
      contributor: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json({
    suggestions: rows.map((r) => {
      const payload = (r.payloadJson ?? {}) as { groupId?: string; note?: string | null; fields?: unknown[] }
      return {
        id: r.id,
        type: r.type,
        groupId: payload.groupId ?? r.id,
        note: payload.note ?? null,
        fields: Array.isArray(payload.fields) ? payload.fields : [],
        placeId: r.place?.id ?? null,
        placeName: r.place?.name ?? null,
        contributor: r.contributor?.name ?? null,
        createdAt: r.createdAt.toISOString(),
      }
    }),
  })
}
