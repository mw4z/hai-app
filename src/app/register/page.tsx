'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { isValidSaudiPhone } from '@/lib/phone'
import { useLanguage, LANGUAGE_CHANGE_EVENT } from '@/hooks/useLanguage'
import { FiArrowRight, FiArrowLeft, FiGlobe } from 'react-icons/fi'

export default function RegisterPage() {
  const router = useRouter()
  const { t, lang } = useLanguage()
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!isValidSaudiPhone(phone)) {
      toast.error(t('auth_invalid_phone'))
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })

      const data = await res.json()
      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : data.error?.message || t('common_error'))
        return
      }

      toast.success(t('auth_otp_sent'))
      router.push(`/verify?phone=${encodeURIComponent(phone)}`)
    } catch {
      toast.error(t('auth_connection_err'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-[100dvh] flex flex-col px-6 pt-6 bg-white">
      <Link href="/" className="flex items-center gap-1 text-gray-400 text-sm mb-4 self-start">
        {lang !== 'en' ? <FiArrowRight className="w-4 h-4" /> : <FiArrowLeft className="w-4 h-4" />}
        {t('common_back')}
      </Link>

      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('register_title')}</h1>
        <p className="text-gray-500 text-sm">{t('register_subtitle')}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('auth_phone_label')}
          </label>
          <div className="flex items-center border border-gray-200 rounded-xl bg-white focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent">
            <span className="px-3 text-gray-500 text-sm border-l border-gray-200 py-3">
              🇸🇦 +966
            </span>
            <input
              type="tel"
              inputMode="numeric"
              placeholder="5xxxxxxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              className="flex-1 px-3 py-3 text-right bg-transparent focus:outline-none text-base"
              maxLength={10}
              required
              dir="ltr"
            />
          </div>
          <p className="text-xs text-gray-400 mt-1.5 px-1">
            {lang === 'en' ? 'Enter with 05 or without the leading 0' : lang === 'ur' ? 'اپنا نمبر 05 کے ساتھ یا بغیر درج کریں' : 'أدخل رقمك بـ 05 أو بدون الصفر'}
          </p>
        </div>

        <button type="submit" disabled={loading} className="btn-primary mt-6">
          {loading ? t('auth_sending') : t('auth_send_otp')}
        </button>

        <p className="text-[11px] text-gray-400 text-center mt-3 leading-relaxed">
          {lang === 'en'
            ? 'By continuing, you confirm you are 13+ and agree to our Terms & Privacy Policy'
            : lang === 'ur'
            ? 'جاری رکھ کر، آپ تصدیق کرتے ہیں کہ آپ کی عمر 13+ ہے'
            : 'بالمتابعة، تؤكد أن عمرك 13 سنة أو أكثر وتوافق على الشروط وسياسة الخصوصية'}
        </p>
      </form>

      <p className="text-center text-gray-500 text-sm mt-6">
        {t('register_has_account')}{' '}
        <Link href="/login" className="text-primary-600 font-medium">
          {t('login_title')}
        </Link>
      </p>

      {/* Language Switcher */}
      <div className="flex items-center justify-center gap-2 mt-8 mb-2">
        <FiGlobe className="w-3.5 h-3.5 text-gray-400" />
        {(['ar', 'en', 'ur'] as const).map((l) => (
          <button
            key={l}
            onClick={() => {
              localStorage.setItem('hai_language', l)
              document.cookie = `hai_language=${l}; path=/; max-age=31536000; SameSite=Lax`
              document.documentElement.setAttribute('lang', l)
              document.documentElement.setAttribute('dir', l === 'en' ? 'ltr' : 'rtl')
              window.dispatchEvent(new Event(LANGUAGE_CHANGE_EVENT))
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              lang === l
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-600 active:bg-gray-200'
            }`}
          >
            {l === 'ar' ? 'العربية' : l === 'en' ? 'English' : 'اردو'}
          </button>
        ))}
      </div>

      <p className="text-center text-gray-400 text-xs mt-auto pb-8 pt-4">
        {t('register_terms')}{' '}
        <Link href="/terms" className="text-primary-600 underline">{t('register_terms_link')}</Link>
        {' '}{t('register_and')}{' '}
        <Link href="/privacy" className="text-primary-600 underline">{t('register_privacy_link')}</Link>
      </p>
    </main>
  )
}
