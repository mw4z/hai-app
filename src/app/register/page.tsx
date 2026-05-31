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
    <main className="hai-screen">
      <Link href="/" className="hai-link--back hai-self-start hai-mb-4">
        {lang !== 'en' ? <FiArrowRight className="hai-icon-md" /> : <FiArrowLeft className="hai-icon-md" />}
        {t('common_back')}
      </Link>

      <div className="hai-stack-1 hai-mb-5">
        <h1 className="hai-h2">{t('register_title')}</h1>
        <p className="hai-caption">{t('register_subtitle')}</p>
      </div>

      <form onSubmit={handleSubmit} className="hai-stack-4">
        <div>
          <label className="hai-label">
            {t('auth_phone_label')}
          </label>
          <div className="hai-input-group">
            <span className="hai-input-affix">
              🇸🇦 +966
            </span>
            <input
              type="tel"
              inputMode="numeric"
              placeholder="5xxxxxxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              maxLength={10}
              required
              dir="ltr"
            />
          </div>
          <p className="hai-field-hint">
            {lang === 'en' ? 'Enter with 05 or without the leading 0' : lang === 'ur' ? 'اپنا نمبر 05 کے ساتھ یا بغیر درج کریں' : 'أدخل رقمك بـ 05 أو بدون الصفر'}
          </p>
        </div>

        <button type="submit" disabled={loading} className="hai-btn-primary hai-btn-block hai-mt-2">
          {loading ? t('auth_sending') : t('auth_send_otp')}
        </button>

        {/* Consent text used to pre-state "you confirm you are 13+",
            which Google Play's Families Policy flagged on May 31 2026
            as a non-neutral age verification gate (it pre-states the
            answer the user is asked to confirm, with no actual
            verification step). Removed the age claim entirely —
            Hai is a neighbourhood services platform for residents,
            not age-restricted content. Just the Terms / Privacy
            agreement remains. */}
        <p className="hai-meta hai-text-center">
          {lang === 'en'
            ? 'By continuing, you agree to our Terms & Privacy Policy'
            : lang === 'ur'
            ? 'جاری رکھ کر، آپ ہماری شرائط اور رازداری کی پالیسی سے اتفاق کرتے ہیں'
            : 'بالمتابعة، توافق على الشروط وسياسة الخصوصية'}
        </p>
      </form>

      <p className="hai-caption hai-text-center hai-mt-6">
        {t('register_has_account')}{' '}
        <Link href="/login" className="hai-link">
          {t('login_title')}
        </Link>
      </p>

      {/* Language Switcher */}
      <div className="hai-row-2 hai-justify-center hai-mt-8 hai-mb-2">
        <FiGlobe className="hai-icon-sm hai-ic-faint" />
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
            data-active={lang === l ? 'true' : 'false'}
            className="hai-chip hai-chip--sm"
          >
            {l === 'ar' ? 'العربية' : l === 'en' ? 'English' : 'اردو'}
          </button>
        ))}
      </div>

      <p className="hai-meta hai-text-center hai-mt-auto hai-pb-8 hai-pt-4">
        {t('register_terms')}{' '}
        <Link href="/terms" className="hai-link hai-link--underline">{t('register_terms_link')}</Link>
        {' '}{t('register_and')}{' '}
        <Link href="/privacy" className="hai-link hai-link--underline">{t('register_privacy_link')}</Link>
      </p>
    </main>
  )
}
