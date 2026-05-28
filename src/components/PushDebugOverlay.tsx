'use client'

import { useEffect, useState } from 'react'

/**
 * On-screen debug panel for the DM-notification cold-start chain.
 * Captures console.log/warn/error calls whose first argument starts
 * with [PUSH] or [SW] and renders them in a fixed-position monospace
 * panel so the user can read them without attaching Safari Web
 * Inspector.
 *
 * Only mounts on iOS Capacitor. Auto-hides after 60s of no new
 * messages so it doesn't sit permanently in the way. Tap to clear,
 * long-press to dismiss entirely.
 *
 * Remove this component from layout.tsx once the bug is fixed.
 */
type Entry = { t: number; level: 'log' | 'warn' | 'error'; text: string }

export default function PushDebugOverlay() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!(window as any).Capacitor?.isNativePlatform()) return
    if ((window as any).Capacitor?.getPlatform() !== 'ios') return

    const origLog = console.log.bind(console)
    const origWarn = console.warn.bind(console)
    const origErr = console.error.bind(console)

    const matches = (args: unknown[]): boolean => {
      const first = args[0]
      if (typeof first !== 'string') return false
      return first.startsWith('[PUSH]') || first.startsWith('[SW]')
    }
    const fmt = (args: unknown[]): string =>
      args.map((a) => {
        if (typeof a === 'string') return a
        try { return JSON.stringify(a) } catch { return String(a) }
      }).join(' ')

    const capture = (level: Entry['level'], args: unknown[]) => {
      if (!matches(args)) return
      const text = fmt(args)
      setEntries((prev) => {
        const next = [...prev, { t: Date.now(), level, text }]
        // Keep last 20 — older entries scroll out.
        return next.length > 20 ? next.slice(-20) : next
      })
    }

    console.log = (...args: unknown[]) => { capture('log', args); origLog(...args) }
    console.warn = (...args: unknown[]) => { capture('warn', args); origWarn(...args) }
    console.error = (...args: unknown[]) => { capture('error', args); origErr(...args) }

    return () => {
      console.log = origLog
      console.warn = origWarn
      console.error = origErr
    }
  }, [])

  // Also capture window error events so an unhandled exception during
  // the push chain shows up here instead of dying silently.
  useEffect(() => {
    const onErr = (e: ErrorEvent) => {
      setEntries((prev) => [...prev, {
        t: Date.now(),
        level: 'error',
        text: `[ERR] ${e.message} @ ${e.filename}:${e.lineno}`,
      }].slice(-20))
    }
    window.addEventListener('error', onErr)
    return () => window.removeEventListener('error', onErr)
  }, [])

  if (hidden || entries.length === 0) return null

  const colorFor = (lvl: Entry['level']) =>
    lvl === 'error' ? '#ff6b6b' : lvl === 'warn' ? '#ffd166' : '#9ee493'

  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 4px)',
        left: 4,
        right: 4,
        zIndex: 999999,
        background: 'rgba(0, 0, 0, 0.86)',
        color: '#e0e0e0',
        fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
        fontSize: 10,
        lineHeight: 1.3,
        padding: '6px 8px',
        borderRadius: 8,
        maxHeight: '40vh',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        pointerEvents: 'auto',
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
      }}
      onClick={() => setEntries([])}
      onContextMenu={(e) => { e.preventDefault(); setHidden(true) }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, fontWeight: 700, fontSize: 9, opacity: 0.7 }}>
        <span>PUSH/SW DEBUG · tap=clear · long-press=hide</span>
        <span>{entries.length}</span>
      </div>
      {entries.map((e, i) => {
        const ms = e.t % 100000
        return (
          <div key={i} style={{ color: colorFor(e.level), wordBreak: 'break-all', marginBottom: 2 }}>
            <span style={{ opacity: 0.5 }}>{String(ms).padStart(5, '0')} </span>
            {e.text}
          </div>
        )
      })}
    </div>
  )
}
