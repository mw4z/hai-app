import { NextRequest, NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { getSession } from '@/lib/auth'

/**
 * Client-direct IMAGE upload via @vercel/blob's handleUpload — the same
 * token flow PDFs use (/api/upload-pdf), and for the same reason.
 *
 * The legacy /api/upload route streams the whole multipart body THROUGH the
 * Next.js function, which is capped at Vercel's 4.5MB per-function body limit
 * on every plan. A photo that didn't compress well (or a couple of images
 * together) blows past that cap and the platform rejects the request with a
 * non-JSON 413 BEFORE our handler runs — which surfaced to users as the
 * generic "فشل رفع الصور" with no detail. Client-direct uploads the bytes
 * straight to Blob storage, so the function only mints a short-lived token
 * and the body cap never applies.
 *
 * Two call shapes hit this route (see /api/upload-pdf for the full writeup):
 *   A. blob.generate-client-token  → user-facing; auth via session cookie.
 *   B. blob.upload-completed       → Vercel's S2S webhook; auth'd internally
 *      by handleUpload against BLOB_READ_WRITE_TOKEN (NO session). The user
 *      check therefore lives inside onBeforeGenerateToken, not at route top.
 */
export const maxDuration = 60

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 12 * 1024 * 1024 // generous headroom; client compresses to ~100-300KB

export async function POST(req: NextRequest) {
  const body = (await req.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const session = await getSession()
        if (!session) throw new Error('Unauthorized')
        return {
          allowedContentTypes: ALLOWED,
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: session.userId, pathname }),
        }
      },
      onUploadCompleted: async ({ blob }) => {
        // Acknowledgement only — the post/comment/message about to be created
        // references blob.url. Hook point for future AV / size enforcement.
        console.log('[UPLOAD_IMAGE] done', { url: blob.url, pathname: blob.pathname })
      },
    })
    return NextResponse.json(jsonResponse)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[UPLOAD_IMAGE] failed:', message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
