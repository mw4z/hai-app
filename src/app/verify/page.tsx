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

  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [resendTimer, setResendTimer] = useState(60)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    inputRefs.current[0]?.focus()
    const timer = setInterval(() => {
      setResendTimer((t) => (t > 0 ? t - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const hiddenRef = useRef<HTMLInputElement>(null)

  function handleOtpChange(index: number, value: string) {
    // Handle paste or autofill of full code into a single box
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 6)
      if (digits.length >= 2) {
        const newOtp = digits.split('').concat(Array(6).fill('')).slice(0, 6)
        setOtp(newOtp)
        if (digits.length === 6) {
          inputRefs.current[5]?.focus()
          // Auto-submit after a short delay
          setTimeout(() => autoSubmit(newOtp.join('')), 300)
        } else {
          inputRefs.current[Math.min(digits.length, 5)]?.focus()
        }
        return
      }
    }
    if (!/^\d*$/.test(value)) return
    const newOtp = [...otp]
    newOtp[index] = value.slice(-1)
    setOtp(newOtp)
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
    // Auto-submit when all 6 digits filled
    const code = newOtp.join('')
    if (code.length === 6 && !code.includes('')) {
      setTimeout(() => autoSubmit(code), 300)
    }
  }

  // Handle the hidden autofill input
  function handleAutofill(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 6)
    if (digits.length === 0) return
    const newOtp = digits.split('').concat(Array(6).fill('')).slice(0, 6)
    setOtp(newOtp)
    if (digits.length === 6) {
      setTimeout(() => autoSubmit(digits), 300)
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  function autoSubmit(code: string) {
    if (code.length !== 6 || loading) return
    submitCode(code)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const code = otp.join('')
    if (code.length !== 6) {
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
        router.push('/onboarding')
      } else {
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
      setOtp(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
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
        <div className="flex justify-center gap-2" dir="ltr">
          {otp.map((digit, index) => (
            <input
              key={index}
              ref={(el) => { inputRefs.current[index] = el }}
              type="tel"
              inputMode="numeric"
              {...(index === 0 ? { autoComplete: 'one-time-code' } : {})}
              maxLength={6}
              value={digit}
              onChange={(e) => handleOtpChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={(e) => {
                const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
                if (paste.length >= 2) {
                  e.preventDefault()
                  const newOtp = paste.split('').concat(Array(6).fill('')).slice(0, 6)
                  setOtp(newOtp)
                  if (paste.length === 6) setTimeout(() => autoSubmit(paste), 300)
                }
              }}
              className="w-12 h-14 text-center text-xl font-bold border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
            />
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
