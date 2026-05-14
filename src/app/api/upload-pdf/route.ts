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
 * The flow has TWO different call shapes hitting this same route:
 *
 *  A. body.type === 'blob.generate-client-token'
 *     Client browser asks for an upload token. We're talking to the
 *     end user → check the user's session cookies and reject if
 *     missing.
 *
 *  B. body.type === 'blob.upload-completed'
 *     Vercel Blob's server-to-server webhook tells us the upload
 *     finished. NO user cookies on this request — Vercel auths via
 *     its own signed Authorization header that handleUpload
 *     validates internally against BLOB_READ_WRITE_TOKEN.
 *
 * Doing a session check at the TOP of this route was the bug behind
 * "upload takes much time till timeout": case B 401'd, the webhook
 * was treated as failed, and the client's await upload() never
 * resolved (it was waiting for the server-side confirmation). The
 * fix is to move the user-session check INSIDE onBeforeGenerateToken,
 * which only runs on case A. handleUpload's internal token validation
 * handles case B.
 */
// 300s — Vercel's default function timeout; covers the longest
// realistic upload-completed webhook callback for a 50MB document.
export const maxDuration = 300

const MAX_BYTES = 50 * 1024 * 1024 // 50MB — matches the client-side cap; Vercel Blob handles up to 5GB
const ALLOWED = ['application/pdf']

export async function POST(req: NextRequest) {
  const body = (await req.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        // User auth lives HERE, not at the route top. This callback
        // only fires for the token-generation step (case A above) —
        // the upload-completed webhook (case B) skips it and goes
        // straight to onUploadCompleted with handleUpload's own
        // signature validation. Throwing rejects the token request
        // with the underlying error surfaced to the client; the
        // catch block at the bottom turns it into a 400.
        const session = await getSession()
        if (!session) {
          throw new Error('Unauthorized')
        }
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
        // Server-to-server callback from Vercel Blob. No user auth
        // here — handleUpload already validated the request via
        // BLOB_READ_WRITE_TOKEN before this fires.
        //
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
