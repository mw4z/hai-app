'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  savePendingInviteCode,
  isValidInviteCode,
} from '@/lib/pendingInvite'
import { useLanguage } from '@/hooks/useLanguage'

type Preview = {
  inviterName: string | null
  neighborhoodName: string | null
}

/**
 * App Store / Play Store URLs. Override via env if they change.
 * These are shown to web visitors who arrive at /i/<code> without
 * the app installed — native-app visitors skip this UI because the
 * page auto-advances for them.
 */
const IOS_STORE_URL =
  process.env.NEXT_PUBLIC_IOS_STORE_URL ||
  'https://apps.apple.com/us/app/%D8%AD%D9%8A/id6761731680'
const ANDROID_STORE_URL =
  process.env.NEXT_PUBLIC_ANDROID_STORE_URL ||
  'https://play.google.com/store/apps/details?id=com.hai.app'

function detectPlatform(): 'ios' | 'android' | 'other' {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'other'
}

function isNativeAppUA(): boolean {
  if (typeof navigator === 'undefined') return false
  return /HaiNativeApp/i.test(navigator.userAgent || '')
}

export default function InviteLandingPage({
  params,
}: {
  params: { code: string }
}) {
  const router = useRouter()
  const { lang } = useLanguage()
  const [status, setStatus] = useState<'capturing' | 'ok' | 'invalid'>(
    'capturing',
  )
  const [preview, setPreview] = useState<Preview | null>(null)
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other')
  const [inNativeApp, setInNativeApp] = useState(false)
  const [copied, setCopied] = useState(false)

  // The code is right here in the URL — show it so a user who taps the
  // link (and never saw the message text) can still type it at signup.
  const displayCode = decodeURIComponent(params.code || '').trim().toUpperCase()

  async function copyCode() {
    try {
      await navigator.clipboard?.writeText(displayCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {}
  }

  useEffect(() => {
    setPlatform(detectPlatform())
    setInNativeApp(isNativeAppUA())
  }, [])

  useEffect(() => {
    const raw = decodeURIComponent(params.code || '').trim()

    if (!isValidInviteCode(raw)) {
      setStatus('invalid')
      const t = setTimeout(() => router.replace('/'), 1500)
      return () => clearTimeout(t)
    }

    const saved = savePendingInviteCode(raw)
    setStatus(saved ? 'ok' : 'invalid')

    fetch(`/api/invites/preview?code=${encodeURIComponent(raw)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.valid) {
          setPreview({
            inviterName: data.inviterName ?? null,
            neighborhoodName: data.neighborhoodName ?? null,
          })
        }
      })
      .catch(() => {})

    // Only auto-advance when we're already inside the native WebView.
    // On a plain browser we stay on this page and show install buttons
    // — otherwise middleware bounces the user to the marketing site and
    // the invite flow looks like it "went nowhere".
    if (isNativeAppUA()) {
      const t = setTimeout(() => router.replace('/'), 2200)
      return () => clearTimeout(t)
    }

    // Plain Android browser → transfer to Google Play automatically (the
    // invite code was saved above). Brief delay so the "you're invited"
    // preview shows first. iOS keeps its existing button flow.
    if (detectPlatform() === 'android') {
      const t = setTimeout(() => { window.location.href = ANDROID_STORE_URL }, 1400)
      return () => clearTimeout(t)
    }
  }, [params.code, router])

  const title = lang === 'en' ? "You're invited to Hai" : 'تمت دعوتك إلى حي'
  const sub = preview?.inviterName
    ? lang === 'en'
      ? `${preview.inviterName} invited you${
          preview.neighborhoodName ? ` · ${preview.neighborhoodName}` : ''
        }`
      : `${preview.inviterName} دعاك${
          preview.neighborhoodName ? ` · ${preview.neighborhoodName}` : ''
        }`
    : lang === 'en'
      ? 'Join your neighborhood'
      : 'انضم إلى جيرانك'

  const storeUrl =
    platform === 'ios'
      ? IOS_STORE_URL
      : platform === 'android'
        ? ANDROID_STORE_URL
        : null
  const storeLabel =
    platform === 'ios'
      ? (lang === 'en' ? 'Get on the App Store' : 'حمّل من App Store')
      : platform === 'android'
        ? (lang === 'en' ? 'Get it on Google Play' : 'حمّل من Google Play')
        : (lang === 'en' ? 'Install the app' : 'ثبّت التطبيق')

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-primary-50 to-white dark:from-gray-900 dark:to-gray-800 p-6">
      <div className="text-center max-w-sm w-full">
        <div className="text-6xl mb-5">🏘️</div>
        <h1 className="text-2xl font-bold text-primary-700 dark:text-primary-300 mb-2">
          {title}
        </h1>
        <p className="text-gray-600 dark:text-gray-400 text-sm">{sub}</p>

        {status === 'invalid' ? (
          <p className="text-xs text-red-500 mt-6">
            {lang === 'en' ? 'Invalid invite link' : 'رابط دعوة غير صالح'}
          </p>
        ) : inNativeApp ? (
          <div className="mt-6 text-xs text-gray-400 dark:text-gray-500">
            {lang === 'en' ? 'Opening the app...' : 'جاري فتح التطبيق...'}
          </div>
        ) : (
          <div className="mt-8 space-y-3">
            {/* The invite code, copyable — they'll enter it when they sign
                up in the app (deferred deep linking isn't available, so the
                code is carried by the user, not the install). */}
            {isValidInviteCode(displayCode) && (
              <div className="rounded-xl border border-primary-200 dark:border-primary-800/60 bg-primary-50 dark:bg-primary-900/20 p-3">
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1">
                  {lang === 'en' ? 'Your invite code' : 'كود دعوتك'}
                </p>
                <button
                  type="button"
                  onClick={copyCode}
                  className="w-full font-mono text-lg font-bold tracking-wider text-primary-700 dark:text-primary-300 active:scale-[0.98] transition-transform"
                >
                  {displayCode}
                </button>
                <p className="text-[10px] text-primary-600 dark:text-primary-400 mt-1">
                  {copied
                    ? (lang === 'en' ? 'Copied ✓' : 'تم النسخ ✓')
                    : (lang === 'en' ? 'Tap to copy — enter it when you sign up' : 'اضغط للنسخ — أدخله عند التسجيل')}
                </p>
              </div>
            )}
            {storeUrl && (
              <a
                href={storeUrl}
                className="block w-full rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 text-sm transition-colors"
              >
                {storeLabel}
              </a>
            )}
            {platform === 'other' && (
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={IOS_STORE_URL}
                  className="rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 text-xs text-center transition-colors"
                >
                  {lang === 'en' ? 'App Store' : 'App Store'}
                </a>
                <a
                  href={ANDROID_STORE_URL}
                  className="rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 text-xs text-center transition-colors"
                >
                  {lang === 'en' ? 'Google Play' : 'Google Play'}
                </a>
              </div>
            )}
            <p className="text-[11px] text-gray-500 dark:text-gray-400 pt-2">
              {lang === 'en'
                ? 'Install the app, then enter your code at sign-up to finish joining.'
                : 'ثبّت التطبيق ثم أدخل الكود عند التسجيل لإكمال الانضمام.'}
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
