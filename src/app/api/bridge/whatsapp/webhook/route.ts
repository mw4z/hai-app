import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { db } from '@/lib/db'
import { bridgeConfig } from '@/lib/bridge/config'
import { recordIncoming, publishConfirmed, markDeclined, senderHashFor } from '@/lib/bridge/ingest'
import { sendText, sendConfirmButtons, BUTTON } from '@/lib/bridge/whatsappCloud'

export const dynamic = 'force-dynamic'

const PENDING_TTL_MS = 24 * 60 * 60_000 // matches WhatsApp's customer-service window
const YES = ['نعم', 'نشر', 'انشر', 'انشرها', 'أنشرها', 'اي', 'ايوه', 'أيوه', 'تمام', 'ok', 'okay', 'yes', 'y', '✅', '👍']
const NO = ['لا', 'إلغاء', 'الغاء', 'لأ', 'no', 'n', 'cancel', '✖️', '❌', '🚫']

/**
 * GET /api/bridge/whatsapp/webhook — Meta verification handshake.
 * Echo hub.challenge when hub.verify_token matches.
 */
export async function GET(req: NextRequest) {
  const cfg = bridgeConfig()
  const sp = req.nextUrl.searchParams
  const mode = sp.get('hub.mode')
  const token = sp.get('hub.verify_token')
  const challenge = sp.get('hub.challenge') || ''
  if (mode === 'subscribe' && cfg.cloud.verifyToken && token === cfg.cloud.verifyToken) {
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return new Response('forbidden', { status: 403 })
}

/**
 * POST /api/bridge/whatsapp/webhook — inbound messages + button taps.
 * Always 200s Meta (so the subscription isn't disabled), even on no-op.
 */
export async function POST(req: NextRequest) {
  const cfg = bridgeConfig()
  const raw = await req.text()

  // Verify Meta's payload signature when the app secret is configured.
  if (cfg.cloud.appSecret) {
    const sig = req.headers.get('x-hub-signature-256') || ''
    if (!verifySignature(raw, sig, cfg.cloud.appSecret)) {
      return new Response('bad signature', { status: 401 })
    }
  }

  let body: any
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ ok: true }) }

  // Disabled bridge: acknowledge but do nothing.
  if (!cfg.enabled) return NextResponse.json({ ok: true, disabled: true })

  try {
    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value
        const messages = value?.messages
        if (!Array.isArray(messages)) continue // statuses/read receipts → ignore
        const contacts = value?.contacts ?? []
        for (const msg of messages) {
          await handleMessage(msg, contacts).catch((e) => console.error('[BRIDGE] handleMessage error', e))
        }
      }
    }
  } catch (e) {
    console.error('[BRIDGE] webhook processing error', e)
  }
  return NextResponse.json({ ok: true })
}

async function handleMessage(msg: any, contacts: any[]): Promise<void> {
  const from: string = msg?.from || '' // sender wa_id (digits)
  if (!from) return
  const senderHash = senderHashFor(from)
  const profileName: string | null =
    contacts.find((c) => c?.wa_id === from)?.profile?.name ?? null

  // ── Button tap ────────────────────────────────────────────────────
  if (msg.type === 'interactive' && msg.interactive?.type === 'button_reply') {
    const parsed = BUTTON.parse(String(msg.interactive.button_reply.id || ''))
    if (!parsed) return
    if (parsed.decision === 'no') {
      await markDeclined(parsed.recordId)
      await sendText(from, 'تم الإلغاء، ما نشرنا شي. 🙏\nCancelled — nothing was published.')
      return
    }
    await finishPublish(from, parsed.recordId, 'BUTTON')
    return
  }

  // ── Plain text (forwarded or typed) ──────────────────────────────
  if (msg.type === 'text') {
    const text = String(msg.text?.body || '').trim()
    if (!text) return

    // Typed yes/no fallback for users who reply instead of tapping.
    const norm = text.toLowerCase()
    const isYes = YES.some((w) => norm === w.toLowerCase())
    const isNo = NO.some((w) => norm === w.toLowerCase())
    if (isYes || isNo) {
      const pending = await latestPending(senderHash)
      if (pending) {
        if (isNo) {
          await markDeclined(pending)
          await sendText(from, 'تم الإلغاء. 🙏\nCancelled.')
        } else {
          await finishPublish(from, pending, 'TEXT')
        }
        return
      }
      // no pending → fall through and treat as a fresh candidate
    }

    const result = await recordIncoming({
      sourceChatId: from,
      sourceMessageId: String(msg.id || ''),
      senderHash,
      senderDisplayName: profileName,
      text,
    })
    if (result.ok) {
      await sendConfirmButtons(from, result.preview, result.recordId)
    } else if (result.code === 'not_useful' || result.code === 'low_confidence') {
      await sendText(from, 'ما قدرنا نعتبرها طلب مناسب للنشر في حي. جرّب ترسل طلب واضح للجيران (مثل: تبحث عن سبّاك، أو غرض مفقود).\n\nCouldn’t treat this as a neighborhood request.')
    }
    // risky/other → stay silent.
    return
  }

  // Non-text media (image/audio/etc.) → tell them text only.
  await sendText(from, 'أرسل النص فقط من فضلك (بدون صور/ملفات).\nPlease send the text only.')
}

async function finishPublish(from: string, recordId: string, method: 'BUTTON' | 'TEXT') {
  const r = await publishConfirmed(recordId, { confirmationMethod: method })
  if (r.ok) {
    await sendText(
      from,
      `✅ تم النشر في تطبيق حي! شكراً لك 🌿\nنشرناها باسم «أحد سكان الحي» بدون رقمك.\n\nشوفها هنا:\n${r.url}\n\nحمّل تطبيق حي وتابع جيرانك مباشرة 👇\nhttps://app.hai-app.net`,
    )
  } else if (r.code === 'rate_limited_sender') {
    await sendText(from, 'وصلت الحد اليومي للنشر عبر واتساب (3 يومياً). جرّب بكرة 🙏')
  } else if (r.code === 'rate_limited_neighborhood') {
    await sendText(from, 'في زحمة نشر بالحي حالياً، جرّب بعد شوي 🙏')
  } else if (r.code === 'not_found') {
    await sendText(from, 'انتهت صلاحية هذا الطلب. أعد إرسال الرسالة من فضلك.\nThis request expired — please send the message again.')
  } else {
    await sendText(from, 'تعذّر النشر هذه المرة 🙏\nCouldn’t publish this time.')
  }
}

/** Most recent still-pending (PROMPTED) record for this sender within the window. */
async function latestPending(senderHash: string): Promise<string | null> {
  const row = await db.whatsappBridgeMessage.findFirst({
    where: { senderHash, status: 'PROMPTED', createdAt: { gte: new Date(Date.now() - PENDING_TTL_MS) } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  }).catch(() => null)
  return row?.id ?? null
}

function verifySignature(raw: string, header: string, appSecret: string): boolean {
  if (!header.startsWith('sha256=')) return false
  const expected = 'sha256=' + createHmac('sha256', appSecret).update(raw).digest('hex')
  try {
    const a = Buffer.from(header)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}
