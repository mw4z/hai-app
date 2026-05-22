import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { Prisma } from '@prisma/client'
import { requireUserReady } from '@/lib/requireUserReady'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import {
  isValidServiceReportReason,
  serviceContactHideThreshold,
} from '@/lib/services/serviceContactSafety'

export const dynamic = 'force-dynamic'

const MAX_REPORTS_PER_HOUR = 6

/**
 * POST /api/directory/service-contacts/[id]/report
 * Body: { reason: ServiceContactReportReason, message? }
 * Auto-hides the contact once distinct reports cross the (verification-
 * scaled) threshold — community/unverified hide faster than verified.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const ready = await requireUserReady(session.userId)
  if (!ready.ok) return ready.response

  const contactId = params.id
  const { reason, message } = await req.json().catch(() => ({}))
  if (!isValidServiceReportReason(reason)) {
    return NextResponse.json({ error: 'سبب غير صالح' }, { status: 400 })
  }

  const reporter = await db.user.findUnique({ where: { id: session.userId }, select: { role: true } })
  const bypass = isSuperAdminRole(reporter?.role)
  if (!bypass) {
    const oneHourAgo = new Date(Date.now() - 3600_000)
    const recent = await db.serviceContactReport.count({
      where: { userId: session.userId, createdAt: { gte: oneHourAgo } },
    })
    if (recent >= MAX_REPORTS_PER_HOUR) return NextResponse.json({ error: 'حاول لاحقاً' }, { status: 429 })
  }

  const contact = await db.directoryServiceContact.findUnique({
    where: { id: contactId },
    select: { id: true, status: true, verification: true, reportCount: true, createdByUserId: true },
  })
  if (!contact) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })

  try {
    await db.serviceContactReport.create({
      data: { contactId, userId: session.userId, reason, message: typeof message === 'string' ? message.slice(0, 300) : null },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: 'أبلغت عن هذا الرقم مسبقاً' }, { status: 400 })
    }
    throw err
  }

  const newCount = contact.reportCount + 1
  let status = contact.status
  if (status === 'ACTIVE' && newCount >= serviceContactHideThreshold(contact.verification)) {
    status = 'HIDDEN'
    console.log(`[SERVICE_CONTACT] auto-hidden: id=${contactId}, reports=${newCount}`)
  }
  await db.directoryServiceContact.update({
    where: { id: contactId },
    data: { reportCount: newCount, status },
  })

  return NextResponse.json({ success: true })
}
