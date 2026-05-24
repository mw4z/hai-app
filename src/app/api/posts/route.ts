import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { classifyPost } from '@/lib/posts/classifyPost'
import { classifyPostCategory } from '@/lib/posts/classify'
import { getSession } from '@/lib/auth'
import { notifyNeighborhood } from '@/lib/notifications'
import { validateContent, normalizeForComparison, isSimilar, apiError } from '@/lib/validation'
import { PostCategory, PostIntent, PostPriority, PostAudience, MarketplaceType, PostOriginScope } from '@prisma/client'
import { getPostLimit } from '@/lib/reputation'
import { getLimits } from '@/lib/capabilities'
import { cacheDeletePrefix } from '@/lib/cache'
import { moderateContent } from '@/lib/moderation'
import { kickNotifCron } from '@/lib/kickNotifCron'
import { requireUserReady } from '@/lib/requireUserReady'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { isDirectoryModerator } from '@/lib/places/isDirectoryModerator'
import { fullName } from '@/lib/displayName'
import { isTitleRequired } from '@/lib/posts/titleRequired'
import { buildNotifTitle } from '@/lib/posts/displayTitle'
import { evaluateOutsideRequest, OUTSIDE_MAX_PER_HOOD_PER_DAY, OUTSIDE_MAX_TOTAL_PER_DAY } from '@/lib/posts/outsideGate'

const DEFAULT_POST_LIMIT = 5
const POST_COOLDOWN_SECONDS = 60
const VALID_CATEGORIES = Object.values(PostCategory)
const VALID_INTENTS = ['OFFER', 'REQUEST', 'NORMAL'] as const
const VALID_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] as const
const VALID_AUDIENCES = ['ALL', 'WOMEN', 'MEN'] as const
const VALID_MARKETPLACE_TYPES = ['SELL', 'BUY', 'JOB'] as const
const VALID_REAL_ESTATE_TYPES = [
  'APARTMENT_RENT','APARTMENT_SALE','VILLA_RENT','VILLA_SALE',
  'LAND_SALE','COMMERCIAL_SHOP','WAREHOUSE','WANTED',
] as const
const VALID_CIVIC_TYPES = [
  'TRAFFIC_SAFETY','INFRASTRUCTURE','PUBLIC_SERVICES',
  'ENVIRONMENT','PROPOSAL','COMPLAINT',
] as const

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

    // Single gate: profile completeness AND location verification.
    // requireUserReady runs them in the right order (completeness
    // first, so OTP-only users see "go to onboarding" rather than
    // the misleading location error) and returns a structured
    // { error, next } body the client can branch on.
    const ready = await requireUserReady(session.userId)
    if (!ready.ok) return ready.response

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
    // PDF attachment — optional. Both fields nullable; we trust the
    // composer's client-side validator (only application/pdf gets
    // through uploadPdf) but still cap the URL length and the
    // filename here so a malicious caller can't write 10MB of JSON
    // into the Post row. Vercel Blob URLs are well under 200 chars
    // in practice; 500 is a safe ceiling.
    const pdfUrlRaw = typeof reqBody.pdfUrl === 'string' ? reqBody.pdfUrl.trim() : ''
    const pdfNameRaw = typeof reqBody.pdfName === 'string' ? reqBody.pdfName.trim() : ''
    const pdfUrl =
      pdfUrlRaw.startsWith('https://') && pdfUrlRaw.length < 500 ? pdfUrlRaw : null
    const pdfName = pdfUrl ? pdfNameRaw.slice(0, 200) || 'document.pdf' : null
    // `category` is `let` because the server-side classifier may
    // AUTO_CORRECT it after content analysis below.
    let category: string = reqBody.category
    // v2 optional fields — Ask flow sends `intent: 'REQUEST'`. Audience
    // and priority are reserved for future selectors; today they're only
    // populated server-side via classifyPost defaults.
    const intentInput = typeof reqBody.intent === 'string' ? reqBody.intent : undefined
    const priorityInput = typeof reqBody.priority === 'string' ? reqBody.priority : undefined
    const audienceInput = typeof reqBody.audience === 'string' ? reqBody.audience : undefined
    // Phase 1 optional metadata — caller may pre-fill if they want to
    // override the classifier (composer never does today, but the API
    // accepts it for future composer enhancements). Strings or null.
    const realEstateTypeInput = typeof reqBody.realEstateType === 'string' ? reqBody.realEstateType : undefined
    const civicTypeInput      = typeof reqBody.civicType === 'string'      ? reqBody.civicType      : undefined
    const eventStartAtInput   = typeof reqBody.eventStartAt === 'string'   ? reqBody.eventStartAt   : undefined
    const eventEndAtInput     = typeof reqBody.eventEndAt === 'string'     ? reqBody.eventEndAt     : undefined
    const eventLocationInput  = typeof reqBody.eventLocation === 'string'  ? reqBody.eventLocation  : undefined
    // Offers ("عروض"): a user-marked deal. `isOffer` is the canonical
    // flag the Offers chip + Market Offers tab filter on (distinct from
    // intent=OFFER). `originalPrice` is the optional "was" price — only
    // stored for a genuine discount (positive, and above the new price
    // when one is given) so the struck-through display always makes
    // sense; otherwise it's dropped.
    const isOffer = reqBody.isOffer === true
    const originalPriceNum = Number(reqBody.originalPrice)
    const newPriceNum = Number(price)
    const originalPrice =
      isOffer
      && Number.isFinite(originalPriceNum)
      && originalPriceNum > 0
      && (!Number.isFinite(newPriceNum) || originalPriceNum > newPriceNum)
        ? originalPriceNum
        : null

    // Target neighborhood resolution.
    //  - Own neighborhood (or no override): normal resident posting.
    //  - SUPER_ADMIN passing another id: cross-neighborhood as a resident
    //    (broadcast/admin) — NOT an outside request.
    //  - Any other user passing another id: an OUTSIDE request — allowed,
    //    but restricted to REQUEST-only by the gate below.
    let targetNeighborhoodId: string = user.neighborhoodId
    let isOutside = false
    if (
      typeof requestedNeighborhoodId === 'string' &&
      requestedNeighborhoodId.trim() &&
      requestedNeighborhoodId.trim() !== user.neighborhoodId
    ) {
      const nbhd = await db.neighborhood.findUnique({
        where: { id: requestedNeighborhoodId.trim() },
        select: { id: true },
      })
      if (!nbhd) {
        return NextResponse.json(apiError('الحي غير موجود', 404), { status: 404 })
      }
      targetNeighborhoodId = nbhd.id
      isOutside = !bypass
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

    // ── Outside-neighborhood posting gate ──────────────────────────────
    // Enforced on the SERVER regardless of what the client sent: a user
    // posting to a hood that isn't their home gets REQUEST-only, a tiny
    // category allowlist, no marketplace, no raised priority. Rejections
    // are explicit (not silent coercion) so a manipulated client is told.
    // A CLAIMED resident (picked this hood as home but not yet GPS/mod-
    // verified) gets the SAME content restrictions as an outside request —
    // REQUEST-only in the allowlisted categories, no marketplace, no raised
    // priority — even in their own home. Verified residents are unaffected.
    const claimedRestricted = !bypass && ready.user.membership === 'CLAIMED_RESIDENT'
    const originScope: PostOriginScope = isOutside ? 'OUTSIDE_REQUEST' : 'RESIDENT'
    const outsideGate = evaluateOutsideRequest({
      isOutside: isOutside || claimedRestricted,
      intentInput,
      category,
      marketplaceTypeInput,
      priorityInput,
    })
    if (!outsideGate.ok) {
      // When the block is due to unverified (claimed) residence rather than
      // being geographically outside, use a claimed-appropriate message.
      const msg = claimedRestricted && !isOutside
        ? 'أكّد سكنك في الحي لتفعيل كامل صلاحيات النشر'
        : outsideGate.messageAr
      return NextResponse.json(apiError(msg, 403, outsideGate.code), { status: 403 })
    }

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

    // Body is ALWAYS required. Title's requiredness is category-aware:
    // commercial / structured posts (MARKETPLACE, OFFER-side services,
    // EVENTS, COMPETITIONS, ...) still need a headline; conversational
    // posts (GENERAL, NEIGHBORHOOD_REPORTS, LOST_FOUND, REQUEST-side)
    // can ship body-only and the headline is computed at render time
    // by buildDisplayTitle.
    if (!body?.trim()) {
      return NextResponse.json(apiError('بيانات ناقصة', 400), { status: 400 })
    }
    const titleProvided = typeof title === 'string' && title.trim().length > 0
    const titleRequired = isTitleRequired(
      category as PostCategory,
      (intentInput as PostIntent) || 'NORMAL',
      marketplaceType,
    )
    if (!titleProvided && titleRequired) {
      return NextResponse.json(apiError('بيانات ناقصة', 400), { status: 400 })
    }

    // Content quality validation. Title runs through validateContent
    // only when one was actually provided — empty title for an
    // optional category is fine and we never store synthetic copy.
    if (titleProvided) {
      const titleErr = validateContent(title, 'title')
      if (titleErr) return NextResponse.json(apiError(titleErr, 400), { status: 400 })
    }
    const bodyErr = validateContent(body, 'body')
    if (bodyErr) return NextResponse.json(apiError(bodyErr, 400), { status: 400 })

    // ── Server-side category normalization + Phase 1 metadata ──────────
    // Trust nothing the client sent for category routing — analyze
    // title+body and either ALLOW, AUTO_CORRECT (silently move),
    // or REJECT_WITH_SUGGESTION (ask the user to confirm).
    // SUPER_ADMIN bypasses category corrections (broadcast posts that
    // don't fit any keyword shape), but metadata inference still runs
    // so we keep the realEstateType / civicType / eventHints fields
    // populated for SUPER_ADMIN posts too.
    const cls = classifyPostCategory({
      title: title.trim(),
      body: body.trim(),
      selectedCategory: category as PostCategory,
      selectedIntent: intent,
      selectedMarketplaceType: marketplaceType,
    })
    // Outside requests are already constrained to a tiny allowlist, so we
    // don't let the classifier reroute them into a blocked category.
    let classifyAction: 'ALLOW' | 'AUTO_CORRECT' | 'REJECT_WITH_SUGGESTION' = (bypass || isOutside) ? 'ALLOW' : cls.action
    let classifyReason = cls.reason

    if (!bypass && !isOutside && cls.action === 'REJECT_WITH_SUGGESTION') {
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

    if (!bypass && !isOutside && cls.action === 'AUTO_CORRECT') {
      // Replace the user-selected category + marketplaceType with
      // the classifier's call. The downstream code reads from these
      // same variable names — so the rest of the handler is unaware
      // of the swap. classifyPost(...) below picks up `category` and
      // resolves intent/priority from there.
      category = cls.finalCategory
      marketplaceType = cls.finalMarketplaceType
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
    // Outside requests are hard-pinned to REQUEST / NORMAL / ALL — never
    // OFFER, never elevated priority, never women/men-targeted — no matter
    // what the client passed (the gate above already rejected obvious
    // attempts; this guarantees the stored row regardless).
    const c = classifyPost({
      category: category as PostCategory,
      intent: isOutside ? 'REQUEST' : intent,
      priority: isOutside ? 'NORMAL' : priority,
      audience: isOutside ? 'ALL' : audience,
    })

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

      // Stricter caps for outside requests — on top of the general daily
      // limit above. A 24h rolling window: at most 2 to any one
      // neighborhood and 5 across all neighborhoods, so an outsider can't
      // blanket-spam hoods they don't live in.
      if (isOutside) {
        const dayAgo = new Date(Date.now() - 24 * 3600_000)
        const outsideTotal = await db.post.count({
          where: { authorId: user.id, originScope: 'OUTSIDE_REQUEST', createdAt: { gte: dayAgo } },
        })
        if (outsideTotal >= OUTSIDE_MAX_TOTAL_PER_DAY) {
          return NextResponse.json(
            apiError(`الحد الأقصى ${OUTSIDE_MAX_TOTAL_PER_DAY} طلبات من خارج حيّك خلال اليوم`, 429, 'OUTSIDE_DAILY_LIMIT'),
            { status: 429 },
          )
        }
        const outsidePerHood = await db.post.count({
          where: {
            authorId: user.id,
            originScope: 'OUTSIDE_REQUEST',
            neighborhoodId: targetNeighborhoodId,
            createdAt: { gte: dayAgo },
          },
        })
        if (outsidePerHood >= OUTSIDE_MAX_PER_HOOD_PER_DAY) {
          return NextResponse.json(
            apiError(`الحد الأقصى ${OUTSIDE_MAX_PER_HOOD_PER_DAY} طلب لنفس الحي خلال اليوم`, 429, 'OUTSIDE_HOOD_LIMIT'),
            { status: 429 },
          )
        }
      }

      // Duplicate/similarity detection: check last 3 hours.
      // When the current post has no title (optional-title category),
      // skip the title-similarity arm — an empty string is trivially
      // "similar" to nothing and would also match any past post that
      // happened to have an empty title, creating false positives.
      // The body-similarity arm still catches the real duplicate case.
      // Mods/admins are never blocked by duplicate detection (e.g. they
      // remove a post then re-add the same one). And for everyone, REMOVED/
      // HIDDEN posts no longer count — a post that's gone isn't a live
      // duplicate, so re-adding after a removal is allowed.
      if (!isDirectoryModerator(user.role)) {
        const threeHoursAgo = new Date(Date.now() - 3 * 3600_000)
        const recentUserPosts = await db.post.findMany({
          where: {
            authorId: user.id,
            createdAt: { gte: threeHoursAgo },
            status: { notIn: ['REMOVED', 'HIDDEN'] },
          },
          select: { title: true, body: true },
        })
        for (const p of recentUserPosts) {
          const titleMatch = titleProvided && isSimilar(title.trim(), p.title)
          if (titleMatch || isSimilar(body.trim(), p.body)) {
            console.log(`[SPAM] duplicate detected: user=${user.id}`)
            return NextResponse.json(
              { error: 'DUPLICATE_POST' },
              { status: 409 },
            )
          }
        }
      }
    }

    // ── Profanity / abuse check ──────────────────────────────────────────
    // moderateContent('') is safe (returns action='allow' / censored=''),
    // so calling it unconditionally keeps the type uniform with
    // ModerationAction. The downstream "log flagged content" branch
    // already gates on `action !== 'allow'`, so an empty title can't
    // trip the audit log.
    const titleMod = moderateContent(titleProvided ? title.trim() : '')
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
    // else gets the moderator's censored version. When the user didn't
    // provide a title (optional-title category), finalTitle stores as
    // empty string — that's the sentinel buildDisplayTitle looks at to
    // decide whether to fall back to a body excerpt.
    const finalTitle = titleProvided
      ? (bypass ? title.trim() : titleMod.censored)
      : ''
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

    // ── Phase 1 metadata resolution ────────────────────────────────────
    // Cross-field rule: each subtype field is only stored when it
    // matches the final category. Caller-provided values win over the
    // classifier's inference. The classifier's value is only stored
    // when its confidenceScore was ≥ SUBTYPE_WRITE_THRESHOLD (handled
    // inside classify.ts — the field is null otherwise).
    type RT = (typeof VALID_REAL_ESTATE_TYPES)[number]
    type CT = (typeof VALID_CIVIC_TYPES)[number]
    const finalRealEstateType: RT | null =
      c.category === 'REAL_ESTATE'
        ? (realEstateTypeInput && (VALID_REAL_ESTATE_TYPES as readonly string[]).includes(realEstateTypeInput)
            ? (realEstateTypeInput as RT)
            : ((cls.realEstateType ?? null) as RT | null))
        : null
    const finalCivicType: CT | null =
      c.category === 'NEIGHBORHOOD_REPORTS'
        ? (civicTypeInput && (VALID_CIVIC_TYPES as readonly string[]).includes(civicTypeInput)
            ? (civicTypeInput as CT)
            : ((cls.civicType ?? null) as CT | null))
        : null

    // Event fields: parse ISO from caller; fall back to classifier
    // hints. Only honored when category=EVENTS.
    const parseIso = (s: string | undefined): Date | null => {
      if (!s) return null
      const d = new Date(s)
      return isNaN(d.getTime()) ? null : d
    }
    const finalEventStartAt: Date | null =
      c.category === 'EVENTS'
        ? (parseIso(eventStartAtInput) ?? cls.eventHints?.startAt ?? null)
        : null
    const finalEventEndAt: Date | null =
      c.category === 'EVENTS'
        ? (parseIso(eventEndAtInput) ?? cls.eventHints?.endAt ?? null)
        : null
    const finalEventLocation: string | null =
      c.category === 'EVENTS'
        ? ((eventLocationInput?.trim() || cls.eventHints?.location || null))
        : null

    const post = await db.post.create({
      data: {
        title: finalTitle,
        body: finalBody,
        category: c.category,
        intent:   c.intent,
        priority: c.priority,
        audience: c.audience,
        originScope, // RESIDENT, or OUTSIDE_REQUEST for cross-hood asks
        marketplaceType, // SELL by default, validated above for MARKETPLACE
        coordinationMode,
        price: price || null,
        isOffer,
        originalPrice,
        imageUrls: validatedImages,
        pdfUrl,
        pdfName,
        locationLat: locationLat || null,
        locationLng: locationLng || null,
        locationName: locationName?.trim() || null,
        authorId: user.id,
        neighborhoodId: targetNeighborhoodId,
        status: 'ACTIVE',
        // Phase 1 subtype metadata. Cross-category writes already
        // filtered above — each field is null unless its category
        // matches AND either the caller provided a valid value OR the
        // classifier's confidenceScore cleared the write threshold.
        realEstateType: finalRealEstateType,
        civicType: finalCivicType,
        eventStartAt: finalEventStartAt,
        eventEndAt: finalEventEndAt,
        eventLocation: finalEventLocation,
      },
    })

    // Enqueue neighborhood push fanout via NotifJob. Awaited so the
    // row is committed BEFORE kickNotifCron fires — otherwise the
    // cron can read the queue before the insert commits and the
    // push waits up to ~60s for the next scheduled tick.
    // Processor applies filtering (author exclusion, prefs, quiet
    // hours, gender). priority:'high' so every neighbor's phone gets
    // the banner the moment the post is published.
    //
    // SKIPPED for OUTSIDE requests: an outsider's question must not
    // banner every resident's phone — it surfaces through the REQUESTS
    // feed filter only (per the outside-posting spec; broad push for
    // outside requests is intentionally not designed yet).
    if (!isOutside) {
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
              // Synthesize a body-excerpt headline when the post is
              // title-optional and the author skipped it — the push
              // banner needs SOMETHING for the subject row.
              title: buildNotifTitle({ title: finalTitle, body: finalBody, category: c.category }).slice(0, 140),
              category: c.category,
            },
          },
        })
      } catch (err) {
        console.error('[NOTIF_JOB] enqueue new_post failed:', err)
      }
      kickNotifCron()
    }

    // Ask flow — fan out a dedicated notification when the post is a
    // REQUEST so neighbors see it as an explicit help-needed signal.
    // When the post has no real title (Ask flow on optional categories),
    // buildNotifTitle synthesizes a body-excerpt headline so the
    // notification still has a meaningful subject. Outside requests are
    // excluded — no broad notification, feed-only discovery.
    if (c.intent === 'REQUEST' && !isOutside) {
      notifyNeighborhood({
        type: 'LOOKING_FOR_POST',
        actorId: user.id,
        actorName: fullName(user) || user.name || undefined,
        neighborhoodId: targetNeighborhoodId,
        postId: post.id,
        postTitle: buildNotifTitle({ title: finalTitle, body: finalBody, category: c.category }),
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
