'use client'

import { useLanguage } from '@/hooks/useLanguage'
import BackButton from '@/components/BackButton'

export default function ContestsClient({ isAdmin }: { isAdmin: boolean }) {
  const { lang } = useLanguage()

  const features = [
    { icon: '🎯', ar: 'تحديات أسبوعية', en: 'Weekly Challenges' },
    { icon: '🎁', ar: 'جوائز حقيقية', en: 'Real Prizes' },
    { icon: '🏅', ar: 'نقاط سمعة إضافية', en: 'Bonus Reputation Points' },
  ]

  return (
    <>
      <header className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-4 py-3 flex items-center gap-3">
        <BackButton href="/feed" />
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">
          🏆 {lang === 'en' ? 'Contests & Prizes' : lang === 'ur' ? 'مقابلے اور انعامات' : 'مسابقات وجوائز'}
        </h1>
      </header>

      <div className="flex flex-col items-center justify-center px-6 pt-20 text-center">
        <div className="text-7xl mb-6">🏆</div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
          {lang === 'en' ? 'Coming Soon' : lang === 'ur' ? 'جلد آرہا ہے' : 'قريباً'}
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xs leading-relaxed">
          {lang === 'ar'
            ? 'مسابقات وجوائز حصرية لسكان الحي — ترقبوا!'
            : 'Exclusive contests & prizes for neighborhood residents — stay tuned!'}
        </p>

        <div className="mt-10 bg-white dark:bg-gray-800 rounded-2xl p-5 w-full max-w-sm border border-gray-100 dark:border-gray-700 space-y-3">
          {features.map((f) => (
            <div key={f.icon} className="flex items-center gap-3">
              <span className="text-2xl">{f.icon}</span>
              <p className="text-sm font-semibold text-gray-800 dark:text-white text-start">
                {lang !== 'en' ? f.ar : f.en}
              </p>
            </div>
          ))}
        </div>

        {isAdmin && (
          <div className="mt-8 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 w-full max-w-sm">
            <p className="text-amber-800 dark:text-amber-300 text-xs font-medium">
              {lang === 'ar'
                ? '🔧 أنت مشرف — ستتمكن من إنشاء مسابقات هنا قريباً'
                : '🔧 You are an admin — you will be able to create contests here soon'}
            </p>
          </div>
        )}
      </div>
    </>
  )
}
