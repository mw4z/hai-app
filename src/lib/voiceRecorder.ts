/**
 * Voice-note recorder. Primary path is the NATIVE Capgo recorder
 * (@capgo/capacitor-audio-recorder) which produces .m4a/AAC on both
 * iOS and Android — consistent, cross-platform-playable. The browser
 * MediaRecorder is ONLY a fallback for the web app (clearly marked);
 * it's never the mobile path (per the chat-voice-note requirement).
 *
 * stop() always resolves to a Blob + mimeType + durationMs, so the
 * caller uploads the same way regardless of platform.
 */

export type RecorderResult = { blob: Blob; mimeType: string; durationMs: number }

export type RecorderErrorCode = 'permission' | 'unsupported' | 'failed'
export class RecorderError extends Error {
  code: RecorderErrorCode
  constructor(code: RecorderErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'RecorderError'
  }
}

export function isNativeRecorder(): boolean {
  return typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.() === true
}

// ── Native (Capgo) ──────────────────────────────────────────────
let nativeStartedAt = 0

async function nativeStart(): Promise<void> {
  const { CapacitorAudioRecorder } = await import('@capgo/capacitor-audio-recorder')
  // Ensure mic permission. The plugin's PermissionStatus exposes the
  // state under `recordAudio` (not `microphone`); keep a `microphone`
  // fallback in case a future version renames it.
  const permState = (s: any): string | undefined => s?.recordAudio ?? s?.microphone
  try {
    const cur: any = await CapacitorAudioRecorder.checkPermissions?.()
    const st = permState(cur)
    if (st && st !== 'granted') {
      const req: any = await CapacitorAudioRecorder.requestPermissions()
      const rst = permState(req)
      if (rst && rst !== 'granted') {
        throw new RecorderError('permission', 'Microphone permission denied')
      }
    }
  } catch (e) {
    if (e instanceof RecorderError) throw e
    const req: any = await CapacitorAudioRecorder.requestPermissions?.().catch(() => null)
    const rst = permState(req)
    if (rst && rst !== 'granted') {
      throw new RecorderError('permission', 'Microphone permission denied')
    }
  }
  // Voice-grade encoding: the plugin defaults to 192 kbps @ 44.1 kHz
  // (music quality) which makes a short note several hundred KB and the
  // upload feel slow. 48 kbps AAC @ 22.05 kHz is plenty for speech and
  // roughly 4× smaller — much faster to read off disk and upload.
  // bitRate is bits/sec (iOS maps it to AVEncoderBitRateKey).
  await CapacitorAudioRecorder.startRecording({ bitRate: 48000, sampleRate: 22050 })
  nativeStartedAt = Date.now()
}

async function nativeStop(): Promise<RecorderResult> {
  const { CapacitorAudioRecorder } = await import('@capgo/capacitor-audio-recorder')
  const res: any = await CapacitorAudioRecorder.stopRecording()
  const durationMs =
    typeof res?.duration === 'number' && res.duration > 0 ? res.duration : Date.now() - nativeStartedAt
  const uri: string | undefined = res?.uri
  if (!uri) throw new RecorderError('failed', 'No recording produced')
  // Read the recorded .m4a file from disk → Blob for upload.
  const { Filesystem } = await import('@capacitor/filesystem')
  const read: any = await Filesystem.readFile({ path: uri })
  const base64 = typeof read?.data === 'string' ? read.data : ''
  if (!base64) throw new RecorderError('failed', 'Could not read recording')
  // Decode via a data: URL so the browser's native base64 decoder does
  // the work (fast, C++) instead of a per-byte JS atob loop, which
  // stalls the UI for hundreds of ms on a multi-MB recording before the
  // upload even starts.
  const blob = await (await fetch(`data:audio/mp4;base64,${base64}`)).blob()
  return { blob, mimeType: 'audio/mp4', durationMs }
}

async function nativeCancel(): Promise<void> {
  try {
    const { CapacitorAudioRecorder } = await import('@capgo/capacitor-audio-recorder')
    await CapacitorAudioRecorder.cancelRecording()
  } catch {
    /* best-effort */
  }
}

// ── Live input level (for the recording waveform) ───────────────
// Native: poll the plugin's amplitude. Web: an AnalyserNode on the
// mic stream → RMS. Always normalized to 0..1.
async function nativeLevel(): Promise<number> {
  try {
    const { CapacitorAudioRecorder } = await import('@capgo/capacitor-audio-recorder')
    const res: any = await (CapacitorAudioRecorder as any).getCurrentAmplitude?.()
    if (!res) return 0
    const raw =
      typeof res.value === 'number'
        ? res.value
        : typeof res.amplitude === 'number'
          ? res.amplitude
          : typeof res.current === 'number'
            ? res.current
            : 0
    if (!(raw > 0)) return 0
    // The plugin returns a LINEAR amplitude in [0,1], but iOS derives it
    // from average power in dB (value = 10^(dB/20)). That packs ordinary
    // speech (~ -25 dB → value ≈ 0.056) into a tiny band near zero, so a
    // raw value barely lifts the bars off their 3px floor — the "quiet
    // dots" symptom. Re-expand through a dB window so speech is lively:
    //   -50 dB → 0 (silence/noise floor)   -5 dB → 1 (loud).
    // Android (peak sample amplitude) maps through the same window fine.
    const db = 20 * Math.log10(Math.min(1, raw))
    return Math.min(1, Math.max(0, (db + 50) / 45))
  } catch {
    return 0
  }
}

function webLevel(): number {
  if (!analyser || !levelBuf) return 0
  analyser.getByteTimeDomainData(levelBuf as any)
  let sum = 0
  for (let i = 0; i < levelBuf.length; i++) {
    const d = (levelBuf[i] - 128) / 128
    sum += d * d
  }
  const rms = Math.sqrt(sum / levelBuf.length)
  return Math.min(1, rms * 3.2) // amplify into a usable visual range
}

// ── Web fallback (MediaRecorder) ────────────────────────────────
let mediaRecorder: MediaRecorder | null = null
let webChunks: Blob[] = []
let webStream: MediaStream | null = null
let webStartedAt = 0
let audioCtx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let levelBuf: Uint8Array | null = null

function cleanupWeb() {
  try { webStream?.getTracks().forEach((t) => t.stop()) } catch {}
  try { audioCtx?.close() } catch {}
  webStream = null
  mediaRecorder = null
  webChunks = []
  audioCtx = null
  analyser = null
  levelBuf = null
}

async function webStart(): Promise<void> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices?.getUserMedia ||
    typeof MediaRecorder === 'undefined'
  ) {
    throw new RecorderError('unsupported', 'Recording not supported on this browser')
  }
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    throw new RecorderError('permission', 'Microphone permission denied')
  }
  webStream = stream
  webChunks = []
  // Live-level analyser for the waveform (best-effort).
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
    if (Ctx) {
      audioCtx = new Ctx()
      const srcNode = audioCtx!.createMediaStreamSource(stream)
      analyser = audioCtx!.createAnalyser()
      analyser.fftSize = 256
      levelBuf = new Uint8Array(analyser.fftSize)
      srcNode.connect(analyser)
    }
  } catch {
    audioCtx = null
    analyser = null
    levelBuf = null
  }
  const prefer = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
  const mime = prefer.find((m) => (MediaRecorder as any).isTypeSupported?.(m)) || ''
  mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
  mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) webChunks.push(e.data) }
  mediaRecorder.start()
  webStartedAt = Date.now()
}

function webStop(): Promise<RecorderResult> {
  return new Promise((resolve, reject) => {
    const mr = mediaRecorder
    if (!mr) return reject(new RecorderError('failed', 'No active recorder'))
    mr.onstop = () => {
      const type = (mr.mimeType || webChunks[0]?.type || 'audio/webm').split(';')[0]
      const blob = new Blob(webChunks, { type })
      const durationMs = Date.now() - webStartedAt
      cleanupWeb()
      resolve({ blob, mimeType: type, durationMs })
    }
    try { mr.stop() } catch (e) { reject(new RecorderError('failed', 'Stop failed')) }
  })
}

function webCancel(): void {
  try { mediaRecorder?.stop() } catch {}
  cleanupWeb()
}

// ── Public API ──────────────────────────────────────────────────
export const voiceRecorder = {
  isNative: isNativeRecorder,
  start(): Promise<void> {
    return isNativeRecorder() ? nativeStart() : webStart()
  },
  stop(): Promise<RecorderResult> {
    return isNativeRecorder() ? nativeStop() : webStop()
  },
  async cancel(): Promise<void> {
    return isNativeRecorder() ? nativeCancel() : webCancel()
  },
  /** Current mic input level, 0..1 — drives the recording waveform. */
  getLevel(): Promise<number> {
    return isNativeRecorder() ? nativeLevel() : Promise.resolve(webLevel())
  },
}
