'use client'

import { useRouter } from 'next/navigation'
import { FiArrowLeft, FiArrowRight } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'

interface Props {
  title: string
  /** Optional explicit href for back navigation. When omitted the
   *  header calls router.back() so the user lands on whatever
   *  surface brought them here (feed / profile / mod dashboard). */
  backHref?: string
}

/** Sticky top bar shared by every directory page. Provides a
 *  reliable, large-touch-target back button — addressing the
 *  "no back button" symptom on the directory list. RTL-aware:
 *  arrow flips direction based on the user's language. */
export default function DirectoryHeader({ title, backHref }: Props) {
  const router = useRouter()
  const { lang } = useLanguage()

  const handleBack = () => {
    if (backHref) router.push(backHref)
    else router.back()
  }

  const ArrowIcon = lang === 'en' ? FiArrowLeft : FiArrowRight

  return (
    <>
      {/* Safe-area cover. The global html::before paints the
          top-inset region with --hai-safe-top-bg, but on some
          Capacitor/WKWebView versions the :has() override that
          recolors that variable doesn't take effect, leaving the
          notch zone in --hai-surface-1 (white / #101619) while
          the page below is gray. This fixed div paints the exact
          page color directly into the inset region with no CSS-
          variable dependency, guaranteeing a seamless edge. */}
      <div
        aria-hidden
        className="fixed top-0 left-0 right-0 z-30 pointer-events-none bg-gray-50 dark:bg-gray-900"
        style={{ height: 'env(safe-area-inset-top, 0px)' }}
      />
      <header className="sticky top-0 z-30 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200/60 dark:border-gray-700/60">
        <div className="max-w-[760px] mx-auto px-3 py-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={handleBack}
            aria-label={lang === 'en' ? 'Back' : lang === 'ur' ? 'واپس' : 'رجوع'}
            className="w-10 h-10 flex items-center justify-center rounded-full text-gray-700 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-800 transition-colors"
          >
            <ArrowIcon className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-base font-bold text-gray-900 dark:text-white truncate">
            {title}
          </h1>
        </div>
      </header>
    </>
  )
}
