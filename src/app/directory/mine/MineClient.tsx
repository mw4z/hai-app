'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { PlaceCategory } from '@prisma/client'
import { useLanguage } from '@/hooks/useLanguage'
import type { PublicPlace } from '@/lib/places/serialize'
import PlaceCard from '@/components/places/PlaceCard'

interface PendingClaim {
  id: string
  placeId: string
  placeName: string
  placeCategory: PlaceCategory
  message: string | null
  createdAt: string
}

interface Props {
  created: PublicPlace[]
  claimed: PublicPlace[]
  pendingClaims: PendingClaim[]
}

export default function MineClient({ created, claimed, pendingClaims }: Props) {
  const { lang } = useLanguage()
  const tr = (en: string, ar: string, ur: string) =>
    lang === 'en' ? en : lang === 'ur' ? ur : ar

  const tabs = [
    { key: 'created' as const, label: tr('Submitted', 'أماكن أضفتها', 'بھیجی گئی'), count: created.length },
    { key: 'claimed' as const, label: tr('Managed', 'أماكن أديرها', 'منتظم'), count: claimed.length },
    { key: 'pending' as const, label: tr('Pending claims', 'طلبات الإدارة', 'زیر التواء دعوے'), count: pendingClaims.length },
  ]
  const [tab, setTab] = useState<typeof tabs[number]['key']>('created')

  return (
    <main className="hai-directory-screen min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-[640px] mx-auto px-4 py-4 space-y-4">
        <Link href="/directory" className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
          {lang !== 'en' ? '→' : '←'} {tr('Back', 'رجوع', 'واپس')}
        </Link>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          {tr('My places', 'أماكني', 'میری جگہیں')}
        </h1>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${
                tab === t.key ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
              }`}
            >
              {t.label} {t.count > 0 ? `(${t.count})` : ''}
            </button>
          ))}
        </div>

        {tab === 'created' && (
          <div className="space-y-2.5">
            {created.length === 0 ? (
              <p className="text-center text-sm text-gray-500 py-8">
                {tr('No submissions yet.', 'لا توجد إضافات بعد.', 'ابھی کوئی نہیں۔')}
              </p>
            ) : created.map((p) => <PlaceCard key={p.id} place={p} />)}
          </div>
        )}
        {tab === 'claimed' && (
          <div className="space-y-2.5">
            {claimed.length === 0 ? (
              <p className="text-center text-sm text-gray-500 py-8">
                {tr('You don\'t manage any place yet.', 'لا تدير أي مكان حالياً.', 'ابھی کسی جگہ کا انتظام نہیں۔')}
              </p>
            ) : claimed.map((p) => <PlaceCard key={p.id} place={p} />)}
          </div>
        )}
        {tab === 'pending' && (
          <div className="space-y-2">
            {pendingClaims.length === 0 ? (
              <p className="text-center text-sm text-gray-500 py-8">
                {tr('No pending claims.', 'لا توجد طلبات معلّقة.', 'کوئی زیر التواء دعوی نہیں۔')}
              </p>
            ) : pendingClaims.map((c) => (
              <Link
                key={c.id}
                href={`/directory/${c.placeId}`}
                className="block p-3 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
              >
                <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{c.placeName}</p>
                {c.message && <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{c.message}</p>}
                <p className="text-[10px] text-gray-400 mt-1">
                  {tr('Waiting for mod review', 'بانتظار مراجعة المشرف', 'موڈریٹر کے جائزے کا انتظار')}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
