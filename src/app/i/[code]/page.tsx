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
  'https://apps.apple.com/app/hai/id6753196418'
const ANDROID_STORE_URL =
  process.env.NEXT_PUBLIC_ANDROID_STORE_URL ||
  'https://play.google.com/store/apps/details?id=net.hai_app.hai'

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
                ? 'Your invite code is saved. Open the app to finish joining.'
                : 'تم حفظ رمز الدعوة. افتح التطبيق لإكمال الانضمام.'}
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
