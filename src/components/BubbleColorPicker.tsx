'use client'

import { useEffect, useState } from 'react'

/**
 * SUPER_ADMIN-only floating debug widget for picking the dark-mode
 * received-message bubble color in Square + DM.
 *
 * - Reads cached role from localStorage (same key BottomNav uses)
 *   so it only renders for super-admins.
 * - Sets a CSS variable `--bubble-other` on document.documentElement.
 *   SquareBubble + ChatClient use `dark:bg-[var(--bubble-other,#5a6b7e)]`
 *   so the picker overrides the default at runtime.
 * - Persists the choice in localStorage('hai_debug_bubble') so the
 *   picker can restore on next launch without re-fetching.
 *
 * No server-side state. Purely a local A/B test tool. Once you
 * settle on a color, hand-edit the fallback hex in SquareBubble +
 * ChatClient and remove this component.
 */

const STORAGE_KEY = 'hai_debug_bubble'
const ROLE_CACHE_KEY = 'hai_user_role'
const DEFAULT_HEX = '#5a6b7e'

const PRESETS = [
  { label: 'Slate 600 (current default)', value: '#475569' },
  { label: 'Slate 500 lite', value: '#5a6b7e' },
  { label: 'Cooler #4e5d72', value: '#4e5d72' },
  { label: 'Lighter slate', value: '#647386' },
  { label: 'Warm dark', value: '#3d4754' },
  { label: 'Almost-gray-500', value: '#6b7280' },
  { label: 'Tealish dark', value: '#3a4d52' },
  { label: 'WhatsApp dark', value: '#202c34' },
  { label: 'Telegram dark', value: '#212d3b' },
]

/**
 * Apply the picked color in TWO ways for maximum coverage:
 *
 *  1. Set the CSS variable on documentElement — picked up by the
 *     new bundle's `bg-[var(--bubble-other)]` rule.
 *
 *  2. Inject a high-specificity <style> override targeting EVERY
 *     hex variant we've ever shipped for the dark bubble bg.
 *     This is the bulletproof path for users whose WebView has a
 *     stale JS/CSS bundle cached (still rendering the old
 *     hardcoded-hex classes) — the !important rule wins
 *     regardless of which class string the bubble carries.
 *
 *  Once you settle on a final color, both paths can be retired in
 *  favour of the hardcoded value. Until then this guarantees
 *  the picker reaches the bubble on EVERY cache state.
 */
const STALE_HEX_VARIANTS = [
  '#242625', '#27323a', '#33424f', '#475569', '#5a6b7e',
]

function applyVar(hex: string) {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--bubble-other', hex)

  const STYLE_ID = '__hai_debug_bubble_style'
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }

  // Escape '#' as '\\#' for use in attribute selectors. Tailwind
  // arbitrary-value classes embed the hex straight into the class
  // name, so the selector must match exactly.
  const variantSelectors = STALE_HEX_VARIANTS.flatMap((h) => {
    const esc = h.replace('#', '\\#')
    return [
      `html.dark .dark\\:bg-\\[${esc}\\]`,
      `html.dark .dark\\:bg-\\[${esc}\\]\\/60`,
    ]
  }).join(',\n  ')

  style.textContent = `
  ${variantSelectors},
  html.dark .dark\\:bg-\\[var\\(--bubble-other\\)\\] {
    background-color: ${hex} !important;
  }`
}

export default function BubbleColorPicker() {
  const [isSuper, setIsSuper] = useState(false)
  const [open, setOpen] = useState(false)
  const [hex, setHex] = useState<string>(DEFAULT_HEX)

  // Role gate. Read from cached localStorage (same key BottomNav
  // populates after /api/profile lands), then re-confirm via the
  // same endpoint so a stale cache can't accidentally render the
  // picker for non-admins.
  useEffect(() => {
    try {
      const cached = localStorage.getItem(ROLE_CACHE_KEY)
      if (cached === 'SUPER_ADMIN') setIsSuper(true)
    } catch {}
    let cancelled = false
    fetch('/api/profile', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return
        setIsSuper(d?.role === 'SUPER_ADMIN')
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Restore the saved color (or apply the default) on mount.
  useEffect(() => {
    if (!isSuper) return
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      const v = saved || DEFAULT_HEX
      setHex(v)
      applyVar(v)
    } catch {
      applyVar(DEFAULT_HEX)
    }
  }, [isSuper])

  function update(nextHex: string) {
    const v = /^#[0-9a-fA-F]{6}$/.test(nextHex) ? nextHex : nextHex
    setHex(v)
    applyVar(v)
    try { localStorage.setItem(STORAGE_KEY, v) } catch {}
  }

  function reset() {
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
    setHex(DEFAULT_HEX)
    applyVar(DEFAULT_HEX)
  }

  if (!isSuper) return null

  return (
    <div
      style={{
        position: 'fixed',
        zIndex: 2147483646,
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)',
        insetInlineStart: '12px',
        fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
        direction: 'ltr',
      }}
      aria-label="Bubble color debug picker"
    >
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          style={{
            width: 40, height: 40,
            borderRadius: 20,
            border: '2px solid rgba(255,255,255,0.4)',
            background: hex,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
          title="Bubble color (super-admin)"
        />
      ) : (
        <div style={{
          background: '#1f2937',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 14,
          padding: 12,
          width: 260,
          maxHeight: '70vh',
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          color: '#e5e7eb',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <strong style={{ fontSize: 12, letterSpacing: 0.4 }}>Bubble color (dark)</strong>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
            >×</button>
          </div>

          <label style={{ display: 'block', fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Custom hex</label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <input
              type="color"
              value={hex}
              onChange={(e) => update(e.target.value)}
              style={{ width: 40, height: 32, border: 'none', background: 'transparent', cursor: 'pointer' }}
            />
            <input
              type="text"
              value={hex}
              onChange={(e) => update(e.target.value)}
              style={{
                flex: 1, fontSize: 12, padding: '6px 8px',
                background: '#0b0f14', border: '1px solid #374151',
                borderRadius: 6, color: '#e5e7eb', fontFamily: 'monospace',
              }}
            />
          </div>

          <label style={{ display: 'block', fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Presets</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => update(p.value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: hex.toLowerCase() === p.value.toLowerCase() ? '#374151' : 'transparent',
                  border: '1px solid #374151', borderRadius: 6,
                  padding: '6px 8px', cursor: 'pointer', color: '#e5e7eb',
                  fontSize: 11, textAlign: 'left',
                }}
              >
                <span style={{ width: 18, height: 18, borderRadius: 4, background: p.value, border: '1px solid rgba(255,255,255,0.2)' }} />
                <span style={{ flex: 1 }}>{p.label}</span>
                <code style={{ fontSize: 10, color: '#9ca3af' }}>{p.value}</code>
              </button>
            ))}
          </div>

          <button
            onClick={reset}
            style={{
              marginTop: 10, width: '100%',
              padding: '6px 8px',
              background: 'transparent', color: '#9ca3af',
              border: '1px solid #374151', borderRadius: 6,
              fontSize: 11, cursor: 'pointer',
            }}
          >
            Reset to default ({DEFAULT_HEX})
          </button>
          <p style={{ fontSize: 10, color: '#6b7280', marginTop: 8, lineHeight: 1.4 }}>
            Live preview — applies to all dark-mode received bubbles in Square + DM. Saved to localStorage on this device only.
          </p>
        </div>
      )}
    </div>
  )
}
