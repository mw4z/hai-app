#!/usr/bin/env node
/**
 * Generate the Hai branded notification sound — a warm two-note
 * doorbell chime (C5 → E5) that evokes "a neighbor at your door".
 * Output is a 16-bit mono PCM WAV, ~0.55s, 44100 Hz. The same file
 * is dropped into both Android raw/ and iOS App/App/sounds/ so push
 * notifications carry the Hai brand on every platform.
 *
 * Run:
 *   node scripts/generate-notification-sound.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const SAMPLE_RATE = 44100
const BITS_PER_SAMPLE = 16
const CHANNELS = 1

/** Sine + slight harmonics with attack + exponential release.
 *  Returns Int16 PCM samples. */
function synthNote(freq, durationSec) {
  const total = Math.floor(SAMPLE_RATE * durationSec)
  const out = new Int16Array(total)
  const attackSamples = Math.floor(SAMPLE_RATE * 0.012) // 12ms attack
  for (let i = 0; i < total; i++) {
    const t = i / SAMPLE_RATE
    // Fundamental + softer 2nd harmonic for a warmer bell tone
    const wave =
      Math.sin(2 * Math.PI * freq * t) * 0.85 +
      Math.sin(2 * Math.PI * freq * 2 * t) * 0.15

    // Attack ramp + exponential decay (bell-like)
    let env
    if (i < attackSamples) {
      env = i / attackSamples
    } else {
      const decayT = t - (attackSamples / SAMPLE_RATE)
      env = Math.exp(-decayT * 4.5)
    }

    out[i] = Math.max(-1, Math.min(1, wave * env)) * 0x7fff * 0.85
  }
  return out
}

function silence(durationSec) {
  return new Int16Array(Math.floor(SAMPLE_RATE * durationSec))
}

function concat(...arrays) {
  let len = 0
  for (const a of arrays) len += a.length
  const out = new Int16Array(len)
  let off = 0
  for (const a of arrays) { out.set(a, off); off += a.length }
  return out
}

// Two-note motif: C5 → E5. Friendly major third, classic doorbell feel.
const C5 = 523.25
const E5 = 659.25

const samples = concat(
  synthNote(C5, 0.18),
  silence(0.04),
  synthNote(E5, 0.32),
)

// ── Wrap in WAV container ────────────────────────────────────
const dataBytes = samples.length * 2
const buf = Buffer.alloc(44 + dataBytes)

// RIFF header
buf.write('RIFF', 0)
buf.writeUInt32LE(36 + dataBytes, 4)
buf.write('WAVE', 8)
// fmt chunk
buf.write('fmt ', 12)
buf.writeUInt32LE(16, 16)              // PCM chunk size
buf.writeUInt16LE(1, 20)               // PCM format
buf.writeUInt16LE(CHANNELS, 22)
buf.writeUInt32LE(SAMPLE_RATE, 24)
buf.writeUInt32LE(SAMPLE_RATE * CHANNELS * BITS_PER_SAMPLE / 8, 28) // byte rate
buf.writeUInt16LE(CHANNELS * BITS_PER_SAMPLE / 8, 32)               // block align
buf.writeUInt16LE(BITS_PER_SAMPLE, 34)
// data chunk
buf.write('data', 36)
buf.writeUInt32LE(dataBytes, 40)
// PCM samples
for (let i = 0; i < samples.length; i++) {
  buf.writeInt16LE(samples[i], 44 + i * 2)
}

// ── Write to all asset locations ─────────────────────────────
const targets = [
  // Android raw resource — must be lowercase, no extension in lookup.
  // FCM android.notification.sound takes the resource name without ext.
  'android/app/src/main/res/raw/hai_chime.wav',
  // iOS bundled sound — APNS sound field references the file name with
  // extension. Keeping it under sounds/ keeps the project clean.
  'ios/App/App/sounds/hai_chime.wav',
  // Web / PWA — also expose so the foreground in-app sound code can
  // reach for it via fetch if we ever want to.
  'public/sounds/hai_chime.wav',
]

for (const rel of targets) {
  const abs = path.join(ROOT, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, buf)
  console.log('wrote', rel, `(${dataBytes} bytes pcm)`)
}
console.log('Done.')
