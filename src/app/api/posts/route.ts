import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { classifyPost } from '@/lib/posts/classifyPost'
import { classifyPostCategory } from '@/lib/posts/classify'
import { getSession } from '@/lib/auth'
import { notifyNeighborhood } from '@/lib/notifications'
import { validateContent, normalizeForComparison, isSimilar, apiError } from '@/lib/validation'
import { PostCategory, PostIntent, PostPriority, PostAudience, MarketplaceType } from '@prisma/client'
import { getPostLimit } from '@/lib/reputation'
import { getLimits } from '@/lib/capabilities'
import { cacheDeletePrefix } from '@/lib/cache'
import { moderateContent } from '@/lib/moderation'
import { kickNotifCron } from '@/lib/kickNotifCron'
import { requireVerified } from '@/lib/requireVerified'
import { requireCompleteProfile } from '@/lib/requireCompleteProfile'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { fullName } from '@/lib/displayName'

const DEFAULT_POST_LIMIT = 5
const POST_COOLDOWN_SECONDS = 60
const VALID_CATEGORIES = Object.values(PostCategory)
const VALID_INTENTS = ['OFFER', 'REQUEST', 'NORMAL'] as const
const VALID_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] as const
const VALID_AUDIENCES = ['ALL', 'WOMEN', 'MEN'] as const
const VALID_MARKETPLACE_TYPES = ['SELL', 'BUY', 'JOB'] as const

// Anti-spam knobs for JOB subtype
const JOB_MIN_BODY_CHARS = 50
const JOB_MAX_PER_DAY = 2
// External-chat link pattern — WhatsApp groups / channels are the
// dominant Saudi-region spam vector for "jobs". Block at write-time.
const EXTERNAL_GROUP_LINK = /(?:chat\.whatsapp\.com|wa\.me\/[^\s]*\?|t\.me\/joinchat|t\.me\/\+)/i

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json(apiError('يجب تسجيل الدخول', 401), { status: 401 })
    }

    // Profile-completeness gate runs BEFORE the verified gate so a
    // post-OTP / pre-onboarding user gets redirected to onboarding
    // instead of seeing a confusing "verify your location" error.
    const incompleteGate = await requireCompleteProfile(session.userId)
    if (incompleteGate) return incompleteGate
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

    const reqBody = await req.json()
    const {
      title,
      body,
      price,
      imageUrls,
      locationLat,
      locationLng,
      locationName,
      neighborhoodId: requestedNeighborhoodId,
    } = reqBody
    // `category` is `let` because the server-side classifier may
    // AUTO_CORRECT it after content analysis below.
    let category: string = reqBody.category
    // v2 optional fields — Ask flow sends `intent: 'REQUEST'`. Audience
    // and priority are reserved for future selectors; today they're only
    // populated server-side via classifyPost defaults.
    const intentInput = typeof reqBody.intent === 'string' ? reqBody.intent : undefined
    const priorityInput = typeof reqBody.priority === 'string' ? reqBody.priority : undefined
    const audienceInput = typeof reqBody.audience === 'string' ? reqBody.audience : undefined

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

    if (
      !category ||
      typeof category !== 'string' ||
      !(VALID_CATEGORIES as readonly string[]).includes(category)
    ) {
      return NextResponse.json(apiError('تصنيف غير صالح', 400), { status: 400 })
    }

    // Marketplace subtype — required when category=MARKETPLACE,
    // ignored otherwise. Defaults to SELL on the way in if a legacy
    // client doesn't send it (back-compat); JOB / BUY must be opt-in.
    const marketplaceTypeInput = typeof reqBody.marketplaceType === 'string'
      ? reqBody.marketplaceType
      : undefined
    let marketplaceType: MarketplaceType = 'SELL'
    if (category === 'MARKETPLACE') {
      if (!marketplaceTypeInput) {
        return NextResponse.json(
          apiError('نوع الإعلان مطلوب (بيع / شراء / فرصة عمل)', 400),
          { status: 400 },
        )
      }
      if (!(VALID_MARKETPLACE_TYPES as readonly string[]).includes(marketplaceTypeInput)) {
        return NextResponse.json(apiError('نوع إعلان غير صالح', 400), { status: 400 })
      }
      marketplaceType = marketplaceTypeInput as MarketplaceType
    }
    // Optional v2 secondary fields — validate against the enums but stay
    // permissive: unknown values are dropped, valid values become
    // overrides for classifyPost.
    const intent: PostIntent | undefined = intentInput && (VALID_INTENTS as readonly string[]).includes(intentInput)
      ? (intentInput as PostIntent)
      : undefined
    const priority: PostPriority | undefined = priorityInput && (VALID_PRIORITIES as readonly string[]).includes(priorityInput)
      ? (priorityInput as PostPriority)
      : undefined

    // Server-side priority clamp — gates the URGENT_ONLY intent override
    // in canSendNotification, so abuse here would punch through user mutes.
    //   NORMAL / LOW: anyone.
    //   HIGH: classifyPost auto-sets it for LOST_FOUND + NEIGHBORHOOD_REPORTS.
    //         Outside those categories, only mods/admins may set it.
    //   CRITICAL: PLATFORM_MOD / SUPER_ADMIN only. Reject otherwise (no
    //         silent downgrade — caller should know they were blocked).
    const role = user.role
    const isPlatformOrSuper = role === 'PLATFORM_MOD' || role === 'SUPER_ADMIN'
    const isAnyMod = isPlatformOrSuper || role === 'NEIGHBORHOOD_MOD'
    if (priority === 'CRITICAL' && !isPlatformOrSuper) {
      return NextResponse.json(apiError('CRITICAL غير مسموح به', 403), { status: 403 })
    }
    if (priority === 'HIGH') {
      const autoHighCategory = category === 'NEIGHBORHOOD_REPORTS' || category === 'LOST_FOUND'
      if (!autoHighCategory && !isAnyMod) {
        return NextResponse.json(apiError('HIGH priority غير مسموح به في هذا التصنيف', 403), { status: 403 })
      }
    }
    const audience: PostAudience | undefined = audienceInput && (VALID_AUDIENCES as readonly string[]).includes(audienceInput)
      ? (audienceInput as PostAudience)
      : undefined

    if (!title?.trim() || !body?.trim()) {
      return NextResponse.json(apiError('بيانات ناقصة', 400), { status: 400 })
    }

    // Content quality validation
    const titleErr = validateContent(title, 'title')
    if (titleErr) return NextResponse.json(apiError(titleErr, 400), { status: 400 })
    const bodyErr = validateContent(body, 'body')
    if (bodyErr) return NextResponse.json(apiError(bodyErr, 400), { status: 400 })

    // ── Server-side category normalization ────────────────────────────
    // Trust nothing the client sent for category routing — analyze
    // title+body and either ALLOW, AUTO_CORRECT (silently move),
    // or REJECT_WITH_SUGGESTION (ask the user to confirm).
    // SUPER_ADMIN bypasses (they often post broadcasts that don't fit
    // any keyword shape).
    let classifyAction: 'ALLOW' | 'AUTO_CORRECT' | 'REJECT_WITH_SUGGESTION' = 'ALLOW'
    let classifyReason = ''
    if (!bypass) {
      const cls = classifyPostCategory({
        title: title.trim(),
        body: body.trim(),
        selectedCategory: category as PostCategory,
        selectedIntent: intent,
        selectedMarketplaceType: marketplaceType,
      })
      classifyAction = cls.action
      classifyReason = cls.reason

      if (cls.action === 'REJECT_WITH_SUGGESTION') {
        return NextResponse.json(
          {
            error: 'category_mismatch',
            suggestedCategory: cls.suggestedCategory ?? cls.finalCategory,
            suggestedIntent: cls.finalIntent,
            suggestedMarketplaceType: cls.finalMarketplaceType,
            confidence: cls.confidence,
            message: 'يبدو أن المنشور أنسب لقسم آخر. أكّد القسم المقترح للمتابعة.',
          },
          { status: 400 },
        )
      }

      if (cls.action === 'AUTO_CORRECT') {
        // Replace the user-selected category + marketplaceType with
        // the classifier's call. The downstream code reads from these
        // same variable names — so the rest of the handler is unaware
        // of the swap. classifyPost(...) below picks up `category` and
        // resolves intent/priority from there.
        category = cls.finalCategory
        marketplaceType = cls.finalMarketplaceType
      }
    }

    // ── Anti-spam guards specific to JOB subtype ──────────────────────
    // JOB posts are the highest-spam vector in Saudi-region community
    // apps (recruiters posting WhatsApp group invites). All three
    // checks bypass for SUPER_ADMIN.
    if (!bypass && category === 'MARKETPLACE' && marketplaceType === 'JOB') {
      const trimmedBody = body.trim()
      // a) external chat-link block
      if (EXTERNAL_GROUP_LINK.test(trimmedBody) || EXTERNAL_GROUP_LINK.test(title.trim())) {
        return NextResponse.json(
          apiError('روابط مجموعات واتساب / تيليقرام غير مسموح بها', 400),
          { status: 400 },
        )
      }
      // b) min body length — discourages "WhatsApp 0512..." one-liners
      if (trimmedBody.length < JOB_MIN_BODY_CHARS) {
        return NextResponse.json(
          apiError(`اكتب وصف الوظيفة بشكل أوضح (الحد الأدنى ${JOB_MIN_BODY_CHARS} حرف)`, 400),
          { status: 400 },
        )
      }
      // c) per-day cap (reuses the post cooldown window logic)
      const since = new Date(new Date().setHours(0, 0, 0, 0))
      const todayJobs = await db.post.count({
        where: {
          authorId: user.id,
          category: 'MARKETPLACE',
          marketplaceType: 'JOB',
          createdAt: { gte: since },
        },
      })
      if (todayJobs >= JOB_MAX_PER_DAY) {
        return NextResponse.json(
          apiError(`الحد الأقصى ${JOB_MAX_PER_DAY} إعلان وظيفة في اليوم`, 429),
          { status: 429 },
        )
      }
    }

    // Price validation
    if (price !== undefined && price !== null) {
      if (typeof price !== 'number' || price < 0 || price > 10_000_000) {
        return NextResponse.json(apiError('سعر غير صالح', 400), { status: 400 })
      }
    }

    // classifyPost fills defaults (intent/priority/audience) when the
    // composer didn't pass them. Single source of truth — see
    // src/lib/posts/classifyPost.ts.
    const c = classifyPost({ category: category as PostCategory, intent, priority, audience })

    // Women-only audience check (SUPER_ADMIN bypasses).
    if (!bypass && c.audience === 'WOMEN' && user.gender !== 'FEMALE') {
      return NextResponse.json(apiError('هذا القسم للنساء فقط', 403), { status: 403 })
    }

    // SERVICES is reserved for publicly-visible providers. The provider
    // gate applies only to OFFER intent — REQUEST (Ask flow) is fine
    // because the user is asking, not offering.
    const isServiceOffer = c.category === 'SERVICES' && c.intent !== 'REQUEST'
    if (!bypass && isServiceOffer && user.providerStatus !== 'ACTIVE' && user.providerStatus !== 'VERIFIED') {
      return NextResponse.json(apiError('هذا القسم متاح فقط لمقدمي الخدمات', 403), { status: 403 })
    }

    // Competitions — admin only (SUPER_ADMIN always allowed by the allowlist)
    if (c.category === 'COMPETITIONS' && !['SUPER_ADMIN', 'PLATFORM_MOD', 'NEIGHBORHOOD_MOD'].includes(user.role)) {
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

    // Ride requests use coordination=EXCLUSIVE so only one neighbor can
    // claim the ride at a time.
    const isRideRequest = c.category === 'RIDES' && c.intent === 'REQUEST'
    const coordinationMode = isRideRequest ? 'EXCLUSIVE' : 'OPEN'

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
        category: c.category,
        intent:   c.intent,
        priority: c.priority,
        audience: c.audience,
        marketplaceType, // SELL by default, validated above for MARKETPLACE
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
            category: c.category,
          },
        },
      })
    } catch (err) {
      console.error('[NOTIF_JOB] enqueue new_post failed:', err)
    }
    kickNotifCron()

    // Ask flow — fan out a dedicated notification when the post is a
    // REQUEST so neighbors see it as an explicit help-needed signal.
    if (c.intent === 'REQUEST') {
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

    return NextResponse.json({
      success: true,
      postId: post.id,
      // When the classifier silently moved the post, tell the client
      // so the UI can show a "moved to {category}" toast.
      ...(classifyAction === 'AUTO_CORRECT' && {
        autoCorrected: {
          category: c.category,
          marketplaceType,
          reason: classifyReason,
        },
      }),
    })
  } catch (error) {
    console.error('[ERROR] create post:', error)
    return NextResponse.json(apiError('خطأ في الخادم', 500), { status: 500 })
  }
}
