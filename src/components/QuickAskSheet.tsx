'use client'

import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { FiX, FiSend, FiImage } from 'react-icons/fi'
import { useDragToDismiss } from '@/hooks/useDragToDismiss'
import { inferAskCategory, type V2Category } from '@/lib/classify/inferAskCategory'
import { pickImagesOrFallback, pickImageFromCamera } from '@/lib/imagePicker'
import ImageSourceSheet from '@/components/ImageSourceSheet'
import { uploadFiles } from '@/lib/upload'

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

export default function QuickAskSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Hooks must run unconditionally even when closed — that's the
  // entire point of the pre-mount pattern (avoid React mount cost on
  // every tap). Heavy effects (scroll lock, focus) gate their work on
  // `open` themselves below.
  const drag = useDragToDismiss<HTMLDivElement, HTMLDivElement>({ open, onDismiss: onClose })
  const router = useRouter()
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState<V2Category>(DEFAULT_CATEGORY)
  // Once the user manually picks a category, we stop overwriting their
  // choice on every keystroke — same pattern as the /ask page.
  const [userOverrode, setUserOverrode] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  // Image attach (single image, same flow as /ask page).
  const [image, setImage] = useState<{ file: File; preview: string } | null>(null)
  const [imageSheetOpen, setImageSheetOpen] = useState(false)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Eager focus before paint, fired ON the open→true transition.
  // The sheet is pre-mounted (see FeedClient: always-rendered with
  // open prop) so this useLayoutEffect runs in the same frame the
  // user's tap lands, BEFORE the browser paints. The keyboard rises
  // immediately — no remount cost, no commit-phase deferral.
  useLayoutEffect(() => {
    if (open) textareaRef.current?.focus()
  }, [open])

  // Lock feed scroll while open WITHOUT repositioning the body. The
  // older "position:fixed + top:-scrollY" pattern caused the visible
  // page to jump UP by the saved scrollY each time the sheet opened —
  // looked like the page sliding up before the popup arrived.
  // overflow:hidden on html+body + touch-action:none keeps the feed
  // from panning on iOS WKWebView and Android WebView without any
  // visible re-layout.
  useEffect(() => {
    if (!open) return
    const html = document.documentElement
    const body = document.body
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyTouchAction: body.style.touchAction,
    }
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    body.style.touchAction = 'none'
    return () => {
      html.style.overflow = prev.htmlOverflow
      body.style.overflow = prev.bodyOverflow
      body.style.touchAction = prev.bodyTouchAction
    }
  }, [open])

  // v1 rule-based suggestion — sub-millisecond, sync. Re-runs on every
  // keystroke unless the user has explicitly picked a category.
  useEffect(() => {
    if (userOverrode) return
    const suggested = inferAskCategory(text)
    setCategory((prev) => (prev === suggested ? prev : suggested))
  }, [text, userOverrode])

  // Revoke blob URL on swap/unmount.
  useEffect(() => {
    if (!image) return
    return () => {
      try { URL.revokeObjectURL(image.preview) } catch { /* ignore */ }
    }
  }, [image])

  function applyImage(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('صور فقط')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('الحد الأقصى 5 ميقا')
      return
    }
    if (image) {
      try { URL.revokeObjectURL(image.preview) } catch { /* ignore */ }
    }
    setImage({ file, preview: URL.createObjectURL(file) })
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) applyImage(file)
  }

  async function pickFromCamera() {
    const isNative = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.()
    if (isNative) {
      try {
        const file = await pickImageFromCamera()
        applyImage(file)
      } catch (err: any) {
        if (!err?.message?.toLowerCase?.().includes('cancel') && err?.message !== 'no_image') {
          console.warn('[quickask] camera failed', err)
        }
      }
    } else {
      cameraInputRef.current?.click()
    }
  }

  async function pickFromGallery() {
    // Use the multi-picker capped at 1 — pickImagesOrFallback goes
    // STRAIGHT to the iOS PHPicker (no intermediate "Take Photo /
    // Photo Library" Apple action sheet) and on Android routes
    // through the WebView <input type=file>. The single-pick
    // pickImageOrFallback uses CameraSource.Prompt which double-
    // stacks our custom ImageSourceSheet against Apple's own.
    const files = await pickImagesOrFallback(1, galleryInputRef)
    if (files[0]) applyImage(files[0])
  }

  const selected = ASK_CATEGORIES.find((c) => c.key === category)
  const isSuggested = !userOverrode && category !== DEFAULT_CATEGORY

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || loading) return
    setLoading(true)
    try {
      let imageUrls: string[] = []
      if (image) {
        try {
          imageUrls = await uploadFiles([image.file])
        } catch {
          toast.error('فشل رفع الصورة')
          setLoading(false)
          return
        }
      }
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: text.trim(), body: text.trim(), category, intent: 'REQUEST', imageUrls }),
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
      {/* Backdrop — pre-mounted, hidden via display when closed so it
          contributes zero to layout/paint. No transition: tap should
          flip backdrop ON instantly, not fade. */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        style={{ display: open ? 'block' : 'none' }}
        onClick={onClose}
      />

      {/* Sheet — same pattern. display:none when closed kills paint
          cost AND disables the textarea (so keyboard doesn't rise
          spuriously while closed). When open flips true the sheet
          appears the same frame; useLayoutEffect[open] focuses the
          textarea synchronously, keyboard rises immediately. NO slide
          animation by user request — pure on/off. */}
      <div
        ref={drag.sheetRef}
        className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto z-50 bg-white rounded-t-3xl shadow-2xl"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
          display: open ? 'block' : 'none',
        }}
        aria-hidden={!open}
      >
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

          {/* Image preview (when attached) */}
          {image && (
            <div className="flex items-center gap-2 mb-3 bg-gray-50 border border-gray-200 rounded-xl p-2">
              <img src={image.preview} alt="" className="w-12 h-12 rounded-lg object-cover" />
              <span className="flex-1 min-w-0 text-[11px] text-gray-500 truncate">{(image.file.size / 1024).toFixed(0)} KB</span>
              <button
                type="button"
                onClick={() => {
                  if (image) URL.revokeObjectURL(image.preview)
                  setImage(null)
                }}
                className="p-1 text-gray-400 active:scale-90"
                aria-label="remove image"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Input + image + send */}
          <form onSubmit={handleSubmit} className="flex gap-2 items-end min-w-0">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="مثال: أبحث عن سباك موثوق في الحي..."
              className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm text-start focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none leading-relaxed"
              rows={2}
              maxLength={200}
            />
            <button
              type="button"
              onClick={() => setImageSheetOpen(true)}
              className="w-11 h-11 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 flex-shrink-0 mb-0.5 active:scale-95 transition-transform"
              aria-label="attach image"
            >
              <FiImage className="w-4 h-4" />
            </button>
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
          <input ref={galleryInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageSelect} className="hidden" />
          <input ref={cameraInputRef}  type="file" accept="image/*" capture="environment" onChange={handleImageSelect} className="hidden" />
          <p className="text-xs text-gray-400 mt-2 text-center">سيصل طلبك لجميع جيرانك في الحي فوراً</p>
        </div>
      </div>

      <ImageSourceSheet
        open={imageSheetOpen}
        onClose={() => setImageSheetOpen(false)}
        onCamera={pickFromCamera}
        onGallery={pickFromGallery}
      />
    </>
  )
}
