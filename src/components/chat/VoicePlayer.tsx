'use client'

import { useRef, useState } from 'react'
import { FiPlay, FiPause, FiAlertCircle } from 'react-icons/fi'

/** Voice-note playback bubble: play/pause, progress, duration, with
 *  loading + error states. Self-contained LTR media widget (the
 *  controls read left→right even inside an RTL chat). */
function fmtMs(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

export default function VoicePlayer({
  src,
  durationMs,
  isMe,
}: {
  src: string
  durationMs?: number | null
  isMe: boolean
}) {
  const ref = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [posMs, setPosMs] = useState(0)
  const [metaMs, setMetaMs] = useState<number>(durationMs && durationMs > 0 ? durationMs : 0)

  const total = metaMs > 0 ? metaMs : durationMs && durationMs > 0 ? durationMs : 0
  const pct = total > 0 ? Math.min(100, (posMs / total) * 100) : 0

  // Colors adapt to bubble side (my green bubble vs neutral).
  const accent = isMe ? 'rgba(255,255,255,0.92)' : '#00a884'
  const trackBg = isMe ? 'rgba(255,255,255,0.30)' : 'rgba(0,0,0,0.15)'
  const knobColor = isMe ? '#00715c' : '#ffffff'
  const labelColor = isMe ? 'rgba(255,255,255,0.85)' : '#6b7280'

  function toggle() {
    const a = ref.current
    if (!a || error) return
    if (playing) {
      a.pause()
      return
    }
    setLoading(true)
    a.play().catch(() => {
      setError(true)
      setLoading(false)
    })
  }

  return (
    <div className="flex items-center gap-2.5 min-w-[180px] max-w-[240px]" dir="ltr">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform"
        style={{ background: accent, color: knobColor }}
      >
        {error ? (
          <FiAlertCircle className="w-4 h-4" />
        ) : loading && !playing ? (
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : playing ? (
          <FiPause className="w-4 h-4" />
        ) : (
          <FiPlay className="w-4 h-4 ms-0.5" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="h-1 rounded-full overflow-hidden" style={{ background: trackBg }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: accent }} />
        </div>
        <div className="text-[10px] mt-1 tabular-nums" style={{ color: labelColor }}>
          {error
            ? '⚠︎'
            : `${fmtMs(playing || posMs > 0 ? posMs : total)}${total > 0 ? ` / ${fmtMs(total)}` : ''}`}
        </div>
      </div>

      <audio
        ref={ref}
        src={src}
        preload="none"
        className="hidden"
        onLoadedMetadata={(e) => {
          const d = (e.currentTarget.duration || 0) * 1000
          if (Number.isFinite(d) && d > 0) setMetaMs(d)
        }}
        onPlay={() => {
          setPlaying(true)
          setLoading(false)
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setPosMs(0)
        }}
        onTimeUpdate={(e) => setPosMs(e.currentTarget.currentTime * 1000)}
        onError={() => {
          setError(true)
          setLoading(false)
          setPlaying(false)
        }}
      />
    </div>
  )
}
