'use client'

import { useRef, useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { FiX, FiPlus } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { uploadFiles } from '@/lib/upload'

const MAX_IMAGES = 5
const PER_FILE_MAX_BYTES = 10 * 1024 * 1024
const SWIPE_CLOSE_THRESHOLD = 100
const SWIPE_MAX_TRAVEL = 360

interface Props {
  placeId: string
  initialUrls: string[]
  open: boolean
  onClose: () => void
  onSaved: (urls: string[]) => void
}

/** Bottom-sheet for the claimed-owner photo edit flow.
 *
 *  Existing photos render with a ✕ remove control; "+ Add"
 *  opens the system picker for new ones. New photos are
 *  uploaded only on Save (via /api/upload, same path the
 *  submission form uses), so the user can pick + remove
 *  freely before committing. Removed existing URLs are
 *  dropped from the array — the file at Blob storage is
 *  abandoned (acceptable given Blob storage cost; a cleanup
 *  cron can sweep orphans later if needed).
 *
 *  Save → PATCH /api/directory/[id] with the new imageUrls
 *  array. On success the parent's onSaved callback is fired
 *  with the final URL list so the detail page can re-render
 *  the strip without a full router.refresh(). */
export default function EditPhotosSheet({
  placeId,
  initialUrls,
  open,
  onClose,
  onSaved,
}: Props) {
  const { lang } = useLanguage()
  // existingUrls = URLs already in the row, possibly minus any
  // the user clicked ✕ on in this session.
  const [existingUrls, setExistingUrls] = useState<string[]>(initialUrls)
  // pendingFiles = new picks not yet uploaded.
  const [pendingFiles, setPendingFiles] = useState<{ file: File; preview: string }[]>([])
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Swipe-down-to-dismiss state.
  const [dragY, setDragY] = useState(0)
  const [animating, setAnimating] = useState(true)
  const dragStartY = useRef<number | null>(null)
  useEffect(() => {
    if (open) { setDragY(0); setAnimating(true) }
  }, [open])

  // Freeze background scroll while the sheet is open. Shared hook
  // already used by ImageLightbox + AttachmentMenu — sets
  // html.overflow:hidden + body.position:fixed for the lock's
  // lifetime so the page underneath can't be panned while the
  // sheet sits on top.
  useBodyScrollLock(open)

  const tr = (en: string, ar: string, ur: string) =>
    lang === 'en' ? en : lang === 'ur' ? ur : ar

  // Total visible images = existing + pending. Cap at MAX_IMAGES.
  const totalCount = existingUrls.length + pendingFiles.length
  const canAdd = totalCount < MAX_IMAGES

  function pickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    const remaining = MAX_IMAGES - totalCount
    for (const file of files.slice(0, remaining)) {
      if (file.size > PER_FILE_MAX_BYTES) {
        toast.error(tr('Image too large', 'حجم الصورة كبير', 'تصویر بہت بڑی'))
        continue
      }
      if (!file.type.startsWith('image/')) {
        toast.error(tr('Image only', 'صور فقط', 'صرف تصاویر'))
        continue
      }
      const preview = URL.createObjectURL(file)
      setPendingFiles((prev) => [...prev, { file, preview }])
    }
  }

  function removeExisting(i: number) {
    setExistingUrls((prev) => prev.filter((_, j) => j !== i))
  }
  function removePending(i: number) {
    setPendingFiles((prev) => {
      URL.revokeObjectURL(prev[i].preview)
      return prev.filter((_, j) => j !== i)
    })
  }

  function close() {
    // Revoke any blob URLs we created so memory doesn't leak.
    pendingFiles.forEach((p) => URL.revokeObjectURL(p.preview))
    setPendingFiles([])
    setExistingUrls(initialUrls)
    onClose()
  }

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      let newUploadUrls: string[] = []
      if (pendingFiles.length > 0) {
        try {
          newUploadUrls = await uploadFiles(pendingFiles.map((p) => p.file))
        } catch (err: any) {
          toast.error(err?.message || tr('Image upload failed', 'فشل رفع الصور', 'تصاویر اپ لوڈ ناکام'))
          setSaving(false)
          return
        }
      }
      const finalUrls = [...existingUrls, ...newUploadUrls].slice(0, MAX_IMAGES)
      const res = await fetch(`/api/directory/${placeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrls: finalUrls }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || tr('Save failed', 'فشل الحفظ', 'محفوظ ناکام'))
        setSaving(false)
        return
      }
      toast.success(tr('Photos updated', 'تم تحديث الصور', 'تصاویر اپ ڈیٹ ہو گئیں'))
      pendingFiles.forEach((p) => URL.revokeObjectURL(p.preview))
      setPendingFiles([])
      onSaved(finalUrls)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[480px] max-h-[88vh] flex flex-col bg-white dark:bg-gray-800 rounded-t-3xl"
        style={{
          transform: `translateY(${dragY}px)`,
          transition: animating ? 'transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
        }}
      >
        <div
          className="px-4 pt-3 pb-2 flex-shrink-0"
          style={{ touchAction: 'pan-y' }}
          onTouchStart={(e) => {
            dragStartY.current = e.touches[0].clientY
            setAnimating(false)
          }}
          onTouchMove={(e) => {
            if (dragStartY.current === null) return
            const delta = e.touches[0].clientY - dragStartY.current
            setDragY(delta <= 0 ? 0 : Math.min(delta, SWIPE_MAX_TRAVEL))
          }}
          onTouchEnd={() => {
            const released = dragY
            dragStartY.current = null
            setAnimating(true)
            if (released >= SWIPE_CLOSE_THRESHOLD) {
              setDragY(window.innerHeight)
              setTimeout(close, 200)
            } else {
              setDragY(0)
            }
          }}
        >
          <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-2" />
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">
              📷 {tr('Edit photos', 'تعديل الصور', 'تصاویر ترمیم کریں')}
            </h3>
            <span className="text-[11px] text-gray-400">{totalCount}/{MAX_IMAGES}</span>
          </div>
        </div>
        {/* Scrollable middle region — pending list grows here. */}
        <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-3">

        {totalCount === 0 ? (
          <p className="text-center text-xs text-gray-400 py-6">
            {tr('No photos yet — add up to 5.', 'لا توجد صور — أضف حتى 5.', 'ابھی کوئی تصاویر نہیں — 5 تک شامل کریں۔')}
          </p>
        ) : (
          <div className="flex gap-2 overflow-x-auto py-1">
            {existingUrls.map((url, i) => (
              <div key={`e-${i}`} className="relative flex-shrink-0">
                <img src={url} alt="" className="w-24 h-24 object-cover rounded-xl border border-gray-200 dark:border-gray-700" />
                <button
                  type="button"
                  onClick={() => removeExisting(i)}
                  aria-label={tr('Remove photo', 'إزالة الصورة', 'تصویر ہٹائیں')}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"
                >
                  <FiX className="w-3 h-3" />
                </button>
              </div>
            ))}
            {pendingFiles.map((p, i) => (
              <div key={`p-${i}`} className="relative flex-shrink-0">
                <img src={p.preview} alt="" className="w-24 h-24 object-cover rounded-xl border-2 border-primary-300" />
                <button
                  type="button"
                  onClick={() => removePending(i)}
                  aria-label={tr('Remove photo', 'إزالة الصورة', 'تصویر ہٹائیں')}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"
                >
                  <FiX className="w-3 h-3" />
                </button>
                {/* "Pending" badge so the user knows which thumbs are new */}
                <span className="absolute bottom-1 left-1 right-1 mx-auto text-center text-[9px] bg-primary-600 text-white rounded-full py-0.5 font-semibold">
                  {tr('New', 'جديد', 'نیا')}
                </span>
              </div>
            ))}
          </div>
        )}

        {canAdd && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl py-3 text-sm text-gray-500 dark:text-gray-400"
          >
            <FiPlus className="w-4 h-4" />
            {tr('Add photo', 'إضافة صورة', 'تصویر شامل کریں')}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={pickFiles}
          className="hidden"
        />
        </div>
        {/* Pinned footer — stays put while Android collapses its URL
            bar or the photo list grows past the viewport. */}
        <div
          className="flex-shrink-0 flex gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-b-3xl"
          style={{ paddingBottom: 'calc(var(--hai-safe-bottom, 0px) + 1.5rem)' }}
        >
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-50 active:scale-95 transition-transform"
          >
            {saving
              ? tr('Saving…', 'جاري الحفظ…', 'محفوظ ہو رہا ہے…')
              : tr('Save', 'حفظ', 'محفوظ کریں')}
          </button>
          <button
            type="button"
            onClick={close}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-500 dark:text-gray-400"
          >
            {tr('Cancel', 'إلغاء', 'منسوخ')}
          </button>
        </div>
      </div>
    </div>
  )
}
