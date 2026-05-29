'use client'

import { useEffect, useState } from 'react'
import type { PostCategory } from '@prisma/client'
import { useLanguage } from '@/hooks/useLanguage'
import { categoryLabel } from '@/lib/posts/displayTitle'

const IOS_STORE_URL =
  process.env.NEXT_PUBLIC_IOS_STORE_URL ||
  'https://apps.apple.com/us/app/%D8%AD%D9%8A/id6761731680'
const ANDROID_STORE_URL =
  process.env.NEXT_PUBLIC_ANDROID_STORE_URL ||
  'https://play.google.com/store/apps/details?id=com.hai.app'

type PublicPost = {
  headline: string
  snippet: string | null
  category: PostCategory
  neighborhoodName: string | null
} | null

export default function PostShareView({ post, postId }: { post: PublicPost; postId: string }) {
  const { lang } = useLanguage()
  const en = lang === 'en'
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other')

  // In the native app, jump straight to the real post in the feed.
  useEffect(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
    if (/HaiNativeApp/i.test(ua)) {
      // Mark a deeplink-landed timestamp BEFORE the redirect so
      // SwUpdateReload's guard (which reads this same key)
      // skips the mid-load page-reload that was wiping the
      // ?post=<id> query param mid-cold-start.
      try { sessionStorage.setItem('hai:deeplink-landed-at', String(Date.now())) } catch {}
      window.location.replace(`/feed?post=${postId}`)
      return
    }
    if (/iPad|iPhone|iPod/.test(ua)) setPlatform('ios')
    else if (/Android/i.test(ua)) setPlatform('android')
  }, [postId])

  const t = {
    missing: en ? 'This post isn’t available anymore.' : 'هذا المنشور لم يعد متاحاً.',
    cta: en ? 'Open in the Hai app' : 'افتح في تطبيق حي',
    sub: en
      ? 'See the full post and reply to your neighbors on Hai.'
      : 'شوف المنشور كامل وردّ على جيرانك في تطبيق حي.',
    appStore: 'App Store',
    googlePlay: 'Google Play',
  }

  // Android intent:// URL — explicit handoff to the Hai app for the
  // SAME post URL. Bypasses the App Links verification cache: even
  // if a device hasn't re-verified our (updated) assetlinks.json,
  // Chrome will still launch com.hai.app with this intent. If the
  // app isn't installed, S.browser_fallback_url drops the user on
  // the Play Store listing automatically.
  const androidIntentUrl =
    `intent://app.hai-app.net/s/post/${encodeURIComponent(postId)}` +
    `#Intent;scheme=https;package=com.hai.app;` +
    `S.browser_fallback_url=${encodeURIComponent(ANDROID_STORE_URL)};end`

  const openInAppLabel = en ? 'Open in the Hai app' : 'افتح في تطبيق حي'
  const orInstallLabel = en ? 'Don’t have it? Install Hai' : 'ما عندك التطبيق؟ نزّله'

  const storeButtons = (
    <div className="mt-7 w-full space-y-3">
      {platform === 'ios' && (
        <a href={IOS_STORE_URL} className="block w-full rounded-2xl bg-primary-600 hover:bg-primary-700 text-white font-bold py-3.5 text-sm transition-colors">
          {t.cta} — {t.appStore}
        </a>
      )}
      {platform === 'android' && (
        <>
          {/* Primary CTA: launch the installed Hai app via intent://.
              Works even when App Links verification is stale; falls
              back to Play Store automatically if the app isn't there. */}
          <a
            href={androidIntentUrl}
            className="block w-full rounded-2xl bg-primary-600 hover:bg-primary-700 text-white font-bold py-3.5 text-sm transition-colors"
          >
            {openInAppLabel}
          </a>
          {/* Secondary CTA: explicit Play Store link for users who
              tapped Open and the app didn't show up (rare — intent
              fallback should already cover this). */}
          <a
            href={ANDROID_STORE_URL}
            className="block w-full rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-semibold py-3 text-xs text-center transition-colors"
          >
            {orInstallLabel}
          </a>
        </>
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

  const badgeText = post
    ? `${categoryLabel(post.category, lang)}${post.neighborhoodName ? ` · ${post.neighborhoodName}` : ''}`
    : ''

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-primary-50 to-white dark:from-gray-900 dark:to-gray-800 p-6">
      <div className="text-center max-w-sm w-full">
        <img src="/icon-192.png" alt="Hai" className="w-16 h-16 rounded-2xl mx-auto mb-5 shadow-lg" />

        {!post ? (
          <>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">حي · Hai</h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm">{t.missing}</p>
            {storeButtons}
          </>
        ) : (
          <>
            <span className="inline-block text-[11px] font-bold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 rounded-full px-3 py-1 mb-3">
              📍 {badgeText}
            </span>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-snug">
              {post.headline}
            </h1>
            {post.snippet && (
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-3 leading-relaxed">
                {post.snippet}
              </p>
            )}
            {storeButtons}
          </>
        )}
      </div>
    </main>
  )
}
