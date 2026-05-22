import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { gateModRoute } from '@/lib/places/routeGate'
import { decryptPhone } from '@/lib/services/phone'

export const dynamic = 'force-dynamic'

/**
 * GET /api/mod/directory/service-contacts?filter=pending|hidden|reported
 *   pending  → status PENDING_REVIEW (incl. owner-confirmation matches —
 *              a mod may REMOVE abusive suggestions but NOT approve them
 *              public; that stays the owner's decision)
 *   hidden   → status HIDDEN (auto-hidden by reports / mod-hidden)
 *   reported → status ACTIVE with reportCount > 0
 *
 * NEIGHBORHOOD_MOD is scoped to their own neighborhood. linkedUserId is
 * never returned. Phone is decrypted for moderation review only.
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, neighborhoodId: true },
  })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const gate = gateModRoute(user.role)
  if (gate) return gate

  const url = req.nextUrl
  const filter = url.searchParams.get('filter') || 'pending'
  const cross = isSuperAdminRole(user.role) || user.role === 'PLATFORM_MOD'
  const filterNbhd = cross
    ? (url.searchParams.get('neighborhood') || null)
    : user.neighborhoodId

  const where: any = { ...(filterNbhd ? { neighborhoodId: filterNbhd } : {}) }
  if (filter === 'hidden') where.status = 'HIDDEN'
  else if (filter === 'reported') { where.status = 'ACTIVE'; where.reportCount = { gt: 0 } }
  else where.status = 'PENDING_REVIEW'

  const rows = await db.directoryServiceContact.findMany({
    where,
    orderBy: filter === 'reported' ? { reportCount: 'desc' } : { createdAt: 'asc' },
    take: 60,
    select: {
      id: true, displayName: true, category: true, description: true,
      serviceArea: true, status: true, verification: true, reportCount: true,
      neighborhoodId: true, createdAt: true,
      serviceIdentity: { select: { phoneEnc: true } },
      createdByUser: { select: { id: true, name: true } },
      reports: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { reason: true, message: true, createdAt: true },
      },
    },
  })

  return NextResponse.json({
    contacts: rows.map((r) => ({
      id: r.id,
      displayName: r.displayName,
      category: r.category,
      description: r.description,
      serviceArea: r.serviceArea,
      status: r.status,
      verification: r.verification,
      reportCount: r.reportCount,
      neighborhoodId: r.neighborhoodId,
      phone: decryptPhone(r.serviceIdentity.phoneEnc),
      submittedBy: r.createdByUser?.name ?? null,
      reports: r.reports.map((rep) => ({
        reason: rep.reason,
        message: rep.message,
        createdAt: rep.createdAt.toISOString(),
      })),
    })),
  })
}
