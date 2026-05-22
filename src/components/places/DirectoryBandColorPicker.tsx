'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiX } from 'react-icons/fi'

/**
 * Super-admin only color picker for the directory route's
 * top/bottom bands (the safe-area-inset cover + iOS overscroll
 * exposure zones). Lets the admin live-tweak the band color
 * without a code redeploy each time.
 *
 * Storage:
 *   hai:directory-band-color (localStorage) — hex string
 *
 * Live application:
 *   Sets --hai-directory-band on documentElement.style. The
 *   DirectoryHeader's inline <style> references that variable so
 *   the change is instant.
 *
 * Visibility gate:
 *   Fetches /api/profile once on mount; renders null unless the
 *   user's role === 'SUPER_ADMIN'. Same pattern as other admin-
 *   only widgets in the project.
 */

const STORAGE_KEY = 'hai:directory-band-color'

const PRESETS: { label: string; hex: string }[] = [
  { label: 'Black (--bg)',          hex: '#000000' },
  { label: 'Surface (--surface-1)', hex: '#101619' },
  { label: 'Surface alt',           hex: '#19232a' },
  { label: 'Tailwind gray-900',     hex: '#111827' },
  { label: 'Gray-950',              hex: '#030712' },
  { label: 'Custom prev',           hex: '#19222b' },
]

function applyToDocument(hex: string) {
  try {
    document.documentElement.style.setProperty('--hai-directory-band', hex)
  } catch {
    // SSR — caller guards
  }
}

export default function DirectoryBandColorPicker() {
  const [role, setRole] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState<string>('#101619')
  const [customHex, setCustomHex] = useState<string>('')

  // Mount: load saved color + check role.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        setCurrent(saved)
        applyToDocument(saved)
      } else {
        applyToDocument('#101619')
      }
    } catch {
      // ignore
    }
    fetch('/api/profile', { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.role) setRole(d.role)
      })
      .catch(() => {})
  }, [])

  function pick(hex: string) {
    setCurrent(hex)
    applyToDocument(hex)
    try {
      localStorage.setItem(STORAGE_KEY, hex)
    } catch {
      // ignore
    }
  }

  function reset() {
    setCurrent('#101619')
    applyToDocument('#101619')
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }

  // Render only for super admin.
  if (role !== 'SUPER_ADMIN') return null
  if (typeof document === 'undefined' || !document.body) return null

  const validCustom = /^#[0-9a-fA-F]{6}$/.test(customHex.trim())

  return createPortal(
    <>
      {/* Floating swatch trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Band color picker (super admin)"
        className="fixed z-[1200] bottom-24 start-3 w-12 h-12 rounded-full border-2 border-white dark:border-gray-200 shadow-2xl active:scale-95 transition-transform flex items-center justify-center"
        style={{ backgroundColor: current }}
      >
        <span className="text-[18px]" aria-hidden>🎨</span>
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed inset-0 z-[1201] bg-black/40 flex items-end justify-center"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[480px] bg-white dark:bg-gray-900 rounded-t-3xl p-4 space-y-3"
            style={{ paddingBottom: 'max(1rem, var(--hai-safe-bottom))' }}
            dir="rtl"
          >
            <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto" />
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                لون شريط الدليل
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 active:bg-gray-100 dark:active:bg-gray-800"
                aria-label="Close"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
              يطبّق فوريًا — لك أنت فقط، يحفظ محليًا. لا يؤثر على بقية المستخدمين.
            </p>

            <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 pt-1">
              الحالي: <span dir="ltr" className="font-mono">{current}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p) => {
                const active = current.toLowerCase() === p.hex.toLowerCase()
                return (
                  <button
                    key={p.hex}
                    type="button"
                    onClick={() => pick(p.hex)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-start active:scale-[0.98] transition-transform ${
                      active
                        ? 'border-emerald-500 ring-2 ring-emerald-300/60'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <span
                      className="w-7 h-7 rounded-md flex-shrink-0 border border-gray-300 dark:border-gray-700"
                      style={{ backgroundColor: p.hex }}
                      aria-hidden
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[11.5px] font-semibold text-gray-900 dark:text-white truncate">
                        {p.label}
                      </span>
                      <span dir="ltr" className="block text-[10px] font-mono text-gray-500 dark:text-gray-400">
                        {p.hex}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
              <span className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                مخصص (Hex)
              </span>
              <div className="flex items-center gap-2">
                <span
                  className="w-9 h-9 rounded-md border border-gray-300 dark:border-gray-700 flex-shrink-0"
                  style={{ backgroundColor: validCustom ? customHex : 'transparent' }}
                  aria-hidden
                />
                <input
                  type="text"
                  value={customHex}
                  onChange={(e) => setCustomHex(e.target.value)}
                  placeholder="#101619"
                  dir="ltr"
                  className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
                  maxLength={7}
                />
                <button
                  type="button"
                  onClick={() => validCustom && pick(customHex.trim())}
                  disabled={!validCustom}
                  className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50 active:scale-95 transition-transform"
                >
                  تطبيق
                </button>
              </div>
              {customHex && !validCustom && (
                <p className="text-[10.5px] text-rose-500 mt-1" dir="ltr">
                  format must be #RRGGBB
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={reset}
              className="w-full text-[12px] font-medium text-gray-500 dark:text-gray-400 py-2 active:scale-95 transition-transform"
            >
              إعادة للافتراضي (#101619)
            </button>
          </div>
        </div>
      )}
    </>,
    document.body,
  )
}
