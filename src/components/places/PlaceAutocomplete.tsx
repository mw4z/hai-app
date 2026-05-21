'use client'

import { useEffect, useRef, useState } from 'react'
import { FiSearch, FiMapPin, FiLoader } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'

/**
 * Google-Places-backed search box for the add-a-place form. Typing
 * queries /api/places/autocomplete (debounced); selecting a result
 * calls /api/places/details and hands the parsed fields back via
 * onSelect so the parent can autofill name / address / lat-lng /
 * phone / website / maps URL.
 *
 * Session tokens: a UUID is generated per autocomplete "session"
 * and reused across keystrokes; after a details fetch we mint a new
 * one so Google bills each lookup as a single session. See
 * lib/places/googlePlaces.ts.
 *
 * Degrades silently: if Places isn't configured the API returns an
 * empty list, so the box just never shows suggestions — the manual
 * fields below it still work.
 */

export interface SelectedPlace {
  name: string
  address: string | null
  latitude: number | null
  longitude: number | null
  phone: string | null
  website: string | null
  mapUrl: string | null
  /** Detected Hai category from Google place types (null = keep). */
  category: string | null
  /** Google hours converted to the app's openingHours format. */
  appHours: string | null
  // The Google place_id — sent on submit so the server takes an
  // authoritative rating/hours/photos snapshot + tags source=GOOGLE.
  placeId: string
}

interface Suggestion {
  placeId: string
  primary: string
  secondary: string
}

function newToken(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch {}
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export default function PlaceAutocomplete({
  onSelect,
  initialQuery = '',
}: {
  onSelect: (place: SelectedPlace) => void
  /** Pre-seed the search box (e.g. an existing place's name when a
   *  super admin is matching it to Google). Fires a search on mount. */
  initialQuery?: string
}) {
  const { lang } = useLanguage()
  const tr = (en: string, ar: string, ur: string) =>
    lang === 'en' ? en : lang === 'ur' ? ur : ar

  const [q, setQ] = useState(initialQuery)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resolving, setResolving] = useState(false)
  const tokenRef = useRef<string>(newToken())
  const rootRef = useRef<HTMLDivElement>(null)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced autocomplete fetch.
  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) {
      setSuggestions([])
      return
    }
    let aborted = false
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/places/autocomplete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: query, sessionToken: tokenRef.current, lang }),
        })
        const d = await res.json().catch(() => ({}))
        if (aborted) return
        setSuggestions(Array.isArray(d.suggestions) ? d.suggestions : [])
        setOpen(true)
      } catch {
        if (!aborted) setSuggestions([])
      } finally {
        if (!aborted) setLoading(false)
      }
    }, 280)
    return () => {
      aborted = true
      clearTimeout(t)
    }
  }, [q, lang])

  // Close on outside click.
  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [])

  async function pick(s: Suggestion) {
    setOpen(false)
    setResolving(true)
    setQ(s.primary)
    try {
      const res = await fetch('/api/places/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeId: s.placeId, sessionToken: tokenRef.current, lang }),
      })
      const d = await res.json().catch(() => ({}))
      if (d.details) onSelect({ ...(d.details as Omit<SelectedPlace, 'placeId'>), placeId: s.placeId })
    } catch {
      /* silent — user can still type manually */
    } finally {
      setResolving(false)
      // New session token after a details call closes the billed session.
      tokenRef.current = newToken()
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <span className="absolute inset-y-0 start-3 flex items-center text-gray-400 pointer-events-none">
          {resolving || loading ? (
            <FiLoader className="w-4 h-4 animate-spin" />
          ) : (
            <FiSearch className="w-4 h-4" />
          )}
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={tr(
            'Search for your place on Google…',
            'ابحث عن مكانك في خرائط Google…',
            'گوگل پر اپنی جگہ تلاش کریں…',
          )}
          className="input-field ps-9"
          autoComplete="off"
        />
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onClick={() => pick(s)}
                className="w-full flex items-start gap-2.5 px-3 py-2.5 text-start hover:bg-gray-50 dark:hover:bg-gray-700/60 active:bg-gray-100"
              >
                <FiMapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary-500" />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-gray-900 dark:text-white truncate">
                    {s.primary}
                  </span>
                  {s.secondary && (
                    <span className="block text-[11px] text-gray-500 dark:text-gray-400 truncate">
                      {s.secondary}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
