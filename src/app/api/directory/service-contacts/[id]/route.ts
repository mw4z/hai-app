import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { isDirectoryModerator } from '@/lib/places/isDirectoryModerator'
import { isValidServiceCategory } from '@/lib/services/serviceCategories'
import { toPublicServiceContact } from '@/lib/services/serializeServiceContact'
import { logModAction } from '@/lib/modAudit'

export const dynamic = 'force-dynamic'

async function gate(userId: string, contactNeighborhoodId: string) {
  const mod = await db.user.findUnique({ where: { id: userId }, select: { role: true, neighborhoodId: true } })
  if (!mod || !isDirectoryModerator(mod.role)) return false
  // NEIGHBORHOOD_MOD is scoped to their own hood; PLATFORM_MOD / SUPER_ADMIN are global.
  if (mod.role === 'NEIGHBORHOOD_MOD') return mod.neighborhoodId === contactNeighborhoodId
  return true
}

// PATCH /api/directory/service-contacts/[id] — mod/admin edit of a listing.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const contact = await db.directoryServiceContact.findUnique({
    where: { id: params.id },
    select: { id: true, neighborhoodId: true },
  })
  if (!contact) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (!(await gate(session.userId, contact.neighborhoodId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const raw = await req.json().catch(() => null)
  if (!raw || typeof raw !== 'object') return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const data: Prisma.DirectoryServiceContactUpdateInput = {}
  if (typeof raw.displayName === 'string') {
    const n = raw.displayName.trim()
    if (n.length < 2 || n.length > 80) return NextResponse.json({ error: 'الاسم مطلوب', field: 'name' }, { status: 400 })
    data.displayName = n
  }
  if (typeof raw.description === 'string') data.description = raw.description.trim().slice(0, 280) || null
  if (typeof raw.serviceArea === 'string') data.serviceArea = raw.serviceArea.trim().slice(0, 120) || null
  if (typeof raw.whatsapp === 'boolean') data.whatsapp = raw.whatsapp
  if (raw.category !== undefined) {
    if (!isValidServiceCategory(raw.category)) return NextResponse.json({ error: 'فئة غير صالحة', field: 'category' }, { status: 400 })
    data.category = raw.category
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: 'لا تغييرات' }, { status: 400 })

  try {
    const updated = await db.directoryServiceContact.update({
      where: { id: params.id },
      data,
      include: { serviceIdentity: { select: { phoneEnc: true, ownerUserId: true } } },
    })
    await logModAction({
      moderatorId: session.userId,
      actionType: 'edit_service_contact',
      targetType: 'service_contact',
      targetId: params.id,
      neighborhoodId: contact.neighborhoodId,
      details: Object.keys(data).join(','),
    }).catch(() => {})
    return NextResponse.json({ ok: true, contact: toPublicServiceContact(updated) })
  } catch (err) {
    // Changing category can collide with the (identity, hood, category) unique key.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: 'يوجد بالفعل إدراج لهذا الرقم في هذا القسم' }, { status: 409 })
    }
    console.error('[SERVICE_CONTACT] edit failed:', err)
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

// DELETE /api/directory/service-contacts/[id] — mod/admin remove (soft → REMOVED,
// drops out of the public ACTIVE list, reversible from the mod queue).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const contact = await db.directoryServiceContact.findUnique({
    where: { id: params.id },
    select: { id: true, neighborhoodId: true },
  })
  if (!contact) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (!(await gate(session.userId, contact.neighborhoodId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  await db.directoryServiceContact.update({ where: { id: params.id }, data: { status: 'REMOVED' } })
  await logModAction({
    moderatorId: session.userId,
    actionType: 'remove_service_contact',
    targetType: 'service_contact',
    targetId: params.id,
    neighborhoodId: contact.neighborhoodId,
  }).catch(() => {})
  return NextResponse.json({ ok: true })
}
