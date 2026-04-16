'use client'

import { useCallback } from 'react'
import toast from 'react-hot-toast'
import { FiPhone, FiCopy } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { hapticLight } from '@/lib/haptic'

// WhatsApp icon — inline SVG to avoid adding a dependency
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

interface Props {
  name: string
  phone: string
}

/**
 * Inline contact card rendered inside comments/chat messages when a
 * `📱 Name — +phone` snippet is detected. Shows the contact info with
 * three quick-action buttons: Call, Copy, WhatsApp.
 */
export default function ContactChip({ name, phone }: Props) {
  const { lang } = useLanguage()

  const cleanPhone = phone.replace(/[^\d+]/g, '')

  const handleCall = useCallback(() => {
    hapticLight()
    window.open(`tel:${cleanPhone}`, '_self')
  }, [cleanPhone])

  const handleCopy = useCallback(() => {
    hapticLight()
    navigator.clipboard?.writeText(cleanPhone).then(() => {
      toast.success(lang === 'en' ? 'Copied!' : lang === 'ur' ? 'کاپی ہو گیا!' : 'تم النسخ!')
    }).catch(() => {})
  }, [cleanPhone, lang])

  const handleWhatsApp = useCallback(() => {
    hapticLight()
    const num = cleanPhone.startsWith('+') ? cleanPhone.slice(1) : cleanPhone
    window.open(`https://wa.me/${num}`, '_blank')
  }, [cleanPhone])

  return (
    <div
      className="flex flex-col gap-2 bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800 rounded-2xl px-4 py-3 my-1.5 w-full"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-9 h-9 rounded-full bg-primary-100 dark:bg-primary-800/60 flex items-center justify-center flex-shrink-0">
          <span className="text-base">📱</span>
        </div>
        <div className="min-w-0 flex-1">
          {name && (
            <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{name}</p>
          )}
          <p className="text-xs text-primary-700 dark:text-primary-300 font-semibold tabular-nums" dir="ltr">
            {phone}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleCall}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-primary-600 text-white rounded-xl text-xs font-bold active:scale-[0.97] transition-transform"
        >
          <FiPhone className="w-3.5 h-3.5" />
          {lang === 'en' ? 'Call' : lang === 'ur' ? 'کال' : 'اتصال'}
        </button>
        <button
          onClick={handleCopy}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-bold active:scale-[0.97] transition-transform"
        >
          <FiCopy className="w-3.5 h-3.5" />
          {lang === 'en' ? 'Copy' : lang === 'ur' ? 'کاپی' : 'نسخ'}
        </button>
        <button
          onClick={handleWhatsApp}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-[#25D366] text-white rounded-xl text-xs font-bold active:scale-[0.97] transition-transform"
        >
          <WhatsAppIcon className="w-3.5 h-3.5" />
          {lang === 'en' ? 'WhatsApp' : 'واتساب'}
        </button>
      </div>
    </div>
  )
}

/**
 * Regex to detect `📱 Name — +phone` or `📱 +phone` snippets in text.
 * Returns an array of segments: either plain strings or { name, phone } objects.
 */
const CONTACT_RE = /📱\s*(?:(.+?)\s*[—–-]\s*)?(\+?\d[\d\s()-]{6,}\d)/g

export type TextSegment = string | { name: string; phone: string }

export function parseContactSnippets(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  CONTACT_RE.lastIndex = 0
  while ((match = CONTACT_RE.exec(text)) !== null) {
    const start = match.index
    if (start > lastIndex) {
      segments.push(text.slice(lastIndex, start))
    }
    segments.push({
      name: (match[1] || '').trim(),
      phone: (match[2] || '').trim(),
    })
    lastIndex = start + match[0].length
  }

  if (lastIndex < text.length) {
    segments.push(text.slice(lastIndex))
  }

  return segments.length > 0 ? segments : [text]
}
