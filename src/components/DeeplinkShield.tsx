'use client'

import { useEffect, useState } from 'react'

/**
 * DeeplinkShield — full-screen brand overlay that covers the
 * router-fight flash when a push notification cold-launches the
 * app onto /feed before bouncing to /threads/<id>.
 *
 * Mounts as soon as a `hai:deeplink-landed` event fires (dispatched
 * from PushRegistration the instant the push handler resolves a
 * target) and stays up until window.location.pathname matches the
 * target — or 3s max. The user sees AppSplash → DeeplinkShield →
 * conversation, instead of AppSplash → /feed → flash → /feed →
 * conversation.
 *
 * Visuals mirror AppSplash.tsx so the handoff is seamless. zIndex
 * 99990 puts us above AppSplash (9990) and above every in-app
 * surface but below toast notifications.
 */
export default function DeeplinkShield() {
  const [target, setTarget] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // On mount: if a deeplink is pending in sessionStorage (e.g. we
    // arrived here via SW reload / full-page nav while the watchdog
    // was mid-flight), shield immediately until the URL matches.
    try {
      const pending = sessionStorage.getItem('hai:pending-deeplink')
      if (pending) {
        const cur = window.location.pathname + window.location.search
        if (cur !== pending) setTarget(pending)
      }
    } catch {}

    const onLanded = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail
      if (typeof detail !== 'string') return
      const cur = window.location.pathname + window.location.search
      if (cur === detail) return
      setTarget(detail)
    }
    window.addEventListener('hai:deeplink-landed', onLanded)
    return () => window.removeEventListener('hai:deeplink-landed', onLanded)
  }, [])

  // While target is set, poll until URL lands on it (or bail after 3s
  // so we never strand the user behind a permanent splash if
  // navigation outright fails).
  useEffect(() => {
    if (!target) return
    let cancelled = false
    let attempts = 0
    const MAX_ATTEMPTS = 30 // 30 × 100ms = 3s
    const tick = () => {
      if (cancelled) return
      const cur = window.location.pathname + window.location.search
      if (cur === target) {
        setTarget(null)
        return
      }
      attempts++
      if (attempts >= MAX_ATTEMPTS) {
        setTarget(null)
        return
      }
      setTimeout(tick, 100)
    }
    setTimeout(tick, 100)
    return () => { cancelled = true }
  }, [target])

  if (!target) return null

  return (
    <div className="_dls" aria-hidden="true">
      <div className="_dls-stage">
        <div className="_dls-ring _dls-r1" />
        <div className="_dls-ring _dls-r2" />
        <div className="_dls-logo">
          <svg viewBox="0 0 192 192" width="68" height="68">
            <rect width="192" height="192" rx="42" fill="#006d57"/>
            <circle cx="96" cy="106" r="17" fill="#fff"/>
            <circle cx="96" cy="51"  r="11" fill="#fff"/>
            <circle cx="144" cy="134" r="11" fill="#fff"/>
            <circle cx="48"  cy="134" r="11" fill="#fff"/>
          </svg>
        </div>
      </div>
      <div className="_dls-brand">
        <span className="_dls-ar">حَيّ</span>
        <span className="_dls-en">HAI</span>
      </div>
      <div className="_dls-loader" aria-hidden="true">
        <i /><i /><i />
      </div>

      <style jsx>{`
        ._dls {
          position: fixed;
          top: 0; right: 0; bottom: 0; left: 0;
          z-index: 99990;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: radial-gradient(ellipse at 50% 42%, #e8f5e9 0%, #e0f7f2 40%, #fff 100%);
          animation: _dlsIn 120ms ease-out forwards;
          will-change: opacity;
        }
        :global(.dark) ._dls {
          background: radial-gradient(ellipse at 50% 42%, #1c2832 0%, #1a262c 40%, #19232a 100%);
        }
        @keyframes _dlsIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        ._dls-stage {
          position: relative;
          width: 220px;
          height: 220px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        ._dls-ring {
          position: absolute;
          border-radius: 50%;
          border: 1px solid #00a884;
          opacity: 0;
          animation: _dlsRp 1.8s ease-out infinite;
        }
        ._dls-r1 { width: 100px; height: 100px; animation-delay: 0.4s; }
        ._dls-r2 { width: 180px; height: 180px; animation-delay: 0.7s; }
        @keyframes _dlsRp {
          0%   { transform: scale(0.5); opacity: 0.35; }
          100% { transform: scale(1.2); opacity: 0; }
        }

        ._dls-logo {
          position: relative;
          z-index: 2;
          width: 68px;
          height: 68px;
          border-radius: 15px;
          overflow: hidden;
          box-shadow: 0 6px 24px rgba(0, 168, 132, 0.32);
        }
        ._dls-logo :global(svg) { display: block; width: 100%; height: 100%; }

        ._dls-brand {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-top: 14px;
        }
        ._dls-ar {
          font-family: 'IBM Plex Sans Arabic', -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 26px;
          font-weight: 700;
          color: #006d57;
          line-height: 1.6;
        }
        :global(.dark) ._dls-ar { color: #00a884; }
        ._dls-en {
          font-size: 10px;
          font-weight: 600;
          color: #9ca3af;
          letter-spacing: 3px;
          margin-top: 4px;
        }

        ._dls-loader {
          position: absolute;
          bottom: max(env(safe-area-inset-bottom, 20px), 44px);
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 5px;
        }
        ._dls-loader i {
          display: block;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #00a884;
          animation: _dlsWave 1s ease-in-out infinite;
        }
        ._dls-loader i:nth-child(1) { animation-delay: 0s; }
        ._dls-loader i:nth-child(2) { animation-delay: 0.12s; }
        ._dls-loader i:nth-child(3) { animation-delay: 0.24s; }
        @keyframes _dlsWave {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.3; }
          40%            { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
