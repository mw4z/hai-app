'use client'

import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { useLanguage } from '@/hooks/useLanguage'
import { uploadFiles } from '@/lib/upload'
import { pickImagesOrFallback } from '@/lib/imagePicker'
import BackButton from '@/components/BackButton'
import BottomNav from '@/components/BottomNav'
import { hapticSuccess } from '@/lib/haptic'

const TYPES = [
  { key: 'bug', tKey: 'support_bug' },
  { key: 'feature', tKey: 'support_feature' },
  { key: 'complaint', tKey: 'support_complaint' },
  { key: 'other', tKey: 'support_other' },
] as const

const STATUS_STYLE: Record<string, { ar: string; en: string; cls: string }> = {
  open:        { ar: 'مفتوحة', en: 'Open',        cls: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' },
  in_progress: { ar: 'قيد المعالجة', en: 'In Progress', cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
  resolved:    { ar: 'تم الحل', en: 'Resolved',    cls: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' },
  closed:      { ar: 'مغلقة', en: 'Closed',       cls: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400' },
}

export default function SupportPage() {
  const { t, lang } = useLanguage()
  const [tickets, setTickets] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [type, setType] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [images, setImages] = useState<{ file: File; preview: string; url?: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)

  const imageInputRef = useRef<HTMLInputElement>(null)

  function applySupportImages(files: File[]) {
    const limited = files.slice(0, 3 - images.length)
    const newImages = limited.map(file => ({ file, preview: URL.createObjectURL(file) }))
    setImages(prev => [...prev, ...newImages])
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    applySupportImages(files)
  }

  async function openSupportImagePicker() {
    const remaining = 3 - images.length
    if (remaining <= 0) return
    const files = await pickImagesOrFallback(remaining, imageInputRef)
    if (files.length > 0) applySupportImages(files)
  }

  async function uploadImages(): Promise<string[]> {
    if (images.length === 0) return []
    try {
      return await uploadFiles(images.map(img => img.file))
    } catch { return [] }
  }

  useEffect(() => {
    fetch('/api/support').then(r => r.json()).then(setTickets).catch(() => {}).finally(() => setFetching(false))
  }, [])

  async function handleSubmit() {
    if (!type) { toast.error(t('support_type')); return }
    if (!subject.trim()) { toast.error(t('support_subject')); return }
    if (body.trim().length < 10) { toast.error(t('support_body')); return }

    setLoading(true)
    try {
      const imageUrls = await uploadImages()
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, subject: subject.trim(), body: body.trim(), imageUrls }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error); return }
      hapticSuccess()
      toast.success(t('support_sent'))
      setShowForm(false)
      setType(''); setSubject(''); setBody(''); setImages([])
      // Refetch
      const updated = await fetch('/api/support').then(r => r.json())
      setTickets(updated)
    } catch { toast.error('Error') }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-4 py-3 flex items-center gap-3">
        <BackButton href="/profile" />
        <h1 className="text-lg font-bold text-gray-900 dark:text-white flex-1">{t('support_title')}</h1>
        {!showForm && (
          <button onClick={() => setShowForm(true)}
            className="bg-primary-600 text-white rounded-full px-4 py-2 text-xs font-semibold active:scale-95">
            + {t('support_new')}
          </button>
        )}
      </header>

      <div className="px-4 py-4 space-y-4">
        {/* New ticket form */}
        {showForm && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-4 animate-fade-in-up">
            <h3 className="font-bold text-gray-900 dark:text-white">{t('support_new')}</h3>

            {/* Type selection */}
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{t('support_type')}</p>
              <div className="grid grid-cols-2 gap-2">
                {TYPES.map(tp => (
                  <button key={tp.key} onClick={() => setType(tp.key)}
                    className={`py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      type === tp.key ? 'bg-primary-600 text-white' : 'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}>
                    {t(tp.tKey as any)}
                  </button>
                ))}
              </div>
            </div>

            {/* Subject */}
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">{t('support_subject')}</label>
              <input type="text" value={subject} onChange={e => setSubject(e.target.value)} maxLength={100}
                placeholder={lang === 'en' ? 'e.g. Login issue' : lang === 'ur' ? 'مثال: لاگ ان میں مسئلہ' : 'مثال: مشكلة في تسجيل الدخول'}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm bg-transparent text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>

            {/* Body */}
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">{t('support_body')}</label>
              <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={1000} rows={4}
                placeholder={lang === 'en' ? 'Describe the issue or suggestion in detail...' : lang === 'ur' ? 'مسئلہ یا تجویز تفصیل سے بتائیں...' : 'اشرح المشكلة أو الاقتراح بالتفصيل...'}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm bg-transparent text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
            </div>

            {/* Screenshots */}
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">
                📷 {lang === 'en' ? 'Screenshots (optional)' : lang === 'ur' ? 'تصاویر (اختیاری)' : 'صور توضيحية (اختياري)'}
                <span className="text-gray-400 mr-1">{images.length}/3</span>
              </label>
              {images.length > 0 && (
                <div className="flex gap-2 mb-2 overflow-x-auto">
                  {images.map((img, i) => (
                    <div key={i} className="relative flex-shrink-0">
                      <img src={img.preview} alt="" className="w-20 h-20 object-cover rounded-xl border border-gray-200 dark:border-gray-700" />
                      <button type="button" onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">✕</button>
                    </div>
                  ))}
                </div>
              )}
              {images.length < 3 && (
                <>
                  <button
                    type="button"
                    onClick={openSupportImagePicker}
                    className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl py-2.5 text-sm text-gray-400 hover:border-primary-300 transition-colors"
                  >
                    <span>+ {lang === 'en' ? 'Add photo' : lang === 'ur' ? 'تصویر شامل کریں' : 'إضافة صورة'}</span>
                  </button>
                  <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleImageSelect} className="hidden" />
                </>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={handleSubmit} disabled={loading || !type || !subject.trim()}
                className="flex-1 bg-primary-600 text-white rounded-xl py-3 font-semibold text-sm disabled:opacity-40 active:scale-[0.97]">
                {loading ? '...' : t('support_submit')}
              </button>
              <button onClick={() => setShowForm(false)} className="px-4 py-3 text-sm text-gray-500">{lang === 'en' ? 'Cancel' : lang === 'ur' ? 'منسوخ' : 'إلغاء'}</button>
            </div>
          </div>
        )}

        {/* Tickets list */}
        {fetching ? (
          <div className="flex justify-center py-10 text-primary-600"><div className="hai-loader" style={{width:40,height:40}}><svg viewBox="0 0 64 64" fill="none" className="w-full h-full"><circle className="hai-dot hai-dot-center" cx="32" cy="35" r="6" fill="currentColor"/><circle className="hai-dot hai-dot-top" cx="32" cy="15" r="4" fill="currentColor"/><circle className="hai-dot hai-dot-br" cx="48" cy="47" r="4" fill="currentColor"/><circle className="hai-dot hai-dot-bl" cx="16" cy="47" r="4" fill="currentColor"/></svg></div></div>
        ) : tickets.length === 0 && !showForm ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">📩</div>
            <p className="text-gray-500 dark:text-gray-400 text-sm">{t('support_empty')}</p>
          </div>
        ) : (
          tickets.map((ticket, idx) => {
            const st = STATUS_STYLE[ticket.status] || STATUS_STYLE.open
            const typeEmoji = { bug: '🐛', feature: '💡', complaint: '⚠️', other: '📝' }[ticket.type as string] || '📝'
            return (
              <div key={ticket.id}
                style={{ animationDelay: `${Math.min(idx * 50, 300)}ms`, animationFillMode: 'backwards' }}
                className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 animate-fade-in-up">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span>{typeEmoji}</span>
                    <span className="font-semibold text-sm text-gray-900 dark:text-white">{ticket.subject}</span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>
                    {lang !== 'en' ? st.ar : st.en}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-2">{ticket.body}</p>
                {ticket.imageUrls?.length > 0 && (
                  <div className="flex gap-2 mb-2 overflow-x-auto">
                    {ticket.imageUrls.map((url: string, i: number) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                        <img src={url} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-200 dark:border-gray-700" />
                      </a>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-gray-400">
                  {new Date(ticket.createdAt).toLocaleDateString(lang !== 'en' ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>

                {/* Admin reply */}
                {ticket.reply && (
                  <div className="mt-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-3">
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">{t('support_admin_reply')}</p>
                    <p className="text-sm text-gray-800 dark:text-gray-200">{ticket.reply}</p>
                    {ticket.repliedAt && (
                      <p className="text-[10px] text-blue-400 mt-1">
                        {new Date(ticket.repliedAt).toLocaleDateString(lang !== 'en' ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <BottomNav active="profile" />
    </div>
  )
}
