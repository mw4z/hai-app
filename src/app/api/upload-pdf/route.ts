import { NextRequest, NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { getSession } from '@/lib/auth'

/**
 * Client-direct PDF upload via @vercel/blob's handleUpload.
 *
 * Why not the same /api/upload route that serves images? Two reasons:
 *
 *  1. Size. Images cap at 5MB on the existing route, which streams
 *     through the Next.js function body. PDFs are 25MB max — that
 *     exceeds Vercel's per-function body cap (4.5MB on every plan),
 *     so we have to use the client-direct token flow.
 *
 *  2. Contract. Image upload returns string[] of URLs; PDF upload
 *     returns { url, pathname } per file with the original name
 *     surfaced via the pathname so the client can display
 *     "user-uploaded-doc.pdf" instead of a random uuid.
 *
 * The flow:
 *  - Client calls `upload(pathname, file, { handleUploadUrl: '/api/upload-pdf' })`
 *  - That helper hits this route with a `type:'blob.generate-client-token'`
 *    body. We check the session here and respond with the upload token
 *    plus content-type/size restrictions baked in.
 *  - Vercel Blob streams the file directly from the browser to its
 *    storage edge — the Next.js function never sees the body bytes.
 *  - When the upload finishes the helper hits this route again with
 *    `type:'blob.upload-completed'`. We log it and return ok.
 *
 * Auth: getSession() is checked on BOTH the token-generation step and
 * the upload-completed callback. A missing session denies the upload
 * before Vercel Blob ever sees the request.
 */
export const maxDuration = 30

const MAX_BYTES = 25 * 1024 * 1024 // 25MB
const ALLOWED = ['application/pdf']

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        return {
          allowedContentTypes: ALLOWED,
          maximumSizeInBytes: MAX_BYTES,
          // tokenPayload travels with the upload and comes back on
          // the completion callback so we can re-verify ownership.
          tokenPayload: JSON.stringify({
            userId: session.userId,
            pathname,
          }),
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // No DB write here — the post / comment / message that's
        // about to be created will reference blob.url. This callback
        // exists so Vercel knows we acknowledged the upload (and so
        // future hooks like virus-scan or AV / size enforcement can
        // be plugged in without changing the client).
        try {
          const payload = tokenPayload ? JSON.parse(tokenPayload) : null
          console.log('[UPLOAD_PDF] done', {
            url: blob.url,
            pathname: blob.pathname,
            userId: payload?.userId,
          })
        } catch {
          /* swallow JSON parse errors — logging is best-effort */
        }
      },
    })
    return NextResponse.json(jsonResponse)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[UPLOAD_PDF] failed:', message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
