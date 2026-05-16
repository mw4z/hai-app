'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import StarRating from './StarRating'
import PlaceReviewSheet from './PlaceReviewSheet'
import PlaceOwnerReplySheet from './PlaceOwnerReplySheet'

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
    if (!confirm('هل تريد حذف تقييمك؟')) return
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
    if (!confirm('هل تريد الإبلاغ عن هذا التقييم؟')) return
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
        <p className="text-center text-[12px] text-gray-400 py-4">
          جاري التحميل…
        </p>
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
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {isMyRow ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setReviewSheetOpen(true)}
                          className="text-[11px] font-semibold text-primary-600 dark:text-primary-400 active:scale-95 transition-transform"
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          onClick={deleteMine}
                          className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 active:scale-95 transition-transform"
                        >
                          حذف
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => reportReview(r.id)}
                        className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 active:scale-95 transition-transform"
                      >
                        🚩 إبلاغ
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => shareReview(r)}
                      className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 active:scale-95 transition-transform"
                    >
                      🔗 مشاركة
                    </button>
                  </div>
                </div>
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
