import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { getSession } from '@/lib/auth'
import crypto from 'crypto'

/**
 * Fast server-side PDF upload — single round trip.
 *
 * The other route at /api/upload-pdf goes through @vercel/blob's
 * handleUpload (client-direct flow): token request → direct PUT
 * to Vercel Blob storage → server-to-server upload-completed
 * webhook. That's 3 sequential round trips before the client's
 * upload() resolves, plus all the @vercel/blob client library
 * overhead. We HAVE to do it that way for files > 4.5MB because
 * that's Vercel's function body cap.
 *
 * But for files at or under 4MB, we can just POST the file body
 * directly to this function, have the function call put()
 * server-side (Vercel's network, ~50ms hop), and return the URL.
 * One round trip total. On mobile this saves roughly 500ms-1s of
 * RTT overhead compared to the client-direct flow.
 *
 * The 4MB ceiling is conservative — Vercel's 4.5MB body limit
 * leaves 0.5MB for multipart boundary + auth headers, which is
 * plenty.
 */
const MAX_BYTES = 4 * 1024 * 1024 // 4MB, well under Vercel's 4.5MB cap
const ALLOWED_TYPES = ['application/pdf']

export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get('pdf') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'PDF only' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large for fast path (${file.size}B > ${MAX_BYTES}B)` },
        { status: 413 },
      )
    }

    // Strip path separators from the original filename so the
    // blob pathname is a flat key under pdfs/. crypto.randomUUID()
    // prefix prevents collisions between two users uploading the
    // same name.
    const safe = file.name.replace(/[/\\]/g, '_').slice(0, 120)
    const key = `pdfs/${crypto.randomUUID()}-${safe}`

    const blob = await put(key, file, {
      access: 'public',
      contentType: 'application/pdf',
    })

    return NextResponse.json({
      url: blob.url,
      name: file.name,
      size: file.size,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[UPLOAD_PDF_FAST] failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
