import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { classifyPost } from '@/lib/posts/classifyPost'
import { getSession } from '@/lib/auth'
import { notifyNeighborhood } from '@/lib/notifications'
import { validateContent, normalizeForComparison, isSimilar, apiError } from '@/lib/validation'
import { PostCategory } from '@prisma/client'
import { getPostLimit } from '@/lib/reputation'
import { getLimits } from '@/lib/capabilities'
import { cacheDeletePrefix } from '@/lib/cache'
import { moderateContent } from '@/lib/moderation'
import { kickNotifCron } from '@/lib/kickNotifCron'
import { requireVerified } from '@/lib/requireVerified'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { fullName } from '@/lib/displayName'

const DEFAULT_POST_LIMIT = 5
const POST_COOLDOWN_SECONDS = 60
const VALID_CATEGORIES = Object.values(PostCategory)

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json(apiError('يجب تسجيل الدخول', 401), { status: 401 })
    }

    const gate = await requireVerified(session.userId)
    if (gate) return gate

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, name: true, lastName: true, neighborhoodId: true, status: true, gender: true, reputation: true, role: true, plan: true, providerStatus: true },
    })

    if (!user?.neighborhoodId) {
      return NextResponse.json(apiError('أكمل ملفك الشخصي أولاً', 403), { status: 403 })
    }
    const bypass = isSuperAdminRole(user.role)
    if (!bypass && (user.status === 'BANNED_TEMP' || user.status === 'BANNED_PERM')) {
      return NextResponse.json(apiError('حسابك موقوف', 403, 'BANNED'), { status: 403 })
    }

    const { title, body, category, price, imageUrls, locationLat, locationLng, locationName, neighborhoodId: requestedNeighborhoodId } = await req.json()

    // SUPER_ADMIN can target any neighborhood by passing neighborhoodId in
    // the body. Regular users (and all other roles) are always pinned to
    // their own neighborhood. If the id is valid, we use it as the post's
    // neighborhoodId for the create + feed-invalidation + push fanout.
    let targetNeighborhoodId: string = user.neighborhoodId
    if (bypass && typeof requestedNeighborhoodId === 'string' && requestedNeighborhoodId.trim() && requestedNeighborhoodId !== user.neighborhoodId) {
      const nbhd = await db.neighborhood.findUnique({
        where: { id: requestedNeighborhoodId.trim() },
        select: { id: true },
      })
      if (!nbhd) {
        return NextResponse.json(apiError('الحي غير موجود', 404), { status: 404 })
      }
      targetNeighborhoodId = nbhd.id
    }

    // Category validation
    if (!category || !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(apiError('تصنيف غير صالح', 400), { status: 400 })
    }

    if (!title?.trim() || !body?.trim()) {
      return NextResponse.json(apiError('بيانات ناقصة', 400), { status: 400 })
    }

    // Content quality validation
    const titleErr = validateContent(title, 'title')
    if (titleErr) return NextResponse.json(apiError(titleErr, 400), { status: 400 })
    const bodyErr = validateContent(body, 'body')
    if (bodyErr) return NextResponse.json(apiError(bodyErr, 400), { status: 400 })

    // Price validation
    if (price !== undefined && price !== null) {
      if (typeof price !== 'number' || price < 0 || price > 10_000_000) {
        return NextResponse.json(apiError('سعر غير صالح', 400), { status: 400 })
      }
    }

    // Women-only check (SUPER_ADMIN bypasses category gender restriction)
    if (!bypass && category === 'WOMEN_ONLY' && user.gender !== 'FEMALE') {
      return NextResponse.json(apiError('هذا القسم للنساء فقط', 403), { status: 403 })
    }

    // SERVICES is reserved for publicly-visible providers. NORMAL users and
    // PENDING providers can't post there even if they bypass the client.
    if (!bypass && category === 'SERVICES' && user.providerStatus !== 'ACTIVE' && user.providerStatus !== 'VERIFIED') {
      return NextResponse.json(apiError('هذا القسم متاح فقط لمقدمي الخدمات', 403), { status: 403 })
    }

    // Contests — admin only (SUPER_ADMIN always allowed by the allowlist)
    if (category === 'CONTESTS' && !['SUPER_ADMIN', 'PLATFORM_MOD', 'NEIGHBORHOOD_MOD'].includes(user.role)) {
      return NextResponse.json(apiError('المسابقات متاحة فقط للمشرفين', 403), { status: 403 })
    }

    if (!bypass) {
      // Cooldown: 60 seconds between posts
      const cooldownAgo = new Date(Date.now() - POST_COOLDOWN_SECONDS * 1000)
      const recentPost = await db.post.findFirst({
        where: { authorId: user.id, createdAt: { gte: cooldownAgo } },
        select: { id: true },
      })
      if (recentPost) {
        console.log(`[RATE_LIMIT] post cooldown: user=${user.id}`)
        return NextResponse.json(apiError('انتظر قليلاً قبل نشر منشور جديد', 429), { status: 429 })
      }

      // Daily post limit
      const todayPosts = await db.post.count({
        where: {
          authorId: user.id,
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      })
      const repLimit = getPostLimit(user.reputation)
      const planLimit = getLimits(user.plan).postsPerDay
      const dailyLimit = Math.max(repLimit, planLimit) // use whichever is higher
      if (todayPosts >= dailyLimit) {
        return NextResponse.json(apiError('وصلت الحد الأقصى للمنشورات اليوم', 429), { status: 429 })
      }

      // Duplicate/similarity detection: check last 3 hours
      const threeHoursAgo = new Date(Date.now() - 3 * 3600_000)
      const recentUserPosts = await db.post.findMany({
        where: { authorId: user.id, createdAt: { gte: threeHoursAgo } },
        select: { title: true, body: true },
      })
      for (const p of recentUserPosts) {
        if (isSimilar(title.trim(), p.title) || isSimilar(body.trim(), p.body)) {
          console.log(`[SPAM] duplicate detected: user=${user.id}`)
          return NextResponse.json(
            { error: 'DUPLICATE_POST' },
            { status: 409 },
          )
        }
      }
    }

    // ── Profanity / abuse check ──────────────────────────────────────────
    const titleMod = moderateContent(title.trim())
    const bodyMod = moderateContent(body.trim())

    // Block if either title or body is flagged. SUPER_ADMIN bypasses
    // moderation entirely — they are the moderators.
    if (!bypass && (titleMod.action === 'block' || bodyMod.action === 'block')) {
      const words = Array.from(new Set([
        ...(titleMod.offensiveWords || []),
        ...(bodyMod.offensiveWords || []),
      ])).filter(Boolean)
      console.log(`[MODERATION] Blocked post: user=${user.id}, words=${words.join(',')}`)
      // Don't echo the matched words back to the client — just a generic
      // "inappropriate content" error. The server-side log retains them
      // for admin review without exposing them in UI.
      return NextResponse.json(
        { error: 'CONTENT_BLOCKED' },
        { status: 403 }
      )
    }

    // Apply censoring if needed. SUPER_ADMIN posts raw content; everyone
    // else gets the moderator's censored version.
    const finalTitle = bypass ? title.trim() : titleMod.censored
    const finalBody = bypass ? body.trim() : bodyMod.censored

    // Apply reputation penalty + notify user (skipped for SUPER_ADMIN)
    const totalPenalty = titleMod.reputationPenalty + bodyMod.reputationPenalty
    if (!bypass && totalPenalty < 0) {
      db.user.update({
        where: { id: user.id },
        data: { reputation: { increment: totalPenalty } },
      }).catch(() => {})
      // Notify user about the penalty
      db.notification.create({
        data: {
          type: 'SYSTEM',
          userId: user.id,
          actorId: user.id,
          actorName: 'النظام',
          postTitle: `تم خصم ${Math.abs(totalPenalty)} نقطة سمعة بسبب محتوى مخالف`,
        },
      }).catch(() => {})
      console.log(`[MODERATION] Penalty: user=${user.id}, penalty=${totalPenalty}`)
    }

    // Log flagged content for admin review
    if (titleMod.action !== 'allow' || bodyMod.action !== 'allow') {
      db.notification.create({
        data: {
          type: 'REPORT',
          userId: user.id,
          actorId: user.id,
          actorName: `[AUTO-MOD] ${fullName(user) || user.name || 'User'}`,
          postTitle: `${titleMod.action}/${bodyMod.action}: ${title.trim().slice(0, 80)}`,
        },
      }).catch(() => {})
    }

    const EXCLUSIVE_CATEGORIES = ['RIDE_REQUEST']
    const coordinationMode = EXCLUSIVE_CATEGORIES.includes(category) ? 'EXCLUSIVE' : 'OPEN'

    // Validate image URLs if provided
    const validatedImages: string[] = []
    if (Array.isArray(imageUrls)) {
      for (const url of imageUrls.slice(0, 5)) {
        if (typeof url === 'string' && (url.startsWith('/uploads/') || url.startsWith('https://')) && url.length < 500) {
          validatedImages.push(url)
        }
      }
    }

    // Dual-write through classifyPost — populates legacy `category`
    // AND v2 (newCategory / intent / priority / audience) in one shot.
    // Single source of truth for the mapping; never duplicate it
    // anywhere else in the codebase.
    const c = classifyPost({ kind: 'legacy', legacyCategory: category as any })
    const post = await db.post.create({
      data: {
        title: finalTitle,
        body: finalBody,
        category:    c.legacyCategory,
        newCategory: c.newCategory,
        intent:      c.intent,
        priority:    c.priority,
        audience:    c.audience,
        coordinationMode,
        price: price || null,
        imageUrls: validatedImages,
        locationLat: locationLat || null,
        locationLng: locationLng || null,
        locationName: locationName?.trim() || null,
        authorId: user.id,
        neighborhoodId: targetNeighborhoodId,
        status: 'ACTIVE',
      },
    })

    // Enqueue neighborhood push fanout via NotifJob. Awaited so the
    // row is committed BEFORE kickNotifCron fires — otherwise the
    // cron can read the queue before the insert commits and the
    // push waits up to ~60s for the next scheduled tick.
    // Processor applies filtering (author exclusion, prefs, quiet
    // hours, gender). priority:'high' so every neighbor's phone gets
    // the banner the moment the post is published.
    try {
      await db.notifJob.create({
        data: {
          type: 'new_post',
          priority: 'high',
          targetType: 'nbhd_topic',
          targetRef: targetNeighborhoodId,
          payload: {
            postId: post.id,
            authorId: user.id,
            authorName: fullName(user) || user.name || null,
            title: finalTitle.slice(0, 140),
            category,
          },
        },
      })
    } catch (err) {
      console.error('[NOTIF_JOB] enqueue new_post failed:', err)
    }
    kickNotifCron()

    // Notify all neighbors when someone posts in LOOKING_FOR
    if (category === 'LOOKING_FOR') {
      notifyNeighborhood({
        type: 'LOOKING_FOR_POST',
        actorId: user.id,
        actorName: fullName(user) || user.name || undefined,
        neighborhoodId: targetNeighborhoodId,
        postId: post.id,
        postTitle: title.trim().slice(0, 80),
      })
    }

    // Invalidate feed cache for this neighborhood
    cacheDeletePrefix(`feed:${targetNeighborhoodId}`)

    return NextResponse.json({ success: true, postId: post.id })
  } catch (error) {
    console.error('[ERROR] create post:', error)
    return NextResponse.json(apiError('خطأ في الخادم', 500), { status: 500 })
  }
}
