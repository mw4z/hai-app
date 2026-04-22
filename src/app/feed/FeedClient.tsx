'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import PostCard from '@/components/PostCard'
import PollCard from '@/components/PollCard'
import BottomNav from '@/components/BottomNav'
import EmergencyBanner from '@/components/EmergencyBanner'
import InviteLeaderboardCard from '@/components/InviteLeaderboardCard'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { hapticLight } from '@/lib/haptic'
import QuickAskSheet from '@/components/QuickAskSheet'
import NeighborhoodSheet from '@/components/NeighborhoodSheet'
import GuestBanner from '@/components/GuestBanner'
import { FiBell, FiPlus, FiMapPin, FiX, FiSearch, FiFilter, FiCheck, FiChevronDown } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import type { TranslationKey } from '@/lib/i18n'

const CATEGORIES: { key: string; tKey: TranslationKey; icon: string }[] = [
  { key: 'ALL',                tKey: 'feed_all',              icon: '🏘️' },
  { key: 'LOOKING_FOR',        tKey: 'cat_LOOKING_FOR',       icon: '🔎' },
  { key: 'ALERT',              tKey: 'cat_ALERT',             icon: '🔔' },
  { key: 'NEIGHBORHOOD_ISSUE', tKey: 'cat_NEIGHBORHOOD_ISSUE',icon: '⚠️' },
  { key: 'RIDE_REQUEST',       tKey: 'cat_RIDE_REQUEST',      icon: '🚗' },
  { key: 'MARKETPLACE',        tKey: 'cat_MARKETPLACE',       icon: '🛒' },
  { key: 'FOOD_HOME',          tKey: 'cat_FOOD_HOME',         icon: '🍱' },
  { key: 'REAL_ESTATE',        tKey: 'cat_REAL_ESTATE',       icon: '🏠' },
  { key: 'SERVICES',           tKey: 'cat_SERVICES',          icon: '🔧' },
  { key: 'LOST_FOUND',         tKey: 'cat_LOST_FOUND',        icon: '🔍' },
  { key: 'MOSQUE',             tKey: 'cat_MOSQUE',            icon: '🕌' },
  { key: 'EID_RAMADAN',        tKey: 'cat_EID_RAMADAN',       icon: '🎉' },
  { key: 'CONTESTS',           tKey: 'cat_CONTESTS',          icon: '🏆' },
  { key: 'GENERAL',            tKey: 'cat_GENERAL',           icon: '💬' },
]

interface Post {
  id: string
  title: string
  body: string
  category: string
  isPaid: boolean
  isFeatured: boolean
  isPinned: boolean
  price: number | null
  imageUrls: string[]
  createdAt: string
  author: { id: string; name: string | null; reputation: number }
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
  unreadNotifCount: number
  hasNeighborhoodMod?: boolean
  addressVerified?: boolean
}

export default function FeedClient({
  user,
  initialPosts,
  selectedCategory,
  isReadOnly,
  browseNeighborhood,
  allNeighborhoods,
  bookmarkedIds = [],
  unreadNotifCount,
  hasNeighborhoodMod,
  addressVerified,
}: Props) {
  const router = useRouter()
  const { t, lang } = useLanguage()
  const dn = (ar: string, en: string) => (lang === 'en' && en) ? en : ar
  const [posts, setPosts] = useState(initialPosts)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(initialPosts.length >= 20)
  const [showAsk, setShowAsk] = useState(false)
  const [openRides, setOpenRides] = useState<any[]>([])
  const [polls, setPolls] = useState<any[]>([])
  const [showFilter, setShowFilter] = useState(false)
  const [showPollForm, setShowPollForm] = useState(false)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState(['', ''])
  const [pollLoading, setPollLoading] = useState(false)
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
  const [sortMode, setSortMode] = useState<'newest' | 'popular'>(() => {
    if (typeof window !== 'undefined') return (localStorage.getItem('hai_feed_sort') as any) || 'newest'
    return 'newest'
  })

  // Sync posts when server re-renders with new category/neighborhood
  useEffect(() => {
    setPosts(initialPosts)
    setHasMore(initialPosts.length >= 20)
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
            // Prepend truly new posts that weren't in the list
            const brandNew = data.posts.filter((p: Post) => !prevIds.has(p.id))
            return [...brandNew, ...updated]
          })
          // Don't touch hasMore — only loadMore should control that
        }
      }
    } catch { /* */ }
    // Also refresh rides + polls
    try {
      const rRes = await fetch('/api/rides?neighborhood=' + (browseNeighborhood?.id || user.neighborhoodId || ''))
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

  // Initial ride requests + polls fetch
  useEffect(() => {
    fetch('/api/rides?neighborhood=' + (browseNeighborhood?.id || user.neighborhoodId || ''))
      .then(r => r.json()).then(d => setOpenRides((d.rides || []).slice(0, 3))).catch(() => {})
    fetch('/api/polls?neighborhood=' + (browseNeighborhood?.id || user.neighborhoodId || ''))
      .then(r => r.json()).then(d => setPolls(d || [])).catch(() => {})
  }, [browseNeighborhood?.id])

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

  const showWomenOnly = user.gender === 'FEMALE'
  const categories = showWomenOnly
    ? [...CATEGORIES, { key: 'WOMEN_ONLY', tKey: 'cat_WOMEN_ONLY' as TranslationKey, icon: '👩' }]
    : CATEGORIES

  // Filtered + sorted posts
  const displayPosts = useMemo(() => {
    let result = selectedCategory === 'ALL' && hiddenCategories.size > 0
      ? posts.filter((p: any) => !hiddenCategories.has(p.category))
      : posts
    if (sortMode === 'popular' && selectedCategory === 'ALL') {
      result = [...result].sort((a: any, b: any) => {
        const aScore = (a._count?.reactions || 0) + (a._count?.comments || 0) * 2
        const bScore = (b._count?.reactions || 0) + (b._count?.comments || 0) * 2
        return bScore - aScore
      })
    }
    return result
  }, [posts, selectedCategory, hiddenCategories, sortMode])

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Guest mode banner — only for users with addressVerified=false */}
      <GuestBanner show={addressVerified === false} />

      {/* Read-only banner */}
      {isReadOnly && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between">
          <span className="text-xs text-amber-700 font-medium">
            🔒 {t('feed_readonly_banner')}
          </span>
          <button
            onClick={() => router.push('/feed')}
            className="text-xs text-amber-600 font-semibold underline"
          >
            {t('feed_return_home')}
          </button>
        </div>
      )}

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
      <header className="glass sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 pt-2.5 pb-1.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span data-tour="feed-title" className="text-xl font-bold text-primary-600 flex-shrink-0">{t('feed_title')}</span>
              <span className="text-gray-400 text-sm flex-shrink-0">·</span>
              <button
                onClick={() => setShowNeighborhoodPicker(true)}
                className="flex items-center gap-1 text-sm font-medium text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800 rounded-full px-2.5 py-1 hover:bg-primary-100 dark:hover:bg-primary-900/50 active:scale-95 transition-all min-w-0 max-w-[45vw]"
              >
                <FiMapPin className="w-3.5 h-3.5 text-primary-600 flex-shrink-0" />
                <span className="truncate">{currentNeighborhood.displayName}</span>
                <FiChevronDown className="w-3.5 h-3.5 text-primary-500 flex-shrink-0" />
              </button>
            </div>
            <p className="text-gray-400 text-xs">{currentNeighborhood.displayCity}</p>
          </div>
          <Link data-tour="notifications" href="/notifications" className="relative p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
            <FiBell className="w-5 h-5 text-gray-600" />
            {unreadNotifCount > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
              </span>
            )}
          </Link>
        </div>

        {/* Category Tabs */}
        <div data-tour="categories" className="flex items-center gap-2 pb-2 ps-4">
          {/* Filter icon — always visible */}
          <button onClick={() => setShowFilter(!showFilter)}
            className={`flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0 relative transition-all ${
              showFilter || hiddenCategories.size > 0 || sortMode !== 'newest'
                ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/25'
                : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10 border border-gray-200 dark:border-white/[0.08]'
            }`}>
            <FiFilter className="w-4 h-4" />
            {hiddenCategories.size > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] w-3.5 h-3.5 rounded-full flex items-center justify-center">{hiddenCategories.size}</span>
            )}
          </button>
          {/* Category tabs */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide flex-1 py-0.5 pe-4"
            style={{ maskImage: 'linear-gradient(to left, transparent, black 24px)', WebkitMaskImage: 'linear-gradient(to left, transparent, black 24px)' }}>
            {categories.map((cat) => (
              <button
                key={cat.key}
                onClick={() => handleCategoryChange(cat.key)}
                className={`flex items-center gap-1 whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-medium transition-all flex-shrink-0 ${
                  selectedCategory === cat.key
                    ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/25 glow-tab'
                    : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10 border border-gray-200 dark:border-white/[0.08]'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{t(cat.tKey)}</span>
              </button>
            ))}
          </div>
        </div>
        {/* Filter panel (expands below tabs) */}
        {showFilter && (
          <div className="px-4 pb-3">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 shadow-lg space-y-4">
              {/* Sort */}
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">{lang === 'en' ? 'Sort by' : lang === 'ur' ? 'ترتیب' : 'الترتيب'}</p>
                <div className="flex gap-2">
                  {[
                    { key: 'newest', ar: 'الأحدث', en: 'Newest' },
                    { key: 'popular', ar: 'الأكثر تفاعلاً', en: 'Most Popular' },
                  ].map(s => (
                    <button key={s.key} onClick={() => { setSortMode(s.key as any); localStorage.setItem('hai_feed_sort', s.key) }}
                      className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${
                        sortMode === s.key ? 'bg-primary-600 text-white' : 'bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                      }`}>
                      {lang !== 'en' ? s.ar : s.en}
                    </button>
                  ))}
                </div>
              </div>
              {/* Category hide */}
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">{lang === 'en' ? 'Hide categories' : lang === 'ur' ? 'زمرے چھپائیں' : 'إخفاء أقسام'}</p>
                <div className="flex flex-wrap gap-1.5">
                  {categories.filter(c => c.key !== 'ALL').map(cat => {
                    const hidden = hiddenCategories.has(cat.key)
                    return (
                      <button key={cat.key} onClick={() => {
                        const next = new Set(hiddenCategories)
                        if (hidden) next.delete(cat.key); else next.add(cat.key)
                        setHiddenCategories(next)
                        localStorage.setItem('hai_feed_hidden_cats', JSON.stringify(Array.from(next)))
                      }}
                        className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium ${
                          hidden ? 'bg-gray-200 dark:bg-gray-600 text-gray-400 line-through' : 'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}>
                        {cat.icon} {t(cat.tKey)}
                      </button>
                    )
                  })}
                </div>
              </div>
              {(hiddenCategories.size > 0 || sortMode !== 'newest') && (
                <button onClick={() => { setHiddenCategories(new Set()); setSortMode('newest'); localStorage.removeItem('hai_feed_hidden_cats'); localStorage.removeItem('hai_feed_sort') }}
                  className="text-xs text-red-500 font-medium">{lang === 'en' ? 'Reset' : lang === 'ur' ? 'ری سیٹ' : 'إعادة ضبط'}</button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Quick Ask bar — only in own neighborhood */}
      {!isReadOnly && (
        <div className="px-4 pt-4">
          <button
            data-tour="new-post"
            onClick={() => setShowAsk(true)}
            className="w-full flex items-center gap-3 bg-white border border-sky-100 rounded-2xl px-4 py-3 shadow-sm hover:shadow-md transition-shadow"
          >
            <span className="text-lg">🔎</span>
            <span className="flex-1 text-start text-sm text-gray-400">{t('feed_ask_placeholder')}</span>
            <span className="text-xs bg-sky-600 text-white px-3 py-1 rounded-full font-medium flex-shrink-0">{t('feed_quick_ask_btn')}</span>
          </button>
        </div>
      )}


      {/* CTA banner when feed has very few posts */}
      {!isReadOnly && posts.length === 0 && (
        <div className="px-4 pt-4">
          <div className="bg-primary-50 border border-primary-100 rounded-2xl p-4">
            <p className="text-primary-800 font-semibold text-sm mb-3">{t('feed_cta_title')}</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => router.push('/post/new')} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2.5 text-xs font-medium text-gray-700 border border-gray-100 active:scale-95 transition-transform">
                <span>🔎</span>{t('feed_cta_ask')}
              </button>
              <button onClick={() => router.push('/post/new')} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2.5 text-xs font-medium text-gray-700 border border-gray-100 active:scale-95 transition-transform">
                <span>🔧</span>{t('feed_cta_service')}
              </button>
              <button onClick={() => router.push('/post/new')} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2.5 text-xs font-medium text-gray-700 border border-gray-100 active:scale-95 transition-transform">
                <span>⚠️</span>{t('feed_cta_report')}
              </button>
              <button onClick={() => router.push('/post/new')} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2.5 text-xs font-medium text-gray-700 border border-gray-100 active:scale-95 transition-transform">
                <span>🤝</span>{t('feed_cta_help')}
              </button>
            </div>
          </div>
        </div>
      )}

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
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">{r.requester?.name || '—'}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Admin: Create poll button + form */}
      {isAdmin && !isReadOnly && (
        <div className="px-4 pt-3">
          {!showPollForm ? (
            <button onClick={() => setShowPollForm(true)}
              className="w-full flex items-center justify-center gap-2 bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800 rounded-2xl py-3 text-sm font-medium text-purple-700 dark:text-purple-300 active:scale-[0.98]">
              📊 {t('poll_create')}
            </button>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-purple-200 dark:border-purple-800 p-4 space-y-3 animate-fade-in-up">
              <h3 className="font-bold text-gray-900 dark:text-white text-sm">📊 {t('poll_create')}</h3>
              <input type="text" value={pollQuestion} onChange={e => setPollQuestion(e.target.value)}
                placeholder={lang !== 'en' ? 'ما هو سؤال التصويت؟' : 'What is the poll question?'}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-transparent text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
              {pollOptions.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-5">{i + 1}.</span>
                  <input type="text" value={opt} onChange={e => { const next = [...pollOptions]; next[i] = e.target.value; setPollOptions(next) }}
                    placeholder={`${lang !== 'en' ? 'خيار' : 'Option'} ${i + 1}`}
                    className="flex-1 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-transparent text-gray-900 dark:text-white focus:outline-none" />
                  {pollOptions.length > 2 && (
                    <button onClick={() => setPollOptions(prev => prev.filter((_, j) => j !== i))} className="text-gray-400 text-xs">✕</button>
                  )}
                </div>
              ))}
              {pollOptions.length < 6 && (
                <button onClick={() => setPollOptions(prev => [...prev, ''])} className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                  {t('poll_add_option')}
                </button>
              )}
              <div className="flex gap-2">
                <button onClick={async () => {
                  if (!pollQuestion.trim()) return
                  const opts = pollOptions.filter(o => o.trim())
                  if (opts.length < 2) { toast.error(lang === 'en' ? 'Add at least 2 options' : lang === 'ur' ? 'کم از کم 2 اختیارات شامل کریں' : 'أضف خيارين على الأقل'); return }
                  setPollLoading(true)
                  try {
                    const res = await fetch('/api/polls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: pollQuestion.trim(), options: opts }) })
                    if (res.ok) {
                      toast.success(lang === 'en' ? 'Poll published' : lang === 'ur' ? 'ووٹنگ شائع ہو گئی' : 'تم نشر التصويت')
                      setShowPollForm(false); setPollQuestion(''); setPollOptions(['', ''])
                      const pRes = await fetch('/api/polls?neighborhood=' + user.neighborhoodId)
                      if (pRes.ok) setPolls(await pRes.json())
                    } else { const d = await res.json(); toast.error(d.error) }
                  } catch { toast.error('Error') }
                  setPollLoading(false)
                }} disabled={pollLoading}
                  className="flex-1 bg-purple-600 text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-40 active:scale-[0.97]">
                  {pollLoading ? '...' : t('poll_publish')}
                </button>
                <button onClick={() => setShowPollForm(false)} className="px-4 py-2.5 text-sm text-gray-500">{lang === 'en' ? 'Cancel' : lang === 'ur' ? 'منسوخ' : 'إلغاء'}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Emergency alerts — pinned above everything */}
      <EmergencyBanner />

      {/* Active polls */}
      {polls.length > 0 && selectedCategory === 'ALL' && (
        <div className="px-4 pt-3 space-y-3">
          {polls.map((poll: any) => (
            <PollCard key={poll.id} poll={poll} currentUserId={user.id} onDelete={() => setPolls(prev => prev.filter(p => p.id !== poll.id))} />
          ))}
        </div>
      )}

      {/* Invite leaderboard — ALL tab only, self-hides when <2 leaders */}
      {selectedCategory === 'ALL' && <InviteLeaderboardCard />}

      {/* Posts */}
      <div className="px-4 py-4 space-y-3">
        {displayPosts.length === 0 ? (
          selectedCategory === 'CONTESTS' ? (
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
              <div className="grid grid-cols-2 gap-2 max-w-sm mx-auto">
                <button onClick={() => router.push('/post/new')} className="flex items-center justify-center gap-2 bg-primary-600 text-white rounded-xl px-4 py-3 text-sm font-medium active:scale-95 transition-transform">
                  <span>🔎</span>{t('feed_cta_ask')}
                </button>
                <button onClick={() => router.push('/post/new')} className="flex items-center justify-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 active:scale-95 transition-transform">
                  <span>🔧</span>{t('feed_cta_service')}
                </button>
                <button onClick={() => router.push('/post/new')} className="flex items-center justify-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 active:scale-95 transition-transform">
                  <span>⚠️</span>{t('feed_cta_report')}
                </button>
                <button onClick={() => router.push('/post/new')} className="flex items-center justify-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 active:scale-95 transition-transform">
                  <span>🤝</span>{t('feed_cta_help')}
                </button>
              </div>
            )}
          </div>
          )
        ) : (
          <>
            {displayPosts.map((post, idx) => (
              <div key={post.id} data-tour={idx === 0 ? 'first-post' : undefined} style={{ animationDelay: `${Math.min(idx * 50, 300)}ms`, animationFillMode: 'backwards' }} className="animate-fade-in-up">
                <PostCard post={post} currentUserId={user.id} currentUserPhone={user.phone} currentUserRole={user.role} isBookmarked={bookmarkedIds.includes(post.id)} onDelete={(id) => setPosts(prev => prev.filter(p => p.id !== id))} />
              </div>
            ))}
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full py-3 text-sm text-primary-600 font-medium bg-white rounded-2xl border border-gray-100 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {loadingMore ? t('common_loading') : t('feed_load_more')}
              </button>
            )}
          </>
        )}
      </div>

      <BottomNav active="feed" isReadOnly={isReadOnly} />

      {showAsk && <QuickAskSheet onClose={() => setShowAsk(false)} />}

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
    </div>
  )
}
