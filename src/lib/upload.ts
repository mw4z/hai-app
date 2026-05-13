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
 */
const MAX_PDF_BYTES = 25 * 1024 * 1024

export async function uploadPdf(file: File): Promise<{
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

  // Dynamic import so the @vercel/blob/client bundle isn't pulled
  // into routes that never upload PDFs (post composer, chat, etc.
  // would otherwise carry the helper in their first paint bundle).
  const { upload } = await import('@vercel/blob/client')

  // Strip directory separators from the original name so the pathname
  // is a flat key under pdfs/. The cuid()-style prefix prevents
  // collisions between two users uploading the same filename.
  const safe = file.name.replace(/[/\\]/g, '_').slice(0, 120)
  const key = `pdfs/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${safe}`

  const blob = await upload(key, file, {
    access: 'public',
    handleUploadUrl: '/api/upload-pdf',
    contentType: 'application/pdf',
  })

  return {
    url: blob.url,
    name: file.name,
    size: file.size,
  }
}
