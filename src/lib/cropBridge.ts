/**
 * Singleton bridge so plain (non-React) call sites and any component can run
 * a picked image through the global crop editor before it's previewed/
 * uploaded. CropHost (mounted once in the layout) registers the handler; if
 * nothing is registered (SSR, tests) the helpers are transparent no-ops.
 *
 * Usage at a "received files" choke point:
 *   const cropped = await cropFiles(files); applyImages(cropped)
 *   const one = await cropFile(file); if (one) apply(one)
 *
 * Semantics: Done → cropped File; Cancel → null (image discarded); any error
 * → the original file is kept (never lose the user's pick to a crop glitch).
 */
export type CropHandler = (
  file: File,
  meta: { index: number; total: number },
) => Promise<File | null>

let handler: CropHandler | null = null

export function registerCropHandler(h: CropHandler | null) {
  handler = h
}

export function cropEnabled(): boolean {
  return !!handler
}

/** Crop a single image. Returns the cropped File, or null if cancelled. */
export async function cropFile(file: File): Promise<File | null> {
  if (!handler || !file.type.startsWith('image/')) return file
  try {
    return await handler(file, { index: 1, total: 1 })
  } catch {
    return file
  }
}

/** Crop several images in sequence (shows a 1/N counter). Cancelled ones are
 *  dropped; non-images pass through untouched. */
export async function cropFiles(files: File[]): Promise<File[]> {
  if (!handler || files.length === 0) return files
  const images = files.filter((f) => f.type.startsWith('image/'))
  const out: File[] = []
  let i = 0
  for (const f of files) {
    if (!f.type.startsWith('image/')) { out.push(f); continue }
    i += 1
    try {
      const res = await handler(f, { index: i, total: images.length })
      if (res) out.push(res)
    } catch {
      out.push(f)
    }
  }
  return out
}
