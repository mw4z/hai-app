'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FiPhone, FiBook } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { openExternal } from '@/lib/openExternal'

/**
 * Compact card rendered under any phone number detected in a post /
 * comment body. Lookup runs at VIEW time via
 * /api/directory/service-contacts/lookup so it works for both new
 * AND existing posts written before the feature shipped — no
 * migration / re-indexing of post content needed.
 *
 * Two visual states:
 *   - MATCH    → the phone is in the viewer's neighborhood directory.
 *               Show the directory entry's name + category and a
 *               "View in directory" link, with call + WhatsApp pills.
 *   - NO MATCH → generic call + WhatsApp pills for the raw number.
 *               No card title — just the action row, so the body
 *               stays uncluttered when the number is unknown.
 *
 * Lookups are batched and module-cached so a feed of 20 posts each
 * mentioning the same number triggers ONE roundtrip.
 */

interface Match {
  id: string
  displayName: string
  category: string
  whatsapp: boolean
}

type LookupState =
  | { kind: 'loading' }
  | { kind: 'match'; data: Match }
  | { kind: 'no-match' }

// Module-level cache. Key = E.164 phone; value = the pending promise
// or resolved state. Cleared on full page reload.
const cache = new Map<string, Promise<LookupState>>()

// Coalesce multiple PhonePreviewCard mounts within the same tick
// into ONE network call. Without this, a feed of N posts each
// containing the same 3 numbers fires N fetches before the cache
// fills. Batching window = 30ms.
let pendingBatch: { phones: Set<string>; resolvers: Map<string, (s: LookupState) => void> } | null = null
let batchTimer: ReturnType<typeof setTimeout> | null = null

function lookup(e164: string): Promise<LookupState> {
  const existing = cache.get(e164)
  if (existing) return existing

  const p = new Promise<LookupState>((resolve) => {
    if (!pendingBatch) pendingBatch = { phones: new Set(), resolvers: new Map() }
    pendingBatch.phones.add(e164)
    pendingBatch.resolvers.set(e164, resolve)
    if (!batchTimer) {
      batchTimer = setTimeout(flushBatch, 30)
    }
  })
  cache.set(e164, p)
  return p
}

async function flushBatch() {
  const batch = pendingBatch
  pendingBatch = null
  batchTimer = null
  if (!batch || batch.phones.size === 0) return
  const phones = Array.from(batch.phones).join(',')
  const resolvers = Array.from(batch.resolvers.entries())
  try {
    const res = await fetch(
      `/api/directory/service-contacts/lookup?phones=${encodeURIComponent(phones)}`,
      { credentials: 'include', cache: 'no-store' },
    )
    if (!res.ok) {
      for (const [, resolve] of resolvers) resolve({ kind: 'no-match' })
      return
    }
    const data = await res.json() as { matches: Record<string, Match | null> }
    for (const [e164, resolve] of resolvers) {
      const m = data.matches?.[e164]
      resolve(m ? { kind: 'match', data: m } : { kind: 'no-match' })
    }
  } catch {
    for (const [, resolve] of resolvers) resolve({ kind: 'no-match' })
  }
}

/** Strip + → just digits for tel: / WhatsApp URL params. */
function digitsOnly(e164: string): string {
  return e164.replace(/^\+/, '').replace(/\D/g, '')
}

/** Pretty Saudi 05xxxxxxxx for display (call/WhatsApp links keep E.164). */
function displayLocal(e164: string): string {
  if (e164.startsWith('+966')) return '0' + e164.slice(4)
  return e164
}

export default function PhonePreviewCard({ phone }: { phone: string }) {
  const { lang } = useLanguage()
  const [state, setState] = useState<LookupState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    lookup(phone).then((s) => { if (!cancelled) setState(s) })
    return () => { cancelled = true }
  }, [phone])

  const tr = (en: string, ar: string, ur: string) =>
    lang === 'en' ? en : lang === 'ur' ? ur : ar

  const local = displayLocal(phone)
  const digits = digitsOnly(phone)
  const callHref = `tel:${phone}`
  const whatsappHref = `https://wa.me/${digits}`

  const onCall = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    openExternal(callHref)
  }
  const onWhatsApp = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    openExternal(whatsappHref)
  }

  // ── Loading skeleton ──
  if (state.kind === 'loading') {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3 mt-2 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-32 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-2.5 w-20 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        </div>
      </div>
    )
  }

  // Common action row (call + whatsapp pills) — used by both
  // matched and unmatched states.
  const actions = (
    <span className="flex items-center gap-2 mt-2 flex-wrap">
      <button
        type="button"
        onClick={onCall}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary-600 hover:bg-primary-700 text-white text-[12px] font-semibold transition-colors"
      >
        <FiPhone className="w-3 h-3" />
        <span>{tr('Call', 'اتصال', 'کال')}</span>
      </button>
      <button
        type="button"
        onClick={onWhatsApp}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500 hover:bg-green-600 text-white text-[12px] font-semibold transition-colors"
      >
        <span aria-hidden>📱</span>
        <span>{tr('WhatsApp', 'واتساب', 'واٹس ایپ')}</span>
      </button>
      <span className="text-[11.5px] text-gray-500 dark:text-gray-400 ltr:ml-auto rtl:mr-auto font-mono ltr:text-left rtl:text-right" dir="ltr">
        {local}
      </span>
    </span>
  )

  // ── Match found: directory entry ──
  if (state.kind === 'match') {
    const { data } = state
    return (
      <div className="rounded-2xl border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-900/15 p-3 mt-2">
        <span className="block text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 mb-1.5">
          {tr('From directory', 'من دليل الحي', 'ڈائرکٹری سے')}
        </span>
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3">
          <Link
            href={`/directory/services/${data.id}`}
            className="flex items-start gap-3 active:scale-[0.99] transition-transform"
          >
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex-shrink-0">
              <FiBook className="w-4 h-4" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[14px] font-bold text-gray-900 dark:text-white truncate">
                {data.displayName}
              </span>
              <span className="block text-[11.5px] text-gray-500 dark:text-gray-400 truncate">
                {tr('View in directory →', 'عرض في الدليل ←', 'ڈائرکٹری میں دیکھیں ←')}
              </span>
            </span>
          </Link>
          {actions}
        </div>
      </div>
    )
  }

  // ── No match: generic action card ──
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3 mt-2">
      <span className="block text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-0.5">
        {tr('Phone number', 'رقم في المنشور', 'فون نمبر')}
      </span>
      {actions}
    </div>
  )
}
