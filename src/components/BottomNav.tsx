'use client'

import { useState, useEffect } from 'react'
import { useDragToDismiss } from '@/hooks/useDragToDismiss'
import { useBodyScrollLock, consumeNextClick } from '@/hooks/useBodyScrollLock'
import { pushBackHandler } from '@/lib/backHandler'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { FiHome, FiMessageSquare, FiShoppingBag, FiUser, FiPlus, FiEdit3, FiSearch } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { hapticMedium } from '@/lib/haptic'
import { playTap } from '@/lib/sound'
import { useConfirm } from '@/components/ConfirmProvider'
import type { TranslationKey } from '@/lib/i18n'

const NAV_ITEMS: { key: string; href: string; icon: React.ComponentType<{ className?: string }>; tKey: TranslationKey; badgeKey?: 'messages' | 'other' }[] = [
  { key: 'feed',    href: '/feed',    icon: FiHome,          tKey: 'nav_feed'    },
  { key: 'market',  href: '/market',  icon: FiShoppingBag,   tKey: 'nav_market'  },
  // center FAB slot
  { key: 'threads', href: '/threads', icon: FiMessageSquare, tKey: 'nav_threads', badgeKey: 'messages' },
  { key: 'profile', href: '/profile', icon: FiUser,          tKey: 'nav_profile' },
]

// Only show the bottom tab bar on these top-level routes. Detail
// pages (post/[id], threads/[id], login, register, onboarding, …)
// don't get a nav. Kept as an allow-list so new detail pages are
// excluded by default.
const SHOW_BOTTOM_NAV_ON = new Set([
  '/feed',
  '/market',
  '/threads',
  '/profile',
  '/rides',
  '/mod',
  '/contests',
  '/neighborhood-reports',
  '/support',
])

function activeKeyForPath(path: string): string {
  if (path.startsWith('/feed')) return 'feed'
  if (path.startsWith('/market')) return 'market'
  if (path === '/threads') return 'threads'
  if (path.startsWith('/profile') || path.startsWith('/support')) return 'profile'
  return ''
}

export default function BottomNav({
  active: activeOverride,
  isReadOnly: isReadOnlyOverride,
  userRole: userRoleOverride,
  browseNeighborhoodId: browseNeighborhoodIdOverride,
}: {
  /** All four props are optional — when this component is mounted
   *  globally from layout.tsx it derives everything from hooks. The
   *  props remain so existing per-page mounts keep compiling during
   *  the hoist transition. */
  active?: string
  isReadOnly?: boolean
  userRole?: string
  browseNeighborhoodId?: string | null
}) {
  const { t, lang } = useLanguage()
  const router = useRouter()
  const confirm = useConfirm()
  const pathname = usePathname() || '/'
  const searchParams = useSearchParams()
  const [msgCount, setMsgCount] = useState(0)

  const active = activeOverride ?? activeKeyForPath(pathname)
  const queryNbhdId = searchParams?.get('neighborhood') || null
  const browseNeighborhoodId = browseNeighborhoodIdOverride ?? queryNbhdId
  const isReadOnly = isReadOnlyOverride ?? (pathname.startsWith('/feed') && !!queryNbhdId)

  // Role is fetched in-line on first mount when not supplied — the
  // /api/profile endpoint already returns it and is cheap.
  const [userRole, setUserRole] = useState<string | undefined>(userRoleOverride)
  useEffect(() => {
    if (userRole) return
    let cancelled = false
    fetch('/api/profile', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.role) setUserRole(d.role)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [userRole])

  const isSuperAdmin = userRole === 'SUPER_ADMIN'
  // Admins / mods skip the resident "suggest a poll" review flow
  // and post polls directly — the same tertiary entry-sheet link
  // routes them to /polls/new instead of /polls/request.
  const isPollAdmin =
    userRole === 'SUPER_ADMIN' || userRole === 'PLATFORM_MOD' || userRole === 'NEIGHBORHOOD_MOD'

  // FAB now opens a 2-option sheet: Post vs Ask neighbors. The split
  // came out of the Phase 3.5 cutover — Ask is its own entry point, not
  // a sub-toggle inside the post composer's category picker.
  const [showEntrySheet, setShowEntrySheet] = useState(false)

  // Swipe-down-to-dismiss for the entry sheet — same hook used by
  // QuickAskSheet, ImageSourceSheet, etc. The drag handle sits at the
  // top of the sheet; vertical drag past the threshold calls onDismiss.
  const entryDrag = useDragToDismiss<HTMLDivElement, HTMLDivElement>({
    open: showEntrySheet,
    onDismiss: () => setShowEntrySheet(false),
  })

  // Shared iOS-safe scroll lock — see useBodyScrollLock.
  useBodyScrollLock(showEntrySheet)

  // Back-press isolation: hardware back / swipe-back close the sheet
  // instead of navigating off the current tab.
  useEffect(() => {
    if (!showEntrySheet) return
    return pushBackHandler(() => setShowEntrySheet(false))
  }, [showEntrySheet])

  async function handleNewPost() {
    hapticMedium()
    playTap()
    if (isReadOnly) {
      // SUPER_ADMIN can post into any neighborhood — skip the confirm
      // and deep-link straight to the post-new form with the currently
      // browsed neighborhood pre-selected in the picker.
      if (isSuperAdmin && browseNeighborhoodId) {
        router.push(`/post/new?neighborhood=${encodeURIComponent(browseNeighborhoodId)}`)
        return
      }
      // Everyone else: posting belongs to your own neighborhood. Prompt
      // and offer to go back to the user's home feed.
      const ok = await confirm({
        title: lang === 'en'
          ? 'Not your neighborhood'
          : lang === 'ur'
            ? 'آپ کا محلہ نہیں'
            : 'هذا ليس حيّك',
        message: lang === 'en'
          ? "You're browsing another neighborhood. Posts can only be created in your own. Go back to your neighborhood?"
          : lang === 'ur'
            ? 'آپ کسی دوسرے محلے کو دیکھ رہے ہیں۔ پوسٹ صرف اپنے محلے میں بنائی جا سکتی ہے۔ کیا واپس اپنے محلے پر جائیں؟'
            : 'أنت تتصفح حياً آخر. لا يمكن إنشاء منشور إلا في حيّك. الرجوع إلى حيّك؟',
        confirmText: lang === 'en' ? 'Go to my neighborhood' : lang === 'ur' ? 'اپنے محلے پر جائیں' : 'الرجوع إلى حيّي',
        cancelText: lang === 'en' ? 'Stay here' : lang === 'ur' ? 'یہیں رہیں' : 'البقاء هنا',
      })
      if (ok) router.push('/feed')
      return
    }
    setShowEntrySheet(true)
  }

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch('/api/notifications/unread')
        if (res.ok) {
          const data = await res.json()
          setMsgCount(data.messages || 0)
        }
      } catch { /* ignore */ }
    }
    check()
    const interval = setInterval(check, 5000)
    return () => clearInterval(interval)
  }, [])

  // Self-hide on routes that shouldn't have a bottom tab bar. Allow
  // legacy callers that pass an explicit `active` to force-render
  // (e.g. a one-off screen that opts in).
  if (!activeOverride && !SHOW_BOTTOM_NAV_ON.has(pathname)) return null

  return (
    <nav
      data-firstrun="bottom-nav"
      className="fixed bottom-0 right-0 left-0 z-10"
      style={{
        // Full-width background on tablets/iPad so the tab bar spans
        // the screen like a standard system bar, instead of floating as
        // a 480px pill with empty gutters on either side.
        paddingBottom: 'max(var(--hai-safe-bottom), var(--hai-space-2))',
        background: 'var(--hai-surface-1)',
        borderTop: '1px solid var(--hai-border)',
        boxShadow: 'var(--hai-shadow-md)',
      }}
    >
      <div
        className="flex items-stretch mx-auto"
        style={{ maxWidth: 'var(--hai-max-width)' }}
      >
        {/* Left two tabs: Home, Market */}
        {NAV_ITEMS.slice(0, 2).map((item) => {
          const Icon = item.icon
          const isActive = active === item.key
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
                isActive ? 'text-primary-600' : 'text-gray-400'
              }`}
            >
              <div className={`relative ${isActive ? 'glow-tab' : ''}`}>
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-medium">{t(item.tKey)}</span>
            </Link>
          )
        })}

        {/* Center FAB — large, raised, glowing, with explicit label.
            Triggered after a non-tech user couldn't find the publish
            button. Sized 64px so it's visibly the dominant element on
            the bar. White ring around it separates the button from
            the dark/light bar background; brand drop-shadow says
            "tap me". Label sits clearly below the button. */}
        <div className="flex-1 flex flex-col items-center justify-end relative" style={{ paddingTop: 8 }}>
          <button
            onClick={handleNewPost}
            data-tour="post-button"
            className="relative w-16 h-16 -translate-y-5 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform"
            style={{
              background: 'linear-gradient(135deg, var(--hai-primary-500) 0%, var(--hai-primary-600) 100%)',
              boxShadow:
                '0 10px 24px -4px rgba(0, 109, 87, 0.55), ' +
                '0 6px 10px -2px rgba(0, 0, 0, 0.20), ' +
                '0 0 0 4px var(--hai-surface-1)', // white/dark-bg ring around the FAB
            }}
            aria-label="new post"
          >
            {/* Pulsing brand glow ring — uses the existing
                animate-pulse-glow keyframe (already in globals.css). */}
            <span
              aria-hidden="true"
              className="absolute -inset-1 rounded-full animate-pulse-glow"
            />
            <FiPlus className="w-8 h-8 relative" strokeWidth={3} />
          </button>
        </div>

        {/* Right two tabs: Chat, Profile */}
        {NAV_ITEMS.slice(2).map((item) => {
          const Icon = item.icon
          const isActive = active === item.key
          const badge = item.badgeKey === 'messages' ? msgCount : 0
          return (
            <Link
              key={item.key}
              href={item.href}
              data-tour={item.key === 'profile' ? 'profile-tab' : undefined}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
                isActive ? 'text-primary-600' : 'text-gray-400'
              }`}
            >
              <div className={`relative ${isActive ? 'glow-tab' : ''}`}>
                <Icon className="w-5 h-5" />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 glow-badge">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{t(item.tKey)}</span>
            </Link>
          )
        })}
      </div>

      {/* Post / Ask entry-point sheet — redesigned as two large
          gradient tile cards with distinct visual identities so the
          chooser feels intentional rather than a generic action sheet.
          Each tile carries its own brand color, oversized icon in a
          ringed circle, decorative background icon at low opacity, and
          a title + subtitle stack. */}
      {showEntrySheet && (
        <div
          className="fixed inset-0 z-[1000] bg-black/50 backdrop-blur-sm flex items-end justify-center"
          // Tap anywhere outside the sheet → dismiss. onPointerDown
          // catches both touch and mouse synchronously (onClick on a
          // backdrop sometimes loses to a child's pointer-up on
          // Android WebView).
          onPointerDown={(e) => {
            if (e.target !== e.currentTarget) return
            // Prevent iOS ghost-click on the element under the tap
            // (a feed post, a tab icon, etc.) once the sheet closes.
            e.preventDefault()
            consumeNextClick()
            setShowEntrySheet(false)
          }}
        >
          <div
            ref={entryDrag.sheetRef}
            className="w-full max-w-[480px] bg-white dark:bg-gray-900 rounded-t-3xl p-5 animate-slide-up"
            // Stop pointer events on the sheet itself from bubbling up
            // to the backdrop's dismiss handler.
            onPointerDown={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'calc(var(--hai-safe-bottom, 0px) + 1.25rem)' }}
          >
            {/* Drag handle area — touchmove on this element drives
                the swipe-down dismiss. Made tall enough (touch-none on
                a generous hit area) for thumb reach. */}
            <div ref={entryDrag.handleRef} className="touch-none -mx-5 px-5 -mt-5 pt-5 pb-1 cursor-grab">
              <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-4" />
            </div>

            <div className="text-center mb-5">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {t('post_or_ask')}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t('post_or_ask_sub')}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* POST tile — brand teal gradient */}
              <button
                onClick={() => { setShowEntrySheet(false); router.push('/post/new') }}
                className="relative overflow-hidden rounded-2xl p-4 text-start active:scale-[0.97] transition-transform shadow-md"
                style={{
                  background: 'linear-gradient(135deg, #00b894 0%, #00a884 50%, #006d57 100%)',
                  minHeight: 150,
                }}
              >
                {/* Decorative oversized icon at bottom-end, low opacity */}
                <FiEdit3
                  className="absolute -bottom-3 -end-3 w-24 h-24 text-white/10"
                  aria-hidden="true"
                />
                {/* Foreground icon in ringed circle */}
                <div className="relative z-10 w-11 h-11 rounded-full bg-white/20 ring-1 ring-white/30 flex items-center justify-center mb-3 backdrop-blur-sm">
                  <FiEdit3 className="w-5 h-5 text-white" />
                </div>
                <h3 className="relative z-10 text-base font-bold text-white leading-tight">
                  {t('post_entry_post')}
                </h3>
                <p className="relative z-10 text-[11px] text-white/85 mt-1 leading-snug">
                  {t('post_entry_post_sub')}
                </p>
              </button>

              {/* ASK tile — sky blue gradient (distinct from POST) */}
              <button
                onClick={() => { setShowEntrySheet(false); router.push('/ask') }}
                className="relative overflow-hidden rounded-2xl p-4 text-start active:scale-[0.97] transition-transform shadow-md"
                style={{
                  background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 50%, #075985 100%)',
                  minHeight: 150,
                }}
              >
                <FiSearch
                  className="absolute -bottom-3 -end-3 w-24 h-24 text-white/10"
                  aria-hidden="true"
                />
                <div className="relative z-10 w-11 h-11 rounded-full bg-white/20 ring-1 ring-white/30 flex items-center justify-center mb-3 backdrop-blur-sm">
                  <FiSearch className="w-5 h-5 text-white" />
                </div>
                <h3 className="relative z-10 text-base font-bold text-white leading-tight">
                  {t('post_entry_ask')}
                </h3>
                <p className="relative z-10 text-[11px] text-white/85 mt-1 leading-snug">
                  {t('post_entry_ask_sub')}
                </p>
              </button>
            </div>

            {/* Tertiary entry — small link, not a tile.
                Role-aware destination:
                  - Resident → /polls/request (suggest a poll, mod
                    reviews before publication).
                  - Admin / mod → /polls/new (direct poll creation,
                    no review). Same surface, same affordance —
                    only the route + label differ. */}
            <button
              type="button"
              onClick={() => {
                setShowEntrySheet(false)
                router.push(isPollAdmin ? '/polls/new' : '/polls/request')
              }}
              className="w-full mt-3 py-2 text-xs font-semibold text-primary-600 dark:text-primary-400 active:opacity-70 transition-opacity"
            >
              {isPollAdmin
                ? `📊 ${lang === 'en' ? 'Create a poll' : lang === 'ur' ? 'پول بنائیں' : 'إنشاء تصويت'}`
                : `💡 ${lang === 'en' ? 'Suggest a poll to the mod' : lang === 'ur' ? 'منتظم کو پول تجویز کریں' : 'اقترح استفتاء للمشرف'}`}
            </button>

            <button
              onClick={() => setShowEntrySheet(false)}
              className="w-full mt-1 py-2.5 text-sm font-medium text-gray-500 dark:text-gray-400 active:scale-[0.98] transition-transform"
            >
              {t('post_or_ask_cancel')}
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
