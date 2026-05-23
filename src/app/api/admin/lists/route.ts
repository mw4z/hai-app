import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { matchesArabic } from '@/lib/arabicNormalize'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, neighborhoodId: true, gender: true },
  })
  // Admin-portal read endpoint — SUPER_ADMIN only. Moderators use the
  // neighborhood-scoped /mod dashboard (+ /api/mod/*) instead.
  if (!admin || !isSuperAdminRole(admin.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const list = searchParams.get('list')

  // Neighborhood scope: NEIGHBORHOOD_MOD only sees their neighborhood
  const isNbhdMod = admin.role === 'NEIGHBORHOOD_MOD'
  const nbhdFilter = isNbhdMod && admin.neighborhoodId ? { neighborhoodId: admin.neighborhoodId } : {}
  const userNbhdFilter = isNbhdMod && admin.neighborhoodId ? { neighborhoodId: admin.neighborhoodId } : {}
  // Male mods cannot see or manage WOMEN-targeted posts. Audience
  // targeting now lives in Post.audience — the legacy WOMEN_ONLY
  // category is no longer how this is expressed.
  const womenOnlyFilter = admin.gender !== 'FEMALE' ? { audience: { not: 'WOMEN' as any } } : {}

  switch (list) {
    case 'reported_posts': {
      const posts = await db.post.findMany({
        where: { reportCount: { gt: 0 }, status: { in: ['ACTIVE', 'HIDDEN', 'IN_PROGRESS'] }, ...nbhdFilter, ...womenOnlyFilter },
        include: {
          author: { select: { id: true, name: true, lastName: true, phone: true } },
          neighborhood: { select: { name: true } },
        },
        orderBy: { reportCount: 'desc' },
        take: 50,
      })
      return NextResponse.json(posts)
    }

    case 'all_posts': {
      const q = searchParams.get('q') || ''
      const statusFilter = searchParams.get('status') || ''
      // Arabic-aware match: drop `q` from the DB query and post-
      // filter in JS via matchesArabic so أحمد == احمد == آحمد.
      // Overfetch when q is set so the post-filter has room to
      // cut down to ~50 visible results.
      const dbTake = q ? 500 : 50
      const rows = await db.post.findMany({
        where: {
          ...nbhdFilter,
          ...womenOnlyFilter,
          ...(statusFilter ? { status: statusFilter as any } : {}),
        },
        include: {
          author: { select: { id: true, name: true, lastName: true, phone: true } },
          neighborhood: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: dbTake,
      })
      const posts = q
        ? rows
            .filter((p) => matchesArabic(p.title, q) || matchesArabic(p.body, q))
            .slice(0, 50)
        : rows
      return NextResponse.json(posts)
    }

    case 'pending_requests': {
      const requests = await db.neighborhoodChangeRequest.findMany({
        where: { status: 'pending' },
        orderBy: { createdAt: 'asc' },
        take: 50,
      })
      const enriched = await Promise.all(requests.map(async r => {
        const [user, from, to] = await Promise.all([
          db.user.findUnique({ where: { id: r.userId }, select: { name: true, lastName: true, phone: true } }),
          db.neighborhood.findUnique({ where: { id: r.currentNeighborhoodId }, select: { name: true } }),
          db.neighborhood.findUnique({ where: { id: r.requestedNeighborhoodId }, select: { name: true } }),
        ])
        return { ...r, userName: [user?.name?.trim(), user?.lastName?.trim()].filter(Boolean).join(' ') || user?.name, userPhone: user?.phone, fromName: from?.name, toName: to?.name }
      }))
      return NextResponse.json(enriched)
    }

    case 'users': {
      const q = searchParams.get('q') || ''
      // Drop the DB-side q filter when q is set — Postgres ILIKE
      // isn't Arabic-aware, so أحمد wouldn't match احمد at the DB
      // layer. Instead overfetch (bounded by userNbhdFilter for
      // NEIGHBORHOOD_MOD; capped to 500 for SUPER_ADMIN) and apply
      // matchesArabic in JS. Trade: slightly more bytes off the
      // wire for admin search; correctness for Arabic-name lookups.
      const dbTake = q ? 1000 : 500
      const rows = await db.user.findMany({
        // Only real members — exclude incomplete signups (OTP-only rows
        // created with a phone but no name yet).
        where: { ...userNbhdFilter, name: { not: null } },
        select: { id: true, name: true, lastName: true, phone: true, email: true, role: true, status: true, neighborhoodId: true, reputation: true, accountType: true, providerStatus: true },
        orderBy: { createdAt: 'desc' },
        take: dbTake,
      })
      // Belt-and-suspenders: also drop blank/whitespace names.
      const named = rows.filter((u) => (u.name ?? '').trim().length > 0)
      const users = q
        ? named
            .filter(
              (u) =>
                (u.phone ?? '').includes(q) ||
                (u.email ?? '').toLowerCase().includes(q.toLowerCase()) ||
                matchesArabic(u.name, q) ||
                matchesArabic(u.lastName, q),
            )
            .slice(0, 200)
        : named
      return NextResponse.json(users)
    }

    case 'verification_requests': {
      const vrs = await db.verificationRequest.findMany({
        where: { status: 'pending' },
        orderBy: { createdAt: 'asc' },
      })
      const enriched = await Promise.all(vrs.map(async v => {
        const user = await db.user.findUnique({ where: { id: v.userId }, select: { name: true, lastName: true, phone: true } })
        return { ...v, userName: [user?.name?.trim(), user?.lastName?.trim()].filter(Boolean).join(' ') || user?.name, userPhone: user?.phone }
      }))
      return NextResponse.json(enriched)
    }

    case 'mod_requests': {
      const mrs = await db.modRequest.findMany({
        where: { status: 'pending' },
        orderBy: { createdAt: 'asc' },
      })
      const enriched = await Promise.all(mrs.map(async m => {
        const [user, nbhd] = await Promise.all([
          db.user.findUnique({ where: { id: m.userId }, select: { name: true, lastName: true, phone: true, reputation: true, createdAt: true } }),
          db.neighborhood.findUnique({ where: { id: m.neighborhoodId }, select: { name: true, nameEn: true } }),
        ])
        const ageDays = user ? Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86400000) : 0
        return { ...m, userName: [user?.name?.trim(), user?.lastName?.trim()].filter(Boolean).join(' ') || user?.name, userPhone: user?.phone, reputation: user?.reputation, ageDays, neighborhoodName: nbhd?.name, neighborhoodNameEn: nbhd?.nameEn }
      }))
      return NextResponse.json(enriched)
    }

    case 'neighborhood_reports': {
      const nrWhere: any = { status: searchParams.get('status') || 'open' }
      if (isNbhdMod && admin.neighborhoodId) nrWhere.neighborhoodId = admin.neighborhoodId
      const reports = await db.neighborhoodReport.findMany({ where: nrWhere, orderBy: { createdAt: 'desc' }, take: 50 })
      const enriched = await Promise.all(reports.map(async r => {
        const u = await db.user.findUnique({ where: { id: r.userId }, select: { name: true, lastName: true, phone: true, avatarUrl: true } })
        return { ...r, userName: [u?.name?.trim(), u?.lastName?.trim()].filter(Boolean).join(' ') || u?.name, userPhone: u?.phone }
      }))
      return NextResponse.json(enriched)
    }

    case 'support_tickets': {
      const statusFilter = searchParams.get('status') || 'open'
      const tickets = await db.supportTicket.findMany({
        where: statusFilter === 'all' ? {} : { status: statusFilter },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      const enriched = await Promise.all(tickets.map(async t => {
        const user = await db.user.findUnique({ where: { id: t.userId }, select: { name: true, lastName: true, phone: true, avatarUrl: true } })
        return { ...t, userName: [user?.name?.trim(), user?.lastName?.trim()].filter(Boolean).join(' ') || user?.name, userPhone: user?.phone, userAvatar: user?.avatarUrl }
      }))
      return NextResponse.json(enriched)
    }

    default:
      return NextResponse.json({ error: 'Invalid list' }, { status: 400 })
  }
}
