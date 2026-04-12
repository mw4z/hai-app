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

    const t = setTimeout(() => router.replace('/'), 2200)
    return () => clearTimeout(t)
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

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-primary-50 to-white dark:from-gray-900 dark:to-gray-800 p-6">
      <div className="text-center max-w-sm">
        <div className="text-6xl mb-5">🏘️</div>
        <h1 className="text-2xl font-bold text-primary-700 dark:text-primary-300 mb-2">
          {title}
        </h1>
        <p className="text-gray-600 dark:text-gray-400 text-sm">{sub}</p>

        {status === 'invalid' && (
          <p className="text-xs text-red-500 mt-4">
            {lang === 'en' ? 'Invalid invite link' : 'رابط دعوة غير صالح'}
          </p>
        )}

        {status === 'ok' && (
          <div className="mt-6 text-xs text-gray-400 dark:text-gray-500">
            {lang === 'en' ? 'Opening the app...' : 'جاري فتح التطبيق...'}
          </div>
        )}
      </div>
    </main>
  )
}
