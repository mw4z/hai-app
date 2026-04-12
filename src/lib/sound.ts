/**
 * Lightweight UI sound system using the Web Audio API.
 * Sounds are synthesized on the fly — no audio files.
 * Modern, short, subtle sounds tied to specific actions.
 *
 * User can toggle sounds on/off via localStorage key 'hai_sounds'.
 */

let audioCtx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!audioCtx) {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
      if (!Ctx) return null
      audioCtx = new Ctx()
    }
    if (audioCtx.state === 'suspended') audioCtx.resume()
    return audioCtx
  } catch {
    return null
  }
}

function soundsEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const v = localStorage.getItem('hai_sounds')
    return v !== '0'
  } catch {
    return true
  }
}

export function setSoundsEnabled(on: boolean) {
  try { localStorage.setItem('hai_sounds', on ? '1' : '0') } catch {}
}

/**
 * Play a tone with an exponential envelope.
 */
function tone(opts: {
  freq: number
  duration: number
  type?: OscillatorType
  gain?: number
  attack?: number
  delay?: number
}) {
  const ctx = getCtx()
  if (!ctx) return

  const { freq, duration, type = 'sine', gain = 0.15, attack = 0.005, delay = 0 } = opts
  const startTime = ctx.currentTime + delay
  const endTime = startTime + duration

  const osc = ctx.createOscillator()
  const g = ctx.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(freq, startTime)

  g.gain.setValueAtTime(0, startTime)
  g.gain.linearRampToValueAtTime(gain, startTime + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, endTime)

  osc.connect(g)
  g.connect(ctx.destination)

  osc.start(startTime)
  osc.stop(endTime + 0.02)
}

/**
 * Frequency sweep (for swoosh effects).
 */
function sweep(opts: { from: number; to: number; duration: number; type?: OscillatorType; gain?: number }) {
  const ctx = getCtx()
  if (!ctx) return

  const { from, to, duration, type = 'sine', gain = 0.1 } = opts
  const startTime = ctx.currentTime
  const endTime = startTime + duration

  const osc = ctx.createOscillator()
  const g = ctx.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(from, startTime)
  osc.frequency.exponentialRampToValueAtTime(to, endTime)

  g.gain.setValueAtTime(0, startTime)
  g.gain.linearRampToValueAtTime(gain, startTime + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, endTime)

  osc.connect(g)
  g.connect(ctx.destination)

  osc.start(startTime)
  osc.stop(endTime + 0.02)
}

// ─── Public sound functions ─────────────────────────────────────────────

/** Soft tap — used for FAB and important button presses */
export function playTap() {
  if (!soundsEnabled()) return
  tone({ freq: 800, duration: 0.05, type: 'sine', gain: 0.1 })
}

/** Success chime — two ascending notes, used when creating post, sending comment */
export function playSuccess() {
  if (!soundsEnabled()) return
  tone({ freq: 587.33, duration: 0.1, type: 'sine', gain: 0.12 })           // D5
  tone({ freq: 880, duration: 0.15, type: 'sine', gain: 0.12, delay: 0.08 }) // A5
}

/** Error — short low buzz */
export function playError() {
  if (!soundsEnabled()) return
  tone({ freq: 220, duration: 0.12, type: 'square', gain: 0.08 })
  tone({ freq: 180, duration: 0.12, type: 'square', gain: 0.08, delay: 0.06 })
}

/** Message sent — upward swoosh */
export function playSend() {
  if (!soundsEnabled()) return
  sweep({ from: 400, to: 900, duration: 0.12, type: 'sine', gain: 0.1 })
}

/** Message received — soft ping */
export function playReceive() {
  if (!soundsEnabled()) return
  tone({ freq: 659.25, duration: 0.08, type: 'sine', gain: 0.1 })  // E5
  tone({ freq: 880, duration: 0.12, type: 'sine', gain: 0.1, delay: 0.05 })  // A5
}

/** Reaction pop — short playful click */
export function playReaction() {
  if (!soundsEnabled()) return
  tone({ freq: 1200, duration: 0.04, type: 'sine', gain: 0.08 })
  tone({ freq: 1600, duration: 0.04, type: 'sine', gain: 0.08, delay: 0.02 })
}

/** Delete — soft low thud */
export function playDelete() {
  if (!soundsEnabled()) return
  sweep({ from: 500, to: 150, duration: 0.15, type: 'triangle', gain: 0.1 })
}
