import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { gatePublicRoute } from '@/lib/places/routeGate'
import { isDirectoryModerator } from '@/lib/places/isDirectoryModerator'
import { isValidSaudiPhone } from '@/lib/phone'
import { isSafeHttpsUrl, isSafeMapUrl, sanitizeImageUrls } from '@/lib/places/validation'
import { toPublicPlace } from '@/lib/places/serialize'
import { PUBLIC_PLACE_STATUSES } from '@/lib/places/statusBadge'
import { logModAction } from '@/lib/modAudit'

export const dynamic = 'force-dynamic'

/** GET /api/directory/[id]
 *  Returns the public-shape place when visible to the caller. The
 *  visibility rules: publicly-visible status OR caller is the
 *  creator OR caller is a directory moderator (scoped by nbhd for
 *  NEIGHBORHOOD_MOD).
 *
 *  Privacy: createdByUser is NEVER exposed here. Mods who need
 *  accountability use /api/mod/directory/[id]. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, neighborhoodId: true },
  })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const gate = gatePublicRoute(user.role)
  if (gate) return gate

  const place = await db.placeListing.findUnique({
    where: { id: params.id },
    include: {
      claimedByUser: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          providerStatus: true,
          serviceItems: {
            where: { active: true },
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              title: true,
              description: true,
              price: true,
              imageUrl: true,
              active: true,
              sortOrder: true,
            },
            take: 20,
          },
        },
      },
    },
  })
  if (!place) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const isSuper = isSuperAdminRole(user.role)
  const isMod = isDirectoryModerator(user.role)
  const sameNbhd = place.neighborhoodId === user.neighborhoodId
  const isCreator = place.createdByUserId === user.id
  const isOwner = place.claimedByUserId === user.id
  const isPubliclyVisible = (PUBLIC_PLACE_STATUSES as string[]).includes(place.status)

  // Visibility:
  //  - SUPER_ADMIN sees everything.
  //  - PLATFORM_MOD sees everything (cross-neighborhood).
  //  - NEIGHBORHOOD_MOD sees within their nbhd only.
  //  - Creator / claimed owner see their own row regardless of status.
  //  - Anyone else can read a publicly-visible place from ANY
  //    neighborhood — same cross-nbhd browse pattern as
  //    /api/directory list. Writes (claim, report, PATCH) stay
  //    locked to the user's own neighborhood independently.
  const allowed =
    isSuper ||
    (isMod && user.role === 'PLATFORM_MOD') ||
    (isMod && user.role === 'NEIGHBORHOOD_MOD' && sameNbhd) ||
    isCreator ||
    isOwner ||
    isPubliclyVisible
  if (!allowed) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json({ place: toPublicPlace(place) })
}

/** PATCH /api/directory/[id]
 *
 *  Claimed owner: may edit description / phone / whatsapp / website /
 *  instagram / openingHours.
 *  Mod / admin: may also edit name / category / lat / lng /
 *  addressText / mapUrl.
 *  imageUrls is unconditionally stripped (MVP write-disabled). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

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
      id: true,
      neighborhoodId: true,
      claimedByUserId: true,
      createdByUserId: true,
      status: true,
    },
  })
  if (!place) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const isSuper = isSuperAdminRole(user.role)
  const isMod = isDirectoryModerator(user.role)
  const sameNbhd = place.neighborhoodId === user.neighborhoodId
  const isOwner = place.claimedByUserId === user.id
  const hasOwner = !!place.claimedByUserId
  const isCreator = place.createdByUserId === user.id
  const isAdminScoped =
    isSuper || (isMod && (user.role === 'PLATFORM_MOD' || sameNbhd))

  // Edit permission model:
  //  - If the place has a claimed owner, ONLY that owner can edit
  //    content. Admins step back — they can still moderate (remove,
  //    reject reports) via the mod surface, but they don't edit a
  //    business owner's listing once that owner exists.
  //  - If the place is unclaimed, admins / mods of the nbhd / and
  //    the original creator can curate (add photos, fix typos).
  //  - Owner always passes regardless of whether they're also a
  //    mod or the creator — same effective gate either way.
  const allowed = isOwner || (!hasOwner && (isCreator || isAdminScoped))
  if (!allowed) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!raw) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const updates: Record<string, unknown> = {}

  // Owner-editable subset. Each field validates the same way it
  // does on create; nothing is written if invalid.
  if (raw.description !== undefined) {
    const v = typeof raw.description === 'string' ? raw.description.trim().slice(0, 500) : ''
    updates.description = v || null
  }
  if (raw.phone !== undefined) {
    const v = typeof raw.phone === 'string' ? raw.phone.trim() : ''
    if (v && !isValidSaudiPhone(v)) return NextResponse.json({ error: 'رقم الجوال غير صالح' }, { status: 400 })
    updates.phone = v || null
  }
  if (raw.whatsapp !== undefined) {
    const v = typeof raw.whatsapp === 'string' ? raw.whatsapp.trim() : ''
    if (v && !isValidSaudiPhone(v)) return NextResponse.json({ error: 'رقم واتساب غير صالح' }, { status: 400 })
    updates.whatsapp = v || null
  }
  if (raw.website !== undefined) {
    const v = typeof raw.website === 'string' ? raw.website.trim() : ''
    if (v && !isSafeHttpsUrl(v)) return NextResponse.json({ error: 'الموقع الإلكتروني غير صالح' }, { status: 400 })
    updates.website = v || null
  }
  if (raw.instagram !== undefined) {
    const v = typeof raw.instagram === 'string' ? raw.instagram.trim().slice(0, 100) : ''
    updates.instagram = v || null
  }
  if (raw.openingHours !== undefined) {
    const v = typeof raw.openingHours === 'string' ? raw.openingHours.trim().slice(0, 300) : ''
    updates.openingHours = v || null
  }

  // Images — owner-editable. The sanitizer caps at MAX_PLACE_IMAGES
  // and rejects non-https junk, so passing whatever the client sent
  // is safe. Files are already validated upstream at /api/upload
  // before they produce a URL.
  if (raw.imageUrls !== undefined) {
    updates.imageUrls = sanitizeImageUrls(raw.imageUrls)
  }

  // Mod-only field edits (name / category / lat / lng / addressText /
  // mapUrl). Even owners can't change these — they require admin
  // review. Use the same admin gate computed at the top.
  if (isAdminScoped) {
    if (raw.name !== undefined) {
      const v = typeof raw.name === 'string' ? raw.name.trim() : ''
      if (v.length < 2 || v.length > 80) {
        return NextResponse.json({ error: 'اسم غير صالح' }, { status: 400 })
      }
      updates.name = v
      // Recompute the dedup key.
      const { normalizePlaceName } = await import('@/lib/places/normalize')
      updates.nameNormalized = normalizePlaceName(v)
    }
    if (raw.addressText !== undefined) {
      const v = typeof raw.addressText === 'string' ? raw.addressText.trim().slice(0, 200) : ''
      updates.addressText = v || null
    }
    if (raw.mapUrl !== undefined) {
      const v = typeof raw.mapUrl === 'string' ? raw.mapUrl.trim() : ''
      if (v && !isSafeMapUrl(v)) return NextResponse.json({ error: 'رابط الخريطة غير مدعوم' }, { status: 400 })
      updates.mapUrl = v || null
    }
    if (raw.latitude !== undefined) {
      if (raw.latitude === null) updates.latitude = null
      else {
        const n = Number(raw.latitude)
        if (!Number.isFinite(n) || n < -90 || n > 90) {
          return NextResponse.json({ error: 'إحداثيات غير صالحة' }, { status: 400 })
        }
        updates.latitude = n
      }
    }
    if (raw.longitude !== undefined) {
      if (raw.longitude === null) updates.longitude = null
      else {
        const n = Number(raw.longitude)
        if (!Number.isFinite(n) || n < -180 || n > 180) {
          return NextResponse.json({ error: 'إحداثيات غير صالحة' }, { status: 400 })
        }
        updates.longitude = n
      }
    }
    if (raw.category !== undefined) {
      const valid = new Set(Object.values(await import('@prisma/client').then((m) => m.PlaceCategory)))
      if (typeof raw.category !== 'string' || !valid.has(raw.category as any)) {
        return NextResponse.json({ error: 'تصنيف غير صالح' }, { status: 400 })
      }
      updates.category = raw.category
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true, place: null })
  }

  const updated = await db.placeListing.update({
    where: { id: place.id },
    data: updates,
    include: {
      claimedByUser: {
        select: { id: true, name: true, avatarUrl: true, providerStatus: true },
      },
    },
  })

  // Audit: log mod edits. Owner / creator edits don't go to
  // ModActionLog — those are normal user actions on their own
  // record. Only fires when a mod or admin actually changed
  // something on a place they don't own.
  if (isAdminScoped && !isOwner && !isCreator) {
    await logModAction({
      moderatorId: user.id,
      actionType: 'edit_place',
      targetType: 'place',
      targetId: place.id,
      neighborhoodId: place.neighborhoodId,
      details: JSON.stringify({ fields: Object.keys(updates) }),
    })
  }

  return NextResponse.json({ ok: true, place: toPublicPlace(updated) })
}
