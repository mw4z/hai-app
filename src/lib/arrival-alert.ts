// ─── Arrival Alert ──────────────────────────────────────────────────────────
// Strong multi-sensory alert when driver arrives at pickup.
// Uses vibration + audio tone (no external files needed).

/** Vibrate in an urgent pattern (works on Android, some iOS) */
export function vibrateArrival() {
  try {
    if (navigator.vibrate) {
      // Pattern: vibrate 300ms, pause 200ms, vibrate 300ms, pause 200ms, vibrate 500ms
      navigator.vibrate([300, 200, 300, 200, 500])
    }
  } catch { /* vibration not supported */ }
}

/** Play a short attention tone using Web Audio API (no mp3 needed) */
export function playArrivalSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()

    // Two-tone alert: ascending notes
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.3, ctx.currentTime + start)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + duration)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + duration)
    }

    // Three ascending tones
    playTone(523, 0, 0.2)    // C5
    playTone(659, 0.25, 0.2) // E5
    playTone(784, 0.5, 0.3)  // G5

    // Repeat after a pause
    setTimeout(() => {
      playTone(523, 0, 0.2)
      playTone(659, 0.25, 0.2)
      playTone(784, 0.5, 0.3)
    }, 1200)
  } catch { /* audio not supported */ }
}

/** Trigger the full arrival alert (vibrate + sound) */
export function triggerArrivalAlert() {
  vibrateArrival()
  playArrivalSound()
}
