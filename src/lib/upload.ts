const MAX_WIDTH = 1200
const MAX_HEIGHT = 1200
const JPEG_QUALITY = 0.75

/**
 * Compress an image file on the client before uploading.
 * Resizes to max 1200x1200 and converts to JPEG at 75% quality.
 * Typical 3-5MB phone photo → 100-300KB output.
 */
// Types the upload API accepts as-is (src/app/api/upload). Anything else
// (HEIC/HEIF from iPhones, GIF, BMP, TIFF…) MUST be re-encoded to JPEG or
// the server rejects it with "نوع غير مدعوم".
const SERVER_OK_TYPES = ['image/jpeg', 'image/png', 'image/webp']

function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    // Non-images pass through (handled / rejected by the caller's flow).
    if (!file.type.startsWith('image/')) {
      resolve(file)
      return
    }
    // Already a server-accepted type AND small → no re-encode needed.
    // A NON-accepted type (e.g. HEIC) always gets re-encoded below,
    // regardless of size, so it never reaches the server unconverted.
    if (SERVER_OK_TYPES.includes(file.type) && file.size < 50_000) {
      resolve(file)
      return
    }

    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      let { width, height } = img

      if (width > MAX_WIDTH || height > MAX_HEIGHT) {
        const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(file); return }

      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return }
          const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
          resolve(new File([blob], name, { type: 'image/jpeg' }))
        },
        'image/jpeg',
        JPEG_QUALITY
      )
    }

    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}

/**
 * Compress images then upload via single POST to server → Blob.
 *
 * Optional `onProgress` callback fires with a 0..100 percent while
 * the multipart body is being sent. We use XMLHttpRequest under the
 * hood (not fetch) because fetch has no upload-progress hook in any
 * shipping browser — the Streams-based Request body API still
 * doesn't surface upload progress on iOS Safari / Android WebView /
 * Capacitor as of 2026-05. XHR's `upload.onprogress` works
 * everywhere.
 *
 * The percent is OVERALL — the request body is a single multipart
 * upload of all images concatenated, so a "per-file" percent isn't
 * a thing the network actually emits. Callers that want per-
 * thumbnail bars can just bind the same overall percent to every
 * thumbnail; that already matches user perception (all uploading
 * together, all done together).
 */
export async function uploadFiles(
  files: File[],
  opts?: { onProgress?: (percent: number) => void },
): Promise<string[]> {
  // Compress all images in parallel (1200px max, JPEG q0.75 → ~100-300KB).
  const compressed = await Promise.all(files.map((f) => compressImage(f)))

  // Client-direct to Vercel Blob, mirroring the PDF path. The old /api/upload
  // route streamed the whole multipart body THROUGH the Next.js function and
  // put() to Blob inside it — on mobile that hit the function timeout (seen in
  // Vercel logs) and Vercel's 4.5MB body cap, surfacing as the generic
  // "فشل رفع الصور". Minting a token + PUTting straight to Blob avoids both.
  // Dynamic import so the blob-client bundle isn't pulled into first paint.
  const { upload } = await import('@vercel/blob/client')

  const n = compressed.length
  const pct = new Array<number>(n).fill(0)
  const emit = () => {
    if (!opts?.onProgress) return
    const avg = pct.reduce((a, b) => a + b, 0) / n
    try { opts.onProgress(Math.max(0, Math.min(100, Math.round(avg)))) } catch {}
  }

  // Hard deadline so a hung connection surfaces as a toast, not a stuck
  // spinner. One controller aborts every in-flight PUT.
  const ctrl = new AbortController()
  let timedOut = false
  const deadline = new Promise<never>((_, reject) => {
    setTimeout(() => { timedOut = true; ctrl.abort(); reject(new Error('انتهت مهلة رفع الصور — تحقّق من الإنترنت')) }, 120_000)
  })

  const work = Promise.all(
    compressed.map(async (file, i) => {
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
      const key = `uploads/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${i}.${ext}`
      const blob = await upload(key, file, {
        access: 'public',
        handleUploadUrl: '/api/upload-image',
        contentType: file.type || 'image/jpeg',
        abortSignal: ctrl.signal,
        onUploadProgress: (ev) => { pct[i] = ev.percentage ?? 0; emit() },
      })
      return blob.url
    }),
  )

  try {
    const urls = await Promise.race([work, deadline])
    try { opts?.onProgress?.(100) } catch {}
    return urls
  } catch (err) {
    if (timedOut) throw err
    throw new Error(err instanceof Error && err.message ? err.message : 'فشل رفع الصور')
  }
}

/**
 * Upload a single PDF up to 25MB. Goes via the client-direct path
 * (the file streams from the browser straight to Vercel Blob; the
 * Next.js function only issues an auth token) because 25MB blows past
 * Vercel's per-function body cap.
 *
 * Returns the blob URL plus the original filename so callers can store
 * both — the filename is what we render in the PdfTile.
 *
 * Wraps the upload in a hard 120s timeout. @vercel/blob/client.upload
 * itself does not honor AbortSignal in all of its phases — the actual
 * file PUT can hang if the connection drops mid-transfer. The wrapper
 * just rejects after the deadline so the caller doesn't sit forever.
 * Mobile is the common case here and a 25MB PDF on a slow 4G link is
 * ~40-60s; 120s gives a healthy margin without being "forever".
 *
 * If onProgress is supplied, it's called whenever the @vercel/blob
 * client emits a progress event (currently fires at file-bytes
 * boundaries; not a smooth percent — but enough for "still working").
 */
// 50MB matches the cap users see in everyday messaging apps
// (WhatsApp document attachments). Vercel Blob itself handles up to
// 5GB; this is purely a UX cap to keep upload times sane.
const MAX_PDF_BYTES = 50 * 1024 * 1024
// 50MB on a slow 4G link can take 80-120s. Bumped from 120s to 300s
// so a legitimate slow-cellular upload doesn't time out mid-transfer.
// 300s is also Vercel's new default function timeout, so this matches
// the platform.
const PDF_UPLOAD_TIMEOUT_MS = 300_000

/**
 * Stages of the PDF pipeline. Surfaced via uploadPdf's onStage
 * callback so the UI can show "Scanning…" then "Compressing…"
 * then "Uploading X%…" with the right label at each step.
 *
 *  scanning    — validatePdfSafety (magic bytes, active content,
 *                encryption, page count). ~50ms on a 5MB file.
 *  compressing — pdf-lib re-save. ~100ms-2s depending on size.
 *  uploading   — actual byte transfer to Vercel Blob. The
 *                bulk of total time on mobile (seconds, not ms).
 *                Progress percent ticks via onProgress in parallel.
 */
export type UploadStage = 'scanning' | 'compressing' | 'uploading'

/**
 * Trilingual label for the current upload stage. Used by every
 * surface that renders a "Scanning… / Compressing… / Uploading…"
 * tile (post composer preview, comment composer preview, chat
 * pending bubble). Keeps the copy in one place so the wording
 * matches across the app.
 *
 * Note: callers pair the returned string with the `.hai-typing-dots`
 * class for the animated trailing dots — that's why we DON'T
 * include "…" here; the CSS pseudo-element supplies the dots.
 */
export function uploadStageLabel(
  stage: UploadStage,
  lang: 'ar' | 'en' | 'ur',
): string {
  switch (stage) {
    case 'scanning':
      return lang === 'en' ? 'Scanning' : lang === 'ur' ? 'اسکین ہو رہی ہے' : 'جاري الفحص'
    case 'compressing':
      return lang === 'en' ? 'Compressing' : lang === 'ur' ? 'دبا رہا ہے' : 'جاري الضغط'
    case 'uploading':
      return lang === 'en' ? 'Uploading' : lang === 'ur' ? 'اپ لوڈ ہو رہا ہے' : 'جاري الرفع'
  }
}

/**
 * Lightweight safety guard for user-uploaded PDFs. NOT a full
 * antivirus scan. Catches the highest-impact attack classes in
 * roughly 30-60ms even on a 25MB file by doing the cheap checks
 * only — magic bytes + a SCOPED substring scan over the head
 * and tail of the file (where PDF metadata lives), no pdf-lib
 * parse.
 *
 *  1. Magic bytes — file must start with "%PDF-". Rejects MIME
 *     spoofing (renamed .exe, junk bodies).
 *
 *  2. Scoped active-content + encryption scan — byte-level grep
 *     over the first 256KB + last 256KB of the file for the
 *     PDF dictionary keys that introduce executable / embedded
 *     / encrypted content:
 *       /JavaScript /JS /OpenAction /Launch /EmbeddedFile /Encrypt
 *     PDFs put their catalog and trailer at the file's edges,
 *     where ALL of these dictionary names appear. Scanning the
 *     middle (which is mostly compressed stream content) is
 *     wasted work — V8 still has to read all 25MB before
 *     reporting "no match", and the false-positive rate from
 *     scanning compressed streams is higher than from scanning
 *     just the metadata regions.
 *
 * We DO NOT load pdf-lib here anymore (the previous version
 * did, costing ~500ms-2s on mobile for large files). Encryption
 * detection is handled by the /Encrypt byte-grep below; page-
 * count capping was dropped — the 25MB file-size cap is already
 * strong DoS protection on its own, and a 5000-page text PDF is
 * a legitimate document we shouldn't block.
 *
 * If you ever need the deep parse back, do it inside compressPdf
 * (it already loads pdf-lib once) instead of doing it twice.
 */
const SCAN_WINDOW_BYTES = 256 * 1024 // head + tail each

async function validatePdfSafety(file: File): Promise<void> {
  // file.slice(start, end).arrayBuffer() asks the browser for ONLY
  // the requested byte range from the underlying storage, instead
  // of pulling the entire file into memory like the previous
  // file.arrayBuffer() call did. On a 4.9MB PDF this was the
  // single biggest wasted cost in the pre-upload phase — 4.9MB of
  // memcpy when we only ever scan 512KB. Slice + decode is
  // ~10-30ms total even on mobile.
  const headSize = Math.min(SCAN_WINDOW_BYTES, file.size)
  const headBuf = await file.slice(0, headSize).arrayBuffer()
  const headU8 = new Uint8Array(headBuf)

  // 1. Magic bytes — "%PDF-" at offset 0.
  if (
    headU8.length < 5 ||
    headU8[0] !== 0x25 || headU8[1] !== 0x50 || headU8[2] !== 0x44 ||
    headU8[3] !== 0x46 || headU8[4] !== 0x2D
  ) {
    throw new Error('الملف ليس PDF صالحاً')
  }

  // 2. Scoped active-content + encryption scan. latin1 keeps 1 byte
  // == 1 char so indexOf offsets align with file offsets.
  const head = new TextDecoder('latin1').decode(headU8)
  let tail = ''
  if (file.size > SCAN_WINDOW_BYTES) {
    const tailStart = file.size - SCAN_WINDOW_BYTES
    const tailBuf = await file.slice(tailStart).arrayBuffer()
    tail = new TextDecoder('latin1').decode(new Uint8Array(tailBuf))
  }

  // Active executable / embedded content.
  const dangerousMarkers = [
    '/JavaScript',
    '/OpenAction',
    '/Launch',
    '/EmbeddedFile',
    '/JS ',           // trailing space avoids matching "/JSON" etc.
    '/JS\n',
    '/JS\r',
  ]
  for (const marker of dangerousMarkers) {
    if (head.includes(marker) || tail.includes(marker)) {
      throw new Error('PDF يحتوي على محتوى تفاعلي غير آمن — رجاءً صدّر نسخة عادية')
    }
  }

  // Encryption indicator lives in the trailer (file tail), but
  // check head too for unusually structured PDFs. Suffix matters:
  // bare "/Encrypt" without delimiter avoids matching legitimate
  // names like "/EncryptMetadata".
  const encryptedMarkers = ['/Encrypt ', '/Encrypt\n', '/Encrypt\r', '/Encrypt<']
  for (const marker of encryptedMarkers) {
    if (head.includes(marker) || tail.includes(marker)) {
      throw new Error('لا يمكن رفع PDF مشفّر — أزل الحماية وحاول مجدداً')
    }
  }
}

/**
 * Lossless PDF re-save via pdf-lib. Strips redundant object
 * declarations, enables object streams (PDF 1.5+ feature that
 * compresses small indirect objects into a single deflate
 * stream), and drops any orphan / unreferenced objects pdf-lib
 * notices during the parse-and-rebuild pass.
 *
 * Typical savings: 5-15% on text-heavy PDFs, 1-5% on image-heavy
 * ones (because the bulk of those is already DCT-encoded JPEG
 * data inside the PDF). For some already-optimized PDFs the
 * re-save can come out LARGER — we compare lengths and keep the
 * original in that case.
 *
 * Safety:
 *  - PDFs we can't parse (encrypted, malformed, signed, etc.)
 *    fall back to the original file. We never reject the upload
 *    because of a compression failure.
 *  - Files under 256KB skip compression entirely — the overhead
 *    of round-tripping through pdf-lib isn't worth it.
 *  - Files over 8MB skip compression. pdf-lib's parse of a 25MB
 *    PDF on mobile is 3-8 seconds, and image-heavy PDFs at that
 *    size save almost nothing (the bulk is already-DCT-encoded
 *    JPEG). At the upper end the parse cost dominates.
 *  - We don't strip metadata. Some PDFs carry meaningful info
 *    there (digital signatures, accessibility tags); preserving
 *    is safer than aggressive stripping.
 *
 * Why 8MB and not 2MB (previous): files in the 4-8MB range are
 * the SLOWEST uploads in practice — they're above the 4.5MB
 * Vercel function body cap so they get forced into the 3-RTT
 * client-direct path. If lossless re-save can drop them under
 * 4MB, they switch to the 1-RTT fast path, which is a 2-4x
 * total speedup that easily pays for the 1-2s parse cost. For
 * text-heavy PDFs (price lists, menus) re-save commonly saves
 * 10-20%, enough to cross the threshold.
 */
const COMPRESS_MIN_BYTES = 256 * 1024
const COMPRESS_MAX_BYTES = 8 * 1024 * 1024

/**
 * Aggressive (lossy) PDF compression — re-encodes embedded JPEG
 * images at lower quality. Used as the fallback path when
 * lossless re-save can't drop the file below the fast-path
 * threshold.
 *
 * How it works:
 *  1. Load via pdf-lib.
 *  2. Walk every indirect object. Find ones that are image
 *     streams (Subtype=Image, Filter=DCTDecode → JPEG).
 *  3. Skip CMYK / non-RGB images (canvas re-encode would shift
 *     colors), tiny images (<30KB, savings not worth it), and
 *     anything we can't decode.
 *  4. For each survivor: decode JPEG via createImageBitmap +
 *     canvas, re-encode at quality 0.65. Replace the stream
 *     only if the new bytes are at least 15% smaller.
 *  5. Save with object streams as usual.
 *
 * Typical savings: 30-60% on image-heavy PDFs (real-estate
 * flyers, scanned brochures, restaurant menus with food shots).
 * Cost: ~100-500ms per image being recompressed, so a 4.9MB PDF
 * with 10 photos might take 2-4 seconds total. Worth it when
 * the result drops the file under the 4MB fast-path threshold —
 * that swaps a 3-RTT slow upload for a 1-RTT fast one, a net
 * win of several seconds.
 *
 * Lossy by design. q=0.65 is the same JPEG quality the existing
 * compressImage helper uses for photo posts, so the visual fidelity
 * matches what users already accept everywhere else in the app.
 */
async function aggressivelyCompressPdf(
  file: File,
  onLog?: (msg: string) => void,
  quality = 0.65,
): Promise<File> {
  try {
    const { PDFDocument, PDFName, PDFRawStream, PDFNumber } = await import('pdf-lib')
    const bytes = await file.arrayBuffer()
    const doc = await PDFDocument.load(bytes, { updateMetadata: false })
    const context = doc.context

    let recompressedCount = 0
    let streamBytesSaved = 0

    const objects = Array.from(context.enumerateIndirectObjects())
    for (const [ref, obj] of objects) {
      if (!(obj instanceof PDFRawStream)) continue

      const dict = obj.dict
      const subtype = dict.get(PDFName.of('Subtype'))
      if (!subtype || String(subtype) !== '/Image') continue

      const filter = dict.get(PDFName.of('Filter'))
      if (!filter) continue
      // Filter can be a single name or an array. We only recompress
      // DCTDecode (JPEG) streams — re-encoding via canvas would
      // corrupt FlateDecode (PNG) or JBIG2 streams.
      const filterStr = String(filter)
      if (!filterStr.includes('DCTDecode')) continue

      // ColorSpace gate: canvas always re-encodes as RGB, so a CMYK
      // or device-specific image would come back color-shifted.
      // Skip those — the safe set is /DeviceRGB and /DeviceGray
      // (grayscale stored as JPEG is rare but works through RGB).
      const cs = dict.get(PDFName.of('ColorSpace'))
      const csStr = cs ? String(cs) : ''
      if (csStr.includes('CMYK') || csStr.includes('ICCBased')) continue

      const jpegBytes = obj.contents
      if (!jpegBytes || jpegBytes.length < 30_000) continue

      try {
        const recompressed = await recompressJpegViaCanvas(jpegBytes, quality)
        // Only swap if the new bytes are meaningfully smaller —
        // otherwise we waste the parse cost for nothing.
        if (recompressed.length < jpegBytes.length * 0.85) {
          const newDict = dict.clone(context)
          newDict.set(PDFName.of('Length'), PDFNumber.of(recompressed.length))
          const newStream = PDFRawStream.of(newDict, recompressed)
          context.assign(ref, newStream)
          recompressedCount++
          streamBytesSaved += jpegBytes.length - recompressed.length
        }
      } catch {
        /* skip on per-image failure — don't abort the whole pass */
      }
    }

    if (recompressedCount === 0) {
      onLog?.(`[aggressive] no eligible JPEG images found`)
      return file
    }

    const saved = await doc.save({ useObjectStreams: true, addDefaultPage: false })
    if (saved.length >= file.size) {
      onLog?.(`[aggressive] no-op (${file.size}B → ${saved.length}B)`)
      return file
    }
    onLog?.(
      `[aggressive] ${recompressedCount} JPEG images recompressed (` +
        `${file.size}B → ${saved.length}B, ` +
        `${Math.round((1 - saved.length / file.size) * 100)}% smaller)`,
    )
    const buf = saved.buffer.slice(
      saved.byteOffset,
      saved.byteOffset + saved.byteLength,
    ) as ArrayBuffer
    return new File([buf], file.name, { type: 'application/pdf' })
  } catch (err) {
    onLog?.(`[aggressive] failed, using input: ${(err as Error).message}`)
    return file
  }
}

/** Decode a JPEG byte array via createImageBitmap, draw it onto a
 *  canvas, and re-encode as JPEG at the requested quality.
 *  Returns a fresh Uint8Array sized to the new compressed length. */
async function recompressJpegViaCanvas(
  bytes: Uint8Array,
  quality: number,
): Promise<Uint8Array> {
  // createImageBitmap is the fastest decode path on every modern
  // browser — no DOM, no event roundtrips. Falls back to <img> tag
  // automatically when unavailable (older Safari).
  const blob = new Blob([bytes as BlobPart], { type: 'image/jpeg' })
  const img = await createImageBitmap(blob)

  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  ctx.drawImage(img, 0, 0)
  img.close?.()

  const newBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      'image/jpeg',
      quality,
    )
  })
  const ab = await newBlob.arrayBuffer()
  return new Uint8Array(ab)
}

async function compressPdf(
  file: File,
  onLog?: (msg: string) => void,
): Promise<File> {
  if (file.size < COMPRESS_MIN_BYTES || file.size > COMPRESS_MAX_BYTES) {
    onLog?.(
      `[compressPdf] skipping (${file.size}B — outside ${COMPRESS_MIN_BYTES}-${COMPRESS_MAX_BYTES} window)`,
    )
    return file
  }
  try {
    const { PDFDocument } = await import('pdf-lib')
    const bytes = await file.arrayBuffer()
    const doc = await PDFDocument.load(bytes, {
      // Skip pdf-lib's "rewrite all xrefs even if they look weird"
      // pass — saves time on well-formed PDFs, falls back to the
      // strict path on the catch below for malformed ones.
      updateMetadata: false,
    })
    const compressed = await doc.save({
      useObjectStreams: true,
      addDefaultPage: false,
    })
    // pdf-lib's save returns a Uint8Array. If the re-save came out
    // bigger than the original (already-optimized PDF, or one that
    // happens to compress poorly with object streams), keep the
    // original — there's no point uploading the larger version.
    if (compressed.length >= file.size) {
      onLog?.(`[compressPdf] no-op (${file.size}B → ${compressed.length}B)`)
      return file
    }
    onLog?.(
      `[compressPdf] ${file.size}B → ${compressed.length}B (` +
      `${Math.round((1 - compressed.length / file.size) * 100)}% smaller)`,
    )
    // pdf-lib returns Uint8Array<ArrayBufferLike>; the strict TS lib
    // for DOM expects ArrayBuffer specifically. The runtime accepts
    // either, but to satisfy the typechecker we copy the bytes into
    // a fresh ArrayBuffer — small allocation, no perf concern at the
    // scale of a single PDF upload.
    const buf = compressed.buffer.slice(
      compressed.byteOffset,
      compressed.byteOffset + compressed.byteLength,
    ) as ArrayBuffer
    return new File([buf], file.name, { type: 'application/pdf' })
  } catch (err) {
    // Encrypted / signed / malformed PDFs fail to load. Don't
    // surface this — silently fall back to the original.
    onLog?.(`[compressPdf] failed, using original: ${(err as Error).message}`)
    return file
  }
}

export async function uploadPdf(
  file: File,
  opts?: {
    onProgress?: (percent: number) => void
    onStage?: (stage: UploadStage) => void
  },
): Promise<{
  url: string
  name: string
  size: number
}> {
  if (file.type !== 'application/pdf') {
    throw new Error('فقط ملفات PDF')
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new Error('حجم الملف كبير (أقصى 50 ميقا)')
  }

  // Pipeline timing — these logs land in the browser DevTools
  // console with [HAI_UPLOAD] prefix so we can see how long each
  // phase actually takes. If the user reports "upload is slow",
  // these numbers point at the bottleneck (scan / compress /
  // network). Cheap (Date.now()), no toggle required.
  const t0 = Date.now()
  console.log(`[HAI_UPLOAD] start size=${file.size}B`)

  // Safety guard — runs BEFORE compression and BEFORE upload.
  opts?.onStage?.('scanning')
  const tScan = Date.now()
  await validatePdfSafety(file)
  console.log(`[HAI_UPLOAD] scan ${Date.now() - tScan}ms`)

  // Compress before upload. Skips files outside the 256KB-8MB
  // window. Two passes:
  //
  //   1. Lossless re-save (always tried in window). 5-15% on
  //      text-heavy PDFs, ~5% on image-heavy.
  //   2. If still above the 4MB fast-path threshold AND in window:
  //      aggressive JPEG re-encoding at quality 0.65. Drops
  //      image-heavy PDFs 30-60%, takes 2-4s of canvas work for
  //      a typical real-estate flyer.
  //
  // The second pass exists specifically for image-heavy 4-8MB
  // files (the user's frustration case): if it drops them under
  // 4MB they swap from the 3-RTT slow path to the 1-RTT fast
  // path, net win of several seconds.
  opts?.onStage?.('compressing')
  const tCompress = Date.now()
  const onCompressLog = (msg: string) => {
    if (typeof window !== 'undefined' && (window as any).__HAI_DEBUG__) {
      console.log(msg)
    }
  }
  let compressed = await compressPdf(file, onCompressLog)
  console.log(
    `[HAI_UPLOAD] compress(lossless) ${Date.now() - tCompress}ms ` +
      `(${file.size}B → ${compressed.size}B)`,
  )

  const FAST_PATH_THRESHOLD = 4 * 1024 * 1024
  if (
    compressed.size > FAST_PATH_THRESHOLD &&
    compressed.size <= COMPRESS_MAX_BYTES
  ) {
    const tAggressive = Date.now()
    const before = compressed.size
    compressed = await aggressivelyCompressPdf(compressed, onCompressLog)
    console.log(
      `[HAI_UPLOAD] compress(aggressive) ${Date.now() - tAggressive}ms ` +
        `(${before}B → ${compressed.size}B)`,
    )
  }

  // ── Fast path: ≤4MB → server-side put() (single round trip) ──
  // For files that fit under Vercel's function body cap, we skip
  // the client-direct dance entirely. Saves ~500ms-1s of RTT
  // overhead (token request + webhook) compared to handleUpload.
  // Especially noticeable on mobile cellular where every round trip
  // is costly.
  const FAST_PATH_MAX = 4 * 1024 * 1024
  if (compressed.size <= FAST_PATH_MAX) {
    opts?.onStage?.('uploading')
    const tNet = Date.now()
    const fd = new FormData()
    fd.append('pdf', compressed)
    const res = await fetch('/api/upload-pdf-fast', { method: 'POST', body: fd })
    console.log(`[HAI_UPLOAD] fast-path network ${Date.now() - tNet}ms · total ${Date.now() - t0}ms`)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error(d.error || 'فشل رفع الملف')
    }
    const data = await res.json()
    return {
      url: data.url as string,
      name: file.name,
      size: compressed.size,
    }
  }

  // ── Client-direct: >4MB → @vercel/blob handleUpload (3 RTTs) ──
  // Required for anything above Vercel's function body cap. Token
  // request, direct PUT to blob storage, server webhook. Slower
  // per-request but unbounded by function body size.
  //
  // Dynamic import so the @vercel/blob/client bundle isn't pulled
  // into routes that never upload PDFs (post composer, chat, etc.
  // would otherwise carry the helper in their first paint bundle).
  const { upload } = await import('@vercel/blob/client')

  // Strip directory separators from the original name so the pathname
  // is a flat key under pdfs/. The random prefix prevents collisions
  // between two users uploading the same filename.
  const safe = compressed.name.replace(/[/\\]/g, '_').slice(0, 120)
  const key = `pdfs/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${safe}`

  // Race the upload against a 120s deadline so a hung TCP connection
  // surfaces as an error toast instead of an infinite spinner. We DO
  // pass an AbortSignal in case the underlying client respects it,
  // but the Promise.race guarantees the rejection even if it doesn't.
  const abortController = new AbortController()
  let timedOut = false
  const deadline = new Promise<never>((_, reject) => {
    setTimeout(() => {
      timedOut = true
      abortController.abort()
      reject(new Error('انتهت مهلة رفع الملف — تحقّق من الإنترنت'))
    }, PDF_UPLOAD_TIMEOUT_MS)
  })

  opts?.onStage?.('uploading')
  const upstream = upload(key, compressed, {
    access: 'public',
    handleUploadUrl: '/api/upload-pdf',
    contentType: 'application/pdf',
    abortSignal: abortController.signal,
    onUploadProgress: opts?.onProgress
      ? (ev) => { try { opts.onProgress!(Math.round(ev.percentage ?? 0)) } catch {} }
      : undefined,
  })

  const tUpload = Date.now()
  try {
    const blob = await Promise.race([upstream, deadline])
    console.log(
      `[HAI_UPLOAD] network ${Date.now() - tUpload}ms · total ${Date.now() - t0}ms`,
    )
    return {
      url: blob.url,
      // Preserve the ORIGINAL display name (user's filename), not
      // the safe-keyed pathname we sent to Blob storage.
      name: file.name,
      // Report the actual uploaded size, not the original — the
      // tile should reflect what's in the bucket.
      size: compressed.size,
    }
  } catch (err: any) {
    console.log(
      `[HAI_UPLOAD] FAILED after ${Date.now() - t0}ms (network ${Date.now() - tUpload}ms): ${err?.message || err}`,
    )
    if (timedOut) throw err
    // Surface the underlying error message — Vercel Blob errors are
    // already user-readable for the common cases (file too large,
    // unauthorized, network).
    throw new Error(err?.message || 'فشل رفع الملف')
  }
}
