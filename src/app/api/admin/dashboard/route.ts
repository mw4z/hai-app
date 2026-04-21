import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { shouldArchivePost } from '@/lib/postExpiry'
import { UserStatus } from '@prisma/client'

const ADMIN_ROLES = ['NEIGHBORHOOD_MOD', 'PLATFORM_MOD', 'SUPER_ADMIN']

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, neighborhoodId: true, gender: true },
  })
  if (!admin || !ADMIN_ROLES.includes(admin.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const isSuper = admin.role === 'SUPER_ADMIN'
  const isPlatform = admin.role === 'PLATFORM_MOD' || isSuper

  // Scoping: neighborhood mods only see their neighborhood
  const nbhdFilter = isPlatform ? {} : { neighborhoodId: admin.neighborhoodId! }
  // Male mods don't see WOMEN_ONLY posts in counts
  const womenOnlyFilter = admin.gender !== 'FEMALE' ? { category: { not: 'WOMEN_ONLY' as any } } : {}

  // Active users = real humans who completed the full onboarding flow
  // (OTP + neighborhood verification). This is tighter than just
  // isVerified=true because historical test/phantom accounts were marked
  // OTP-verified but never made it through neighborhood verification.
  // addressVerified becomes true only when /api/auth/complete-profile
  // accepts a matched GPS-to-neighborhood assignment.
  const activeUserFilter = {
    ...(nbhdFilter.neighborhoodId ? { neighborhoodId: nbhdFilter.neighborhoodId } : {}),
    deletedAt: null,
    isSeed: false,
    isVerified: true,
    addressVerified: true,
    status: { notIn: [UserStatus.BANNED_TEMP, UserStatus.BANNED_PERM] },
  }

  const [
    pendingRequests,
    reportedPosts,
    hiddenPosts,
    totalUsers,
    bannedUsers,
    livePostsRaw,
    recentLogs,
    adminUsers,
    neighborhoodStats,
  ] = await Promise.all([
    db.neighborhoodChangeRequest.count({ where: { status: 'pending' } }),
    db.post.count({ where: { ...nbhdFilter, ...womenOnlyFilter, status: 'HIDDEN' } }),
    db.post.count({ where: { ...nbhdFilter, ...womenOnlyFilter, status: 'REMOVED' } }),
    db.user.count({ where: activeUserFilter }),
    db.user.count({ where: { status: { in: ['BANNED_TEMP', 'BANNED_PERM'] }, deletedAt: null, isSeed: false, isVerified: true, addressVerified: true, ...(nbhdFilter.neighborhoodId ? { neighborhoodId: nbhdFilter.neighborhoodId } : {}) } }),
    // Pull enough metadata to run the JS-side expiry check — matches what
    // users actually see in the feed (expired/archived posts are excluded).
    db.post.findMany({
      // Exclude seed-authored posts — the dashboard is for tracking real
      // user activity, not the background pool.
      where: { ...nbhdFilter, status: { in: ['ACTIVE', 'IN_PROGRESS'] }, author: { isSeed: false, isVerified: true, addressVerified: true } },
      select: {
        id: true,
        category: true,
        createdAt: true,
        activeThreadId: true,
        isPinned: true,
        _count: { select: { comments: true } },
      },
    }),
    db.moderationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
    isSuper ? db.user.findMany({
      where: { role: { not: 'RESIDENT' } },
      select: { id: true, name: true, phone: true, role: true },
      orderBy: { role: 'asc' },
    }) : [],
    db.city.findMany({
      select: { name: true, _count: { select: { neighborhoods: true } } },
    }),
  ])

  // Apply the same expiry rule the feed uses, so the dashboard "totalPosts"
  // reflects only the posts currently visible to users.
  const totalPosts = livePostsRaw.filter(p => !shouldArchivePost(p)).length

  return NextResponse.json({
    role: admin.role,
    stats: { pendingRequests, reportedPosts, hiddenPosts, totalUsers, bannedUsers, totalPosts },
    recentLogs: JSON.parse(JSON.stringify(recentLogs)),
    adminUsers,
    neighborhoodStats,
  })
}
