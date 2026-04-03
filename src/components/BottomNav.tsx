'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FiHome, FiMessageSquare, FiShoppingBag, FiUser, FiPlus } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
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
              className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 transition-colors ${
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
        <div className="flex-1 flex justify-center" style={{ marginTop: -14 }}>
          <button
            onClick={() => router.push('/post/new')}
            className="w-[52px] h-[52px] bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform"
          >
            <FiPlus className="w-6 h-6" />
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
              className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 transition-colors ${
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
