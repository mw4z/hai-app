'use client'

import { useEffect, useState } from 'react'
import { useLanguage } from '@/hooks/useLanguage'

const IOS_STORE_URL =
  process.env.NEXT_PUBLIC_IOS_STORE_URL ||
  'https://apps.apple.com/us/app/%D8%AD%D9%8A/id6761731680'
const ANDROID_STORE_URL =
  process.env.NEXT_PUBLIC_ANDROID_STORE_URL ||
  'https://play.google.com/store/apps/details?id=com.hai.app'

type PublicPoll = {
  question: string
  options: string[]
  votes: number
  neighborhoodName: string | null
  closed: boolean
} | null

export default function PollShareView({ poll, pollId }: { poll: PublicPoll; pollId: string }) {
  const { lang } = useLanguage()
  const en = lang === 'en'
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other')

  // Inside the native app a shared link should jump straight to the real
  // poll — only plain browsers see this install landing.
  useEffect(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
    if (/HaiNativeApp/i.test(ua)) {
      window.location.replace(`/feed?poll=${pollId}`)
      return
    }
    if (/iPad|iPhone|iPod/.test(ua)) setPlatform('ios')
    else if (/Android/i.test(ua)) setPlatform('android')
  }, [pollId])

  const t = {
    badge: en ? 'Neighborhood poll' : 'استطلاع الحي',
    missing: en ? 'This poll isn’t available anymore.' : 'هذا الاستطلاع لم يعد متاحاً.',
    votes: (n: number) => (en ? `${n} voted` : `${n} صوّتوا`),
    closed: en ? 'Voting closed' : 'انتهى التصويت',
    cta: en ? 'Open in the Hai app' : 'افتح في تطبيق حي',
    sub: en
      ? 'Vote and see live results with your neighbors on Hai.'
      : 'صوّت وشوف النتائج المباشرة مع جيرانك في تطبيق حي.',
    appStore: en ? 'App Store' : 'App Store',
    googlePlay: en ? 'Google Play' : 'Google Play',
  }

  const storeButtons = (
    <div className="mt-7 w-full space-y-3">
      {platform === 'ios' && (
        <a href={IOS_STORE_URL} className="block w-full rounded-2xl bg-primary-600 hover:bg-primary-700 text-white font-bold py-3.5 text-sm transition-colors">
          {t.cta} — {t.appStore}
        </a>
      )}
      {platform === 'android' && (
        <a href={ANDROID_STORE_URL} className="block w-full rounded-2xl bg-primary-600 hover:bg-primary-700 text-white font-bold py-3.5 text-sm transition-colors">
          {t.cta} — {t.googlePlay}
        </a>
      )}
      {platform === 'other' && (
        <div className="grid grid-cols-2 gap-2.5">
          <a href={IOS_STORE_URL} className="rounded-2xl bg-primary-600 hover:bg-primary-700 text-white font-bold py-3.5 text-xs text-center transition-colors">{t.appStore}</a>
          <a href={ANDROID_STORE_URL} className="rounded-2xl bg-primary-600 hover:bg-primary-700 text-white font-bold py-3.5 text-xs text-center transition-colors">{t.googlePlay}</a>
        </div>
      )}
      <p className="text-[11px] text-gray-500 dark:text-gray-400 pt-1">{t.sub}</p>
    </div>
  )

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-primary-50 to-white dark:from-gray-900 dark:to-gray-800 p-6">
      <div className="text-center max-w-sm w-full">
        {/* Hai mark */}
        <img src="/icon-192.png" alt="Hai" className="w-16 h-16 rounded-2xl mx-auto mb-5 shadow-lg" />

        {!poll ? (
          <>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">حي · Hai</h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm">{t.missing}</p>
            {storeButtons}
          </>
        ) : (
          <>
            <span className="inline-block text-[11px] font-bold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 rounded-full px-3 py-1 mb-3">
              📊 {t.badge}{poll.neighborhoodName ? ` · ${poll.neighborhoodName}` : ''}
            </span>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-snug mb-4">
              {poll.question}
            </h1>

            <div className="space-y-2 text-right">
              {poll.options.map((opt, i) => (
                <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/60 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200">
                  {opt}
                </div>
              ))}
            </div>

            <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-3">
              {poll.closed ? t.closed : t.votes(poll.votes)}
            </p>

            {storeButtons}
          </>
        )}
      </div>
    </main>
  )
}
