import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { Prisma } from '@prisma/client'
import { gatePublicRoute } from '@/lib/places/routeGate'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { isDirectoryModerator } from '@/lib/places/isDirectoryModerator'
import { requireUserReady } from '@/lib/requireUserReady'
import { matchesArabic } from '@/lib/arabicNormalize'
import { toE164 } from '@/lib/services/phoneFormat'
import { phoneHash, encryptPhone, serviceContactCryptoReady } from '@/lib/services/phone'
import { isValidServiceCategory } from '@/lib/services/serviceCategories'
import { SERVICE_CONTACT_MAX_PER_DAY } from '@/lib/services/serviceContactSafety'
import { resolveServiceContact, resolutionResponse } from '@/lib/services/resolveServiceContact'
import { toPublicServiceContact } from '@/lib/services/serializeServiceContact'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 40

// Candidate stored forms of a User.phone for an E.164 number, so we can
// match a phone to a user regardless of which shape login stored it as.
function userPhoneCandidates(e164: string): string[] {
  const digits = e164.replace(/^\+/, '')          // 9665XXXXXXXX
  const out = new Set<string>([e164, digits])
  if (digits.startsWith('966')) {
    const local = '0' + digits.slice(3)           // 05XXXXXXXX
    out.add(local)
    out.add(digits.slice(3))                       // 5XXXXXXXX
  }
  return Array.from(out)
}

/**
 * GET /api/directory/service-contacts
 *   ?category=PLUMBER  ?q=سباك  ?neighborhood=<id> (cross-read)
 * Returns only publicly-visible (ACTIVE) contacts. Private fields and
 * the linked/owner user identity are never serialized.
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, neighborhoodId: true },
  })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const gate = gatePublicRoute(user.role)
  if (gate) return gate

  const url = req.nextUrl
  const queryNbhd = url.searchParams.get('neighborhood')
  const targetNeighborhoodId = queryNbhd?.trim() || user.neighborhoodId
  if (!targetNeighborhoodId) return NextResponse.json({ contacts: [] })

  const categoryParam = url.searchParams.get('category')
  const q = (url.searchParams.get('q') || '').trim()

  const rows = await db.directoryServiceContact.findMany({
    where: {
      neighborhoodId: targetNeighborhoodId,
      status: 'ACTIVE',
      ...(categoryParam && isValidServiceCategory(categoryParam) ? { category: categoryParam } : {}),
    },
    orderBy: [{ verification: 'desc' }, { ratingAvg: 'desc' }, { createdAt: 'desc' }],
    take: q ? PAGE_SIZE * 6 : PAGE_SIZE,
    include: { serviceIdentity: { select: { phoneEnc: true, ownerUserId: true } } },
  })

  let working = rows
  if (q) working = working.filter((c) => matchesArabic(c.displayName, q) || matchesArabic(c.serviceArea, q))
  // canModerate mirrors the [id] route gate: any directory moderator, but a
  // NEIGHBORHOOD_MOD only in their own hood (not while browsing another).
  const canModerate = isDirectoryModerator(user.role) &&
    (user.role !== 'NEIGHBORHOOD_MOD' || targetNeighborhoodId === user.neighborhoodId)
  return NextResponse.json({
    contacts: working.slice(0, PAGE_SIZE).map(toPublicServiceContact),
    viewerId: session.userId,
    canModerate,
  })
}

/**
 * POST /api/directory/service-contacts
 * Body: name, category, phone (required); whatsapp?, description?,
 *       serviceArea?, notes?, sourcePostId?, sourceCommentId? (optional).
 *
 * Resolve-or-create (see resolveServiceContact): a verified provider or
 * an existing contact links instead of duplicating; a normal-user match
 * queues a pending owner-confirmation WITHOUT exposing the user; only a
 * true no-match creates a community-added contact. Writes are locked to
 * the submitter's own neighborhood.
 */
export async function POST(req: NextRequest) {
  // Fail closed in production: never hash with a default pepper or store a
  // plaintext phone if the secrets aren't provisioned.
  if (process.env.NODE_ENV === 'production' && !serviceContactCryptoReady()) {
    console.error('[SERVICE_CONTACT] missing SERVICE_PHONE_KEY / SERVICE_PHONE_PEPPER in production')
    return NextResponse.json({ error: 'الخدمة غير متاحة مؤقتاً', code: 'SERVICE_MISCONFIGURED' }, { status: 503 })
  }

  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Write gate: complete profile + verified location (residents only).
  const ready = await requireUserReady(session.userId)
  if (!ready.ok) return ready.response

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, status: true, neighborhoodId: true },
  })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const gate = gatePublicRoute(user.role)
  if (gate) return gate
  if (!user.neighborhoodId) return NextResponse.json({ error: 'أكمل ملفك الشخصي أولاً' }, { status: 403 })
  const isSuper = isSuperAdminRole(user.role)
  if (!isSuper && (user.status === 'BANNED_TEMP' || user.status === 'BANNED_PERM')) {
    return NextResponse.json({ error: 'حسابك موقوف' }, { status: 403 })
  }

  const raw = await req.json().catch(() => null)
  if (!raw || typeof raw !== 'object') return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const category = raw.category
  const e164 = toE164(typeof raw.phone === 'string' ? raw.phone : '')
  if (name.length < 2 || name.length > 80) return NextResponse.json({ error: 'الاسم مطلوب', field: 'name' }, { status: 400 })
  if (!isValidServiceCategory(category)) return NextResponse.json({ error: 'اختر فئة الخدمة', field: 'category' }, { status: 400 })
  if (!e164) return NextResponse.json({ error: 'رقم جوال غير صالح', field: 'phone' }, { status: 400 })

  const whatsapp = raw.whatsapp === true
  const description = typeof raw.description === 'string' ? raw.description.trim().slice(0, 280) || null : null
  const serviceArea = typeof raw.serviceArea === 'string' ? raw.serviceArea.trim().slice(0, 120) || null : null
  const notes = typeof raw.notes === 'string' ? raw.notes.trim().slice(0, 500) || null : null
  const sourcePostId = typeof raw.sourcePostId === 'string' ? raw.sourcePostId.slice(0, 64) : null
  const sourceCommentId = typeof raw.sourceCommentId === 'string' ? raw.sourceCommentId.slice(0, 64) : null

  const neighborhoodId = user.neighborhoodId

  // ── Rate limit: rolling 24h additions per user ──
  // Moderators/admins add without any daily cap — only normal residents
  // are limited.
  if (!isDirectoryModerator(user.role)) {
    const since = new Date(Date.now() - 24 * 3600_000)
    const recent = await db.directoryServiceContact.count({
      where: { createdByUserId: user.id, createdAt: { gte: since } },
    })
    if (recent >= SERVICE_CONTACT_MAX_PER_DAY) {
      return NextResponse.json({ error: `الحد الأقصى ${SERVICE_CONTACT_MAX_PER_DAY} أرقام في اليوم`, code: 'RATE_LIMITED' }, { status: 429 })
    }
  }

  const hash = phoneHash(e164)

  // ── Resolution lookups ──
  const [matchedUser, identity] = await Promise.all([
    db.user.findFirst({
      where: { phone: { in: userPhoneCandidates(e164) } },
      select: { id: true, providerStatus: true },
    }),
    db.serviceIdentity.findUnique({ where: { phoneHash: hash }, select: { id: true, ownerUserId: true } }),
  ])
  const existingContact = identity
    ? await db.directoryServiceContact.findFirst({
        where: { serviceIdentityId: identity.id, neighborhoodId, category, status: 'ACTIVE' },
        select: { id: true },
      })
    : null
  const isProvider = !!matchedUser && (matchedUser.providerStatus === 'ACTIVE' || matchedUser.providerStatus === 'VERIFIED')
  // The submitter adding their OWN number is the phone owner — never treat
  // that as "already a provider in the directory" (MATCHED_PROVIDER blocks it)
  // nor park it for review (GENERIC_PENDING_MATCH notifies them about their
  // own number). It becomes a self-owned ACTIVE listing below. Fixes the bug
  // where a service provider got "already added" while having no listing.
  const isSelf = !!matchedUser && matchedUser.id === user.id

  const resolution = resolveServiceContact({
    providerUserId: (isProvider && !isSelf) ? matchedUser!.id : null,
    existingContactId: existingContact?.id ?? null,
    linkedUserId: (matchedUser && !isProvider && !isSelf) ? matchedUser.id : null,
  })
  const resp = resolutionResponse(resolution)

  // 1 & 2 — link, never duplicate.
  if (resolution.kind === 'MATCHED_PROVIDER') {
    return NextResponse.json({ code: resp.code, message: resp.messageAr, providerUserId: resolution.providerUserId })
  }
  if (resolution.kind === 'MATCHED_SERVICE_CONTACT') {
    return NextResponse.json({ code: resp.code, message: resp.messageAr, contactId: resolution.contactId })
  }

  // Ensure the identity row exists (encrypted phone + hash). For a normal-
  // user match we record linkedUserId (internal marker ONLY).
  const ensuredIdentity = await db.serviceIdentity.upsert({
    where: { phoneHash: hash },
    create: {
      phoneHash: hash,
      phoneEnc: encryptPhone(e164),
      // Self-add → record explicit ownership (ownerUserId) so the listing is
      // owned + DM-able. Generic match → linkedUserId (internal marker only).
      ...(isSelf ? { ownerUserId: user.id, linkedUserId: user.id } : {}),
      ...(resolution.kind === 'GENERIC_PENDING_MATCH' ? { linkedUserId: resolution.linkedUserId } : {}),
    },
    update: isSelf
      ? { ownerUserId: user.id, linkedUserId: user.id }
      : (resolution.kind === 'GENERIC_PENDING_MATCH' ? { linkedUserId: resolution.linkedUserId } : {}),
    select: { id: true },
  })

  const pendingMatch = resolution.kind === 'GENERIC_PENDING_MATCH'
  try {
    const contact = await db.directoryServiceContact.create({
      data: {
        serviceIdentityId: ensuredIdentity.id,
        neighborhoodId,
        category,
        displayName: name,
        description,
        whatsapp,
        serviceArea,
        notes,
        source: isSelf ? 'OWNER_SUBMITTED' : 'COMMUNITY_ADDED',
        // Self-add: VERIFIED if the owner is an active/verified provider, else
        // CLAIMED (owned). Matched-user (not self) contacts stay non-public
        // until the owner confirms.
        verification: isSelf ? (isProvider ? 'VERIFIED' : 'CLAIMED') : (pendingMatch ? 'PENDING_OWNER_CONFIRMATION' : 'UNVERIFIED'),
        status: pendingMatch ? 'PENDING_REVIEW' : 'ACTIVE',
        createdByUserId: user.id,
        sourcePostId,
        sourceCommentId,
      },
      include: { serviceIdentity: { select: { phoneEnc: true, ownerUserId: true } } },
    })

    // Prompt the matched user privately to claim/confirm. Best-effort;
    // the submitter never learns this happened (generic response).
    if (pendingMatch) {
      try {
        await db.notification.create({
          data: {
            type: 'SYSTEM',
            userId: resolution.linkedUserId,
            actorId: user.id,
            title: 'تم اقتراح رقمك كجهة خدمة',
            titleEn: 'Your number was suggested as a service',
            body: 'تم اقتراح رقمك كجهة خدمة في دليل الحي. هل ترغب بتفعيل صفحة خدمة؟',
            bodyEn: 'Your number was suggested as a service in the directory. Activate a service page?',
          },
        })
      } catch { /* notification is best-effort */ }
      return NextResponse.json({ code: resp.code, message: resp.messageAr })
    }

    return NextResponse.json({ code: resp.code, message: resp.messageAr, contact: toPublicServiceContact(contact) }, { status: 201 })
  } catch (err) {
    // Unique (serviceIdentityId, neighborhoodId, category) race → treat as
    // an existing contact rather than a hard error.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const dup = await db.directoryServiceContact.findFirst({
        where: { serviceIdentityId: ensuredIdentity.id, neighborhoodId, category },
        select: { id: true },
      })
      return NextResponse.json({ code: 'MATCHED_SERVICE_CONTACT', message: 'هذا الرقم مضاف مسبقًا في الدليل لهذا القسم.', contactId: dup?.id }, { status: 200 })
    }
    console.error('[SERVICE_CONTACT] create failed:', err)
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}
