import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { decryptPhone } from '@/lib/services/phone'

export const dynamic = 'force-dynamic'

/**
 * GET /api/directory/service-contacts/claims
 * The current user's PENDING owner-confirmation requests — i.e. contacts
 * whose phone was matched to THIS user's account. Returns the (decrypted)
 * phone because it's the caller's own number. Scoped strictly to
 * serviceIdentity.linkedUserId === me, so it can't leak others' matches.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const rows = await db.directoryServiceContact.findMany({
    where: {
      verification: 'PENDING_OWNER_CONFIRMATION',
      status: 'PENDING_REVIEW',
      serviceIdentity: { linkedUserId: session.userId },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      displayName: true,
      category: true,
      description: true,
      serviceArea: true,
      serviceIdentity: { select: { phoneEnc: true } },
      neighborhood: { select: { name: true, nameEn: true } },
    },
  })

  return NextResponse.json({
    claims: rows.map((r) => ({
      id: r.id,
      displayName: r.displayName,
      category: r.category,
      description: r.description,
      serviceArea: r.serviceArea,
      phone: decryptPhone(r.serviceIdentity.phoneEnc),
      neighborhoodName: r.neighborhood?.name ?? null,
    })),
  })
}
