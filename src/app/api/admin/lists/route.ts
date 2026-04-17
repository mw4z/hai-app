import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

const ADMIN_ROLES = ['NEIGHBORHOOD_MOD', 'PLATFORM_MOD', 'SUPER_ADMIN']

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, neighborhoodId: true, gender: true },
  })
  if (!admin || !ADMIN_ROLES.includes(admin.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const list = searchParams.get('list')

  // Neighborhood scope: NEIGHBORHOOD_MOD only sees their neighborhood
  const isNbhdMod = admin.role === 'NEIGHBORHOOD_MOD'
  const nbhdFilter = isNbhdMod && admin.neighborhoodId ? { neighborhoodId: admin.neighborhoodId } : {}
  const userNbhdFilter = isNbhdMod && admin.neighborhoodId ? { neighborhoodId: admin.neighborhoodId } : {}
  // Male mods cannot see or manage WOMEN_ONLY posts
  const womenOnlyFilter = admin.gender !== 'FEMALE' ? { category: { not: 'WOMEN_ONLY' as any } } : {}

  switch (list) {
    case 'reported_posts': {
      const posts = await db.post.findMany({
        where: { reportCount: { gt: 0 }, status: { in: ['ACTIVE', 'HIDDEN', 'IN_PROGRESS'] }, ...nbhdFilter, ...womenOnlyFilter },
        include: {
          author: { select: { id: true, name: true, phone: true } },
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
      const posts = await db.post.findMany({
        where: {
          ...nbhdFilter,
          ...womenOnlyFilter,
          ...(q ? { OR: [{ title: { contains: q } }, { body: { contains: q } }] } : {}),
          ...(statusFilter ? { status: statusFilter as any } : {}),
        },
        include: {
          author: { select: { id: true, name: true, phone: true } },
          neighborhood: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
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
          db.user.findUnique({ where: { id: r.userId }, select: { name: true, phone: true } }),
          db.neighborhood.findUnique({ where: { id: r.currentNeighborhoodId }, select: { name: true } }),
          db.neighborhood.findUnique({ where: { id: r.requestedNeighborhoodId }, select: { name: true } }),
        ])
        return { ...r, userName: user?.name, userPhone: user?.phone, fromName: from?.name, toName: to?.name }
      }))
      return NextResponse.json(enriched)
    }

    case 'users': {
      const q = searchParams.get('q') || ''
      const users = await db.user.findMany({
        where: {
          ...userNbhdFilter,
          ...(q ? { OR: [{ name: { contains: q } }, { phone: { contains: q } }, { email: { contains: q } }] } : {}),
        },
        select: { id: true, name: true, phone: true, email: true, role: true, status: true, neighborhoodId: true, reputation: true, accountType: true, providerStatus: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      return NextResponse.json(users)
    }

    case 'verification_requests': {
      const vrs = await db.verificationRequest.findMany({
        where: { status: 'pending' },
        orderBy: { createdAt: 'asc' },
      })
      const enriched = await Promise.all(vrs.map(async v => {
        const user = await db.user.findUnique({ where: { id: v.userId }, select: { name: true, phone: true } })
        return { ...v, userName: user?.name, userPhone: user?.phone }
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
          db.user.findUnique({ where: { id: m.userId }, select: { name: true, phone: true, reputation: true, createdAt: true } }),
          db.neighborhood.findUnique({ where: { id: m.neighborhoodId }, select: { name: true, nameEn: true } }),
        ])
        const ageDays = user ? Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86400000) : 0
        return { ...m, userName: user?.name, userPhone: user?.phone, reputation: user?.reputation, ageDays, neighborhoodName: nbhd?.name, neighborhoodNameEn: nbhd?.nameEn }
      }))
      return NextResponse.json(enriched)
    }

    case 'neighborhood_reports': {
      const nrWhere: any = { status: searchParams.get('status') || 'open' }
      if (isNbhdMod && admin.neighborhoodId) nrWhere.neighborhoodId = admin.neighborhoodId
      const reports = await db.neighborhoodReport.findMany({ where: nrWhere, orderBy: { createdAt: 'desc' }, take: 50 })
      const enriched = await Promise.all(reports.map(async r => {
        const u = await db.user.findUnique({ where: { id: r.userId }, select: { name: true, phone: true, avatarUrl: true } })
        return { ...r, userName: u?.name, userPhone: u?.phone }
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
        const user = await db.user.findUnique({ where: { id: t.userId }, select: { name: true, phone: true, avatarUrl: true } })
        return { ...t, userName: user?.name, userPhone: user?.phone, userAvatar: user?.avatarUrl }
      }))
      return NextResponse.json(enriched)
    }

    default:
      return NextResponse.json({ error: 'Invalid list' }, { status: 400 })
  }
}
