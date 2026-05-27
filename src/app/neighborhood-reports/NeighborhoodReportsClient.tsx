'use client'

import { useState, useRef } from 'react'
import toast from 'react-hot-toast'
import { useLanguage } from '@/hooks/useLanguage'
import { uploadFiles } from '@/lib/upload'
import { pickImagesOrFallback } from '@/lib/imagePicker'
import BackButton from '@/components/BackButton'
import { HaiSpinner } from '@/components/HaiLoader'
import { hapticSuccess } from '@/lib/haptic'

const TYPES = [
  { key: 'complaint', tKey: 'nbhd_report_complaint' },
  { key: 'suggestion', tKey: 'nbhd_report_suggestion' },
  { key: 'issue', tKey: 'nbhd_report_issue' },
  { key: 'other', tKey: 'nbhd_report_other' },
] as const

const STATUS_STYLE: Record<string, { ar: string; en: string; cls: string }> = {
  open:     { ar: 'مفتوح', en: 'Open',     cls: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' },
  reviewed: { ar: 'تمت المراجعة', en: 'Reviewed', cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
  resolved: { ar: 'تم الحل', en: 'Resolved', cls: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' },
  closed:   { ar: 'مغلق', en: 'Closed',    cls: 'bg-gray-100 dark:bg-gray-700 text-gray-500' },
}

export default function NeighborhoodReportsClient({ initialReports }: { initialReports: any[] }) {
  const { t, lang } = useLanguage()
  const [reports, setReports] = useState<any[]>(initialReports)
  const [showForm, setShowForm] = useState(false)
  const [type, setType] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [images, setImages] = useState<{ file: File; preview: string }[]>([])
  const [loading, setLoading] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

  function applyReportImages(files: File[]) {
    const limited = files.slice(0, 3 - images.length)
    const newImages = limited.map(f => ({ file: f, preview: URL.createObjectURL(f) }))
    setImages(prev => [...prev, ...newImages])
  }

  async function openReportImagePicker() {
    const remaining = 3 - images.length
    if (remaining <= 0) return
    const files = await pickImagesOrFallback(remaining, imageInputRef)
    if (files.length > 0) applyReportImages(files)
  }

  async function handleSubmit() {
    if (!type) return
    if (!subject.trim()) return
    if (body.trim().length < 10) { toast.error(lang === 'en' ? 'Description too short' : lang === 'ur' ? 'تفصیل بہت مختصر' : 'الوصف قصير جداً'); return }

    setLoading(true)
    let imageUrls: string[] = []
    if (images.length > 0) {
      try {
        imageUrls = await uploadFiles(images.map(img => img.file))
      } catch { /* */ }
    }

    try {
      const res = await fetch('/api/neighborhood-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, subject: subject.trim(), body: body.trim(), imageUrls }),
      })
      if (res.ok) {
        hapticSuccess()
        toast.success(t('nbhd_report_sent'))
        setShowForm(false); setType(''); setSubject(''); setBody(''); setImages([])
        const updated = await fetch('/api/neighborhood-report').then(r => r.json())
        if (Array.isArray(updated)) setReports(updated)
      } else { const d = await res.json(); toast.error(d.error) }
    } catch { toast.error('Error') }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-4 py-3 flex items-center gap-3">
        <BackButton href="/feed" />
        <h1 className="text-lg font-bold text-gray-900 dark:text-white flex-1">{t('contact_admin')}</h1>
        {!showForm && (
          <button onClick={() => setShowForm(true)}
            className="bg-primary-600 text-white rounded-full px-4 py-2 text-xs font-semibold active:scale-95">
            + {t('nbhd_report_new')}
          </button>
        )}
      </header>

      <div className="px-4 py-4 space-y-4">
        {/* Info note */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-3">
          <p className="text-xs text-blue-700 dark:text-blue-300">
            {lang === 'en' ? "📋 Send your report or suggestion to your neighborhood admin — you'll get a direct response" : lang === 'ur' ? '📋 اپنی رپورٹ یا تجویز محلے کے منتظم کو بھیجیں' : '📋 أرسل بلاغك أو اقتراحك لمشرف الحي — سيصلك رد مباشرة'}
          </p>
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-4 animate-fade-in-up">
            <h3 className="font-bold text-gray-900 dark:text-white">{t('nbhd_report_new')}</h3>

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

            <input type="text" value={subject} onChange={e => setSubject(e.target.value)} maxLength={100}
              placeholder={lang === 'en' ? 'Subject' : lang === 'ur' ? 'موضوع' : 'الموضوع'}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm bg-transparent text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />

            <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={1000} rows={4}
              placeholder={lang === 'en' ? 'Describe in detail...' : lang === 'ur' ? 'تفصیل سے بتائیں...' : 'اشرح بالتفصيل...'}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm bg-transparent text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />

            {/* Images */}
            <div>
              {images.length > 0 && (
                <div className="flex gap-2 mb-2 overflow-x-auto">
                  {images.map((img, i) => (
                    <div key={i} className="relative flex-shrink-0">
                      <img src={img.preview} alt="" className="w-16 h-16 object-cover rounded-xl border border-gray-200 dark:border-gray-700" />
                      <button onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                        className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center">✕</button>
                    </div>
                  ))}
                </div>
              )}
              {images.length < 3 && (
                <>
                  <button
                    type="button"
                    onClick={openReportImagePicker}
                    className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl py-2 text-xs text-gray-400"
                  >
                    📷 {lang === 'en' ? 'Add photo' : lang === 'ur' ? 'تصویر شامل کریں' : 'إضافة صورة'}
                  </button>
                  <input ref={imageInputRef} type="file" accept="image/*" multiple onChange={e => {
                    const files = Array.from(e.target.files || [])
                    e.target.value = ''
                    applyReportImages(files)
                  }} className="hidden" />
                </>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={handleSubmit} disabled={loading || !type || !subject.trim()}
                className="flex-1 bg-primary-600 text-white rounded-xl py-3 font-semibold text-sm disabled:opacity-40 active:scale-[0.97]">
                {loading ? <HaiSpinner /> : (lang === 'en' ? 'Submit Report' : lang === 'ur' ? 'رپورٹ بھیجیں' : 'إرسال البلاغ')}
              </button>
              <button onClick={() => setShowForm(false)} className="px-4 py-3 text-sm text-gray-500">{lang === 'en' ? 'Cancel' : lang === 'ur' ? 'منسوخ' : 'إلغاء'}</button>
            </div>
          </div>
        )}

        {/* Reports list — SSR'd, so it's on screen from first paint. */}
        {reports.length === 0 && !showForm ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">📋</div>
            <p className="text-gray-500 dark:text-gray-400 text-sm">{t('nbhd_report_empty')}</p>
          </div>
        ) : (
          reports.map((r, idx) => {
            const st = STATUS_STYLE[r.status] || STATUS_STYLE.open
            const typeEmoji = { complaint: '⚠️', suggestion: '💡', issue: '🔧', other: '📝' }[r.type as string] || '📝'
            return (
              <div key={r.id} style={{ animationDelay: `${Math.min(idx * 50, 300)}ms`, animationFillMode: 'backwards' }}
                className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 animate-fade-in-up">
                <div className="flex items-start justify-between mb-2">
                  <span className="font-semibold text-sm text-gray-900 dark:text-white">{typeEmoji} {r.subject}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{lang !== 'en' ? st.ar : st.en}</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-2">{r.body}</p>
                {r.imageUrls?.length > 0 && (
                  <div className="flex gap-2 mb-2">
                    {r.imageUrls.map((url: string, i: number) => (
                      <a key={i} href={url} target="_blank" className="flex-shrink-0">
                        <img src={url} alt="" className="w-14 h-14 object-cover rounded-lg border border-gray-200 dark:border-gray-700" />
                      </a>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-gray-400">{new Date(r.createdAt).toLocaleDateString(lang !== 'en' ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                {r.reply && (
                  <div className="mt-3 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 rounded-xl p-3">
                    <p className="text-xs font-semibold text-green-700 dark:text-green-300 mb-1">{t('nbhd_report_reply')}</p>
                    <p className="text-sm text-gray-800 dark:text-gray-200">{r.reply}</p>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* BottomNav is mounted globally in src/app/layout.tsx */}
    </div>
  )
}
