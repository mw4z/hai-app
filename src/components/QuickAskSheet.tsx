'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { FiX, FiSend } from 'react-icons/fi'
import { useDragToDismiss } from '@/hooks/useDragToDismiss'
import { inferAskCategory, type V2Category } from '@/lib/classify/inferAskCategory'

const SUGGESTIONS = [
  { label: 'سباك',         icon: '🔧' },
  { label: 'كهربائي',      icon: '⚡' },
  { label: 'معلم / معلمة', icon: '📚' },
  { label: 'طبيب / عيادة', icon: '🩺' },
  { label: 'نقل عفش',      icon: '🚛' },
  { label: 'محل تصليح',    icon: '🛠️' },
  { label: 'شقة للإيجار',  icon: '🏠' },
  { label: 'مطعم / أكل',   icon: '🍽️' },
]

// Same v2 buckets as the /ask page picker. COMPETITIONS omitted —
// requests don't fit a contest format.
const ASK_CATEGORIES: { key: V2Category; label: string; icon: string }[] = [
  { key: 'MARKETPLACE',          label: 'السوق',          icon: '🛒' },
  { key: 'SERVICES',             label: 'خدمات',          icon: '🔧' },
  { key: 'HOME_BUSINESSES',      label: 'الأسر المنتجة', icon: '🍱' },
  { key: 'RIDES',                label: 'مشاوير',         icon: '🚗' },
  { key: 'REAL_ESTATE',          label: 'عقارات',         icon: '🏠' },
  { key: 'NEIGHBORHOOD_REPORTS', label: 'بلاغات الحي',    icon: '⚠️' },
  { key: 'LOST_FOUND',           label: 'مفقودات',        icon: '🔍' },
  { key: 'EVENTS',               label: 'فعاليات',        icon: '🎉' },
]
const DEFAULT_CATEGORY: V2Category = 'SERVICES'

export default function QuickAskSheet({ onClose }: { onClose: () => void }) {
  const drag = useDragToDismiss<HTMLDivElement, HTMLDivElement>({ open: true, onDismiss: onClose })
  const router = useRouter()
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState<V2Category>(DEFAULT_CATEGORY)
  // Once the user manually picks a category, we stop overwriting their
  // choice on every keystroke — same pattern as the /ask page.
  const [userOverrode, setUserOverrode] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  // v1 rule-based suggestion — sub-millisecond, sync. Re-runs on every
  // keystroke unless the user has explicitly picked a category.
  useEffect(() => {
    if (userOverrode) return
    const suggested = inferAskCategory(text)
    setCategory((prev) => (prev === suggested ? prev : suggested))
  }, [text, userOverrode])

  const selected = ASK_CATEGORIES.find((c) => c.key === category)
  const isSuggested = !userOverrode && category !== DEFAULT_CATEGORY

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: text.trim(), body: text.trim(), category, intent: 'REQUEST' }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(typeof data.error === 'string' ? data.error : data.error?.message || 'فشل النشر'); return }
      toast.success('وصل طلبك للجيران! 🔎')
      onClose()
      router.refresh()
    } catch {
      toast.error('تعذر الاتصال')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      <div ref={drag.sheetRef} className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto z-50 bg-white rounded-t-3xl shadow-2xl" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div ref={drag.handleRef} className="px-4 pt-3 touch-none">
          {/* Handle */}
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />

          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-900 text-base">🔎 اسأل جيرانك</h2>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100">
              <FiX className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>
        <div className="px-4 pt-2 pb-8">

          {/* Suggestion chips */}
          <p className="text-xs text-gray-400 mb-2">اختر من الشائع أو اكتب طلبك:</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {SUGGESTIONS.map(s => (
              <button
                key={s.label}
                type="button"
                onClick={() => setText(`أبحث عن ${s.label}`)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  text === `أبحث عن ${s.label}`
                    ? 'bg-sky-600 text-white'
                    : 'bg-sky-50 text-sky-700 hover:bg-sky-100'
                }`}
              >
                <span>{s.icon}</span>
                <span>{s.label}</span>
              </button>
            ))}
          </div>

          {/* Suggested category — auto-inferred via inferAskCategory.
              Tap to expand and override. The label flips between
              "القسم (افتراضي)" and "القسم المقترح" so the user knows
              when the rule actually fired versus the SERVICES fallback. */}
          <div className="mb-3">
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              className="flex items-center justify-between w-full px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 active:scale-[0.99] transition-transform"
            >
              <span className="text-[11px] font-medium text-gray-500">
                {userOverrode
                  ? 'القسم'
                  : isSuggested
                    ? 'القسم المقترح'
                    : 'القسم (افتراضي)'}
              </span>
              <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                {selected && (
                  <>
                    <span>{selected.icon}</span>
                    <span>{selected.label}</span>
                  </>
                )}
              </span>
            </button>
            {pickerOpen && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {ASK_CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => {
                      setCategory(c.key)
                      setUserOverrode(true)
                      setPickerOpen(false)
                    }}
                    className={`flex flex-col items-center justify-center gap-1 aspect-square p-2 rounded-xl border active:scale-[0.97] transition-transform ${
                      category === c.key
                        ? 'border-sky-400 bg-sky-50'
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    <span className="text-xl">{c.icon}</span>
                    <span className="text-[10px] font-medium text-gray-700">{c.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Input + send */}
          <form onSubmit={handleSubmit} className="flex gap-2 items-end min-w-0">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="مثال: أبحث عن سباك موثوق في الحي..."
              className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm text-start focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none leading-relaxed"
              rows={2}
              maxLength={200}
              autoFocus
            />
            <button
              type="submit"
              disabled={loading || !text.trim()}
              className="w-11 h-11 bg-sky-600 rounded-full flex items-center justify-center text-white disabled:opacity-40 flex-shrink-0 mb-0.5 active:scale-95 transition-transform"
            >
              {loading
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <FiSend className="w-4 h-4" />
              }
            </button>
          </form>
          <p className="text-xs text-gray-400 mt-2 text-center">سيصل طلبك لجميع جيرانك في الحي فوراً</p>
        </div>
      </div>
    </>
  )
}
