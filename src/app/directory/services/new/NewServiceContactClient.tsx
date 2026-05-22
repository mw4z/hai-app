'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { useLanguage } from '@/hooks/useLanguage'
import DirectoryHeader from '@/components/places/DirectoryHeader'
import { SERVICE_CATEGORIES, isValidServiceCategory } from '@/lib/services/serviceCategories'

/**
 * Lightweight "add a service contact" form. Required: name, category,
 * phone. Optional: WhatsApp toggle, short description, service area,
 * notes. NO map / coords / hours / images. Prefilled when arriving from
 * the post/comment "إضافة الرقم للدليل" action (?phone=&name=&category=
 * &sourcePostId=&sourceCommentId=). The user always reviews + confirms;
 * the server runs resolve-or-create and may link instead of duplicating.
 */
export default function NewServiceContactClient() {
  const router = useRouter()
  const sp = useSearchParams()
  const { lang } = useLanguage()
  const tr = (en: string, ar: string, ur: string) => (lang === 'en' ? en : lang === 'ur' ? ur : ar)

  const prefillCat = sp?.get('category')
  const [name, setName] = useState(sp?.get('name') || '')
  const [category, setCategory] = useState<string>(prefillCat && isValidServiceCategory(prefillCat) ? prefillCat : '')
  const [phone, setPhone] = useState(sp?.get('phone') || '')
  const [whatsapp, setWhatsapp] = useState(true)
  const [description, setDescription] = useState('')
  const [serviceArea, setServiceArea] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const sourcePostId = sp?.get('sourcePostId') || undefined
  const sourceCommentId = sp?.get('sourceCommentId') || undefined

  const inputCls = 'w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary-500'

  async function submit() {
    if (loading) return
    if (name.trim().length < 2) { toast.error(tr('Enter a name', 'أدخل الاسم', 'نام درج کریں')); return }
    if (!category) { toast.error(tr('Choose a category', 'اختر فئة الخدمة', 'زمرہ منتخب کریں')); return }
    if (!phone.trim()) { toast.error(tr('Enter a phone', 'أدخل رقم الجوال', 'فون نمبر درج کریں')); return }
    setLoading(true)
    try {
      const res = await fetch('/api/directory/service-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), category, phone: phone.trim(), whatsapp, description, serviceArea, notes, sourcePostId, sourceCommentId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error || tr('Failed', 'فشل', 'ناکام')); return }

      // Resolve-or-create outcomes.
      switch (data.code) {
        case 'MATCHED_PROVIDER':
          toast(data.message, { icon: 'ℹ️', duration: 5000 })
          if (data.providerUserId) router.push(`/profile?u=${data.providerUserId}`)
          else router.push('/directory?tab=services')
          return
        case 'MATCHED_SERVICE_CONTACT':
          toast(data.message, { icon: 'ℹ️', duration: 5000 })
          router.push('/directory?tab=services')
          return
        case 'GENERIC_PENDING_MATCH':
          toast(data.message, { icon: '🕓', duration: 6000 })
          router.push('/directory?tab=services')
          return
        default: // CREATED
          toast.success(data.message || tr('Added', 'تمت الإضافة', 'شامل ہو گیا'))
          router.push('/directory?tab=services')
      }
    } catch {
      toast.error(tr('Connection error', 'خطأ بالاتصال', 'کنکشن خرابی'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="hai-directory-screen min-h-screen bg-gray-50 dark:bg-[#19232a]">
      <DirectoryHeader title={tr('Add a service / number', 'إضافة خدمة / رقم', 'خدمت / نمبر شامل کریں')} backHref="/directory?tab=services" />
      <div className="max-w-[640px] mx-auto px-4 pt-4 space-y-3" style={{ paddingBottom: 'calc(var(--hai-safe-bottom, 0px) + 2rem)' }}>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {tr('Share a trusted local service. Listed as "added by residents" until the owner verifies it.',
              'شارك رقم خدمة موثوق في حيّك. يظهر بوسم "مضاف من السكان" حتى يؤكده صاحبه.',
              'بھروسہ مند خدمت کا نمبر شیئر کریں۔')}
        </p>

        <label className="block">
          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{tr('Name', 'الاسم', 'نام')} *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={tr('e.g. Abu Khalid plumbing', 'مثال: أبو خالد للسباكة', 'مثال')} className={inputCls} />
        </label>

        <div>
          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{tr('Service', 'نوع الخدمة', 'خدمت')} *</span>
          <div className="grid grid-cols-3 gap-2">
            {SERVICE_CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key)}
                className={`flex flex-col items-center justify-center gap-1 aspect-[5/4] p-1.5 rounded-xl border text-center active:scale-[0.97] transition-transform ${
                  category === c.key ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                }`}
              >
                <span className="text-lg">{c.emoji}</span>
                <span className="text-[10px] font-medium text-gray-700 dark:text-gray-200 leading-tight">
                  {lang === 'en' ? c.labelEn : lang === 'ur' ? c.labelUr : c.labelAr}
                </span>
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{tr('Phone', 'رقم الجوال', 'فون')} *</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" inputMode="tel" placeholder="05xxxxxxxx" className={inputCls} />
        </label>

        <label className="flex items-center gap-2.5 cursor-pointer select-none rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
          <input type="checkbox" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500" />
          <span className="text-sm text-gray-700 dark:text-gray-200">{tr('WhatsApp on the same number', 'واتساب على نفس الرقم', 'اسی نمبر پر واٹس ایپ')}</span>
        </label>

        <label className="block">
          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{tr('Service area (optional)', 'نطاق الخدمة (اختياري)', 'علاقہ (اختیاری)')}</span>
          <input value={serviceArea} onChange={(e) => setServiceArea(e.target.value)} maxLength={120} placeholder={tr('e.g. North Jeddah', 'مثال: شمال جدة', '')} className={inputCls} />
        </label>

        <label className="block">
          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{tr('Short description (optional)', 'وصف مختصر (اختياري)', 'مختصر تفصیل')}</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={280} rows={3} className={`${inputCls} resize-none`} />
        </label>

        <button onClick={submit} disabled={loading} className="w-full py-3.5 rounded-2xl bg-primary-600 text-white font-bold text-sm disabled:opacity-50 active:scale-[0.98] transition-transform">
          {loading ? tr('Adding…', 'جاري الإضافة…', 'شامل ہو رہا ہے…') : tr('Add to directory', 'إضافة للدليل', 'ڈائریکٹری میں شامل کریں')}
        </button>
      </div>
    </main>
  )
}
