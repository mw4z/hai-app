'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { FiMoreHorizontal } from 'react-icons/fi'
import StarRating from './StarRating'
import PlaceReviewSheet from './PlaceReviewSheet'
import PlaceOwnerReplySheet from './PlaceOwnerReplySheet'
import { useConfirm } from '@/components/ConfirmProvider'
import HaiLoader from '@/components/HaiLoader'

/**
 * Review section rendered inside the place detail page. Three
 * variants of state per row:
 *   - normal: someone else's review, optionally with the
 *     owner's reply nested beneath
 *   - mine: caller's own review; shown with edit + delete
 *     affordances. If the caller's review is HIDDEN_BY_MOD or
 *     DELETED_BY_USER, server still returns it via /reviews
 *     `mine` field so we can render a status banner.
 *   - owner viewing someone else's review: shows a "رد صاحب
 *     المكان" button when there's no reply yet; once replied,
 *     the reply is rendered inline and the owner can edit it.
 *
 * Server endpoints used:
 *   GET    /api/directory/[id]/reviews
 *   POST   /api/directory/[id]/reviews                 (mine)
 *   DELETE /api/directory/[id]/reviews/mine             (mine)
 *   POST   /api/directory/[id]/reviews/[id]/reply       (owner)
 */

interface ReviewerLite {
  id: string
  name: string | null
  avatarUrl: string | null
  providerStatus: string | null
}

interface ApiReview {
  id: string
  rating: number
  body: string | null
  createdAt: string
  updatedAt: string
  ownerReplyBody: string | null
  ownerReplyAt: string | null
  user: ReviewerLite
  ownerReplyByUser: ReviewerLite | null
}

interface ApiMine {
  id: string
  rating: number
  body: string | null
  status: 'VISIBLE' | 'HIDDEN_BY_MOD' | 'DELETED_BY_USER'
  createdAt: string
  updatedAt: string
  ownerReplyBody: string | null
  ownerReplyAt: string | null
}

interface Props {
  placeId: string
  /** Initial average / count from PlaceListing — updated when
   *  the user refreshes the reviews list. */
  initialAvg: number
  initialCount: number
  /** Caller-side computed: is the viewer the claimed owner of
   *  this place? Drives owner-reply affordances. */
  isOwner: boolean
  /** Caller-side computed: did the viewer originally add this
   *  place? Drives the "you added this — can't review" hint. */
  isCreator: boolean
  /** Caller-side computed: can the viewer submit a review at
   *  all? False for owner / creator / cross-nbhd residents. */
  canReview: boolean
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'الآن'
  if (mins < 60) return `قبل ${mins} د`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `قبل ${hrs} س`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `قبل ${days} يوم`
  const months = Math.floor(days / 30)
  return `قبل ${months} شهر`
}

export default function PlaceReviewsSection({
  placeId,
  initialAvg,
  initialCount,
  isOwner,
  isCreator,
  canReview,
}: Props) {
  const [avg, setAvg] = useState(initialAvg)
  const [count, setCount] = useState(initialCount)
  const [reviews, setReviews] = useState<ApiReview[]>([])
  const [mine, setMine] = useState<ApiMine | null>(null)
  const [loading, setLoading] = useState(true)
  const [reviewSheetOpen, setReviewSheetOpen] = useState(false)
  // reviewId currently being replied to (owner mode). null = closed.
  const [replyingTo, setReplyingTo] = useState<{ reviewId: string; existing: string | null } | null>(null)
  // Which review's kebab (⋯) menu is currently open. null = all closed.
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null)
  // In-app confirm dialog (replaces native window.confirm so the
  // sheet UX matches the rest of the app and Capacitor doesn't
  // pop a native system dialog).
  const confirmDialog = useConfirm()

  // Close the kebab on outside click. Listening at document
  // level + comparing to a ref lets us avoid a portal.
  const menuRootRef = useRef<HTMLUListElement>(null)
  useEffect(() => {
    if (!openMenuFor) return
    function onPointer(e: PointerEvent) {
      if (!menuRootRef.current) return
      if (menuRootRef.current.contains(e.target as Node)) return
      setOpenMenuFor(null)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenMenuFor(null)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [openMenuFor])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/directory/${placeId}/reviews`, {
        credentials: 'include',
        cache: 'no-store',
      })
      if (!res.ok) {
        setReviews([])
        setMine(null)
        return
      }
      const data = await res.json()
      setReviews(Array.isArray(data.reviews) ? data.reviews : [])
      setMine(data.mine ?? null)
      if (data.summary) {
        setAvg(data.summary.avg ?? 0)
        setCount(data.summary.count ?? 0)
      }
    } finally {
      setLoading(false)
    }
  }, [placeId])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function deleteMine() {
    if (!mine) return
    const ok = await confirmDialog({
      message: 'هل تريد حذف تقييمك؟',
      variant: 'danger',
      confirmText: 'حذف',
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/directory/${placeId}/reviews/mine`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || 'تعذر الحذف')
        return
      }
      toast.success('تم حذف تقييمك')
      refresh()
    } catch {
      toast.error('تعذر الاتصال')
    }
  }

  async function reportReview(reviewId: string) {
    const ok = await confirmDialog({
      message: 'هل تريد الإبلاغ عن هذا التقييم؟',
      variant: 'danger',
      confirmText: 'إبلاغ',
    })
    if (!ok) return
    try {
      // Mirrors the post-report UX: a single tap fires the
      // report with reason=OTHER. Picker UI can be added later
      // if mods want richer signal.
      const res = await fetch(
        `/api/directory/${placeId}/reviews/${reviewId}/report`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'OTHER' }),
        },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || 'تعذر الإبلاغ')
        return
      }
      toast.success(
        data.hidden
          ? 'تم الإبلاغ — وتمّ إخفاء التقييم'
          : 'تم الإبلاغ، سيراجعه المشرف',
      )
      refresh()
    } catch {
      toast.error('تعذر الاتصال')
    }
  }

  async function shareReview(r: ApiReview) {
    // Web Share API on native (Capacitor iOS / Android share
    // sheet) and modern web browsers. Falls back to copy-to-
    // clipboard everywhere else. The URL points at the place
    // detail page — the reviewer's content surfaces there in
    // context.
    const base =
      typeof window !== 'undefined' ? window.location.origin : 'https://app.hai-app.net'
    const url = `${base}/directory/${placeId}`
    const text = r.body
      ? `${r.user.name || 'جار'} (${r.rating}/5):\n${r.body}\n\n${url}`
      : `${r.user.name || 'جار'} قيّم المكان ${r.rating}/5\n${url}`
    try {
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        await (navigator as any).share({ title: 'تقييم من دليل الحي', text, url })
        return
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text)
        toast.success('نسخ الرابط')
        return
      }
      toast.error('تعذر المشاركة')
    } catch {
      // User cancelled the native share sheet — silent.
    }
  }

  return (
    <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-1">
            تقييمات أهل الحي
          </h2>
          {count > 0 ? (
            <div className="flex items-center gap-2">
              <StarRating value={avg} size={18} />
              <span className="text-[13px] font-bold text-gray-800 dark:text-gray-100" dir="ltr">
                {avg.toFixed(1)}
              </span>
              <span className="text-[12px] text-gray-500 dark:text-gray-400">
                · {count} تقييم
              </span>
            </div>
          ) : (
            <p className="text-[12px] text-gray-500 dark:text-gray-400">
              بدون تقييمات بعد
            </p>
          )}
        </div>
        {canReview && (
          <button
            type="button"
            onClick={() => setReviewSheetOpen(true)}
            className="flex-shrink-0 px-3 py-2 rounded-xl bg-primary-600 text-white text-[12px] font-semibold active:scale-95 transition-transform"
          >
            {mine && mine.status === 'VISIBLE' ? 'تعديل تقييمي' : 'قيّم هذا المكان'}
          </button>
        )}
      </div>

      {/* "Why can't I review?" hint — shown to the people whose
          button was hidden so the absence isn't a silent mystery.
          Owner / creator self-block is per spec (a business owner
          could otherwise pre-rate their own place). The hint reads
          softer for owners (positive identity) vs creators (just
          neutral fact). */}
      {!canReview && (isOwner || isCreator) && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3 text-[12px] text-gray-600 dark:text-gray-300 leading-relaxed">
          {isOwner
            ? '✓ أنت صاحب هذا المكان — لا يمكنك تقييم مكانك.'
            : '📝 أنت من أضاف هذا المكان — لا يمكنك تقييم مكان أضفته.'}
        </div>
      )}

      {/* Status banner for the caller's own non-visible review. */}
      {mine && mine.status === 'HIDDEN_BY_MOD' && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-900/20 p-3 text-[12px] text-rose-800 dark:text-rose-200">
          تم إخفاء تقييمك من قبل مشرف الحي. لا يمكن إعادة نشره.
        </div>
      )}
      {mine && mine.status === 'DELETED_BY_USER' && canReview && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3 text-[12px] text-gray-600 dark:text-gray-300">
          حذفت تقييمك السابق. يمكنك إضافة تقييم جديد.
        </div>
      )}

      {loading && reviews.length === 0 && (
        <div className="py-4">
          <HaiLoader size="md" />
        </div>
      )}

      {!loading && reviews.length === 0 && (
        <p className="text-center text-[12px] text-gray-500 dark:text-gray-400 py-4">
          كن أول من يضيف تقييمًا
        </p>
      )}

      <ul className="space-y-3">
        {reviews.map((r) => {
          const isMyRow = mine && mine.id === r.id
          return (
            <li
              key={r.id}
              className="border border-gray-100 dark:border-gray-700 rounded-xl p-3 bg-gray-50 dark:bg-gray-900/40"
            >
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-[12px] font-bold text-primary-700 dark:text-primary-300 flex-shrink-0 overflow-hidden">
                  {r.user.avatarUrl ? (
                    <img src={r.user.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    (r.user.name || '؟').slice(0, 1)
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12.5px] font-bold text-gray-900 dark:text-white truncate">
                      {r.user.name || 'جار'}
                    </span>
                    <span className="text-[10.5px] text-gray-400">
                      · {timeAgo(r.createdAt)}
                    </span>
                  </div>
                  <div className="mt-0.5">
                    <StarRating value={r.rating} size={13} />
                  </div>
                  {r.body && (
                    <p className="text-[12.5px] text-gray-700 dark:text-gray-300 leading-relaxed mt-1.5 whitespace-pre-line">
                      {r.body}
                    </p>
                  )}
                </div>
                {/* ⋯ kebab sits in the row's far corner — same row
                    as the reviewer name + timestamp, not below the
                    body. Per-row state, only one menu open at a
                    time, closes on outside-click / Escape / pick. */}
                <ReviewActionsMenu
                  isMyRow={!!isMyRow}
                  open={openMenuFor === r.id}
                  onToggle={() => setOpenMenuFor((cur) => (cur === r.id ? null : r.id))}
                  onClose={() => setOpenMenuFor(null)}
                  rootRef={openMenuFor === r.id ? menuRootRef : undefined}
                  onEdit={() => setReviewSheetOpen(true)}
                  onDelete={deleteMine}
                  onReport={() => reportReview(r.id)}
                  onShare={() => shareReview(r)}
                />
              </div>

              {/* Owner reply */}
              {r.ownerReplyBody && (
                <div className="mt-2 ms-10 rounded-lg border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-900/15 p-2.5">
                  <p className="text-[10.5px] font-bold text-emerald-700 dark:text-emerald-300">
                    رد صاحب المكان
                    {r.ownerReplyAt && (
                      <span className="text-emerald-600/70 dark:text-emerald-400/70 font-normal ms-1">
                        · {timeAgo(r.ownerReplyAt)}
                      </span>
                    )}
                  </p>
                  <p className="text-[12px] text-gray-800 dark:text-gray-200 leading-relaxed mt-1 whitespace-pre-line">
                    {r.ownerReplyBody}
                  </p>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => setReplyingTo({ reviewId: r.id, existing: r.ownerReplyBody })}
                      className="mt-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 active:scale-95 transition-transform"
                    >
                      تعديل الرد
                    </button>
                  )}
                </div>
              )}
              {isOwner && !r.ownerReplyBody && (
                <div className="ms-10 mt-2">
                  <button
                    type="button"
                    onClick={() => setReplyingTo({ reviewId: r.id, existing: null })}
                    className="text-[11.5px] font-semibold text-emerald-700 dark:text-emerald-300 active:scale-95 transition-transform"
                  >
                    رد صاحب المكان
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {canReview && (
        <PlaceReviewSheet
          placeId={placeId}
          open={reviewSheetOpen}
          onClose={() => setReviewSheetOpen(false)}
          onSaved={refresh}
          initialRating={mine?.status === 'VISIBLE' ? mine.rating : 0}
          initialBody={mine?.status === 'VISIBLE' ? mine.body : ''}
        />
      )}
      {isOwner && replyingTo && (
        <PlaceOwnerReplySheet
          placeId={placeId}
          reviewId={replyingTo.reviewId}
          open={true}
          onClose={() => setReplyingTo(null)}
          onSaved={refresh}
          initialBody={replyingTo.existing}
        />
      )}
    </section>
  )
}

/**
 * Per-row kebab (⋯) menu. Stays minimal — small floating card
 * with 2–3 items, no portal needed since it lives inside the
 * review's bounding box and we close on outside-click in the
 * parent component. Items shift based on whether the viewer is
 * the review's author:
 *   own row    →  تعديل / حذف / مشاركة
 *   other row  →  إبلاغ / مشاركة
 *
 * The trigger and menu share a relative wrapper so the menu
 * positions against the trigger via `absolute`. start-0 +
 * top-full lands it directly under the kebab.
 */
function ReviewActionsMenu({
  isMyRow,
  open,
  onToggle,
  onClose,
  rootRef,
  onEdit,
  onDelete,
  onReport,
  onShare,
}: {
  isMyRow: boolean
  open: boolean
  onToggle: () => void
  onClose: () => void
  rootRef?: React.RefObject<HTMLUListElement>
  onEdit: () => void
  onDelete: () => void
  onReport: () => void
  onShare: () => void
}) {
  const items = isMyRow
    ? [
        { key: 'edit',   label: 'تعديل',  tone: 'text-primary-700 dark:text-primary-300', onClick: onEdit },
        { key: 'delete', label: 'حذف',    tone: 'text-rose-600 dark:text-rose-400',       onClick: onDelete },
        { key: 'share',  label: 'مشاركة', tone: 'text-gray-700 dark:text-gray-200',       onClick: onShare },
      ]
    : [
        { key: 'report', label: 'إبلاغ',  tone: 'text-rose-600 dark:text-rose-400', onClick: onReport },
        { key: 'share',  label: 'مشاركة', tone: 'text-gray-700 dark:text-gray-200', onClick: onShare },
      ]
  return (
    <div className="relative inline-block flex-shrink-0">
      <button
        type="button"
        onClick={onToggle}
        aria-label="خيارات"
        aria-expanded={open}
        className="w-8 h-8 -m-1 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 active:bg-gray-200/60 dark:active:bg-gray-700/60 transition-colors"
      >
        <FiMoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <ul
          ref={rootRef}
          role="menu"
          className="absolute z-30 top-full mt-1 end-0 min-w-[140px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg overflow-hidden"
        >
          {items.map((it) => (
            <li key={it.key}>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  // Defer the action by one tick so the menu's
                  // unmount doesn't fight a sheet's mount.
                  setTimeout(it.onClick, 0)
                }}
                className={`block w-full text-start px-3 py-2 text-[12.5px] font-semibold ${it.tone} active:bg-gray-100 dark:active:bg-gray-700`}
              >
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
