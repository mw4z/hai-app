'use client'

/**
 * Bottom-sheet chooser asking "Take Photo" or "From Gallery".
 *
 * Mirrors the sheet ChatClient already uses; pulled into a shared
 * component so the same chooser appears everywhere a user adds a
 * photo (new post, post edit, support, etc.). The parent handles the
 * actual pick — this component only renders the UI and emits intent.
 */

import { useEffect } from 'react'
import { FiCamera, FiImage } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { t as translate } from '@/lib/i18n'

interface Props {
  open: boolean
  onClose: () => void
  onCamera: () => void
  onGallery: () => void
}

export default function ImageSourceSheet({ open, onClose, onCamera, onGallery }: Props) {
  const { lang } = useLanguage()

  // Lock body scroll while the sheet is open so taps outside the sheet
  // dismiss it instead of scrolling the page underneath.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/40 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] bg-white dark:bg-gray-800 rounded-t-3xl p-4 pb-6 space-y-2 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
      >
        <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-3" />
        <button
          onClick={() => { onClose(); onCamera() }}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-gray-50 dark:bg-gray-700 active:scale-[0.98] transition-transform"
        >
          <FiCamera className="w-5 h-5 text-primary-600" />
          <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
            {lang === 'en' ? 'Take Photo' : lang === 'ur' ? 'تصویر لیں' : 'التقاط صورة'}
          </span>
        </button>
        <button
          onClick={() => { onClose(); onGallery() }}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-gray-50 dark:bg-gray-700 active:scale-[0.98] transition-transform"
        >
          <FiImage className="w-5 h-5 text-primary-600" />
          <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
            {lang === 'en' ? 'From Gallery' : lang === 'ur' ? 'لائبریری سے' : 'من المعرض'}
          </span>
        </button>
        <button
          onClick={onClose}
          className="w-full py-3 mt-2 rounded-xl text-sm font-medium text-gray-500 dark:text-gray-400"
        >
          {translate('profile_cancel', lang)}
        </button>
      </div>
    </div>
  )
}
