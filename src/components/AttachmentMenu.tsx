'use client'

import { useEffect } from 'react'
import { FiX } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { hapticLight } from '@/lib/haptic'
import { pushBackHandler } from '@/lib/backHandler'

interface Props {
  open: boolean
  onClose: () => void
  onPickImage: () => void
  onPickContact: () => void
  onPickLocation: () => void
  /** Optional — when provided, a "Document" (PDF) row is rendered as
   *  the fourth menu option. Surfaces that don't yet handle PDFs
   *  (legacy callers) omit this prop and the row simply doesn't render. */
  onPickDocument?: () => void
  /**
   * Visual variant. 'chat' renders on a dark/translucent input area
   * (the ChatClient composer) so the menu uses a brighter elevated
   * card. 'comment' renders inside the comments sheet (already on a
   * light surface) so the menu is tighter and uses theme tokens.
   */
  variant?: 'chat' | 'comment'
}

/**
 * Single-tap attachment chooser. Replaces the 3-button image / contact
 * / location row that was crowding the chat and comment composers.
 *
 * Layout: floating card anchored to the start (bottom) of the
 * composer's button row, with a transparent click-catching backdrop
 * behind it. Three tappable rows, each with an icon, title, and a
 * one-line subtitle, brand-coloured for clarity (image=primary,
 * contact=primary, location=sky to match LocationChip).
 *
 * Animation: backdrop fades, card scales in from 95% with a soft
 * blur — origin set to the bottom corner so it visually pops out of
 * the attach button. CSS-only via existing `animate-fade-in` /
 * `animate-scale-in-up` helpers in globals.css.
 */
export default function AttachmentMenu({
  open,
  onClose,
  onPickImage,
  onPickContact,
  onPickLocation,
  onPickDocument,
  variant = 'chat',
}: Props) {
  const { lang } = useLanguage()

  // ESC closes
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Android hardware back / iOS swipe-back: register close as the
  // top back-press handler so a back press dismisses the menu
  // instead of navigating away from the post detail / chat thread.
  // Stack is LIFO — if a confirm dialog opens on top of this menu,
  // it'll handle back first.
  useEffect(() => {
    if (!open) return
    return pushBackHandler(onClose)
  }, [open, onClose])

  if (!open) return null

  const tr = (en: string, ar: string, ur: string) =>
    lang === 'en' ? en : lang === 'ur' ? ur : ar

  // Each option is rendered as a button. Wrapping the click handler
  // in a closer-first wrapper guarantees the menu unmounts BEFORE
  // the picker opens — otherwise the map / image overlays z-stack
  // under the menu and feel wrong.
  const wrap = (fn: () => void) => () => {
    hapticLight()
    onClose()
    // Defer to next tick so React unmounts the menu first.
    setTimeout(fn, 16)
  }

  const options = [
    {
      key: 'image',
      onClick: wrap(onPickImage),
      icon: '🖼️',
      title: tr('Photo', 'صورة', 'تصویر'),
      subtitle: tr('From gallery or camera', 'من المعرض أو الكاميرا', 'گیلری یا کیمرہ سے'),
      tint: 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300',
    },
    {
      key: 'contact',
      onClick: wrap(onPickContact),
      icon: '📱',
      title: tr('Contact', 'جهة اتصال', 'رابطہ'),
      subtitle: tr('Pick a phone contact', 'اختر من جهات اتصالك', 'فون رابطہ منتخب کریں'),
      tint: 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300',
    },
    {
      key: 'location',
      onClick: wrap(onPickLocation),
      icon: '📍',
      title: tr('Location', 'موقع', 'مقام'),
      subtitle: tr('Pick a point on the map', 'اختر من الخريطة', 'نقشے سے منتخب کریں'),
      tint: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300',
    },
    // Document row only renders when the caller wired up a handler.
    // Surfaces that don't yet support PDF (or never will, e.g. ride
    // messages) omit onPickDocument and the row disappears.
    ...(onPickDocument
      ? [
          {
            key: 'document',
            onClick: wrap(onPickDocument),
            icon: '📄',
            title: tr('Document', 'مستند PDF', 'PDF دستاویز'),
            subtitle: tr(
              'Attach a PDF (max 25MB)',
              'إرفاق ملف PDF (أقصى 25 ميقا)',
              'PDF منسلک کریں (زیادہ سے زیادہ 25MB)',
            ),
            tint: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300',
          },
        ]
      : []),
  ]

  const cardClass =
    variant === 'comment'
      ? 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
      : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700'

  return (
    <>
      {/* Backdrop — full-screen, transparent. Tap anywhere to close.
          Uses onPointerDown + preventDefault + consumeNextClick to
          suppress the iOS ghost-click on whatever sits underneath. */}
      <div
        className="fixed inset-0 z-[80] animate-fade-in"
        onPointerDown={async (e) => {
          if (e.target !== e.currentTarget) return
          e.preventDefault()
          const { consumeNextClick } = await import('@/hooks/useBodyScrollLock')
          consumeNextClick()
          onClose()
        }}
      />

      {/* Menu card — anchored to the bottom-start (start = right in
          RTL, left in LTR) of the viewport. The composers sit right
          above the bottom safe-area, so anchoring here puts the
          menu floating over the composer's attach button.

          z-[81] so it sits above the backdrop (80) and any overlapping
          composer chrome. */}
      <div
        role="menu"
        className={`fixed z-[81] start-3 bottom-[88px] max-w-[280px] w-[calc(100vw-1.5rem)] rounded-2xl shadow-2xl overflow-hidden origin-bottom-right ${cardClass}`}
        style={{
          animation: 'attachmentMenuPop 180ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
        }}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {tr('Attach', 'إرفاق', 'منسلک کریں')}
          </span>
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onClose()
            }}
            className="p-1 -m-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 active:scale-90 transition-transform"
            aria-label={tr('Close', 'إغلاق', 'بند کریں')}
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>
        <div className="pb-2">
          {options.map((opt, i) => (
            <button
              key={opt.key}
              type="button"
              onClick={opt.onClick}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-start active:bg-gray-50 dark:active:bg-gray-700/50 transition-colors"
              style={{
                animation: `attachmentRowIn 220ms cubic-bezier(0.22, 1, 0.36, 1) ${40 + i * 35}ms both`,
              }}
            >
              <span
                className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${opt.tint}`}
              >
                {opt.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-900 dark:text-white leading-tight">
                  {opt.title}
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight mt-0.5 truncate">
                  {opt.subtitle}
                </p>
              </div>
              <span className="text-gray-300 dark:text-gray-600 text-base" aria-hidden="true">
                ›
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Inline keyframes — kept here instead of globals.css so the
          menu component is self-contained and can be dropped into
          any composer without a CSS import. Two keyframes:
          - menu pop: scale + fade with a soft overshoot
          - row stagger: small slide + fade per row */}
      <style jsx>{`
        @keyframes attachmentMenuPop {
          0% {
            opacity: 0;
            transform: scale(0.9) translateY(8px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes attachmentRowIn {
          0% {
            opacity: 0;
            transform: translateY(6px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  )
}
