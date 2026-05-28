'use client'

import { useRouter } from 'next/navigation'
import { FiArrowLeft, FiArrowRight } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import SquareComposer from '@/components/square/SquareComposer'

/** Screen wrapper for the Square composer — header + RTL-safe back
 *  arrow + the composer itself. Composer handles all the data flow,
 *  validation, and intent-nudge UI. */
export default function NewSquareClient() {
  const { t, lang } = useLanguage()
  const router = useRouter()
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-[640px] mx-auto px-4 py-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 active:bg-gray-100 dark:active:bg-gray-700"
            aria-label={lang === 'en' ? 'Back' : 'رجوع'}
          >
            {lang === 'en' ? <FiArrowLeft className="w-5 h-5" /> : <FiArrowRight className="w-5 h-5" />}
          </button>
          <h1 className="text-[17px] font-extrabold text-gray-900 dark:text-white">{t('square_start_cta')}</h1>
        </div>
      </div>
      <div className="max-w-[640px] mx-auto px-4 py-4">
        <SquareComposer />
      </div>
    </main>
  )
}
