'use client'

import { useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { uploadFiles } from '@/lib/upload'
import { pickImageOrFallback } from '@/lib/imagePicker'
import { cropFile } from '@/lib/cropBridge'
import { useLanguage } from '@/hooks/useLanguage'
import { FiArrowRight, FiArrowLeft, FiPlus, FiTrash2, FiCamera } from 'react-icons/fi'
import { HaiSpinner } from '@/components/HaiLoader'
import ImageLightbox from '@/components/ImageLightbox'

const DEFAULT_LIMIT = 3 // Matches FREE plan. Actual enforcement is in API.

interface Item {
  id: string
  title: string
  description: string | null
  price: number | null
  imageUrl: string | null
  showOnProfile: boolean
  showOnPlace: boolean
}

interface Props {
  initialItems: Item[]
  /** The directory place this user has claimed, if any. When null,
   *  the place-visibility toggles are hidden (they'd be inert). */
  claimedPlace: { id: string; name: string } | null
}

export default function CatalogClient({ initialItems, claimedPlace }: Props) {
  const { lang } = useLanguage()
  const router = useRouter()
  const searchParams = useSearchParams()
  const fromPlace = searchParams?.get('from') === 'place'
  const dn = (ar: string, en: string) => lang === 'en' ? en : ar

  const [items, setItems] = useState<Item[]>(initialItems)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function uploadImage(file: File) {
    if (uploading) return
    const cropped = await cropFile(file)
    if (!cropped) return
    setUploading(true)
    try {
      const urls = await uploadFiles([cropped])
      if (urls[0]) setImageUrl(urls[0])
    } catch { toast.error(dn('فشل رفع الصورة', 'Upload failed')) }
    finally { setUploading(false) }
  }

  async function addItem() {
    if (saving || !title.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/service-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          price: price ? Number(price) : null,
          imageUrl: imageUrl || null,
        }),
      })
      if (res.ok) {
        const item = await res.json()
        // Server returns the new item with both flags = true by
        // default (matches the column default). Normalize the
        // type so the toggle UI doesn't crash on legacy responses.
        setItems(prev => [
          ...prev,
          {
            id: item.id,
            title: item.title,
            description: item.description ?? null,
            price: item.price ?? null,
            imageUrl: item.imageUrl ?? null,
            showOnProfile: item.showOnProfile ?? true,
            showOnPlace: item.showOnPlace ?? true,
          },
        ])
        resetForm()
        toast.success(dn('تمت الإضافة', 'Added'))
      } else {
        const d = await res.json()
        toast.error(d.error || 'Error')
      }
    } catch { toast.error('Error') }
    finally { setSaving(false) }
  }

  async function deleteItem(id: string) {
    try {
      const res = await fetch(`/api/service-items?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== id))
        toast.success(dn('تم الحذف', 'Deleted'))
      }
    } catch { toast.error('Error') }
  }

  // Per-item visibility toggle — optimistic update + PATCH.
  // Guards against the "both off" state by silently flipping the
  // OTHER flag on if the user tries to disable the last one. An
  // item with both flags off has no surface to render on, which
  // is just confusing — keep at least one visibility on always.
  async function toggleVisibility(id: string, field: 'showOnProfile' | 'showOnPlace', next: boolean) {
    setItems(prev => prev.map(i => {
      if (i.id !== id) return i
      const updated = { ...i, [field]: next }
      // Don't allow both flags off.
      if (!updated.showOnProfile && !updated.showOnPlace) {
        const other = field === 'showOnProfile' ? 'showOnPlace' : 'showOnProfile'
        updated[other] = true
      }
      return updated
    }))
    // Build the patch from the item's RESOLVED next state so the
    // "don't both off" guard above is reflected on the server.
    const updated = items.find(i => i.id === id)
    if (!updated) return
    const patch: { showOnProfile?: boolean; showOnPlace?: boolean } = {}
    patch[field] = next
    if (field === 'showOnProfile' && !next && !updated.showOnPlace) patch.showOnPlace = true
    if (field === 'showOnPlace' && !next && !updated.showOnProfile) patch.showOnProfile = true
    try {
      await fetch('/api/service-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      })
    } catch {
      // Optimistic update stays; toast the user but don't roll
      // back — they can re-tap if it really failed.
      toast.error(dn('تعذر الحفظ', 'Save failed'))
    }
  }

  // Bulk visibility actions. All three modes leave at least one
  // surface enabled, so no orphaned items.
  async function bulkSet(mode: 'place' | 'profile' | 'both') {
    if (bulkBusy || items.length === 0) return
    setBulkBusy(true)
    const target = mode === 'place'
      ? { showOnProfile: false, showOnPlace: true }
      : mode === 'profile'
        ? { showOnProfile: true, showOnPlace: false }
        : { showOnProfile: true, showOnPlace: true }
    // Optimistic local update.
    setItems(prev => prev.map(i => ({ ...i, ...target })))
    try {
      await Promise.all(items.map(item =>
        fetch('/api/service-items', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id, ...target }),
        }),
      ))
      toast.success(dn('تم تحديث الظهور', 'Visibility updated'))
    } catch {
      toast.error(dn('تعذر تحديث الكل', 'Bulk update failed'))
    } finally {
      setBulkBusy(false)
    }
  }

  function resetForm() {
    setTitle(''); setDescription(''); setPrice(''); setImageUrl(''); setShowForm(false)
  }

  const atLimit = items.length >= DEFAULT_LIMIT
  const showPlaceControls = !!claimedPlace
  // Catalog images (in display order) for the full-screen lightbox.
  const catalogImages = items.filter((i) => i.imageUrl).map((i) => i.imageUrl as string)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.back()} className="text-gray-400">
          {lang !== 'en' ? <FiArrowRight className="w-5 h-5" /> : <FiArrowLeft className="w-5 h-5" />}
        </button>
        <div className="flex-1">
          <h1 className="font-bold text-gray-900 dark:text-white">{dn('الكتالوج', 'My Catalog')}</h1>
          <p className="text-[10px] text-gray-400">{items.length}/{DEFAULT_LIMIT} {dn('عناصر', 'items')}</p>
        </div>
        {!atLimit && (
          <button onClick={() => setShowForm(true)}
            className="bg-primary-600 text-white rounded-full w-8 h-8 flex items-center justify-center active:scale-90">
            <FiPlus className="w-4 h-4" />
          </button>
        )}
      </header>

      <div className="px-4 py-4 space-y-3">

        {/* Info banner — appears when entering from the place
            detail page so the user understands the dual-surface
            model in context. Hidden otherwise to keep the
            standard catalog flow clean. */}
        {fromPlace && showPlaceControls && (
          <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 p-3 text-[12px] text-emerald-800 dark:text-emerald-200 leading-relaxed">
            كتالوجك يمكن أن يظهر في بروفايلك وصفحة محلك. اختر مكان ظهور كل خدمة.
          </div>
        )}

        {/* Bulk actions — only relevant when the user has a
            claimed place. Single-surface users (profile only)
            don't need them. */}
        {showPlaceControls && items.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
              {dn('إجراءات سريعة', 'Bulk actions')}
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => bulkSet('place')}
                className="text-[11px] font-medium py-2 px-1 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 active:scale-[0.97] disabled:opacity-50"
              >
                إظهار الكل في صفحة المحل
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => bulkSet('profile')}
                className="text-[11px] font-medium py-2 px-1 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 active:scale-[0.97] disabled:opacity-50"
              >
                إظهار الكل في البروفايل
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => bulkSet('both')}
                className="text-[11px] font-medium py-2 px-1 rounded-xl bg-emerald-600 text-white active:scale-[0.97] disabled:opacity-50"
              >
                إظهار الكل في الاثنين
              </button>
            </div>
          </div>
        )}

        {/* Add Form */}
        {showForm && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 space-y-3">
            {/* Image upload area */}
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f) }} />
            {imageUrl ? (
              <div className="relative">
                <img src={imageUrl} alt="" className="w-full h-40 object-cover rounded-xl" />
                <button onClick={() => setImageUrl('')}
                  className="absolute top-2 right-2 w-6 h-6 bg-black/50 text-white rounded-full text-xs flex items-center justify-center">✕</button>
              </div>
            ) : (
              <button onClick={async () => {
                const f = await pickImageOrFallback(lang as 'ar' | 'en' | 'ur', fileRef)
                if (f) uploadImage(f)
              }} disabled={uploading}
                className="w-full h-32 border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400 active:bg-gray-50 dark:active:bg-gray-700 disabled:opacity-50">
                <FiCamera className={`w-6 h-6 ${uploading ? 'animate-pulse' : ''}`} />
                <span className="text-xs">{uploading ? <HaiSpinner /> : dn('أضف صورة', 'Add photo')}</span>
              </button>
            )}

            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder={dn('اسم المنتج أو الخدمة', 'Product or service name')}
              className="input-field text-sm" maxLength={80} autoFocus />

            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder={dn('وصف مختصر (اختياري)', 'Short description (optional)')}
              className="input-field text-sm resize-none" rows={2} maxLength={300} />

            <input type="number" value={price} onChange={e => setPrice(e.target.value)}
              placeholder={dn('السعر بالريال (اختياري)', 'Price in SAR (optional)')}
              className="input-field text-sm" min={0} max={100000} />

            <div className="flex gap-2 pt-1">
              <button onClick={resetForm}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-500 bg-gray-100 dark:bg-gray-700">
                {dn('إلغاء', 'Cancel')}
              </button>
              <button onClick={addItem} disabled={saving || !title.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-primary-600 disabled:opacity-50">
                {saving ? <HaiSpinner /> : dn('إضافة', 'Add')}
              </button>
            </div>
          </div>
        )}

        {/* Items grid — SSR'd, so it's on screen from first paint. */}
        {items.length === 0 && !showForm ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">📦</div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{dn('لم تضف أي عنصر بعد', 'No items yet')}</p>
            <p className="text-[11px] text-gray-400 mb-4">{dn('أضف خدماتك أو منتجاتك مع صور وأسعار', 'Add services or products with photos & prices')}</p>
            <button onClick={() => setShowForm(true)}
              className="text-sm text-primary-600 font-semibold active:scale-95">
              + {dn('أضف أول عنصر', 'Add first item')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {items.map(item => (
              <div key={item.id} className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-700">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" className="w-full h-28 object-cover cursor-pointer" onClick={() => setLightboxIndex(catalogImages.indexOf(item.imageUrl!))} />
                ) : (
                  <div className="w-full h-20 bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-2xl text-gray-300">📦</div>
                )}
                <div className="p-2.5">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{item.title}</p>
                  {item.description && (
                    <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">{item.description}</p>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs font-bold text-primary-600 dark:text-primary-400">
                      {item.price != null ? `${item.price} ${dn('ريال', 'SAR')}` : dn('تواصل', 'Contact')}
                    </p>
                    <button onClick={() => deleteItem(item.id)}
                      className="text-red-400 hover:text-red-500 p-1">
                      <FiTrash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Per-item visibility toggles. Two compact rows
                      with checkbox-style state. The "show on
                      place" row is hidden for users who don't own
                      a claimed place — keeps the editor uncluttered
                      for residents who only have a profile catalog. */}
                  <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 space-y-1.5">
                    <label className="flex items-center justify-between gap-2 cursor-pointer">
                      <span className="text-[10.5px] text-gray-600 dark:text-gray-300">
                        يظهر في البروفايل
                      </span>
                      <input
                        type="checkbox"
                        checked={item.showOnProfile}
                        onChange={(e) => toggleVisibility(item.id, 'showOnProfile', e.target.checked)}
                        className="w-3.5 h-3.5 rounded text-primary-600 focus:ring-primary-500 cursor-pointer"
                      />
                    </label>
                    {showPlaceControls && (
                      <label className="flex items-center justify-between gap-2 cursor-pointer">
                        <span className="text-[10.5px] text-gray-600 dark:text-gray-300">
                          يظهر في صفحة المحل
                        </span>
                        <input
                          type="checkbox"
                          checked={item.showOnPlace}
                          onChange={(e) => toggleVisibility(item.id, 'showOnPlace', e.target.checked)}
                          className="w-3.5 h-3.5 rounded text-primary-600 focus:ring-primary-500 cursor-pointer"
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Limit indicator */}
        {atLimit && (
          <p className="text-center text-[11px] text-gray-400 pt-2">
            {dn(`وصلت الحد الأقصى (${DEFAULT_LIMIT} عناصر)`, `You've reached the limit (${DEFAULT_LIMIT} items)`)}
          </p>
        )}
      </div>

      <ImageLightbox
        images={catalogImages}
        initialIndex={lightboxIndex ?? 0}
        open={lightboxIndex !== null}
        onClose={() => setLightboxIndex(null)}
      />
    </div>
  )
}
