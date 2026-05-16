'use client'

import { useRouter } from 'next/navigation'
import { FiArrowLeft, FiArrowRight } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import DirectoryBandColorPicker from './DirectoryBandColorPicker'

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
      {/* Global bg overrides scoped to the directory routes.
          Three previous attempts failed:
            1. CSS :has(.hai-directory-screen) — not honored on
               every WKWebView version in the wild.
            2. JS-toggled html.hai-route-directory class — there
               was a hydration window where the class wasn't on
               <html> yet, AND on some builds the useEffect ran
               but the iOS rubber-band overscroll still exposed
               the old background until the page repainted.
            3. background-color override that forgot the
               --hai-safe-top-bg CSS var that html::before reads.
          This inline <style> renders as part of the page SSR
          output, so the rules apply BEFORE first paint with no
          JS dependency, and Next.js removes it on unmount when
          the user navigates away from a directory route. */}
      <style>{`
        html {
          --hai-safe-top-bg: rgb(249 250 251);
          background-color: #f9fafb !important;
        }
        html body {
          background-color: #f9fafb !important;
        }
        /* Dark-mode band color is now driven by --hai-directory-band
           (set on documentElement.style by DirectoryBandColorPicker
           — falls back to #101619 when no picker selection exists).
           That lets a super admin live-tweak the band color from the
           in-app picker without redeploying. */
        html.dark, .dark html {
          --hai-safe-top-bg: var(--hai-directory-band, #19232a);
          background-color: var(--hai-directory-band, #19232a) !important;
        }
        html.dark body, .dark html body {
          background-color: var(--hai-directory-band, #19232a) !important;
        }
        .hai-directory-safe-cover {
          background-color: #f9fafb;
        }
        html.dark .hai-directory-safe-cover,
        .dark html .hai-directory-safe-cover {
          background-color: var(--hai-directory-band, #19232a) !important;
        }
      `}</style>
      {/* Safe-area cover. The global html::before paints the
          top-inset region with --hai-safe-top-bg; the inline
          <style> above keeps that var pointing at the page
          color. This <div> is an extra belt-and-suspenders layer
          that paints the exact same color directly into the
          inset region with no CSS-variable dependency at all, so
          even if the var-override fails the seam disappears. */}
      <div
        aria-hidden
        className="hai-directory-safe-cover fixed top-0 left-0 right-0 z-30 pointer-events-none"
        style={{ height: 'env(safe-area-inset-top, 0px)' }}
      />
      {/* Header is fully opaque (no /95 + backdrop-blur). The
          translucent + blur combo was producing a visibly darker
          tone than the surrounding solid bg-gray-900, so the
          header bar read as a separate, darker band on dark mode
          even though both targeted the same color. Pinning to a
          solid bg-gray-50 / bg-gray-900 guarantees the header
          matches the page bg edge-to-edge. */}
      <header className="sticky top-0 z-30 bg-gray-50 dark:bg-gray-900 border-b border-gray-200/60 dark:border-gray-700/60">
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
      {/* Super-admin only — renders a floating swatch button that
          opens a color picker for the band color. Self-gates on
          the user's role (returns null for non-admins). Reads its
          last selection from localStorage on mount and writes
          --hai-directory-band on documentElement.style; the inline
          <style> above consumes that variable. */}
      <DirectoryBandColorPicker />
    </>
  )
}
