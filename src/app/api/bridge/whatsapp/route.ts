import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { bridgeConfig, BRIDGE_LIMITS } from '@/lib/bridge/config'
import { evaluateBridgeIngest } from '@/lib/bridge/classify'
import { createBridgePost } from '@/lib/bridge/createBridgePost'

export const dynamic = 'force-dynamic'

/**
 * POST /api/bridge/whatsapp  — internal ingest endpoint for the WhatsApp
 * bridge. Called by the (future) ingestion layer ONLY after the sender has
 * confirmed. Server is the source of truth: it re-classifies, re-checks
 * the flag/confirmation/neighborhood, dedupes, rate-limits, and audits.
 *
 * Auth: header `x-bridge-secret` must equal WHATSAPP_BRIDGE_SECRET.
 * Never logs the plain phone — only senderHash.
 *
 * Body (normalized): {
 *   sourceMessageId, sourceChatId|sourceGroupId, senderHash,
 *   senderDisplayName?, text, confirmedBySender, confirmationMethod,
 *   neighborhoodId, timestamp?
 * }
 */
export async function POST(req: NextRequest) {
  const cfg = bridgeConfig()

  // Fail closed: disabled bridge or unconfigured secret → reject.
  if (!cfg.enabled) return NextResponse.json({ error: 'bridge_disabled' }, { status: 403 })
  if (!cfg.ingestSecret) return NextResponse.json({ error: 'bridge_misconfigured' }, { status: 503 })
  if (req.headers.get('x-bridge-secret') !== cfg.ingestSecret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const sourceChatId = String(body.sourceChatId || body.sourceGroupId || '').trim()
  const sourceMessageId = String(body.sourceMessageId || '').trim()
  const senderHash = String(body.senderHash || '').trim()
  const text = typeof body.text === 'string' ? body.text : ''
  const neighborhoodId = String(body.neighborhoodId || '').trim()
  const confirmedBySender = body.confirmedBySender === true
  const confirmationMethod = body.confirmationMethod === 'BUTTON' ? 'BUTTON' : body.confirmationMethod === 'TEXT' ? 'TEXT' : null
  const senderDisplayName = typeof body.senderDisplayName === 'string' ? body.senderDisplayName.slice(0, 120) : null

  if (!sourceChatId || !sourceMessageId || !senderHash || !neighborhoodId || !text.trim()) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
  }

  const idKey = { sourceChatId_sourceMessageId_senderHash: { sourceChatId, sourceMessageId, senderHash } }

  // ── Idempotency: never publish the same source message twice ────────
  const existing = await db.whatsappBridgeMessage.findUnique({ where: idKey, select: { id: true, status: true, createdPostId: true } })
  if (existing?.status === 'PUBLISHED' && existing.createdPostId) {
    return NextResponse.json({ ok: true, idempotent: true, postId: existing.createdPostId, url: postUrl(existing.createdPostId) })
  }

  // Base audit payload (upserted at each step). originalText is stored for
  // moderation/audit; never surfaced to normal users.
  const auditBase = {
    sourceChatId, sourceMessageId, senderHash, senderDisplayName,
    originalText: text.slice(0, 2000), neighborhoodId, confirmedBySender, confirmationMethod,
  }
  async function audit(status: string, extra: Record<string, unknown> = {}) {
    await db.whatsappBridgeMessage.upsert({
      where: idKey,
      create: { ...auditBase, status: status as any, ...extra },
      update: { status: status as any, ...extra },
    }).catch((e) => console.error('[BRIDGE] audit failed', e))
  }

  // ── Server-side gate (re-classifies; never trusts the caller) ───────
  const gate = evaluateBridgeIngest({ text, confirmedBySender, neighborhoodId, config: cfg })
  if (!gate.ok) {
    await audit('IGNORED', { classifiedType: gate.classification?.type ?? null, failureReason: gate.code })
    return NextResponse.json({ error: gate.code, message: gate.message }, { status: gate.code === 'not_confirmed' ? 400 : 422 })
  }

  // ── Rate limits (published bridge posts) ────────────────────────────
  const dayAgo = new Date(Date.now() - 24 * 60 * 60_000)
  const hourAgo = new Date(Date.now() - 60 * 60_000)
  const [senderToday, hoodThisHour] = await Promise.all([
    db.whatsappBridgeMessage.count({ where: { senderHash, status: 'PUBLISHED', createdAt: { gte: dayAgo } } }),
    db.whatsappBridgeMessage.count({ where: { neighborhoodId, status: 'PUBLISHED', createdAt: { gte: hourAgo } } }),
  ])
  if (senderToday >= BRIDGE_LIMITS.perSenderPostsPerDay) {
    await audit('IGNORED', { classifiedType: gate.classification.type ?? null, failureReason: 'rate_limited_sender' })
    return NextResponse.json({ error: 'rate_limited', scope: 'sender' }, { status: 429 })
  }
  if (hoodThisHour >= BRIDGE_LIMITS.perNeighborhoodPostsPerHour) {
    await audit('IGNORED', { classifiedType: gate.classification.type ?? null, failureReason: 'rate_limited_neighborhood' })
    return NextResponse.json({ error: 'rate_limited', scope: 'neighborhood' }, { status: 429 })
  }

  // ── Create the post via the safe service ────────────────────────────
  await audit('CONFIRMED', { classifiedType: gate.classification.type ?? null, confirmedAt: new Date() })
  const result = await createBridgePost({
    text,
    category: gate.classification.category!,
    neighborhoodId,
    systemUserId: cfg.systemUserId,
    reviewFirst: cfg.reviewFirst,
  })

  if (!result.ok) {
    await audit('FAILED', { failureReason: result.reason })
    return NextResponse.json({ error: 'publish_failed', reason: result.reason }, { status: 500 })
  }

  await audit('PUBLISHED', { createdPostId: result.postId, confirmedAt: new Date() })
  console.log('[BRIDGE] published', { senderHash, sourceChatId, postId: result.postId, type: gate.classification.type })
  return NextResponse.json({ ok: true, postId: result.postId, url: postUrl(result.postId) })
}

function postUrl(postId: string): string {
  const base = process.env.HAI_SHARE_BASE || 'https://app.hai-app.net'
  return `${base}/feed?post=${postId}`
}
