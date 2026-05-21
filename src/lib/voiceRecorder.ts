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

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// ── Native (Capgo) ──────────────────────────────────────────────
let nativeStartedAt = 0

async function nativeStart(): Promise<void> {
  const { CapacitorAudioRecorder } = await import('@capgo/capacitor-audio-recorder')
  // Ensure mic permission. Shapes vary slightly across versions, so be
  // lenient: check, then request if not clearly granted.
  try {
    const cur: any = await CapacitorAudioRecorder.checkPermissions?.()
    if (cur && cur.microphone && cur.microphone !== 'granted') {
      const req: any = await CapacitorAudioRecorder.requestPermissions()
      if (req?.microphone && req.microphone !== 'granted') {
        throw new RecorderError('permission', 'Microphone permission denied')
      }
    }
  } catch (e) {
    if (e instanceof RecorderError) throw e
    const req: any = await CapacitorAudioRecorder.requestPermissions?.().catch(() => null)
    if (req && req.microphone && req.microphone !== 'granted') {
      throw new RecorderError('permission', 'Microphone permission denied')
    }
  }
  await CapacitorAudioRecorder.startRecording()
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
  const blob = new Blob([base64ToBytes(base64) as unknown as BlobPart], { type: 'audio/mp4' })
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
    let v =
      typeof res.amplitude === 'number'
        ? res.amplitude
        : typeof res.value === 'number'
          ? res.value
          : typeof res.current === 'number'
            ? res.current
            : 0
    // dB-scale (≤0) → normalize from roughly -60..0 dB into 0..1.
    if (v <= 0 && v !== 0) v = Math.max(0, (v + 60) / 60)
    return Math.min(1, Math.max(0, v))
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
