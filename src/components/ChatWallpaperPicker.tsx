'use client'

import { useEffect, useState } from 'react'
import { CHAT_WALLPAPERS, getWallpaper, type ChatWallpaper } from '@/lib/chatWallpapers'
import { useLanguage } from '@/hooks/useLanguage'
import { useDragToDismiss } from '@/hooks/useDragToDismiss'

/**
 * Single source of truth for the chat wallpaper preference. Reads /
 * writes localStorage under the SAME key DM uses ('hai_chat_wallpaper')
 * so picking a wallpaper anywhere — DM thread or Square — applies
 * everywhere.
 *
 * Returns the resolved wallpaper object, the active id, a setter,
 * and a derived isDark flag the caller can hand straight into a
 * style={{ background: isDark ? wp.dark : wp.light }} prop.
 *
 * Cross-tab updates (e.g. picking a wallpaper in DM while Square is
 * also mounted in another tab) are honoured via the 'storage' event.
 */
const STORAGE_KEY = 'hai_chat_wallpaper'

export function useChatWallpaper() {
  const [id, setId] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE_KEY) || 'default' } catch { return 'default' }
  })
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof window !== 'undefined' && document.documentElement.classList.contains('dark'),
  )

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'))
    const obs = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  // Cross-tab + cross-surface sync: if DM changes the wallpaper while
  // Square is open (or vice versa), pick up the new id without a
  // reload. Same-tab updates already happen via setId().
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return
      if (e.newValue) setId(e.newValue)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setWallpaperId = (next: string) => {
    setId(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch {}
  }

  const wallpaper: ChatWallpaper = getWallpaper(id)
  return { id, wallpaper, isDark, setWallpaperId }
}

/**
 * Bottom-sheet picker for chat wallpapers. Same grid layout DM ships
 * inline today; lifting it here so Square (and any future chat-style
 * surface) can render the identical UX without duplicating JSX.
 */
interface PickerProps {
  open: boolean
  onClose: () => void
  currentId: string
  onSelect: (id: string) => void
}

export default function ChatWallpaperPicker({ open, onClose, currentId, onSelect }: PickerProps) {
  const { lang } = useLanguage()
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof window !== 'undefined' && document.documentElement.classList.contains('dark'),
  )

  useEffect(() => {
    if (!open) return
    setIsDark(document.documentElement.classList.contains('dark'))
    const obs = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [open])

  const drag = useDragToDismiss<HTMLDivElement, HTMLDivElement>({ open, onDismiss: onClose })

  if (!open) return null
  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />
      <div ref={drag.sheetRef} className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto z-50 bg-white dark:bg-gray-800 rounded-t-3xl shadow-2xl">
        <div ref={drag.handleRef} className="px-5 pt-3 pb-3 touch-none">
          <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-2" />
          <h3 className="font-bold text-gray-900 dark:text-white text-center">
            {lang === 'en' ? 'Chat Wallpaper' : 'خلفية المحادثة'}
          </h3>
        </div>
        <div className="px-5" style={{ paddingBottom: 'calc(var(--hai-safe-bottom, 0px) + 1.5rem)' }}>
          <div className="grid grid-cols-4 gap-3">
            {CHAT_WALLPAPERS.map(wp => (
              <button
                key={wp.id}
                type="button"
                onClick={() => { onSelect(wp.id); onClose() }}
                className={`relative rounded-2xl overflow-hidden h-24 border-2 transition-all active:scale-95 ${
                  currentId === wp.id ? 'border-primary-500 shadow-lg shadow-primary-500/20' : 'border-gray-200 dark:border-gray-600'
                }`}
              >
                <div className="absolute inset-0" style={{ background: isDark ? wp.dark : wp.light }} />
                <div className="absolute inset-0 flex flex-col justify-center items-center gap-1 px-1">
                  <div className="w-10 h-2.5 bg-primary-500 rounded-full opacity-60" />
                  <div className="w-8 h-2.5 bg-white dark:bg-gray-600 rounded-full opacity-40 self-start ml-1" />
                </div>
                {currentId === wp.id && (
                  <div className="absolute top-1 right-1 w-4 h-4 bg-primary-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-[8px] font-bold">✓</span>
                  </div>
                )}
                <p className="absolute bottom-1 left-0 right-0 text-[9px] text-center font-medium text-gray-600 dark:text-gray-300">
                  {lang === 'en' ? wp.nameEn : wp.nameAr}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
