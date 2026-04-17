'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FiHome, FiMessageSquare, FiShoppingBag, FiUser, FiPlus } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { hapticMedium } from '@/lib/haptic'
import { playTap } from '@/lib/sound'
import type { TranslationKey } from '@/lib/i18n'

const NAV_ITEMS: { key: string; href: string; icon: React.ComponentType<{ className?: string }>; tKey: TranslationKey; badgeKey?: 'messages' | 'other' }[] = [
  { key: 'feed',    href: '/feed',    icon: FiHome,          tKey: 'nav_feed'    },
  { key: 'market',  href: '/market',  icon: FiShoppingBag,   tKey: 'nav_market'  },
  // center FAB slot
  { key: 'threads', href: '/threads', icon: FiMessageSquare, tKey: 'nav_threads', badgeKey: 'messages' },
  { key: 'profile', href: '/profile', icon: FiUser,          tKey: 'nav_profile' },
]

export default function BottomNav({ active }: { active: string }) {
  const { t } = useLanguage()
  const router = useRouter()
  const [msgCount, setMsgCount] = useState(0)

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
    <nav className="fixed bottom-0 right-0 left-0 max-w-[480px] mx-auto glass-bottom z-10" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}>
      <div className="flex items-end">
        {/* Left two tabs: Home, Market */}
        {NAV_ITEMS.slice(0, 2).map((item) => {
          const Icon = item.icon
          const isActive = active === item.key
          return (
            <Link
              key={item.key}
              href={item.href}
              onClick={() => { hapticMedium(); playTap() }}
              className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 transition-colors active:scale-[0.92] active:opacity-80 ${
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

        {/* Center FAB */}
        <div className="flex-1 flex justify-center" style={{ marginTop: -20 }}>
          <button
            onClick={() => { hapticMedium(); playTap(); router.push('/post/new') }}
            className="fab-glow relative w-[58px] h-[58px] rounded-full flex items-center justify-center text-white active:scale-95 transition-transform"
            style={{
              background: 'radial-gradient(circle at 30% 30%, #34d399 0%, #16a34a 50%, #14532d 100%)',
              boxShadow: '0 6px 20px -2px rgba(22, 163, 74, 0.55), 0 2px 6px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
            }}
            aria-label="new post"
          >
            {/* Outer soft ring */}
            <span className="absolute inset-0 rounded-full ring-[3px] ring-white/60 dark:ring-gray-900/60" />
            {/* Icon */}
            <FiPlus className="w-7 h-7 relative z-10 drop-shadow-sm" />
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
              onClick={() => { hapticMedium(); playTap() }}
              className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 transition-colors active:scale-[0.92] active:opacity-80 ${
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
