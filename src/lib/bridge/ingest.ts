/**
 * Shared bridge ingest logic used by the official WhatsApp Cloud webhook.
 *
 * Two phases:
 *   recordIncoming()   — a message arrived at the bot. Re-classify with the
 *                        SAME server gate; if it would be accepted, stash a
 *                        PROMPTED audit row and return its id so the confirm
 *                        buttons can reference it. Otherwise IGNORED.
 *   publishConfirmed() — the sender tapped "نشر". Re-gate + rate-limit the
 *                        stored text (never trust the round-trip) and publish
 *                        via createBridgePost. Idempotent on the audit row.
 *
 * Never stores or returns a plain phone number — only senderHash.
 */
import { createHmac } from 'node:crypto'
import { db } from '@/lib/db'
import { bridgeConfig, BRIDGE_LIMITS } from './config'
import { evaluateBridgeIngest } from './classify'
import { createBridgePost } from './createBridgePost'
import { aiReview } from './ai'

export function senderHashFor(phone: string): string {
  const cfg = bridgeConfig()
  const normalized = (phone || '').replace(/[^0-9]/g, '')
  return createHmac('sha256', cfg.senderPepper || 'unset-pepper').update(normalized).digest('hex')
}

function postUrl(postId: string): string {
  const base = process.env.HAI_SHARE_BASE || 'https://app.hai-app.net'
  return `${base}/feed?post=${postId}`
}

export interface IncomingInput {
  sourceChatId: string
  sourceMessageId: string
  senderHash: string
  senderDisplayName?: string | null
  text: string
}

export type IncomingResult =
  | { ok: true; recordId: string; preview: string }
  | { ok: false; code: string; message: string }

/** Phase 1 — classify + stash a pending (PROMPTED) record. */
export async function recordIncoming(input: IncomingInput): Promise<IncomingResult> {
  const cfg = bridgeConfig()
  const neighborhoodId = cfg.testNeighborhoodId || ''
  const text = (input.text || '').trim()

  const idKey = {
    sourceChatId_sourceMessageId_senderHash: {
      sourceChatId: input.sourceChatId,
      sourceMessageId: input.sourceMessageId,
      senderHash: input.senderHash,
    },
  }

  // Gate on the ORIGINAL text. We pass confirmedBySender:true here only to
  // reach the classification checks — actual consent is the button tap.
  const gateOriginal = evaluateBridgeIngest({ text, confirmedBySender: true, neighborhoodId, config: cfg })

  // Optional Claude pass: it can VETO (says not a request) or REWRITE. The
  // rewrite is only used if it ALSO passes the rule gate — the safety net
  // never moves. AI errors/disabled → null → rules-only behaviour.
  let publishText = text
  let classifiedType: string | null = gateOriginal.ok ? (gateOriginal.classification.type ?? null) : null
  let category = gateOriginal.ok ? gateOriginal.classification.category ?? null : null
  let accepted = gateOriginal.ok
  let failCode = gateOriginal.ok ? '' : gateOriginal.code
  let failMsg = gateOriginal.ok ? '' : gateOriginal.message

  if (cfg.ai.enabled) {
    const ai = await aiReview(text)
    if (ai && ai.isRequest === false) {
      accepted = false
      failCode = 'ai_filtered'
      failMsg = 'الرسالة لا تبدو طلباً مناسباً'
    } else if (ai && ai.cleaned) {
      const gateClean = evaluateBridgeIngest({ text: ai.cleaned, confirmedBySender: true, neighborhoodId, config: cfg })
      if (gateClean.ok) {
        publishText = ai.cleaned
        classifiedType = gateClean.classification.type ?? null
        category = gateClean.classification.category ?? null
        accepted = true
        failCode = ''
      }
      // cleaned failed the gate → keep the original outcome (accepted iff gateOriginal.ok)
    }
  }

  const auditBase = {
    sourceChatId: input.sourceChatId,
    sourceMessageId: input.sourceMessageId,
    senderHash: input.senderHash,
    senderDisplayName: input.senderDisplayName?.slice(0, 120) ?? null,
    // When AI rewrites, this holds the text we'd actually publish.
    originalText: publishText.slice(0, 2000),
    neighborhoodId,
  }

  if (!accepted) {
    await db.whatsappBridgeMessage.upsert({
      where: idKey,
      create: { ...auditBase, originalText: text.slice(0, 2000), status: 'IGNORED', classifiedType, failureReason: failCode },
      update: { status: 'IGNORED', failureReason: failCode },
    }).catch((e) => console.error('[BRIDGE] audit (ignored) failed', e))
    return { ok: false, code: failCode || 'not_useful', message: failMsg || 'الرسالة غير مناسبة كطلب' }
  }

  const row = await db.whatsappBridgeMessage.upsert({
    where: idKey,
    create: { ...auditBase, status: 'PROMPTED', classifiedType },
    update: { status: 'PROMPTED', classifiedType, originalText: auditBase.originalText },
    select: { id: true },
  })
  void category // category is recomputed at publish time from the stored text
  return { ok: true, recordId: row.id, preview: publishText }
}

export type PublishResult =
  | { ok: true; postId: string; url: string; idempotent?: boolean }
  | { ok: false; code: string; message?: string }

/** Phase 2 — sender confirmed; re-gate, rate-limit, publish. */
export async function publishConfirmed(
  recordId: string,
  opts: { confirmationMethod: 'BUTTON' | 'TEXT' },
): Promise<PublishResult> {
  const cfg = bridgeConfig()

  const row = await db.whatsappBridgeMessage.findUnique({ where: { id: recordId } })
  if (!row) return { ok: false, code: 'not_found' }

  if (row.status === 'PUBLISHED' && row.createdPostId) {
    return { ok: true, postId: row.createdPostId, url: postUrl(row.createdPostId), idempotent: true }
  }

  const mark = (status: string, extra: Record<string, unknown> = {}) =>
    db.whatsappBridgeMessage.update({ where: { id: recordId }, data: { status: status as any, ...extra } })
      .catch((e) => console.error('[BRIDGE] audit update failed', e))

  // Re-gate the stored text — never trust that what was prompted is still ok.
  const gate = evaluateBridgeIngest({
    text: row.originalText,
    confirmedBySender: true,
    neighborhoodId: row.neighborhoodId,
    config: cfg,
  })
  if (!gate.ok) {
    await mark('IGNORED', { failureReason: gate.code })
    return { ok: false, code: gate.code, message: gate.message }
  }

  // Rate limits on PUBLISHED posts (same thresholds as the internal endpoint).
  const dayAgo = new Date(Date.now() - 24 * 60 * 60_000)
  const hourAgo = new Date(Date.now() - 60 * 60_000)
  const [senderToday, hoodThisHour] = await Promise.all([
    db.whatsappBridgeMessage.count({ where: { senderHash: row.senderHash, status: 'PUBLISHED', createdAt: { gte: dayAgo } } }),
    db.whatsappBridgeMessage.count({ where: { neighborhoodId: row.neighborhoodId, status: 'PUBLISHED', createdAt: { gte: hourAgo } } }),
  ])
  if (senderToday >= BRIDGE_LIMITS.perSenderPostsPerDay) {
    await mark('IGNORED', { failureReason: 'rate_limited_sender' })
    return { ok: false, code: 'rate_limited_sender' }
  }
  if (hoodThisHour >= BRIDGE_LIMITS.perNeighborhoodPostsPerHour) {
    await mark('IGNORED', { failureReason: 'rate_limited_neighborhood' })
    return { ok: false, code: 'rate_limited_neighborhood' }
  }

  await mark('CONFIRMED', { confirmedBySender: true, confirmationMethod: opts.confirmationMethod, confirmedAt: new Date() })

  const result = await createBridgePost({
    text: row.originalText,
    category: gate.classification.category!,
    neighborhoodId: row.neighborhoodId,
    systemUserId: cfg.systemUserId,
    reviewFirst: cfg.reviewFirst,
  })
  if (!result.ok) {
    await mark('FAILED', { failureReason: result.reason })
    return { ok: false, code: 'publish_failed' }
  }

  await mark('PUBLISHED', { createdPostId: result.postId })
  console.log('[BRIDGE] published (official)', { senderHash: row.senderHash, postId: result.postId, type: gate.classification.type })
  return { ok: true, postId: result.postId, url: postUrl(result.postId) }
}

/** Sender tapped "إلغاء". */
export async function markDeclined(recordId: string): Promise<void> {
  await db.whatsappBridgeMessage.update({
    where: { id: recordId },
    data: { status: 'IGNORED', failureReason: 'declined' },
  }).catch(() => { /* row may not exist; non-fatal */ })
}
