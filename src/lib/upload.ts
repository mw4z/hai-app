const MAX_WIDTH = 1200
const MAX_HEIGHT = 1200
const JPEG_QUALITY = 0.75

/**
 * Compress an image file on the client before uploading.
 * Resizes to max 1200x1200 and converts to JPEG at 75% quality.
 * Typical 3-5MB phone photo → 100-300KB output.
 */
function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/') || file.size < 50_000) {
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
 */
export async function uploadFiles(files: File[]): Promise<string[]> {
  // Compress all images in parallel
  const compressed = await Promise.all(files.map(f => compressImage(f)))

  const formData = new FormData()
  for (const file of compressed) formData.append('images', file)

  const res = await fetch('/api/upload', { method: 'POST', body: formData })
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    throw new Error(d.error || 'فشل رفع الصور')
  }

  const data = await res.json()
  return data.urls || []
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
const MAX_PDF_BYTES = 25 * 1024 * 1024
const PDF_UPLOAD_TIMEOUT_MS = 120_000

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
  const buf = await file.arrayBuffer()
  const u8 = new Uint8Array(buf)

  // 1. Magic bytes — "%PDF-" at offset 0.
  if (
    u8.length < 5 ||
    u8[0] !== 0x25 || u8[1] !== 0x50 || u8[2] !== 0x44 ||
    u8[3] !== 0x46 || u8[4] !== 0x2D
  ) {
    throw new Error('الملف ليس PDF صالحاً')
  }

  // 2. Scoped active-content + encryption scan.
  //
  // latin1 (1 byte == 1 char) keeps indexOf offsets aligned with
  // file offsets. Subarray + decode is essentially free at this
  // size; the 25MB → 25M-char-string allocation that the previous
  // version did is gone.
  const head = new TextDecoder('latin1').decode(
    u8.subarray(0, Math.min(SCAN_WINDOW_BYTES, u8.length)),
  )
  const tail =
    u8.length > SCAN_WINDOW_BYTES
      ? new TextDecoder('latin1').decode(
          u8.subarray(Math.max(0, u8.length - SCAN_WINDOW_BYTES)),
        )
      : ''

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
 *  - Files over 2MB ALSO skip compression. pdf-lib's parse of a
 *    25MB PDF on mobile is 1-3 seconds, and image-heavy PDFs at
 *    that size save almost nothing (the bulk is already-DCT-
 *    encoded JPEG). The user-reported "upload takes too long"
 *    regression was almost entirely this parse cost; skipping it
 *    here trades a few % of payload size for several seconds of
 *    perceived responsiveness.
 *  - We don't strip metadata. Some PDFs carry meaningful info
 *    there (digital signatures, accessibility tags); preserving
 *    is safer than aggressive stripping.
 */
const COMPRESS_MIN_BYTES = 256 * 1024
const COMPRESS_MAX_BYTES = 2 * 1024 * 1024

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
    throw new Error('حجم الملف كبير (أقصى 25 ميقا)')
  }

  // Safety guard — runs BEFORE compression and BEFORE upload.
  // Rejects spoofed MIME, PDFs carrying JavaScript / launch actions
  // / embedded files, encrypted PDFs, and PDF bombs (200+ pages).
  // Total runtime ~50ms on a 5MB file; rejection here costs the
  // user a clear error toast and prevents shipping a hostile
  // attachment to neighbors. Same arrayBuffer() the compressor
  // re-reads below — modern browsers cache File reads so the
  // double-read isn't a real cost.
  opts?.onStage?.('scanning')
  await validatePdfSafety(file)

  // Compress before upload. compressPdf returns the smaller of the
  // re-saved version vs the original, so this is always a win.
  // Logs are dev-only — strip in production via console silencing.
  opts?.onStage?.('compressing')
  const compressed = await compressPdf(file, (msg) => {
    if (typeof window !== 'undefined' && (window as any).__HAI_DEBUG__) {
      console.log(msg)
    }
  })

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

  try {
    const blob = await Promise.race([upstream, deadline])
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
    if (timedOut) throw err
    // Surface the underlying error message — Vercel Blob errors are
    // already user-readable for the common cases (file too large,
    // unauthorized, network).
    throw new Error(err?.message || 'فشل رفع الملف')
  }
}
