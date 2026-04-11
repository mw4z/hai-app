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
