'use client'

import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { FiX, FiPlus } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { uploadFiles } from '@/lib/upload'

const MAX_IMAGES = 5
const PER_FILE_MAX_BYTES = 10 * 1024 * 1024

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
        className="w-full max-w-[480px] bg-white dark:bg-gray-800 rounded-t-3xl p-4 space-y-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
      >
        <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-2" />
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">
            📷 {tr('Edit photos', 'تعديل الصور', 'تصاویر ترمیم کریں')}
          </h3>
          <span className="text-[11px] text-gray-400">{totalCount}/{MAX_IMAGES}</span>
        </div>

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

        <div className="flex gap-2 pt-1">
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
