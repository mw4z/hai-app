import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { cached } from '@/lib/cache'
import { PostCategoryV2 } from '@prisma/client'
import PostCard from '@/components/PostCard'
import Link from 'next/link'
import MarketTab from './MarketTab'

// ─────────────────────────────────────────────────────────────────────
// Market = OFFER ONLY. There is no REQUESTS tab here. REQUEST posts
// live in the main feed's REQUESTS chip; the Market surface is a
// pure selling/offering experience.
//
// Every tab below pins intent: 'OFFER' at the Prisma where clause —
// REQUEST posts can never enter Market regardless of which tab the
// user lands on.
//
//   ALL       intent=OFFER   in MARKETPLACE / HOME_BUSINESSES /
//                             REAL_ESTATE / SERVICES
//   SELLING   intent=OFFER   in MARKETPLACE / HOME_BUSINESSES /
//                             REAL_ESTATE  (no services)
//   SERVICES  intent=OFFER   in SERVICES
// ─────────────────────────────────────────────────────────────────────

// Categories that show on the market's offer-side tabs.
const OFFER_CATEGORIES_ALL: PostCategoryV2[] = [
  'MARKETPLACE',
  'HOME_BUSINESSES',
  'REAL_ESTATE',
  'SERVICES',
]

// Just goods/property — no services.
const OFFER_CATEGORIES_SELLING: PostCategoryV2[] = [
  'MARKETPLACE',
  'HOME_BUSINESSES',
  'REAL_ESTATE',
]

const OFFER_CATEGORIES_SERVICES: PostCategoryV2[] = ['SERVICES']

// Whitelist of valid Market tabs. Any unknown / legacy value (e.g. a
// shared link to ?tab=REQUESTS from before this refactor) falls
// through to ALL — the resolved tab is what drives the Prisma where
// clause AND the cache key, so a request URL physically can't reach
// the request-side query path.
type MarketTabKey = 'ALL' | 'SELLING' | 'SERVICES'
const VALID_MARKET_TABS = new Set<MarketTabKey>(['ALL', 'SELLING', 'SERVICES'])

export default async function MarketPage({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await db.user.findUnique({
    where: { id: session.userId },
    include: { neighborhood: { include: { city: true } } },
  })
  if (!user?.neighborhoodId) redirect('/onboarding')

  // Resolve the requested tab against the whitelist. Anything not in
  // VALID_MARKET_TABS (including the legacy 'REQUESTS' value) collapses
  // to 'ALL' — the request-side query path no longer exists in Market.
  const requested = (searchParams.tab || 'ALL') as MarketTabKey
  const tab: MarketTabKey = VALID_MARKET_TABS.has(requested) ? requested : 'ALL'

  // Per-tab where clause. EVERY tab pins intent: 'OFFER' — REQUEST
  // posts cannot reach Market through this code path.
  let tabFilter: object
  switch (tab) {
    case 'SELLING':
      tabFilter = { intent: 'OFFER', newCategory: { in: OFFER_CATEGORIES_SELLING } }
      break
    case 'SERVICES':
      tabFilter = { intent: 'OFFER', newCategory: { in: OFFER_CATEGORIES_SERVICES } }
      break
    case 'ALL':
    default:
      tabFilter = { intent: 'OFFER', newCategory: { in: OFFER_CATEGORIES_ALL } }
      break
  }

  const posts = await cached(`market:${user.neighborhoodId}:${tab}`, 30_000, () =>
    db.post.findMany({
      where: {
        neighborhoodId: user.neighborhoodId!,
        status: { in: ['ACTIVE', 'IN_PROGRESS'] },
        ...tabFilter,
      },
      include: {
        author: { select: { id: true, name: true, lastName: true, reputation: true, accountType: true, providerStatus: true } },
        reactions: { select: { emoji: true, userId: true } },
      },
      orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
      take: 30,
    })
  )

  // No REQUESTS tab — Market is offer-only. Users browsing requests
  // do so through the main feed's REQUESTS chip.
  const tabs = [
    { key: 'ALL',      label: 'الكل',  labelEn: 'All',      icon: '🛍️' },
    { key: 'SELLING',  label: 'بيع',   labelEn: 'Selling',  icon: '🛒' },
    { key: 'SERVICES', label: 'خدمات', labelEn: 'Services', icon: '🔧' },
  ]

  const emptyStates: Record<string, { emoji: string; title: string; sub: string }> = {
    ALL:      { emoji: '🛍️', title: 'لا توجد إعلانات بعد',       sub: 'كن أول من يضيف في حيّك!' },
    SELLING:  { emoji: '🛒', title: 'لا توجد منتجات للبيع',      sub: 'أضف منتجك الآن!' },
    SERVICES: { emoji: '🔧', title: 'لا توجد خدمات مسجّلة بعد',  sub: 'هل تقدم خدمة في الحي؟ أضفها!' },
  }

  const empty = emptyStates[tab] || emptyStates.ALL

  return (
    <div className="hai-app-shell bg-gray-50">
      <header className="glass z-10">
        <div className="px-4 py-3">
          <h1 className="font-bold text-gray-900 text-lg">سوق الحي</h1>
          <p className="text-gray-400 text-xs">{user.neighborhood?.name} · {user.neighborhood?.city.name}</p>
        </div>
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide">
          {tabs.map((t) => (
            <MarketTab
              key={t.key}
              href={`/market?tab=${t.key}`}
              active={tab === t.key}
              icon={t.icon}
              label={t.label}
            />
          ))}
        </div>
      </header>

      <div className="hai-app-shell__scroll pb-24">
      <div id="hai-pull-target" />
      <div className="px-4 py-4 space-y-3">
        {posts.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">{empty.emoji}</div>
            <p className="text-gray-500 font-medium">{empty.title}</p>
            <p className="text-gray-400 text-sm mt-1">{empty.sub}</p>
          </div>
        ) : (
          posts.map((post) => (
            <PostCard key={post.id} post={JSON.parse(JSON.stringify(post))} currentUserId={user.id} currentUserPhone={user.phone} currentUserRole={user.role} />
          ))
        )}
      </div>
      </div>{/* /hai-app-shell__scroll */}

      {/* BottomNav is mounted globally in src/app/layout.tsx */}
    </div>
  )
}
