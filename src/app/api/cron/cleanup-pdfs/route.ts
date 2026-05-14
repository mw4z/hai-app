import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { del } from '@vercel/blob'

/**
 * Delete PDF attachments older than 30 days.
 *
 * PDFs on neighborhood posts are time-sensitive (grocery flyers,
 * event programs, weekly menus). Keeping them indefinitely
 * accumulates storage cost on Vercel Blob without serving any
 * real user value — the offer expired weeks ago.
 *
 * For each Post / Comment / Message with pdfUrl set and createdAt
 * older than the retention window, this cron:
 *   1. Calls del() on the Vercel Blob URL.
 *   2. Nullifies the row's pdfUrl. We KEEP pdfName so a future UI
 *      pass can render a "file expired" tombstone if we want — the
 *      current PdfTile gate (`post.pdfUrl && <PdfTile />`) just
 *      stops rendering the tile, which is the right default for
 *      now.
 *
 * Idempotent — if the blob is already gone (404 from del()) the
 * row is still nullified and we move on. Stale rows can't loop
 * forever. Batch size of 500 keeps each cron tick well under the
 * 300s function timeout; a backlog clears across multiple ticks.
 *
 * Auth: bearer CRON_SECRET, same pattern as every other cron.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const RETENTION_DAYS = 30
const BATCH_SIZE = 500

export async function GET(req: NextRequest) {
  return handle(req)
}
export async function POST(req: NextRequest) {
  return handle(req)
}

async function handle(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const expected = process.env.CRON_SECRET
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000)
  let postsCleared = 0
  let commentsCleared = 0
  let messagesCleared = 0
  let blobsFailed = 0

  // ── Posts ────────────────────────────────────────────────────────
  const expiredPosts = await db.post.findMany({
    where: { pdfUrl: { not: null }, createdAt: { lt: cutoff } },
    select: { id: true, pdfUrl: true },
    take: BATCH_SIZE,
  })
  for (const p of expiredPosts) {
    if (!p.pdfUrl) continue
    try {
      await del(p.pdfUrl)
    } catch (err) {
      // Blob may already be missing (manual delete, prior failed run).
      // Log but still nullify the row so we don't retry forever.
      console.error(`[CLEANUP_PDFS] del() failed for post ${p.id}:`, (err as Error).message)
      blobsFailed++
    }
    await db.post.update({
      where: { id: p.id },
      data: { pdfUrl: null },
      select: { id: true },
    }).catch(() => { /* row may have been deleted concurrently */ })
    postsCleared++
  }

  // ── Comments ─────────────────────────────────────────────────────
  const expiredComments = await db.comment.findMany({
    where: { pdfUrl: { not: null }, createdAt: { lt: cutoff } },
    select: { id: true, pdfUrl: true },
    take: BATCH_SIZE,
  })
  for (const c of expiredComments) {
    if (!c.pdfUrl) continue
    try {
      await del(c.pdfUrl)
    } catch (err) {
      console.error(`[CLEANUP_PDFS] del() failed for comment ${c.id}:`, (err as Error).message)
      blobsFailed++
    }
    await db.comment.update({
      where: { id: c.id },
      data: { pdfUrl: null },
      select: { id: true },
    }).catch(() => {})
    commentsCleared++
  }

  // ── Messages (DMs) ───────────────────────────────────────────────
  const expiredMessages = await db.message.findMany({
    where: { pdfUrl: { not: null }, createdAt: { lt: cutoff } },
    select: { id: true, pdfUrl: true },
    take: BATCH_SIZE,
  })
  for (const m of expiredMessages) {
    if (!m.pdfUrl) continue
    try {
      await del(m.pdfUrl)
    } catch (err) {
      console.error(`[CLEANUP_PDFS] del() failed for message ${m.id}:`, (err as Error).message)
      blobsFailed++
    }
    await db.message.update({
      where: { id: m.id },
      data: { pdfUrl: null },
      select: { id: true },
    }).catch(() => {})
    messagesCleared++
  }

  const result = {
    ok: true,
    cutoff: cutoff.toISOString(),
    postsCleared,
    commentsCleared,
    messagesCleared,
    blobsFailed,
  }
  console.log('[CLEANUP_PDFS] tick', result)
  return NextResponse.json(result)
}
