'use client'

import { useEffect, useState } from 'react'

/**
 * On-device debug overlay — captures every console.log /
 * console.error that contains '[KB]' and renders the last N lines on
 * top of everything. Activates ONLY when ?debugkb=1 is in the URL,
 * so it never appears for normal users.
 *
 * Use: open the app at any page with ?debugkb=1, e.g.
 *   /feed?debugkb=1
 * The overlay sits in the top-right corner. Tap it to clear.
 *
 * No Mac / Console.app needed — runs entirely on the iPhone.
 */
export default function DebugOverlay() {
  const [enabled, setEnabled] = useState(false)
  const [lines, setLines] = useState<string[]>([])

  useEffect(() => {
    if (typeof window === 'undefined') return
    // Toggle: ?debugkb=1 enables and persists; ?debugkb=0 disables.
    const url = new URL(window.location.href)
    const param = url.searchParams.get('debugkb')
    if (param === '1') {
      try { localStorage.setItem('hai_debugkb', '1') } catch {}
    } else if (param === '0') {
      try { localStorage.removeItem('hai_debugkb') } catch {}
    }
    let on = false
    try { on = localStorage.getItem('hai_debugkb') === '1' } catch {}
    setEnabled(on)
    if (!on) return

    // Patch console.log / console.error / console.warn — keep the
    // originals working AND capture lines that contain '[KB]'.
    const origLog = console.log.bind(console)
    const origErr = console.error.bind(console)
    const origWarn = console.warn.bind(console)
    function fmt(args: unknown[]): string {
      return args.map((a) => {
        if (typeof a === 'string') return a
        try { return JSON.stringify(a) } catch { return String(a) }
      }).join(' ')
    }
    function capture(prefix: string, args: unknown[]) {
      const text = fmt(args)
      if (!text.includes('[KB]')) return
      const stamp = new Date().toLocaleTimeString('en-GB', { hour12: false })
      setLines((prev) => {
        const next = [...prev, `${stamp} ${prefix} ${text}`]
        return next.slice(-12)
      })
    }
    console.log = (...args) => { origLog(...args); capture('•', args) }
    console.error = (...args) => { origErr(...args); capture('✕', args) }
    console.warn = (...args) => { origWarn(...args); capture('⚠', args) }

    return () => {
      console.log = origLog
      console.error = origErr
      console.warn = origWarn
    }
  }, [])

  if (!enabled) return null

  return (
    <div
      onClick={() => setLines([])}
      style={{
        position: 'fixed',
        top: 'env(safe-area-inset-top, 0px)',
        right: 8,
        zIndex: 99999,
        maxWidth: '92vw',
        maxHeight: '50vh',
        overflow: 'auto',
        background: 'rgba(0,0,0,0.82)',
        color: '#9ad9ff',
        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        fontSize: 10,
        lineHeight: 1.35,
        padding: '6px 8px',
        borderRadius: 8,
        pointerEvents: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      }}
      aria-label="KB debug overlay (tap to clear)"
    >
      {lines.length === 0 ? (
        <div style={{ opacity: 0.6 }}>[KB debug] waiting for logs… tap an input</div>
      ) : (
        lines.map((l, i) => <div key={i}>{l}</div>)
      )}
    </div>
  )
}
