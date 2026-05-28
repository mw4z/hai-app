'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import PostCard from '@/components/PostCard'
import PollCard from '@/components/PollCard'
import { HaiSpinner } from '@/components/HaiLoader'
import EmergencyBanner from '@/components/EmergencyBanner'
import InviteLeaderboardCard from '@/components/InviteLeaderboardCard'
import DirectoryEntryCard from '@/components/places/DirectoryEntryCard'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { hapticLight } from '@/lib/haptic'
import QuickAskSheet from '@/components/QuickAskSheet'
import NeighborhoodSheet from '@/components/NeighborhoodSheet'
import GuestBanner from '@/components/GuestBanner'
import { FiBell, FiPlus, FiMapPin, FiX, FiSearch, FiFilter, FiCheck, FiChevronDown } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import type { TranslationKey } from '@/lib/i18n'
import { fullName } from '@/lib/displayName'
import HighlightsSection, { type HighlightItemPayload } from '@/components/HighlightsSection'
import HomeActionCard from '@/components/feed/HomeActionCard'
import FirstRunGuide from '@/components/FirstRunGuide'
import CategoryPickerSheet, { type CategoryOption } from '@/components/CategoryPickerSheet'

// v2 filter chips — REQUESTS is a special intent-based chip (not a
// PostCategory value) elevated to position 2 to surface request
// posts that were getting buried inside category-based browsing.
// MARKETPLACE remains in the strip because Market has its own bottom
// tab AND deserves a top chip, but with intent=OFFER scoping so
// "ابحث عن شقة" no longer pollutes it. Other category chips are
// unchanged (all intents) — narrow them later if needed.
const CATEGORIES: { key: string; tKey: TranslationKey; icon: string }[] = [
  { key: 'ALL',                  tKey: 'feed_all',                    icon: '🏘️' },
  // Promoted to position 2 — visibility boost for request content.
  { key: 'REQUESTS',             tKey: 'feed_requests',               icon: '🔎' },
  // Offers — intent-based chip (every "offering" post, any category).
  { key: 'OFFERS',               tKey: 'feed_offers',                 icon: '🏷️' },
  // Core categories
  { key: 'MARKETPLACE',          tKey: 'post_v2_MARKETPLACE',         icon: '🛒' },
  { key: 'SERVICES',             tKey: 'post_v2_SERVICES',            icon: '🔧' },
  { key: 'HOME_BUSINESSES',      tKey: 'post_v2_HOME_BUSINESSES',     icon: '🍱' },
  // Daily needs
  { key: 'RIDES',                tKey: 'post_v2_RIDES',               icon: '🚗' },
  { key: 'REAL_ESTATE',          tKey: 'post_v2_REAL_ESTATE',         icon: '🏠' },
  // Important / urgent
  { key: 'NEIGHBORHOOD_REPORTS', tKey: 'post_v2_NEIGHBORHOOD_REPORTS',icon: '⚠️' },
  { key: 'LOST_FOUND',           tKey: 'post_v2_LOST_FOUND',          icon: '🔍' },
  // Social / optional
  { key: 'EVENTS',               tKey: 'post_v2_EVENTS',              icon: '🎉' },
  { key: 'COMPETITIONS',         tKey: 'post_v2_COMPETITIONS',        icon: '🏆' },
]

interface Post {
  id: string
  title: string
  body: string
  category: string
  intent?: 'OFFER' | 'REQUEST' | 'NORMAL' | null
  isPaid: boolean
  isFeatured: boolean
  isPinned: boolean
  price: number | null
  imageUrls: string[]
  createdAt: string
  author: { id: string; name: string | null; lastName?: string | null; reputation: number }
}

interface NeighborhoodItem {
  id: string
  name: string
  nameEn: string
  lat?: number | null
  lng?: number | null
  cityName: string
  cityNameEn: string
}

interface Props {
  user: {
    id: string
    name: string | null
    lastName?: string | null
    gender: string
    phone: string
    neighborhood: string
    neighborhoodEn: string
    city: string
    cityEn: string
    neighborhoodId: string
    role?: string
  }
  initialPosts: Post[]
  selectedCategory: string
  isReadOnly: boolean
  browseNeighborhood: { id: string; name: string; nameEn: string; cityName: string; cityNameEn: string } | null
  allNeighborhoods: NeighborhoodItem[]
  bookmarkedIds?: string[]
  followedIds?: string[]
  unreadNotifCount: number
  hasNeighborhoodMod?: boolean
  addressVerified?: boolean
  /** Master kill switch for the REQUEST visibility experiment. When
   *  false, the inline Ask CTA, the chip dot, the post-submit success
   *  state, and the auto-select-on-mount behaviour all turn off. The
   *  ranking + soft-insert side already gate themselves server-side
   *  on the same env var. */
  requestBoostOn?: boolean
  /** True when at least one REQUEST was created in the last 6 hours.
   *  Renders a small presence dot on the REQUESTS chip — deliberately
   *  not a count, to avoid reading as a "new / unread" notification. */
  requestsRecentDot?: boolean
  /** SSR'd highlights bundle. Empty array = section hidden entirely. */
  highlights?: HighlightItemPayload[]
  /** Open DELIVERY ride requests in this neighborhood. Surfaced as a
   *  slim strip in the REQUESTS / RIDES / ALL feeds so neighbors see
   *  delivery requests alongside posts. Source of truth stays on the
   *  RideRequest row — tapping a card jumps to /rides/[id]. */
  deliveryRequests?: Array<{
    id: string
    pickupArea: string
    dropoffArea: string
    itemDescription: string | null
    createdAt: string
    requester: { id: string; name: string | null; lastName: string | null; avatarUrl: string | null }
  }>
  /** SSR'd open RIDE requests for the "المشاوير" strip (top 3) and
   *  active polls — passed so both render with the feed on first paint
   *  instead of fetching on mount. The 30s refresh keeps them current. */
  initialRides?: any[]
  initialPolls?: any[]
  /** When arriving from a notification (/feed?post=<id>), scroll to and
   *  flash that post so the user sees exactly which one it's about. */
  highlightPostId?: string
}

export default function FeedClient({
  user,
  initialPosts,
  selectedCategory,
  isReadOnly,
  browseNeighborhood,
  allNeighborhoods,
  bookmarkedIds = [],
  followedIds = [],
  unreadNotifCount,
  hasNeighborhoodMod,
  addressVerified,
  requestBoostOn = true,
  requestsRecentDot = false,
  highlights = [],
  deliveryRequests = [],
  initialRides = [],
  initialPolls = [],
  highlightPostId,
}: Props) {
  const router = useRouter()
  const { t, lang } = useLanguage()
  const dn = (ar: string, en: string) => (lang === 'en' && en) ? en : ar
  const [posts, setPosts] = useState(initialPosts)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(initialPosts.length >= 20)
  const [showAsk, setShowAsk] = useState(false)

  // Auto-select REQUESTS chip after a successful Ask submit. The
  // QuickAskSheet sets sessionStorage.hai_pending_request_view = '1'
  // on success; FeedClient consumes it once on mount, so the next
  // feed view lands on the REQUESTS filter without a per-request
  // round-trip. Cleared after read so it fires only the first time.
  // Skipped when the experiment is off, but the flag is still
  // cleared so a flag flip doesn't trigger stale jumps later.
  useEffect(() => {
    if (selectedCategory === 'REQUESTS') return
    if (typeof window === 'undefined') return
    try {
      if (sessionStorage.getItem('hai_pending_request_view') === '1') {
        sessionStorage.removeItem('hai_pending_request_view')
        if (requestBoostOn) router.replace('/feed?category=REQUESTS')
      }
    } catch { /* sessionStorage can be blocked in some WebViews */ }
    // Run once on mount only — guarding on selectedCategory above so
    // it doesn't fire when the user manually navigates back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Direct ref to QuickAskSheet's textarea. Used to focus the
  // textarea SYNCHRONOUSLY in the search-bar's onClick — preserves
  // the user-gesture context that iOS WKWebView requires before it
  // will raise the keyboard. Android Chrome WebView is lenient about
  // this; iOS isn't.
  const askTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Notification deep-link: when /feed?post=<id> is opened (tapping a
  // comment/reaction notification), scroll to that post and flash it so the
  // user immediately sees which post the notification was about — like
  // Instagram. Retries briefly to cover async list paint.
  useEffect(() => {
    if (!highlightPostId) return
    let tries = 0
    let timer: ReturnType<typeof setTimeout>
    const tryScroll = () => {
      const el = document.getElementById(`post-${highlightPostId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('hai-highlight-flash')
        setTimeout(() => el.classList.remove('hai-highlight-flash'), 1800)
        return
      }
      if (++tries < 16) timer = setTimeout(tryScroll, 250) // ~4s window
    }
    timer = setTimeout(tryScroll, 200)
    return () => clearTimeout(timer)
  }, [highlightPostId])

  const [openRides, setOpenRides] = useState<any[]>(initialRides)
  const [polls, setPolls] = useState<any[]>(initialPolls)
  const [showFilter, setShowFilter] = useState(false)
  /** When true, the bottom-sheet category picker is mounted — the
   *  discoverable replacement for the prior swipe-only chip strip. */
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false)
  // Poll-creation state (showPollForm / pollQuestion / pollOptions /
  // pollLoading) was removed when the admin poll form moved to its
  // own /polls/new page. Surface is now reachable via the BottomNav
  // "+" entry sheet, same row where residents see "Suggest a poll".
  const isAdmin = ['SUPER_ADMIN', 'PLATFORM_MOD', 'NEIGHBORHOOD_MOD'].includes(user.role || '')
  const [showModBanner, setShowModBanner] = useState(false)
  useEffect(() => {
    try {
      const val = localStorage.getItem('hai_mod_banner')
      if (val === 'dismissed') return
      const count = parseInt(val || '0') || 0
      if (count >= 3) return
      localStorage.setItem('hai_mod_banner', String(count + 1))
      setShowModBanner(true)
    } catch {}
  }, [])
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('hai_feed_hidden_cats')
      return saved ? new Set(JSON.parse(saved)) : new Set()
    }
    return new Set()
  })
  // 'recommended' (default) = the SSR ranked feed (fresh + useful +
  // important). 'latest' = strict chronological. 'popular' = engagement.
  const [sortMode, setSortMode] = useState<'recommended' | 'latest' | 'popular'>(() => {
    if (typeof window === 'undefined') return 'recommended'
    const stored = localStorage.getItem('hai_feed_sort')
    // Migrate the old 'newest' value (which was actually the ranked feed).
    return stored === 'latest' || stored === 'popular' ? stored : 'recommended'
  })

  // Sync posts + the SSR'd rides strip / polls when the server
  // re-renders with a new category/neighborhood. Replaces what the old
  // mount-fetch useEffect did on neighborhood change — but with
  // server-fresh data and no spinner.
  useEffect(() => {
    setPosts(initialPosts)
    setHasMore(initialPosts.length >= 20)
    setOpenRides(initialRides)
    setPolls(initialPolls)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, isReadOnly, browseNeighborhood?.id])

  // Guard: prevent overlapping refresh/pagination fetches
  const fetchingRef = useRef(false)

  // Auto-refresh: MERGE new posts into existing list, never replace paginated content
  const refreshFeed = useCallback(async () => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    try {
      const nId = isReadOnly && browseNeighborhood ? browseNeighborhood.id : user.neighborhoodId
      const params = new URLSearchParams({ neighborhoodId: nId, category: selectedCategory })
      const res = await fetch(`/api/feed?${params}`)
      if (res.ok) {
        const data = await res.json()
        if (data.posts) {
          setPosts(prev => {
            const prevIds = new Set(prev.map(p => p.id))
            const freshMap = new Map<string, Post>(data.posts.map((p: Post) => [p.id, p]))
            // Update existing posts with fresh data (reactions, etc.)
            const updated = prev.map(p => freshMap.get(p.id) || p)
            // Prepend ONLY genuinely new posts — those created AFTER the
            // newest post we already have. The server page is RANKED, so a
            // fresh comment/reaction can lift an OLD post back into the top
            // page; without the createdAt guard that old post counted as
            // "new" and got yanked to position 0 of the recommended feed
            // until the app was restarted. Older posts that re-enter the
            // top page just get their data refreshed in place (above) and
            // surface at their real rank, not pinned to the top.
            const newestExisting = prev.reduce(
              (max, p) => Math.max(max, new Date(p.createdAt).getTime()),
              0,
            )
            const brandNew = data.posts.filter(
              (p: Post) =>
                !prevIds.has(p.id) &&
                new Date(p.createdAt).getTime() > newestExisting,
            )
            return [...brandNew, ...updated]
          })
          // Don't touch hasMore — only loadMore should control that
        }
      }
    } catch { /* */ }
    // Also refresh rides + polls
    try {
      // type=RIDE so only ride-share requests land in the المشاوير
      // strip; DELIVERY rows surface in their own delivery strip
      // above. Without the filter the same delivery request appeared
      // twice on the feed (once as 📦, once as 🚗).
      const rRes = await fetch('/api/rides?type=RIDE&neighborhood=' + (browseNeighborhood?.id || user.neighborhoodId || ''))
      if (rRes.ok) { const rData = await rRes.json(); setOpenRides((rData.rides || []).slice(0, 3)) }
    } catch { /* */ }
    try {
      const pRes = await fetch('/api/polls?neighborhood=' + (browseNeighborhood?.id || user.neighborhoodId || ''))
      if (pRes.ok) { const pData = await pRes.json(); setPolls(pData || []) }
    } catch { /* */ }
    fetchingRef.current = false
  }, [selectedCategory, isReadOnly, browseNeighborhood?.id, user.neighborhoodId])

  useAutoRefresh(refreshFeed, 30000)

  // Immediate refresh when returning from post creation
  useEffect(() => {
    try {
      if (sessionStorage.getItem('hai_feed_refresh')) {
        sessionStorage.removeItem('hai_feed_refresh')
        refreshFeed()
      }
    } catch {}
  }, [])

  // (Initial ride requests + polls now come in as SSR props — see
  // initialRides / initialPolls — and are kept current by refreshFeed's
  // 30s tick. No mount fetch, so the strip/polls don't pop in late.)

  async function loadMore() {
    if (loadingMore || !hasMore || posts.length === 0 || fetchingRef.current) return
    fetchingRef.current = true
    setLoadingMore(true)
    try {
      const lastPost = posts[posts.length - 1]
      const nId = isReadOnly && browseNeighborhood ? browseNeighborhood.id : user.neighborhoodId
      const params = new URLSearchParams({
        neighborhoodId: nId,
        category: selectedCategory,
        cursor: lastPost.createdAt,
        gender: user.gender,
      })
      const res = await fetch(`/api/feed?${params}`)
      const data = await res.json()
      if (data.posts?.length) {
        setPosts(prev => [...prev, ...data.posts])
      }
      setHasMore(data.hasMore ?? false)
    } catch {
      // silently fail
    } finally {
      setLoadingMore(false)
      fetchingRef.current = false
    }
  }

  const [showNeighborhoodPicker, setShowNeighborhoodPicker] = useState(false)
  const [lazyNeighborhoods, setLazyNeighborhoods] = useState<NeighborhoodItem[]>([])
  const [loadingNeighborhoods, setLoadingNeighborhoods] = useState(false)

  // Prefetch the neighborhood list on idle after the feed loads, so
  // opening the browse sheet feels instant instead of waiting on the
  // /api/neighborhoods/all round-trip.
  useEffect(() => {
    if (lazyNeighborhoods.length > 0 || loadingNeighborhoods) return
    const run = () => {
      setLoadingNeighborhoods(true)
      fetch('/api/neighborhoods/all')
        .then(r => r.json())
        .then((data: NeighborhoodItem[]) => {
          const mine = data.find(n => n.id === user.neighborhoodId)
          if (mine?.lat && mine?.lng) {
            const myLat = mine.lat, myLng = mine.lng
            data.sort((a, b) => {
              const dA = Math.pow((a.lat || 0) - myLat, 2) + Math.pow((a.lng || 0) - myLng, 2)
              const dB = Math.pow((b.lat || 0) - myLat, 2) + Math.pow((b.lng || 0) - myLng, 2)
              return dA - dB
            })
          }
          setLazyNeighborhoods(data)
        })
        .catch(() => {})
        .finally(() => setLoadingNeighborhoods(false))
    }
    const ric = (window as any).requestIdleCallback
    if (typeof ric === 'function') {
      const id = ric(run, { timeout: 2000 })
      return () => (window as any).cancelIdleCallback?.(id)
    }
    const t = setTimeout(run, 1200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentNeighborhood = isReadOnly && browseNeighborhood
    ? { ...browseNeighborhood, displayName: dn(browseNeighborhood.name, browseNeighborhood.nameEn), displayCity: dn(browseNeighborhood.cityName, browseNeighborhood.cityNameEn) }
    : { id: user.neighborhoodId, displayName: dn(user.neighborhood, user.neighborhoodEn), displayCity: dn(user.city, user.cityEn) }

  function handleCategoryChange(cat: string) {
    if (cat !== selectedCategory) hapticLight()
    const nParam = isReadOnly && browseNeighborhood ? `&neighborhood=${browseNeighborhood.id}` : ''
    router.push(`/feed?category=${cat}${nParam}`)
  }

  function browseNeighborhoodById(
    id: string,
    displayName: string,
    isHome: boolean,
  ) {
    // If user picked the neighborhood they're already viewing, just close.
    const alreadyHere =
      (isHome && !isReadOnly) ||
      (!isHome && isReadOnly && browseNeighborhood?.id === id)
    if (alreadyHere) {
      setShowNeighborhoodPicker(false)
      return
    }
    setShowNeighborhoodPicker(false)
    const href = isHome ? '/feed' : `/feed?neighborhood=${id}`
    // Hand off to the global travel overlay — it plays the branded
    // transition and performs the router.push itself.
    window.dispatchEvent(
      new CustomEvent('hai:travel-nbhd', {
        detail: {
          from: currentNeighborhood.displayName,
          to: displayName,
          href,
        },
      }),
    )
  }

  // Audience targeting (women-only) is no longer a category — Phase 3 v2
  // model represents it as `audience: WOMEN`. The filter chip is dropped
  // from the composer surface; the legacy WOMEN_ONLY rows still live in
  // historical posts and remain visible via the AUDIENCE filter on the
  // API (handled by feedQuery.ts when ?gender=FEMALE).
  const categories = CATEGORIES

  // Filtered + sorted posts. hiddenCategories holds v2 enum keys (set by
  // the v2 chips above) — filter each post by its category directly.
  const displayPosts = useMemo(() => {
    let result = selectedCategory === 'ALL' && hiddenCategories.size > 0
      ? posts.filter((p: any) => !hiddenCategories.has(p.category))
      : posts
    if (sortMode === 'latest') {
      // True chronological — NO ranked scoring. Product policy: pinned
      // posts stay on top (mod-curated), then strict createdAt desc.
      result = [...result].sort((a: any, b: any) => {
        if (!!a.isPinned !== !!b.isPinned) return a.isPinned ? -1 : 1
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
    } else if (sortMode === 'popular' && selectedCategory === 'ALL') {
      result = [...result].sort((a: any, b: any) => {
        const aScore = (a._count?.reactions || 0) + (a._count?.comments || 0) * 2
        const bScore = (b._count?.reactions || 0) + (b._count?.comments || 0) * 2
        return bScore - aScore
      })
    }
    // 'recommended' → keep the SSR ranked order as-is.
    return result
  }, [posts, selectedCategory, hiddenCategories, sortMode])

  return (
    <div className="hai-app-shell bg-gray-50">
      {/* Guest mode banner — only for users with addressVerified=false */}
      <GuestBanner show={addressVerified === false} neighborhoodName={dn(user.neighborhood, user.neighborhoodEn)} />

      {/* Mod recruitment banner (max 3 shows, dismissable) */}
      {!isReadOnly && !hasNeighborhoodMod && user.role === 'RESIDENT' && showModBanner && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 py-2.5 flex items-center gap-2">
          <Link href="/profile#mod-apply" className="flex items-center gap-2 flex-1 active:opacity-70">
            <span className="text-base">🏅</span>
            <span className="text-xs text-amber-800 dark:text-amber-300 font-medium flex-1">
              {lang === 'en' ? 'This neighborhood needs a moderator — apply now' : lang === 'ur' ? 'اس محلے کو ناظم کی ضرورت ہے — ابھی درخواست دیں' : 'حيّك يحتاج مشرف — قدّم طلبك الآن'}
            </span>
          </Link>
          <button onClick={() => { setShowModBanner(false); try { localStorage.setItem('hai_mod_banner', 'dismissed') } catch {} }}
            className="text-amber-400 p-1"><FiX className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Header */}
      <header className="glass z-10">
        {/* Read-only banner — lives INSIDE the sticky header so it
            pins together with the header as the user scrolls. Without
            this nesting two separate sticky elements would overlap on
            top:0 and the banner would visually cover the header. */}
        {isReadOnly && (
          <>
          {/* Paint the top safe-area with the SAME amber as this read-only
              banner so it reads as one continuous strip to the screen edge
              (no black gap above it). Dark value is amber-900/30
              pre-composited over --hai-bg (#19232a) → #362822, used opaque
              here AND on the banner so they match exactly. */}
          <style>{`
            html { --hai-safe-top-bg: rgb(255 251 235) !important; }
            html.dark { --hai-safe-top-bg: #362822 !important; }
          `}</style>
          <div className="bg-amber-50 dark:bg-[#362822] border-b border-amber-200 dark:border-amber-800/60 px-4 py-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-amber-700 dark:text-amber-200 font-medium">
                🔒 {t('feed_readonly_banner')}
              </span>
              <button
                onClick={() => router.push('/feed')}
                className="text-xs text-amber-600 dark:text-amber-300 font-semibold underline flex-shrink-0"
              >
                {t('feed_return_home')}
              </button>
            </div>
            {/* Outside users can't post publicly, but they may send a
                request/question to this neighborhood. */}
            <p className="text-[11px] text-amber-700/80 dark:text-amber-200/70 leading-snug">
              {t('feed_outside_helper')}
            </p>
            <button
              onClick={() => router.push(`/ask?neighborhood=${browseNeighborhood?.id ?? ''}`)}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary-600 text-white text-sm font-bold py-2.5 active:scale-[0.98] transition-transform shadow-sm"
            >
              💬 {t('feed_outside_ask_cta')}
            </button>
          </div>
          </>
        )}
        <div className="hai-row-2 hai-justify-between hai-px-4 hai-header-top">
          <div className="hai-flex-1 hai-min-w-0">
            <div className="hai-row-1">
              <span data-tour="feed-title" className="hai-h3 hai-tc-brand hai-shrink-0">{t('feed_title')}</span>
              <span className="hai-caption hai-tc-faint hai-shrink-0">·</span>
              <button
                onClick={() => setShowNeighborhoodPicker(true)}
                className="hai-pill hai-pill--brand hai-neighborhood-pill"
              >
                <FiMapPin className="hai-icon-sm" />
                <span className="hai-truncate">{currentNeighborhood.displayName}</span>
                <FiChevronDown className="hai-icon-sm" />
              </button>
            </div>
            <p className="hai-meta">{currentNeighborhood.displayCity}</p>
          </div>
          <Link data-tour="notifications" href="/notifications" className="hai-btn-icon">
            <FiBell className="hai-icon-lg" />
            {unreadNotifCount > 0 && (
              <span className="hai-count-badge">
                {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
              </span>
            )}
          </Link>
        </div>

        {/* Category picker. Filter (sort + hidden categories) icon at
            the leading edge · one dropdown button (replaces the prior
            scrollable chip row that hid options behind a swipe) ·
            optional rides-dashboard shortcut when RIDES is the active
            filter (the only chip that used to ship with an attached
            "open dashboard" affordance). */}
        <div data-tour="categories" className="hai-row-2 hai-pb-2 hai-ps-4 hai-pe-4">
          <button
            onClick={() => setShowFilter(!showFilter)}
            data-active={showFilter || hiddenCategories.size > 0 || sortMode !== 'recommended' ? 'true' : 'false'}
            className="hai-btn-icon hai-btn-icon--sm hai-btn-icon--outlined hai-shrink-0"
          >
            <FiFilter className="hai-icon-md" />
            {hiddenCategories.size > 0 && (
              <span className="hai-count-badge">{hiddenCategories.size}</span>
            )}
          </button>
          {(() => {
            const currentCat = categories.find((c) => c.key === selectedCategory) ?? categories[0]
            const isFiltered = selectedCategory !== 'ALL'
            const currentEmoji = currentCat.icon
            const currentLabel = selectedCategory === 'ALL'
              ? t('categories_browse_all')
              : t(currentCat.tKey)
            const showRequestsDot =
              selectedCategory === 'ALL' && requestBoostOn && requestsRecentDot
            return (
              <button
                type="button"
                onClick={() => { hapticLight(); setCategoryPickerOpen(true) }}
                aria-haspopup="dialog"
                aria-expanded={categoryPickerOpen}
                className={`flex-1 inline-flex items-center justify-between gap-2 px-4 py-3 rounded-xl text-[15px] font-bold transition-colors active:scale-[0.98] shadow-[0_2px_10px_rgba(14,165,233,0.12)] ${
                  isFiltered
                    ? 'bg-primary-100 dark:bg-primary-900/35 border-2 border-primary-500 dark:border-primary-500 text-primary-900 dark:text-primary-100'
                    : 'bg-primary-50 dark:bg-primary-900/20 border-2 border-primary-300 dark:border-primary-700/60 text-gray-900 dark:text-white'
                }`}
              >
                <span className="inline-flex items-center gap-2.5 min-w-0">
                  <span className="text-lg flex-shrink-0" aria-hidden>{currentEmoji}</span>
                  <span className="truncate">{currentLabel}</span>
                  {showRequestsDot && (
                    <span
                      className="w-2 h-2 rounded-full bg-sky-500 ring-2 ring-white dark:ring-gray-900 flex-shrink-0"
                      aria-label="recent activity"
                    />
                  )}
                </span>
                <FiChevronDown
                  className={`w-5 h-5 flex-shrink-0 text-primary-600 dark:text-primary-300 transition-transform ${
                    categoryPickerOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
            )
          })()}
          {selectedCategory === 'RIDES' && (
            <button
              type="button"
              onClick={() => { hapticLight(); router.push('/rides') }}
              className="hai-shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 active:scale-95 transition-transform"
              aria-label={lang === 'en' ? 'Open rides dashboard' : 'فتح لوحة المشاوير'}
              title={lang === 'en' ? 'Rides dashboard' : 'لوحة المشاوير'}
            >
              <span>↗</span>
            </button>
          )}
        </div>
        {/* Filter panel (expands below tabs) */}
        {showFilter && (
          <div className="hai-px-4 hai-pb-3">
            <div className="hai-card hai-card--elevated hai-stack-4">
              {/* Sort */}
              <div>
                <p className="hai-h6 hai-tc-muted hai-mb-2">{lang === 'en' ? 'Sort by' : lang === 'ur' ? 'ترتیب' : 'الترتيب'}</p>
                <div className="hai-row-2">
                  {[
                    { key: 'recommended', ar: 'الأهم', en: 'Top' },
                    { key: 'latest', ar: 'الأحدث', en: 'Latest' },
                    { key: 'popular', ar: 'الأكثر تفاعلاً', en: 'Most Popular' },
                  ].map(s => (
                    <button
                      key={s.key}
                      onClick={() => { setSortMode(s.key as any); localStorage.setItem('hai_feed_sort', s.key) }}
                      data-active={sortMode === s.key ? 'true' : 'false'}
                      className="hai-chip hai-flex-1 hai-justify-center"
                    >
                      {lang !== 'en' ? s.ar : s.en}
                    </button>
                  ))}
                </div>
              </div>
              {/* Category hide */}
              <div>
                <p className="hai-h6 hai-tc-muted hai-mb-2">{lang === 'en' ? 'Hide categories' : lang === 'ur' ? 'زمرے چھپائیں' : 'إخفاء أقسام'}</p>
                <div className="hai-flex-wrap hai-row-1">
                  {categories.filter(c => c.key !== 'ALL').map(cat => {
                    const hidden = hiddenCategories.has(cat.key)
                    return (
                      <button
                        key={cat.key}
                        onClick={() => {
                          const next = new Set(hiddenCategories)
                          if (hidden) next.delete(cat.key); else next.add(cat.key)
                          setHiddenCategories(next)
                          localStorage.setItem('hai_feed_hidden_cats', JSON.stringify(Array.from(next)))
                        }}
                        data-hidden={hidden ? 'true' : 'false'}
                        className="hai-chip hai-chip--xs hai-category-toggle"
                      >
                        {cat.icon} {t(cat.tKey)}
                      </button>
                    )
                  })}
                </div>
              </div>
              {(hiddenCategories.size > 0 || sortMode !== 'recommended') && (
                <button
                  onClick={() => { setHiddenCategories(new Set()); setSortMode('recommended'); localStorage.removeItem('hai_feed_hidden_cats'); localStorage.removeItem('hai_feed_sort') }}
                  className="hai-link hai-tc-danger hai-meta"
                >
                  {lang === 'en' ? 'Reset' : lang === 'ur' ? 'ری سیٹ' : 'إعادة ضبط'}
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Neighborhood Highlights — glued below the header as a flex item of
          .hai-app-shell (NOT position:sticky, which leaves a gap inside the
          iOS momentum-scroll container). Stays put while the feed scrolls
          beneath it. Skipped in read-only browse. Tapping an item scrolls
          to the matching #post-<id> anchor in the list below. */}
      {!isReadOnly && (
        <HighlightsSection
          items={highlights}
          neighborhoodId={isReadOnly && browseNeighborhood ? browseNeighborhood.id : user.neighborhoodId}
          canManage={['SUPER_ADMIN', 'PLATFORM_MOD', 'NEIGHBORHOOD_MOD'].includes(user.role || '') && !isReadOnly}
        />
      )}

      {/* Inner scroll container — only this bounces. Header + highlights
          above stay glued to the top. */}
      <div className="hai-app-shell__scroll" style={{ paddingBottom: 'calc(7rem + var(--hai-safe-bottom, 0px))' }}>
      {/* Pull-to-refresh portal target — first child so the indicator
          appears at the top of the scrolling list. */}
      <div id="hai-pull-target" />

      {/* Delivery requests strip — DELIVERY-typed RideRequests surfaced
          in the LOOKING_FOR / REQUESTS feed. Single source of truth
          stays on the RideRequest row; tapping a card opens the rides
          detail screen where the offer/pricing flow lives. */}
      {!isReadOnly && deliveryRequests.length > 0 && (selectedCategory === 'REQUESTS' || selectedCategory === 'RIDES' || selectedCategory === 'ALL') && (
        <div className="px-4 pt-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1">
              📦 {lang === 'en' ? 'Delivery requests nearby' : lang === 'ur' ? 'قریبی ڈیلیوری درخواستیں' : 'طلبات توصيل قريبة'}
            </h2>
            <button onClick={() => router.push('/rides')} className="text-[11px] text-primary-600 active:scale-95">
              {lang === 'en' ? 'See all' : lang === 'ur' ? 'سب دیکھیں' : 'عرض الكل'}
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 snap-x snap-mandatory">
            {deliveryRequests.map(d => (
              <button
                key={d.id}
                onClick={() => router.push(`/rides/${d.id}`)}
                className="flex-shrink-0 w-[78%] sm:w-[60%] snap-start bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-2xl p-3 text-start active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-6 h-6 rounded-full bg-amber-200 dark:bg-amber-800 overflow-hidden flex-shrink-0">
                    {d.requester.avatarUrl ? <img src={d.requester.avatarUrl} alt="" className="w-full h-full object-cover" /> : null}
                  </div>
                  <span className="text-xs font-semibold text-gray-800 dark:text-white truncate">{d.requester.name || '—'}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 ms-auto flex-shrink-0">📦</span>
                </div>
                {d.itemDescription && (
                  <p className="text-xs text-gray-700 dark:text-gray-200 line-clamp-2 leading-snug mb-1">{d.itemDescription}</p>
                )}
                <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{d.pickupArea} {lang !== 'en' ? '←' : '→'} {d.dropoffArea}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Neighborhood Directory CTA — gated entirely on
          NEXT_PUBLIC_DIRECTORY_ENABLED. When the flag is unset
          (default), DirectoryEntryCard returns null and this
          wrapping div renders an empty fragment — no visual
          residue, no extra spacing. Shown only on the ALL chip
          so it doesn't clutter category filters.
          When the feed is in cross-neighborhood browse mode,
          forward the same nbhd id to /directory so the link
          stays in browse context. */}
      {selectedCategory === 'ALL' && (
        <div className="px-4 pt-3">
          <DirectoryEntryCard
            variant="card"
            browseNeighborhoodId={isReadOnly ? browseNeighborhood?.id ?? null : null}
          />
        </div>
      )}


      {/* Empty-state CTA lives in the bottom block (search for
          🏘️ / feed_cta_title). The compact top card that used to
          live here duplicated the same four buttons under the same
          title — both fired simultaneously when posts.length === 0,
          so the user saw "حيّك يحتاجك!" twice. Removed in favor of
          the single full-size empty state. */}

      {/* Open ride requests from neighborhood */}
      {openRides.length > 0 && selectedCategory === 'ALL' && (
        <div className="px-4 pt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">🚗 {t('nav_rides')}</h3>
            <Link href="/rides" className="text-xs text-primary-600 dark:text-primary-400 font-medium">
              {lang === 'en' ? 'View all' : lang === 'ur' ? 'سب دیکھیں' : 'عرض الكل'}
            </Link>
          </div>
          <div className="space-y-2">
            {openRides.map((r: any, idx: number) => (
              <Link key={r.id} href={`/rides/${r.id}`}
                style={{ animationDelay: `${idx * 80}ms`, animationFillMode: 'backwards' }}
                className="block bg-white dark:bg-gray-800 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.06)] border border-indigo-100 dark:border-indigo-900/50 p-3.5 active:scale-[0.99] transition-transform animate-slide-in-rtl">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white mb-1">
                  <FiMapPin className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                  <span className="truncate">{r.pickupArea}</span>
                  <span className="text-gray-400">{lang !== 'en' ? '←' : '→'}</span>
                  <FiMapPin className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                  <span className="truncate">{r.dropoffArea}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-[11px] text-gray-400">
                    <span>{r.distanceKm} {t('ride_km')}</span>
                    <span>~{r.durationMin} {t('ride_min')}</span>
                    <span>{r.offerCount || 0} {t('rides_offers')}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-primary-100 overflow-hidden flex-shrink-0">
                      {r.requester?.avatarUrl ? <img src={r.requester.avatarUrl} alt="" className="w-full h-full object-cover" /> : null}
                    </div>
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">{fullName(r.requester) || r.requester?.name || '—'}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Admin poll creator was moved out of the feed. Admins now
          tap the center "+" button in the BottomNav and pick
          "📊 إنشاء تصويت" — the same surface where residents see
          "💡 اقترح استفتاء للمشرف". Role decides the destination:
          admins → /polls/new (direct publish), residents →
          /polls/request (mod review). Keeps the feed less cluttered
          and gives both flows a single, predictable home. */}

      {/* Emergency alerts — pinned above everything */}
      <EmergencyBanner />

      {/* Quick-start action grid. Pure UI helper: 4 buttons that
          route to existing pages so a first-time user doesn't have
          to learn the category taxonomy to do anything. Hidden on
          cross-neighborhood browse (read-only mode) and once the
          user dismisses it (versioned localStorage, permanent at v1).
          The data-firstrun marker is the spotlight target for step
          2 of the FirstRunGuide. */}
      {!isReadOnly && (
        <div data-firstrun="home-actions">
          <HomeActionCard />
        </div>
      )}

      {/* Quick Ask bar — only in own neighborhood */}
      {!isReadOnly && (
        <div className="px-4 pt-4">
          {/* Plain button — NOT a real input. The previous <input
              readOnly> trigger caused the browser to auto-scroll the
              feed when the keyboard pushed the input out of the
              viewport. With a button there's no native focus, no
              scroll-into-view, no keyboard rise on the trigger
              itself — the sheet's textarea is what raises the
              keyboard, and it does so as soon as the sheet flips
              display: block (see useLayoutEffect in QuickAskSheet). */}
          <button
            data-tour="new-post"
            data-firstrun="post"
            type="button"
            onClick={() => {
              // Order matters on iOS:
              //   1) focus the textarea SYNCHRONOUSLY inside the
              //      tap's gesture chain — that's what raises the
              //      WKWebView keyboard. The textarea is always in
              //      the DOM thanks to QuickAskSheet's pre-mount
              //      + translateY hide pattern.
              //   2) preventScroll:true is REQUIRED on iOS — without
              //      it, iOS WKWebView scrolls the document down to
              //      try to show the offscreen translateY(110%)
              //      textarea, which is what produced the 'feed
              //      scrolls down' bug.
              //   3) THEN set showAsk so React can flip the sheet's
              //      transform: translateY(110%) → translateY(0) in
              //      the next frame.
              askTextareaRef.current?.focus({ preventScroll: true })
              setShowAsk(true)
            }}
            className="glow-ask w-full flex items-center gap-3 bg-white border border-sky-100 rounded-2xl px-4 py-3 transition-shadow"
          >
            <span className="text-lg">🔎</span>
            <span className="flex-1 text-start text-sm text-gray-400">{t('feed_ask_placeholder')}</span>
            <span className="text-xs bg-sky-600 text-white px-3 py-1 rounded-full font-medium flex-shrink-0">{t('feed_quick_ask_btn')}</span>
          </button>
        </div>
      )}

      {/* Active polls */}
      {polls.length > 0 && selectedCategory === 'ALL' && (
        <div className="px-4 pt-3 space-y-3">
          {polls.map((poll: any) => (
            <PollCard key={poll.id} poll={poll} currentUserId={user.id} isSuperAdmin={user.role === 'SUPER_ADMIN'} isAdmin={['SUPER_ADMIN', 'PLATFORM_MOD', 'NEIGHBORHOOD_MOD'].includes(user.role ?? '')} onDelete={() => setPolls(prev => prev.filter(p => p.id !== poll.id))} />
          ))}
        </div>
      )}

      {/* Invite leaderboard — ALL tab only, self-hides when <2 leaders */}
      {selectedCategory === 'ALL' && <InviteLeaderboardCard />}

      {/* Posts */}
      <div className="px-4 py-4 space-y-3">
        {displayPosts.length === 0 ? (
          selectedCategory === 'COMPETITIONS' ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">🏆</div>
              <p className="text-gray-500 dark:text-gray-300 font-bold text-xl mb-2">{t('contests_coming_soon')}</p>
              <p className="text-gray-400 dark:text-gray-500 text-sm max-w-xs mx-auto leading-relaxed">{t('contests_desc')}</p>
              <button
                onClick={() => router.push('/contests')}
                className="mt-6 bg-fuchsia-600 text-white rounded-xl px-6 py-3 text-sm font-semibold active:scale-95 transition-transform"
              >
                {lang === 'en' ? 'Learn More' : lang === 'ur' ? 'مزید جانیں' : 'اعرف المزيد'}
              </button>
            </div>
          ) : (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">🏘️</div>
            <p className="text-gray-500 font-semibold text-lg mb-1">{t('feed_cta_title')}</p>
            <p className="text-gray-400 text-sm mb-6">
              {isReadOnly ? t('feed_no_posts_readonly') : t('feed_be_first')}
            </p>
            {!isReadOnly && (
              // Each button routes to its own dedicated surface
              // instead of dropping the user back into the generic
              // composer's category picker:
              //
              //   🔎 Ask neighbors   → /ask
              //   🔧 Request service → /ask?intent=service_need
              //                        (Ask flow with the "I need a
              //                        service" intent pre-selected)
              //   ⚠️ Report issue    → /post/new?category=NEIGHBORHOOD_REPORTS
              //   🤝 Offer help      → /post/new?category=SERVICES
              //                        (composer pre-selects the
              //                        Services tile; provider-gate
              //                        logic still applies on submit)
              <div className="grid grid-cols-2 gap-2 max-w-sm mx-auto">
                <button onClick={() => router.push('/ask')} className="flex items-center justify-center gap-2 bg-primary-600 text-white rounded-xl px-4 py-3 text-sm font-medium active:scale-95 transition-transform">
                  <span>🔎</span>{t('feed_cta_ask')}
                </button>
                <button onClick={() => router.push('/ask?intent=service_need')} className="flex items-center justify-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 active:scale-95 transition-transform">
                  <span>🔧</span>{t('feed_cta_service')}
                </button>
                <button onClick={() => router.push('/post/new?category=NEIGHBORHOOD_REPORTS')} className="flex items-center justify-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 active:scale-95 transition-transform">
                  <span>⚠️</span>{t('feed_cta_report')}
                </button>
                <button onClick={() => router.push('/post/new?category=SERVICES')} className="flex items-center justify-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 active:scale-95 transition-transform">
                  <span>🤝</span>{t('feed_cta_help')}
                </button>
              </div>
            )}
          </div>
          )
        ) : (
          <>
            {displayPosts.map((post, idx) => (
              <div key={post.id} id={`post-${post.id}`}>
                <div data-tour={idx === 0 ? 'first-post' : undefined} style={{ animationDelay: `${Math.min(idx * 50, 300)}ms`, animationFillMode: 'backwards' }} className="animate-fade-in-up">
                  <PostCard post={post} currentUserId={user.id} currentUserPhone={user.phone} currentUserRole={user.role} isBookmarked={bookmarkedIds.includes(post.id)} isFollowing={followedIds.includes(post.id)} onDelete={(id) => setPosts(prev => prev.filter(p => p.id !== id))} />
                </div>
                {/* Secondary inline Ask CTA. Renders after the 4th
                    post (idx === 3) on the ALL chip only — REQUESTS /
                    other filters already centre the request flow.
                    Same trigger as the top search bar so iOS keyboard
                    rises synchronously on tap. Gated on the boost
                    flag so the CTA disappears alongside ranking +
                    badge when the experiment is off. */}
                {idx === 3 && selectedCategory === 'ALL' && !isReadOnly && requestBoostOn && (
                  <button
                    type="button"
                    onClick={() => {
                      askTextareaRef.current?.focus({ preventScroll: true })
                      setShowAsk(true)
                    }}
                    className="w-full mt-2 mb-1 flex items-center gap-3 px-4 py-3 rounded-2xl bg-sky-50 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-900/40 text-start active:scale-[0.99] transition-transform"
                  >
                    <span className="w-9 h-9 rounded-full bg-sky-500 text-white flex items-center justify-center text-base flex-shrink-0">🔎</span>
                    <span className="flex-1 text-sm font-medium text-sky-900 dark:text-sky-100">{t('feed_inline_ask_cta')}</span>
                    <span className="text-sky-600 dark:text-sky-400 text-xs font-semibold flex-shrink-0">{t('feed_quick_ask_btn')} ←</span>
                  </button>
                )}
              </div>
            ))}
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full py-3 text-sm text-primary-600 font-medium bg-white rounded-2xl border border-gray-100 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {loadingMore ? (
                  <span className="inline-flex items-center justify-center"><HaiSpinner /></span>
                ) : (
                  t('feed_load_more')
                )}
              </button>
            )}
          </>
        )}
      </div>

      </div>{/* /hai-app-shell__scroll */}

      {/* BottomNav is mounted globally in src/app/layout.tsx */}

      {/* First-run guided tour — مرشد حي. Self-mounts once per
          device (localStorage hai:first-run-guide-v1), suppressed
          on cross-neighborhood browse, defers paint while an
          EmergencyBanner is on screen. */}
      <FirstRunGuide enabled={!isReadOnly} />

      {/* Pre-mount QuickAskSheet so the keyboard rises the same frame
          the user taps the search bar — see commit notes. The sheet
          is always in the DOM, just translated off-screen until
          open=true. */}
      <QuickAskSheet
        open={showAsk}
        onClose={() => setShowAsk(false)}
        externalTextareaRef={askTextareaRef}
        requestBoostOn={requestBoostOn}
      />

      {/* Neighborhood picker — polished bottom sheet */}
      <NeighborhoodSheet
        open={showNeighborhoodPicker}
        onClose={() => setShowNeighborhoodPicker(false)}
        onSelect={(n) => browseNeighborhoodById(n.id, n.displayName, n.isHome)}
        user={{
          neighborhoodId: user.neighborhoodId,
          neighborhood: user.neighborhood,
          neighborhoodEn: user.neighborhoodEn,
          city: user.city,
          cityEn: user.cityEn,
        }}
        browseNeighborhoodId={browseNeighborhood?.id || null}
        allNeighborhoods={lazyNeighborhoods.length > 0 ? lazyNeighborhoods : allNeighborhoods}
        loading={loadingNeighborhoods && lazyNeighborhoods.length === 0}
        isReadOnly={isReadOnly}
      />

      {/* Bottom-sheet replacement for the prior horizontally-scrolling
          chip row. Vertical list, large rows, one-tap commit. */}
      <CategoryPickerSheet
        open={categoryPickerOpen}
        onClose={() => setCategoryPickerOpen(false)}
        selected={selectedCategory === 'ALL' ? null : selectedCategory}
        onSelect={(v) => { hapticLight(); handleCategoryChange(v ?? 'ALL') }}
        title={t('categories_pick_feed')}
        options={categories.map<CategoryOption>((c) => ({
          value: c.key === 'ALL' ? null : c.key,
          emoji: c.icon,
          label: c.key === 'ALL' ? t('categories_browse_all') : t(c.tKey),
        }))}
      />
    </div>
  )
}
