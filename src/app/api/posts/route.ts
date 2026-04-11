import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { notifyNeighborhood } from '@/lib/notifications'
import { validateContent, normalizeForComparison, isSimilar, apiError } from '@/lib/validation'
import { PostCategory } from '@prisma/client'
import { getPostLimit } from '@/lib/reputation'
import { getLimits } from '@/lib/capabilities'
import { cacheDeletePrefix } from '@/lib/cache'
import { moderateContent } from '@/lib/moderation'

const DEFAULT_POST_LIMIT = 5
const POST_COOLDOWN_SECONDS = 60
const VALID_CATEGORIES = Object.values(PostCategory)

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json(apiError('يجب تسجيل الدخول', 401), { status: 401 })
    }

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, name: true, neighborhoodId: true, status: true, gender: true, reputation: true, role: true, plan: true },
    })

    if (!user?.neighborhoodId) {
      return NextResponse.json(apiError('أكمل ملفك الشخصي أولاً', 403), { status: 403 })
    }
    if (user.status === 'BANNED_TEMP' || user.status === 'BANNED_PERM') {
      return NextResponse.json(apiError('حسابك موقوف', 403, 'BANNED'), { status: 403 })
    }

    const { title, body, category, price, imageUrls, locationLat, locationLng, locationName } = await req.json()

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

    // Women-only check
    if (category === 'WOMEN_ONLY' && user.gender !== 'FEMALE') {
      return NextResponse.json(apiError('هذا القسم للنساء فقط', 403), { status: 403 })
    }

    // Contests — admin only
    if (category === 'CONTESTS' && !['SUPER_ADMIN', 'PLATFORM_MOD', 'NEIGHBORHOOD_MOD'].includes(user.role)) {
      return NextResponse.json(apiError('المسابقات متاحة فقط للمشرفين', 403), { status: 403 })
    }

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
        return NextResponse.json(apiError('لديك منشور مشابه بالفعل', 409), { status: 409 })
      }
    }

    // ── Profanity / abuse check ──────────────────────────────────────────
    const titleMod = moderateContent(title.trim())
    const bodyMod = moderateContent(body.trim())

    // Block if either title or body is extremely offensive
    if (titleMod.action === 'block' || bodyMod.action === 'block') {
      console.log(`[MODERATION] Blocked post: user=${user.id}, title="${title.trim().slice(0, 50)}"`)
      return NextResponse.json(
        apiError(titleMod.reason || bodyMod.reason || 'تم حظر المحتوى', 403, 'CONTENT_BLOCKED'),
        { status: 403 }
      )
    }

    // Apply censoring if needed
    const finalTitle = titleMod.censored
    const finalBody = bodyMod.censored

    // Apply reputation penalty + notify user
    const totalPenalty = titleMod.reputationPenalty + bodyMod.reputationPenalty
    if (totalPenalty < 0) {
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
          actorName: `[AUTO-MOD] ${user.name || 'User'}`,
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

    const post = await db.post.create({
      data: {
        title: finalTitle,
        body: finalBody,
        category,
        coordinationMode,
        price: price || null,
        imageUrls: validatedImages,
        locationLat: locationLat || null,
        locationLng: locationLng || null,
        locationName: locationName?.trim() || null,
        authorId: user.id,
        neighborhoodId: user.neighborhoodId,
        status: 'ACTIVE',
      },
    })

    // Notify all neighbors when someone posts in LOOKING_FOR
    if (category === 'LOOKING_FOR') {
      notifyNeighborhood({
        type: 'LOOKING_FOR_POST',
        actorId: user.id,
        actorName: user.name || undefined,
        neighborhoodId: user.neighborhoodId,
        postId: post.id,
        postTitle: title.trim().slice(0, 80),
      })
    }

    // Invalidate feed cache for this neighborhood
    cacheDeletePrefix(`feed:${user.neighborhoodId}`)

    return NextResponse.json({ success: true, postId: post.id })
  } catch (error) {
    console.error('[ERROR] create post:', error)
    return NextResponse.json(apiError('خطأ في الخادم', 500), { status: 500 })
  }
}
