'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useLanguage } from '@/hooks/useLanguage'
import { FiArrowRight, FiArrowLeft } from 'react-icons/fi'

function VerifyForm() {
  const router = useRouter()
  const { t, lang } = useLanguage()
  const searchParams = useSearchParams()
  const phone = searchParams.get('phone') || ''

  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendTimer, setResendTimer] = useState(60)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const timer = setInterval(() => {
      setResendTimer((t) => (t > 0 ? t - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  function handleChange(value: string) {
    const clean = value.replace(/\D/g, '').slice(0, 4)
    setCode(clean)
    if (clean.length === 4) {
      setTimeout(() => {
        if (!loading) submitCode(clean)
      }, 300)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (code.length !== 4) {
      toast.error(t('verify_enter_code'))
      return
    }
    submitCode(code)
  }

  async function submitCode(code: string) {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      })

      const data = await res.json()
      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : data.error?.message || t('verify_invalid'))
        return
      }

      if (data.isNewUser) {
        try { sessionStorage.setItem('hai_show_tour', '1') } catch {}
        router.push('/onboarding')
      } else {
        // Returning user — fire auth-ready so push registration can kick in.
        // New users will fire this themselves after onboarding completes.
        try { window.dispatchEvent(new CustomEvent('hai:auth-ready')) } catch {}
        router.push('/feed')
      }
    } catch {
      toast.error(t('auth_connection_err'))
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (resendTimer > 0) return
    try {
      await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      toast.success(t('verify_resent'))
      setResendTimer(60)
      setCode('')
      inputRef.current?.focus()
    } catch {
      toast.error(t('auth_connection_err'))
    }
  }

  return (
    <main className="flex flex-col px-6 pt-6 bg-white" style={{ minHeight: 'calc(100dvh - env(safe-area-inset-top, 0px))' }}>
      <Link href="/register" className="flex items-center gap-1 text-gray-400 text-sm mb-4 self-start">
        {lang !== 'en' ? <FiArrowRight className="w-4 h-4" /> : <FiArrowLeft className="w-4 h-4" />}
        {t('common_back')}
      </Link>

      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('verify_title')}</h1>
        <p className="text-gray-500 text-sm">{t('verify_subtitle')}</p>
        <p className="text-primary-600 font-medium text-sm mt-1" dir="ltr">{phone}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="relative flex justify-center gap-2" dir="ltr" onClick={() => inputRef.current?.focus()}>
          {/* Hidden real input for autofill */}
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            name="otp"
            pattern="[0-9]*"
            maxLength={4}
            value={code}
            onChange={(e) => handleChange(e.target.value)}
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              opacity: 0,
              zIndex: 10,
              fontSize: '16px',
              caretColor: 'transparent',
            }}
          />
          {/* Visual boxes */}
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`w-14 h-16 flex items-center justify-center text-2xl font-bold border-2 rounded-xl transition-all ${
                code[i]
                  ? 'border-primary-500'
                  : i === code.length
                  ? 'border-primary-500 ring-2 ring-primary-200'
                  : 'border-gray-200'
              }`}
            >
              {code[i] || ''}
            </div>
          ))}
        </div>

        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? t('verify_verifying') : t('verify_confirm')}
        </button>
      </form>

      <div className="text-center mt-6">
        {resendTimer > 0 ? (
          <p className="text-gray-400 text-sm">
            {t('verify_resend_after')}{' '}
            <span className="text-primary-600 font-medium">{resendTimer}</span>
            {' '}{t('verify_seconds')}
          </p>
        ) : (
          <button onClick={handleResend} className="text-primary-600 font-medium text-sm">
            {t('verify_resend')}
          </button>
        )}
      </div>
    </main>
  )
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">...</div>}>
      <VerifyForm />
    </Suspense>
  )
}
