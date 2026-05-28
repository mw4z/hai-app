'use client'

import { useState } from 'react'
import { FiBell, FiBellOff } from 'react-icons/fi'
import toast from 'react-hot-toast'
import { useLanguage } from '@/hooks/useLanguage'
import { hapticLight } from '@/lib/haptic'

interface Props {
  threadId: string
  initialFollowing: boolean
}

/** Follow / unfollow a Square thread. Optimistic toggle — flips the
 *  state immediately, reverts on failure. Visual: a small pill that
 *  shows the CURRENT state and what tapping will do. */
export default function SquareFollowButton({ threadId, initialFollowing }: Props) {
  const { t } = useLanguage()
  const [following, setFollowing] = useState(initialFollowing)
  const [pending, setPending] = useState(false)

  async function toggle() {
    if (pending) return
    hapticLight()
    const next = !following
    setFollowing(next)
    setPending(true)
    try {
      const res = await fetch(`/api/square/${threadId}/follow`, {
        method: next ? 'POST' : 'DELETE',
      })
      if (!res.ok) {
        setFollowing(!next)
        toast.error('—')
      }
    } catch {
      setFollowing(!next)
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-colors active:scale-95 ${
        following
          ? 'bg-primary-600 text-white'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
      }`}
      aria-pressed={following}
    >
      {following ? <FiBell className="w-3.5 h-3.5" /> : <FiBellOff className="w-3.5 h-3.5" />}
      <span>{following ? t('square_unfollow') : t('square_follow')}</span>
    </button>
  )
}
