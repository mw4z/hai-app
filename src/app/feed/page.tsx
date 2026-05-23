import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import FeedClient from './FeedClient'
import { PostCategory } from '@prisma/client'
import { getFeedBoost } from '@/lib/reputation-levels'
import { cached } from '@/lib/cache'
import { shouldArchivePost } from '@/lib/postExpiry'
import { getHighlights } from '@/lib/highlights'

// v2 chip values posted by the feed UI — internal reads/writes go
// through the v2 column directly during Phase 3 read-flag-on era.
const V2_FILTER_VALUES: readonly string[] = [
  'HOME_BUSINESSES','MARKETPLACE','SERVICES','RIDES','REAL_ESTATE',
  'LOST_FOUND','NEIGHBORHOOD_REPORTS','EVENTS','COMPETITIONS','GENERAL',
]

export default async function FeedPage({
  searchParams,
}: {
  searchParams: { category?: string; neighborhood?: string }
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  // Always fetch fresh — caching here caused an onboarding loop on Vercel
  // when a stale row with neighborhoodId=null survived across instances.
  // Slim select: only fields the FeedClient renders. The previous
  // include-everything query pulled bio / service* / socialLinks /
  // tokens / etc. on every request and added 50–100ms over the wire.
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      lastName: true,
      gender: true,
      phone: true,
      role: true,
      neighborhoodId: true,
      addressVerified: true,
      neighborhood: {
        select: {
          name: true,
          nameEn: true,
          city: { select: { name: true, nameEn: true } },
        },
      },
    },
  })

  // Profile-completeness gate: a user can exist without a name when
  // they finished OTP but bailed before onboarding. Force them back
  // there. Mirrors the API-side requireCompleteProfile guard.
  if (!user?.neighborhoodId || !user.name?.trim()) redirect('/onboarding')

  const category = searchParams.category || 'ALL'
  const browseNeighborhoodId = searchParams.neighborhood
  const isReadOnly = !!(browseNeighborhoodId && browseNeighborhoodId !== user.neighborhoodId)
  const activeNeighborhoodId = isReadOnly ? browseNeighborhoodId : user.neighborhoodId!

  const isFemale = user.gender === 'FEMALE'

  // Audience-based ALL: female viewers see every audience; everyone
  // else gets WOMEN-targeted posts filtered out via the audience field.
  // v2 chips route through the v2 column directly. Anything else (a
  // legacy chip slipping through somehow) falls through with no
  // category filter — defensive. REQUESTS is intent-only (no category
  // restriction); MARKETPLACE pins intent=OFFER so request posts don't
  // pollute the marketplace chip; other v2 chips filter by category.
  let categoryFilter: object
  if (category === 'ALL') {
    categoryFilter = isFemale ? {} : { audience: { not: 'WOMEN' } }
  } else if (category === 'REQUESTS') {
    categoryFilter = { intent: 'REQUEST' }
  } else if (category === 'OFFERS') {
    // Explicitly user-marked offers ("عروض") across categories. Uses the
    // dedicated isOffer flag — NOT intent=OFFER, which is far broader
    // (the offer-vs-request "side") and used to leak reports into this
    // chip. MUST mirror the /api/feed branch.
    categoryFilter = { isOffer: true }
  } else if (category === 'MARKETPLACE') {
    categoryFilter = { category: 'MARKETPLACE' as PostCategory, intent: 'OFFER' }
  } else if (V2_FILTER_VALUES.includes(category)) {
    categoryFilter = { category: category as PostCategory }
  } else {
    categoryFilter = {}
  }

  // Run all DB queries in parallel — including highlights, which used
  // to run sequentially after the batch and added a full DB roundtrip
  // (~150ms) to every feed render.
  const ridesNow = new Date()
  const [posts, unreadNotifCount, browseNeighborhood, bookmarkedIds, followedIds, highlightsBundle, openRidesRaw, pollsRaw] = await Promise.all([
    // Posts — cache 60s per neighborhood+category combo (was 30s).
    // Doubling the TTL halves the per-feed DB load with no user-visible
    // change in freshness for posts (PostCard's poll catches edits).
    cached(`feed:${activeNeighborhoodId}:${category}:${isFemale}`, 60_000, () =>
      db.post.findMany({
        where: {
          neighborhoodId: activeNeighborhoodId,
          status: { in: ['ACTIVE', 'IN_PROGRESS'] },
          ...categoryFilter,
        },
        include: {
          // Slimmed author select — bio / service* / socialLinks were
          // never read by PostCard's feed view; they belong on the
          // author profile sheet which fetches its own user row.
          author: {
            select: {
              id: true, name: true, lastName: true,
              reputation: true, accountType: true, providerStatus: true,
              role: true, avatarUrl: true, gender: true, showGender: true,
              createdAt: true,
              neighborhood: { select: { name: true, nameEn: true } },
            },
          },
          reactions: { select: { emoji: true, userId: true } },
          _count: { select: { comments: true, reactions: true } },
          // Preview comment — most-liked root comment, shipped with the
          // feed so the comment line renders on first paint instead of
          // popping in ~1s later via a per-card follow-up fetch.
          comments: {
            where: { parentId: null },
            orderBy: [
              { likes: { _count: 'desc' } },
              { createdAt: 'desc' },
            ],
            take: 1,
            include: {
              author: {
                select: {
                  id: true,
                  name: true,
                  lastName: true,
                  reputation: true,
                  accountType: true,
                  providerStatus: true,
                  avatarUrl: true,
                },
              },
              _count: { select: { likes: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
    ),
    // Unread notifications — cache 60s (was 30s).
    cached(`notif:${session.userId}`, 60_000, () =>
      db.notification.count({
        where: { userId: session.userId, read: false },
      })
    ),
    // Browse neighborhood (only if needed)
    isReadOnly
      ? cached(`nbhd:${activeNeighborhoodId}`, 300_000, () =>
          db.neighborhood.findUnique({
            where: { id: activeNeighborhoodId },
            include: { city: true },
          })
        )
      : null,
    // Bookmarks — cache 5 min (was 1 min). User's own bookmarks rarely
    // change between feed renders; their PostCard updates optimistically.
    cached(`bookmarks:${session.userId}`, 300_000, () =>
      db.bookmark.findMany({
        where: { userId: session.userId },
        select: { postId: true },
      }).then(b => b.map(x => x.postId))
    ),
    // Post subscriptions — cache 5 min (was 1 min). Same reasoning.
    cached(`postsubs:${session.userId}`, 300_000, () =>
      db.postSubscription.findMany({
        where: { userId: session.userId },
        select: { postId: true },
      }).then(s => s.map(x => x.postId))
    ),
    // Highlights bundle — was a sequential await after this batch;
    // moved in so the whole page does ONE fan-out instead of two.
    getHighlights(activeNeighborhoodId, user.gender as 'MALE' | 'FEMALE' | 'UNSPECIFIED' | null)
      .catch(() => ({ items: [], generatedAt: new Date().toISOString() })),
    // Open RIDE requests for the "المشاوير" strip — SSR'd so the strip
    // is on screen with the feed instead of popping in ~1s later.
    // Mirrors GET /api/rides?type=RIDE&neighborhood=…, take 3 (strip cap).
    db.rideRequest.findMany({
      where: {
        status: 'RIDE_OPEN',
        expiresAt: { gt: ridesNow },
        OR: [
          { isImmediate: true },
          { scheduledAt: { lte: new Date(ridesNow.getTime() + 2 * 3600 * 1000) } },
        ],
        type: 'RIDE',
        neighborhoodId: activeNeighborhoodId,
      },
      select: {
        id: true, pickupArea: true, dropoffArea: true, distanceKm: true, durationMin: true,
        estimatedMinPrice: true, estimatedMaxPrice: true, isImmediate: true, scheduledAt: true,
        notes: true, type: true, itemDescription: true, status: true, createdAt: true,
        requester: { select: { id: true, name: true, lastName: true, avatarUrl: true, reputation: true } },
        _count: { select: { offers: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
    }).catch(() => []),
    // Active polls — SSR'd for the same reason. Mirrors GET /api/polls.
    db.poll.findMany({
      where: { neighborhoodId: activeNeighborhoodId, status: 'active' },
      include: {
        author: { select: { id: true, name: true, lastName: true, avatarUrl: true, role: true } },
        votes: { select: { userId: true, optionIndex: true } },
        reactions: { select: { userId: true, emoji: true } },
        _count: { select: { votes: true, comments: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }).catch(() => []),
  ])

  const initialOpenRides = (openRidesRaw as any[]).map(r => {
    const isLate = !r.isImmediate && r.scheduledAt && new Date(r.scheduledAt) < ridesNow
    const { _count, ...rest } = r
    return { ...rest, offerCount: _count.offers, isLate: isLate || false }
  })

  if (isReadOnly && !browseNeighborhood) redirect('/feed')

  // ── Cross-list DELIVERY ride requests in REQUESTS ("looking for")
  // ── feed. Drivers offer/price through the rides surface; this just
  // ── makes the request visible to neighbors browsing requests so they
  // ── can also chime in or know what's going on. Limited to 5 — meant
  // ── as a strip, not a takeover.
  const deliveryRequests = (!isReadOnly && (category === 'REQUESTS' || category === 'RIDES' || category === 'ALL'))
    ? await db.rideRequest.findMany({
        where: {
          neighborhoodId: activeNeighborhoodId,
          type: 'DELIVERY',
          status: 'RIDE_OPEN',
          expiresAt: { gt: new Date() },
        },
        select: {
          id: true,
          pickupArea: true,
          dropoffArea: true,
          itemDescription: true,
          createdAt: true,
          requester: { select: { id: true, name: true, lastName: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }).catch(() => [])
    : []

  // Filter out expired posts + archive them in background
  const activePosts = posts.filter(p => !shouldArchivePost(p))
  const expiredIds = posts.filter(p => shouldArchivePost(p)).map(p => p.id)
  if (expiredIds.length > 0) {
    db.post.updateMany({
      where: { id: { in: expiredIds } },
      data: { status: 'ARCHIVED' },
    }).catch(() => {})
  }

  // v2 boost map. NEIGHBORHOOD_REPORTS absorbs legacy ALERT +
  // NEIGHBORHOOD_ISSUE; EVENTS keeps the small MOSQUE bump. Request
  // posts are boosted via intent === 'REQUEST' below, replacing the
  // legacy LOOKING_FOR boost.
  const TYPE_BOOST: Partial<Record<PostCategory, number>> = {
    NEIGHBORHOOD_REPORTS: 5, LOST_FOUND: 2, EVENTS: 2,
  }
  const COMMERCIAL = new Set<PostCategory>(['MARKETPLACE', 'HOME_BUSINESSES', 'REAL_ESTATE', 'SERVICES'])

  // Feature flag: increase REQUEST visibility. Set NEXT_PUBLIC_REQUEST_BOOST
  // to '0' to disable the bump + soft guarantee + first-screen
  // insertion below. Defaults on. Cheap kill switch if a side effect
  // appears in production without needing a redeploy.
  const REQUEST_BOOST_ON = process.env.NEXT_PUBLIC_REQUEST_BOOST !== '0'
  // +10 on a base of 50 ≈ 20% bump. Capped by anti-domination /
  // commercial-balance rules below so REQUESTs can't crowd out the rest.
  const REQUEST_INTENT_BOOST = REQUEST_BOOST_ON ? 10 : 3

  // Score with time decay
  const scored = activePosts.map(p => {
    if (p.isPinned) return { ...p, _score: 999999 }
    if (p.isFeatured) return { ...p, _score: 999998 }
    const hoursAgo = (Date.now() - new Date(p.createdAt).getTime()) / 3600_000
    const engagement = Math.min(p._count.comments * 3 + p._count.reactions, 30)
    const boost = (p.category && TYPE_BOOST[p.category]) || 0
    // Outside requests appear in the feed but are never ranked above
    // resident content — no intent boost for them.
    const intentBoost = p.intent === 'REQUEST' && p.originScope !== 'OUTSIDE_REQUEST' ? REQUEST_INTENT_BOOST : 0
    // Phase 0: small extra bump for HIGH/CRITICAL civic posts so a
    // genuine neighborhood issue out-ranks fresh commercial content.
    // Stacks on top of TYPE_BOOST so a HIGH report gets +5+15 = +20.
    // Only applied to NEIGHBORHOOD_REPORTS — preserving CRITICAL for
    // truly emergent content (mod-curated EmergencyAlert is a separate
    // channel).
    const priorityBoost =
      p.category === 'NEIGHBORHOOD_REPORTS' && p.priority === 'CRITICAL' ? 25
      : p.category === 'NEIGHBORHOOD_REPORTS' && p.priority === 'HIGH' ? 15
      : 0
    const repBoost = getFeedBoost(p.author.reputation)
    return { ...p, _score: (50 + engagement + boost + intentBoost + priorityBoost + repBoost) / (hoursAgo + 2) }
  }).sort((a, b) => b._score - a._score)

  // Anti-domination: max 2 consecutive posts per same author
  const deduped: typeof scored = []
  const deferred: typeof scored = []
  for (const post of scored) {
    const last2 = deduped.slice(-2)
    if (last2.length === 2 && last2.every(p => p.authorId === post.authorId)) {
      deferred.push(post)
    } else {
      deduped.push(post)
    }
  }

  // Commercial balance
  const balanced: typeof deduped = []
  let commercialStreak = 0
  for (const post of [...deduped, ...deferred]) {
    if (post.category && COMMERCIAL.has(post.category)) {
      commercialStreak++
      if (commercialStreak >= 3) { balanced.push(post); continue }
    } else {
      commercialStreak = 0
    }
    balanced.push(post)
  }

  // Soft guarantee: if the first 5 posts don't include a REQUEST,
  // splice the highest-scored REQUEST in at position 4 (0-indexed: 3).
  // Doesn't touch ranking — just a single visibility nudge for the
  // first screen. No-op when no REQUEST exists, when one is already
  // up top, or when the boost flag is off.
  //
  // Session-scope dedupe: track which REQUEST IDs we've already
  // soft-inserted into THIS user's first screen via a cookie, so a
  // refresh-loop on a slow-traffic neighborhood doesn't keep showing
  // the same low-ranked REQUEST in the boosted slot. The cookie
  // holds up to 10 IDs, expires after 6h (covers a typical browse
  // session without persisting across days). When a candidate is
  // picked, its ID is appended.
  const insertedCookie = cookies().get('hai_req_seen')?.value || ''
  const seenIds = new Set(insertedCookie.split(',').filter(Boolean))
  let pickedIdForCookie: string | null = null
  if (REQUEST_BOOST_ON && balanced.length >= 5) {
    const firstFive = balanced.slice(0, 5)
    // Only resident requests get the first-screen visibility nudge —
    // outside requests are never promoted onto the first screen.
    const isResidentRequest = (p: typeof balanced[number]) =>
      p.intent === 'REQUEST' && p.originScope !== 'OUTSIDE_REQUEST'
    const hasRequestUp = firstFive.some(isResidentRequest)
    if (!hasRequestUp) {
      const idx = balanced.findIndex(
        p => isResidentRequest(p) && !seenIds.has(p.id),
      )
      if (idx >= 5) {
        const [pick] = balanced.splice(idx, 1)
        balanced.splice(3, 0, pick)
        pickedIdForCookie = pick.id
      }
    }
  }
  if (pickedIdForCookie) {
    const next = [pickedIdForCookie, ...Array.from(seenIds)].slice(0, 10).join(',')
    // Writing a cookie during a Server Component render now THROWS in
    // current Next.js ("Cookies can only be modified in a Server Action or
    // Route Handler") — which was crashing the whole /feed page. Swallow
    // it: the feed must render regardless. Worst case the request-boost
    // dedupe doesn't persist across refreshes, which is purely cosmetic.
    try {
      cookies().set('hai_req_seen', next, {
        maxAge: 6 * 3600,
        sameSite: 'lax',
        httpOnly: false,
        path: '/',
      })
    } catch { /* RSC render can't set cookies — ignore */ }
  }

  // Chip indicator: presence-only dot scoped to the last 6 hours.
  // Why not a count: a number badge reads as "unread / new for me",
  // but the value is just neighborhood-wide volume — a refresher
  // who already saw the posts would see the same number and feel
  // it's a stale notification. A dot signals "there's recent
  // activity here" without overpromising. 6h scope keeps the
  // signal meaningfully recent.
  const sixHoursAgo = Date.now() - 6 * 3600_000
  const requestsRecentDot = REQUEST_BOOST_ON && activePosts.some(p =>
    p.intent === 'REQUEST'
    && p.originScope !== 'OUTSIDE_REQUEST'
    && new Date(p.createdAt).getTime() >= sixHoursAgo,
  )

  return (
    <FeedClient
      user={{
        id: user.id,
        name: user.name,
        lastName: user.lastName,
        gender: user.gender,
        phone: user.phone,
        neighborhood: user.neighborhood?.name || '',
        neighborhoodEn: user.neighborhood?.nameEn || '',
        city: user.neighborhood?.city.name || '',
        cityEn: user.neighborhood?.city.nameEn || '',
        neighborhoodId: user.neighborhoodId!,
        role: user.role,
      }}
      initialPosts={JSON.parse(JSON.stringify(balanced.map((p: any) => {
        // Move SSR preview from `comments` into `previewComments` so the
        // PostCard can seed its comment-row state without confusing
        // "preview" with "full thread" (which it still lazy-loads on open).
        // Also flatten `_count.likes` → `likeCount` so the heart badge
        // renders with zero extra work client-side.
        const { comments, ...rest } = p
        const previewComments = Array.isArray(comments)
          ? comments.map((c: any) => ({
              id: c.id,
              body: c.body,
              imageUrl: c.imageUrl ?? null,
              createdAt: c.createdAt,
              author: c.author,
              likeCount: c._count?.likes ?? 0,
              replies: [],
            }))
          : []
        return {
          ...rest,
          previewComments,
          author: rest.author
            ? {
                ...rest.author,
                // Respect author's privacy: hide gender if they opted out
                gender: rest.author.showGender === false ? null : rest.author.gender,
                showGender: undefined,
              }
            : rest.author,
        }
      })))}
      selectedCategory={category}
      isReadOnly={isReadOnly}
      browseNeighborhood={browseNeighborhood ? {
        id: browseNeighborhood.id,
        name: browseNeighborhood.name,
        nameEn: browseNeighborhood.nameEn,
        cityName: browseNeighborhood.city.name,
        cityNameEn: browseNeighborhood.city.nameEn,
      } : null}
      allNeighborhoods={[]}
      bookmarkedIds={bookmarkedIds || []}
      followedIds={followedIds || []}
      unreadNotifCount={unreadNotifCount}
      hasNeighborhoodMod={true}
      addressVerified={!!user.addressVerified}
      requestBoostOn={REQUEST_BOOST_ON}
      requestsRecentDot={requestsRecentDot}
      highlights={highlightsBundle.items}
      deliveryRequests={JSON.parse(JSON.stringify(deliveryRequests))}
      initialRides={JSON.parse(JSON.stringify(initialOpenRides))}
      initialPolls={JSON.parse(JSON.stringify(pollsRaw))}
    />
  )
}
