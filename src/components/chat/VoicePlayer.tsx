'use client'

import { useMemo, useRef, useState } from 'react'
import { FiPlay, FiPause, FiAlertCircle } from 'react-icons/fi'

/** Voice-note playback bubble: play/pause, an animated waveform, and a
 *  duration readout, with loading + error states. Self-contained LTR
 *  media widget (the controls read left→right even inside an RTL chat). */
function fmtMs(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

const WAVE_BARS = 28

/** Deterministic decorative waveform (we don't decode the audio). Seeded
 *  from the duration so a given note always draws the same shape and it
 *  doesn't reshuffle when the optimistic row swaps to the server row. A
 *  sine envelope makes it taller in the middle, like real speech. */
function buildWave(seed: number, count: number): number[] {
  let s = (Math.max(1, Math.floor(seed)) >>> 0) || 1
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    s = (s * 1103515245 + 12345) >>> 0
    const r = (s % 1000) / 1000
    const env = Math.sin((i / (count - 1)) * Math.PI) * 0.6 + 0.4
    out.push(Math.min(1, r * env + 0.12))
  }
  return out
}

export default function VoicePlayer({
  src,
  durationMs,
  isMe,
  pending,
}: {
  src: string
  durationMs?: number | null
  isMe: boolean
  /** While true (uploading), a spinner ring wraps the play button. */
  pending?: boolean
}) {
  const ref = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [posMs, setPosMs] = useState(0)
  const [metaMs, setMetaMs] = useState<number>(durationMs && durationMs > 0 ? durationMs : 0)

  const total = metaMs > 0 ? metaMs : durationMs && durationMs > 0 ? durationMs : 0
  const pct = total > 0 ? Math.min(100, (posMs / total) * 100) : 0
  const wave = useMemo(() => buildWave(durationMs && durationMs > 0 ? durationMs : 1, WAVE_BARS), [durationMs])

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
      <div className="relative flex-shrink-0 w-9 h-9">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? 'Pause voice note' : 'Play voice note'}
          className="absolute inset-0 w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform"
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
        {/* Upload spinner — a ring that wraps the play circle exactly
            (concentric, 3px outside it) instead of a corner dot. */}
        {pending && (
          <span
            className="absolute -inset-[3px] rounded-full animate-spin pointer-events-none"
            style={{ border: '2px solid', borderColor: accent, borderTopColor: 'transparent' }}
            aria-hidden
          />
        )}
      </div>

      <div className="flex-1 min-w-0">
        {/* Animated waveform preview — visible even before playback. Each
            bar fills with the accent as the note plays; the gentle idle
            motion (hai-voice-bar) keeps the "voice note" read alive. */}
        <div className="flex items-center gap-[2px] h-6" dir="ltr">
          {wave.map((bv, i) => {
            const played = total > 0 && (i + 0.5) / wave.length <= pct / 100
            return (
              <span
                key={i}
                className="flex-1 min-w-[2px] rounded-full hai-voice-bar"
                style={{
                  height: `${Math.round(20 + bv * 80)}%`,
                  background: played ? accent : trackBg,
                  animationDelay: `${i * 55}ms`,
                }}
              />
            )
          })}
        </div>
        <div className="text-[10px] mt-0.5 tabular-nums" style={{ color: labelColor }}>
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
