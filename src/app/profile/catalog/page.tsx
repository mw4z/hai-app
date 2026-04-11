'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { uploadFiles } from '@/lib/upload'
import { useLanguage } from '@/hooks/useLanguage'
import { FiArrowRight, FiArrowLeft, FiPlus, FiTrash2, FiCamera } from 'react-icons/fi'

const DEFAULT_LIMIT = 3 // Matches FREE plan. Actual enforcement is in API.

interface Item {
  id: string
  title: string
  description: string | null
  price: number | null
  imageUrl: string | null
}

export default function CatalogPage() {
  const { lang } = useLanguage()
  const router = useRouter()
  const dn = (ar: string, en: string) => lang === 'en' ? en : ar

  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/service-items/mine')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setItems(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function uploadImage(file: File) {
    if (uploading) return
    setUploading(true)
    try {
      const urls = await uploadFiles([file])
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
        setItems(prev => [...prev, item])
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

  function resetForm() {
    setTitle(''); setDescription(''); setPrice(''); setImageUrl(''); setShowForm(false)
  }

  const atLimit = items.length >= DEFAULT_LIMIT

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
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="w-full h-32 border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400 active:bg-gray-50 dark:active:bg-gray-700 disabled:opacity-50">
                <FiCamera className={`w-6 h-6 ${uploading ? 'animate-pulse' : ''}`} />
                <span className="text-xs">{uploading ? '...' : dn('أضف صورة', 'Add photo')}</span>
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
                {saving ? '...' : dn('إضافة', 'Add')}
              </button>
            </div>
          </div>
        )}

        {/* Items grid */}
        {loading ? (
          <div className="text-center py-12">
            <div className="hai-loader text-primary-600 mx-auto" style={{width:40,height:40}}><svg viewBox="0 0 64 64" fill="none" className="w-full h-full"><circle className="hai-dot hai-dot-center" cx="32" cy="35" r="6" fill="currentColor"/><circle className="hai-dot hai-dot-top" cx="32" cy="15" r="4" fill="currentColor"/><circle className="hai-dot hai-dot-br" cx="48" cy="47" r="4" fill="currentColor"/><circle className="hai-dot hai-dot-bl" cx="16" cy="47" r="4" fill="currentColor"/></svg></div>
          </div>
        ) : items.length === 0 && !showForm ? (
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
                  <img src={item.imageUrl} alt="" className="w-full h-28 object-cover" />
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
    </div>
  )
}
