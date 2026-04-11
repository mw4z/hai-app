import { upload } from '@vercel/blob/client'

/**
 * Upload files directly to Vercel Blob (client-side).
 * Files go straight from browser to Blob storage — no server middleman.
 */
export async function uploadFiles(files: File[]): Promise<string[]> {
  const results = await Promise.all(
    files.map(file =>
      upload(`uploads/${Date.now()}-${file.name}`, file, {
        access: 'public',
        handleUploadUrl: '/api/upload',
      })
    )
  )
  return results.map(blob => blob.url)
}
