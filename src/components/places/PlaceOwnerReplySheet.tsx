'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import { FiX } from 'react-icons/fi'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'

/**
 * Compose / edit the claimed owner's single reply to a review.
 *
 * Server-side gate (POST /api/directory/[id]/reviews/[reviewId]/reply):
 *   - Caller must be place.claimedByUserId.
 *   - Review must be VISIBLE.
 *   - Empty body clears the existing reply.
 */

interface Props {
  placeId: string
  reviewId: string
  open: boolean
  onClose: () => void
  onSaved: () => void
  initialBody?: string | null
}

const REPLY_MAX = 500

export default function PlaceOwnerReplySheet({
  placeId,
  reviewId,
  open,
  onClose,
  onSaved,
  initialBody = '',
}: Props) {
  const [body, setBody] = useState(initialBody ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setBody(initialBody ?? '')
    setSaving(false)
  }, [open, initialBody])

  useBodyScrollLock(open)

  if (!open) return null
  if (typeof document === 'undefined' || !document.body) return null

  async function submit() {
    if (saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/directory/${placeId}/reviews/${reviewId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || 'تعذر نشر الرد')
        return
      }
      toast.success('تم نشر الرد')
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
              رد صاحب المكان
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

        <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-3">
          <label className="block">
            <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">
              اكتب ردك
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, REPLY_MAX))}
              maxLength={REPLY_MAX}
              rows={4}
              className="input-field text-sm resize-none"
            />
            <span className="block text-[10px] text-gray-400 mt-1 text-end">
              {body.length}/{REPLY_MAX}
            </span>
          </label>
          {initialBody && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
              يمكنك تفريغ الحقل وإرسال رد فارغ لحذف ردك.
            </p>
          )}
        </div>

        <div
          className="flex-shrink-0 flex gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-b-3xl"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)' }}
        >
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-50 active:scale-95 transition-transform"
          >
            {saving ? 'جاري النشر…' : 'نشر الرد'}
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
