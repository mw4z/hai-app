'use client'

import { useEffect, useCallback, useState, useRef } from 'react'
import { useLanguage } from '@/hooks/useLanguage'

const MESSAGES = {
  ar: [
    'أحسنت! استمر بهذا الأسلوب الراقي 💪',
    'أنت تصنع فرق في حيّك! 🌟',
    'جزاك الله خير على مساعدتك 🤝',
    'سمعتك الطيبة تكبر! ⭐',
    'شكراً لخدمتك لأهل الحي 🏘️',
    'أنت قدوة لأهل الحي! 💚',
  ],
  en: [
    'Well done! Keep up the great work 💪',
    'You\'re making a difference! 🌟',
    'Thank you for helping out 🤝',
    'Your reputation is growing! ⭐',
    'Thanks for serving the neighborhood 🏘️',
    'You\'re a role model! 💚',
  ],
}

const STORAGE_KEY = 'hai_last_rep'

export default function RepToast() {
  const { lang } = useLanguage()
  const [popup, setPopup] = useState<{ diff: number; text: string } | null>(null)
  // Use localStorage to persist last rep across sessions — prevents false popup on login
  const lastRepRef = useRef<number | null>((() => {
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
      return stored ? parseInt(stored, 10) : null
    } catch { return null }
  })())
  // Skip the first two checks after mount (login/page load)
  const skipCount = useRef(2)

  const check = useCallback(async () => {
    try {
      const res = await fetch('/api/profile/rep-check')
      if (!res.ok) return
      const data = await res.json()
      const currentRep: number = data.totalRep ?? 0

      const prev = lastRepRef.current

      // Always store current rep
      lastRepRef.current = currentRep
      try { localStorage.setItem(STORAGE_KEY, String(currentRep)) } catch {}

      // Skip first checks after login — only show for real-time gains during the session
      if (skipCount.current > 0) {
        skipCount.current--
        return
      }

      if (prev !== null) {
        const diff = currentRep - prev
        if (diff > 0) {
          const msgs = lang !== 'en' ? MESSAGES.ar : MESSAGES.en
          const text = msgs[Math.floor(Math.random() * msgs.length)]
          setPopup({ diff, text })
          setTimeout(() => setPopup(null), 5000)
        }
      }
    } catch { /* ignore */ }
  }, [lang])

  useEffect(() => {
    check()
    const interval = setInterval(check, 30000)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [check])

  if (!popup) return null

  return (
    <div
      onClick={() => setPopup(null)}
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99999,
        background: 'linear-gradient(135deg, #005745 0%, #006d57 100%)',
        border: '1px solid #00a884',
        borderRadius: '16px',
        padding: '14px 20px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        cursor: 'pointer',
        maxWidth: '340px',
        animation: 'slideDown 0.3s ease-out',
      }}
    >
      <span style={{ fontSize: '28px' }}>🏆</span>
      <div>
        <div style={{ color: '#ffffff', fontSize: '14px', fontWeight: 600, lineHeight: 1.4 }}>{popup.text}</div>
        <div style={{ color: '#00a884', fontSize: '13px', fontWeight: 700, marginTop: '4px' }}>
          +{popup.diff} {lang !== 'en' ? 'نقطة' : 'pts'}
        </div>
      </div>
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  )
}
