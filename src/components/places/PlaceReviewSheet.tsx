'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import { FiX } from 'react-icons/fi'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import StarRating from './StarRating'

/**
 * Compose / edit the caller's own review for a place. Reused
 * for both first-time creation and editing.
 *
 * Calls POST /api/directory/[id]/reviews — the server upserts
 * on (placeId, userId) so creating and updating share one
 * endpoint. On success, onSaved() fires so the parent can
 * refresh its review list + summary.
 */

interface Props {
  placeId: string
  open: boolean
  onClose: () => void
  onSaved: () => void
  /** Pre-fill values when editing the caller's existing review. */
  initialRating?: number
  initialBody?: string | null
}

const BODY_MAX = 500

export default function PlaceReviewSheet({
  placeId,
  open,
  onClose,
  onSaved,
  initialRating = 0,
  initialBody = '',
}: Props) {
  const [rating, setRating] = useState(initialRating)
  const [body, setBody] = useState(initialBody ?? '')
  const [saving, setSaving] = useState(false)

  // Sync local state with new initials when the parent reopens
  // the sheet for a different review (e.g. user dismissed +
  // tapped "edit" on someone else's flow). Compare via the
  // initial values directly — we WANT the reset on open.
  useEffect(() => {
    if (!open) return
    setRating(initialRating)
    setBody(initialBody ?? '')
    setSaving(false)
  }, [open, initialRating, initialBody])

  useBodyScrollLock(open)

  if (!open) return null
  if (typeof document === 'undefined' || !document.body) return null

  async function submit() {
    if (saving) return
    if (rating < 1 || rating > 5) {
      toast.error('اختر عدد النجوم')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/directory/${placeId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, body: body.trim() || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || 'تعذر إرسال التقييم')
        return
      }
      toast.success('تم إرسال التقييم')
      onSaved()
      onClose()
    } catch {
      toast.error('تعذر الاتصال')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[1100] bg-black/50 flex items-end justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[520px] bg-white dark:bg-gray-900 rounded-t-3xl flex flex-col max-h-[88vh]"
        dir="rtl"
      >
        <div className="px-4 pt-3 pb-2 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-2" />
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">
              قيّم المكان
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 active:bg-gray-100 dark:active:bg-gray-800"
            >
              <FiX className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-4">
          <div className="flex flex-col items-center pt-2">
            <StarRating value={rating} onChange={setRating} size={36} />
            <span className="mt-2 text-[12px] text-gray-500 dark:text-gray-400">
              {rating > 0 ? `${rating} / 5` : 'اختر عدد النجوم'}
            </span>
          </div>

          <label className="block">
            <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">
              اكتب ملاحظتك، اختياري
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
              maxLength={BODY_MAX}
              rows={4}
              className="input-field text-sm resize-none"
            />
            <span className="block text-[10px] text-gray-400 mt-1 text-end">
              {body.length}/{BODY_MAX}
            </span>
          </label>
        </div>

        <div
          className="flex-shrink-0 flex gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-b-3xl"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
        >
          <button
            type="button"
            onClick={submit}
            disabled={saving || rating < 1}
            className="flex-1 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-50 active:scale-95 transition-transform"
          >
            {saving ? 'جاري الإرسال…' : 'إرسال التقييم'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-500 dark:text-gray-400"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
