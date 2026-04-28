import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { cached } from '@/lib/cache'
import { PostCategoryV2 } from '@prisma/client'
import PostCard from '@/components/PostCard'
import Link from 'next/link'
import MarketTab from './MarketTab'

// v2 categories that belong on the market surface. The legacy
// LOOKING_FOR / RIDE_REQUEST request-style buckets are intentionally
// excluded — request flows now go through intent: 'REQUEST' filtering,
// driven from the dedicated Ask tab.
const ALL_MARKET_CATEGORIES: PostCategoryV2[] = [
  'MARKETPLACE',
  'HOME_BUSINESSES',
  'REAL_ESTATE',
  'SERVICES',
]

const SELLING_CATEGORIES: PostCategoryV2[] = ['MARKETPLACE', 'HOME_BUSINESSES', 'REAL_ESTATE']
const SERVICES_CATEGORIES: PostCategoryV2[] = ['SERVICES']

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

  const tab = searchParams.tab || 'ALL'

  // Build the per-tab where filter against the v2 column directly. The
  // REQUESTS tab is no longer a category list — it's an intent filter
  // that crosses every v2 commercial bucket (any post asking for
  // something, regardless of category).
  let tabFilter: object
  switch (tab) {
    case 'SELLING':
      tabFilter = { newCategory: { in: SELLING_CATEGORIES } }
      break
    case 'REQUESTS':
      tabFilter = { intent: 'REQUEST', newCategory: { in: ALL_MARKET_CATEGORIES } }
      break
    case 'SERVICES':
      tabFilter = { newCategory: { in: SERVICES_CATEGORIES } }
      break
    case 'ALL':
    default:
      tabFilter = { newCategory: { in: ALL_MARKET_CATEGORIES } }
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

  const tabs = [
    { key: 'ALL',      label: 'الكل',    labelEn: 'All',      icon: '🛍️' },
    { key: 'SELLING',  label: 'بيع',     labelEn: 'Selling',  icon: '🛒' },
    { key: 'REQUESTS', label: 'طلبات',   labelEn: 'Requests', icon: '🔎' },
    { key: 'SERVICES', label: 'خدمات',   labelEn: 'Services', icon: '🔧' },
  ]

  const emptyStates: Record<string, { emoji: string; title: string; sub: string }> = {
    ALL:      { emoji: '🛍️', title: 'لا توجد إعلانات بعد',       sub: 'كن أول من يضيف في حيّك!' },
    SELLING:  { emoji: '🛒', title: 'لا توجد منتجات للبيع',      sub: 'أضف منتجك الآن!' },
    REQUESTS: { emoji: '🔎', title: 'لا توجد طلبات بعد',         sub: 'اطلب ما تحتاجه من جيرانك' },
    SERVICES: { emoji: '🔧', title: 'لا توجد خدمات مسجّلة بعد',  sub: 'هل تقدم خدمة في الحي؟ أضفها!' },
  }

  const empty = emptyStates[tab] || emptyStates.ALL

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <header className="glass sticky top-0 z-10">
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

      {/* BottomNav is mounted globally in src/app/layout.tsx */}
    </div>
  )
}
