'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { FiX, FiSend } from 'react-icons/fi'

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

export default function QuickAskSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: text.trim(), body: text.trim(), category: 'LOOKING_FOR' }),
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

      <div className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto z-50 bg-white rounded-t-3xl shadow-2xl" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="px-4 pt-3 pb-8">
          {/* Handle */}
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900 text-base">🔎 اسأل جيرانك</h2>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100">
              <FiX className="w-5 h-5 text-gray-400" />
            </button>
          </div>

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

          {/* Input + send */}
          <form onSubmit={handleSubmit} className="flex gap-2 items-end">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="مثال: أبحث عن سباك موثوق في الحي..."
              className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm text-right focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none leading-relaxed"
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
