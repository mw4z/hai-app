import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { Prisma } from '@prisma/client'
import { gatePublicRoute } from '@/lib/places/routeGate'
import { requireUserReady } from '@/lib/requireUserReady'
import { buildSuggestionDiffs, typesInDiffs, noteHasSpam } from '@/lib/places/suggestions'

export const dynamic = 'force-dynamic'

const MAX_PER_PLACE_PER_DAY = 2
const MAX_PER_USER_PER_DAY = 10

/**
 * POST /api/directory/[id]/suggest
 * Body: { proposed: { name?, category?, description?, addressText?, phone?,
 *         whatsapp?, website?, instagram?, latitude?, longitude? }, note? }
 *
 * A verified resident of the place's neighborhood proposes corrections.
 * We keep only CHANGED allowlisted fields, group them by contribution type
 * (EDIT_PLACE / ADD_CONTACT / FIX_LOCATION) and create one PENDING_REVIEW
 * DirectoryContribution per type, sharing a groupId. No reputation here —
 * that's awarded only when a mod approves + applies (see the review route).
 * Owners/mods keep their direct edit and don't need this.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const ready = await requireUserReady(session.userId)
  if (!ready.ok) return ready.response

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, neighborhoodId: true },
  })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const gate = gatePublicRoute(user.role)
  if (gate) return gate

  const place = await db.placeListing.findUnique({
    where: { id: params.id },
    select: {
      id: true, neighborhoodId: true, status: true,
      name: true, category: true, description: true, addressText: true,
      phone: true, whatsapp: true, website: true, instagram: true,
      latitude: true, longitude: true,
    },
  })
  if (!place) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Only a verified resident OF THIS neighborhood may suggest. Outside
  // users (different hood) cannot.
  if (!user.neighborhoodId || user.neighborhoodId !== place.neighborhoodId) {
    return NextResponse.json({ error: 'لا يمكنك اقتراح تصحيح خارج حيّك' }, { status: 403 })
  }

  const raw = await req.json().catch(() => null)
  if (!raw || typeof raw !== 'object') return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  const proposed = (raw as any).proposed
  if (!proposed || typeof proposed !== 'object') return NextResponse.json({ error: 'لا توجد تغييرات' }, { status: 400 })
  const note = typeof (raw as any).note === 'string' ? (raw as any).note.trim().slice(0, 300) : ''
  if (note && noteHasSpam(note)) {
    return NextResponse.json({ error: 'لا يُسمح بالروابط أو الأرقام في الملاحظة' }, { status: 400 })
  }

  const diffs = buildSuggestionDiffs(place as Record<string, unknown>, proposed)
  if (diffs.length === 0) {
    return NextResponse.json({ error: 'لم تقم بأي تغيير' }, { status: 400 })
  }

  // Rate limits.
  const since = new Date(Date.now() - 24 * 3600_000)
  const [perPlace, perUser] = await Promise.all([
    db.directoryContribution.count({
      where: { contributorId: user.id, placeId: place.id, type: { in: ['EDIT_PLACE', 'ADD_CONTACT', 'FIX_LOCATION'] }, createdAt: { gte: since } },
    }),
    db.directoryContribution.count({
      where: { contributorId: user.id, type: { in: ['EDIT_PLACE', 'ADD_CONTACT', 'FIX_LOCATION'] }, createdAt: { gte: since } },
    }),
  ])
  if (perPlace >= MAX_PER_PLACE_PER_DAY) return NextResponse.json({ error: 'اقترحت تصحيحات كثيرة لهذا المكان اليوم', code: 'RATE_LIMITED' }, { status: 429 })
  if (perUser >= MAX_PER_USER_PER_DAY) return NextResponse.json({ error: 'وصلت للحد اليومي للاقتراحات', code: 'RATE_LIMITED' }, { status: 429 })

  // One contribution per type present, sharing a groupId so the queue can
  // present them as a single suggestion.
  const groupId = crypto.randomUUID()
  const types = typesInDiffs(diffs)
  try {
    await db.$transaction(
      types.map((t) =>
        db.directoryContribution.create({
          data: {
            type: t,
            status: 'PENDING_REVIEW',
            contributorId: user.id,
            placeId: place.id,
            neighborhoodId: place.neighborhoodId,
            payloadJson: {
              groupId,
              note: note || null,
              fields: diffs.filter((d) => d.contributionType === t) as unknown as Prisma.InputJsonValue,
            } as Prisma.InputJsonValue,
          },
        }),
      ),
    )
  } catch (err) {
    console.error('[suggest] create failed:', err)
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, groupId, changes: diffs.length })
}
