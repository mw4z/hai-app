'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FiHome, FiMessageSquare, FiShoppingBag, FiUser, FiPlus } from 'react-icons/fi'
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

export default function BottomNav({
  active,
  isReadOnly = false,
  userRole,
  browseNeighborhoodId,
}: {
  active: string
  isReadOnly?: boolean
  userRole?: string
  browseNeighborhoodId?: string | null
}) {
  const { t, lang } = useLanguage()
  const router = useRouter()
  const confirm = useConfirm()
  const [msgCount, setMsgCount] = useState(0)

  const isSuperAdmin = userRole === 'SUPER_ADMIN'

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
    router.push('/post/new')
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

  return (
    <nav
      className="fixed bottom-0 right-0 left-0 mx-auto z-10"
      style={{
        maxWidth: 'var(--hai-max-width)',
        paddingBottom: 'max(env(safe-area-inset-bottom), var(--hai-space-2))',
        background: 'var(--hai-surface-1)',
        borderTop: '1px solid var(--hai-border)',
        boxShadow: 'var(--hai-shadow-md)',
      }}
    >
      <div className="flex items-stretch">
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

        {/* Center FAB — flat, token-driven. Sized to match the rhythm of
            the side tabs (icon size matches, total button footprint sits
            within the nav row, no floating/elevation). */}
        <div className="flex-1 flex justify-center items-center">
          <button
            onClick={handleNewPost}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform"
            style={{
              background: 'var(--hai-primary-500)',
            }}
            aria-label="new post"
          >
            <FiPlus className="w-5 h-5" strokeWidth={2.5} />
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
    </nav>
  )
}
