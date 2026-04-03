'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useLanguage, LANGUAGE_CHANGE_EVENT } from '@/hooks/useLanguage'
import type { Lang } from '@/lib/i18n'

function applyLanguage(l: Lang) {
  localStorage.setItem('hai_language', l)
  document.cookie = `hai_language=${l}; path=/; max-age=31536000; SameSite=Lax`
  document.documentElement.setAttribute('lang', l)
  document.documentElement.setAttribute('dir', l === 'en' ? 'ltr' : 'rtl')
  window.dispatchEvent(new Event(LANGUAGE_CHANGE_EVENT))
}

const PHRASES: Record<Lang, string[]> = {
  ar: ['ابدأ من حيّك', 'سوق، خدمات، تنبيهات', 'جارك أقرب مما تتوقع', 'حيّك يتكلم', 'كل شي قريب منك'],
  en: ['Start from your block', 'Market, services, alerts', 'Closer than you think', 'Your block speaks', 'Everything nearby'],
  ur: ['اپنے محلے سے شروع کریں', 'مارکیٹ، خدمات، الرٹس', 'جتنا سوچتے ہیں اتنا قریب', 'محلے کی آواز', 'سب کچھ قریب'],
}

export default function HomeClient() {
  const { t, lang } = useLanguage()
  const [phraseIdx, setPhraseIdx] = useState(0)
  const [fadeClass, setFadeClass] = useState('_h-phrase-in')
  const phrases = PHRASES[lang] || PHRASES.ar

  useEffect(() => {
    const interval = setInterval(() => {
      setFadeClass('_h-phrase-out')
      setTimeout(() => {
        setPhraseIdx(prev => (prev + 1) % phrases.length)
        setFadeClass('_h-phrase-in')
      }, 500)
    }, 2000)
    return () => clearInterval(interval)
  }, [phrases.length])

  useEffect(() => { setPhraseIdx(0) }, [lang])

  return (
    <main className="min-h-[100dvh] flex flex-col bg-white dark:bg-gray-900">
      {/* Language toggle */}
      <div className="flex justify-end px-6 pt-3 bg-white dark:bg-gray-900">
        <div className="flex rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden text-xs font-medium">
          {(['ar', 'en', 'ur'] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => applyLanguage(l)}
              className={`px-3 py-1.5 transition-colors ${
                lang === l
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              {l === 'ar' ? 'العربية' : l === 'en' ? 'English' : 'اردو'}
            </button>
          ))}
        </div>
      </div>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-4 text-center">
        <div className="w-24 h-24 rounded-3xl overflow-hidden mb-1 shadow-lg">
          <img src="/icon-192.svg" alt="Hai" className="w-full h-full" />
        </div>

        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-5">
          {t('feed_title')}
        </h1>

        <div className="h-8 flex items-center justify-center mb-6">
          <p className={`text-primary-600 dark:text-primary-400 font-medium text-lg ${fadeClass}`}>
            {phrases[phraseIdx]}
          </p>
        </div>

        <div className="w-full max-w-sm space-y-2.5 mb-8">
          <FeatureItem icon="🔔" text={t('home_feature_alerts')} />
          <FeatureItem icon="🛒" text={t('home_feature_market')} />
          <FeatureItem icon="🧑‍🔧" text={t('home_feature_services')} />
          <FeatureItem icon="🕌" text={t('home_feature_mosque')} />
        </div>

        <div className="w-full max-w-sm space-y-3">
          <Link href="/register" className="btn-primary block">
            {t('home_cta_start')}
          </Link>
          <Link href="/login" className="btn-outline block">
            {t('home_login')}
          </Link>
        </div>
      </div>

      <p className="text-center text-gray-400 dark:text-gray-500 text-xs pb-5">
        {t('home_cities')}
      </p>

      <style jsx global>{`
        ._h-phrase-in {
          opacity: 1;
          transform: translateY(0);
          transition: opacity 0.5s ease-out, transform 0.5s ease-out;
        }
        ._h-phrase-out {
          opacity: 0;
          transform: translateY(-6px);
          transition: opacity 0.4s ease-in, transform 0.4s ease-in;
        }
        @media (prefers-reduced-motion: reduce) {
          ._h-phrase-in, ._h-phrase-out {
            opacity: 1 !important;
            transform: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </main>
  )
}

function FeatureItem({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3">
      <span className="text-xl">{icon}</span>
      <span className="text-gray-700 dark:text-gray-300 font-medium text-sm">{text}</span>
    </div>
  )
}
