/**
 * Optional Claude pass for the bridge. Two jobs in one cheap Haiku call:
 *   1. Second-opinion filter — is this genuinely a neighborhood REQUEST?
 *   2. Rewrite — clean Arabic, drop phone/links/names/insults/chit-chat.
 *
 * SAFETY: this never has the final say. The caller re-validates the rewrite
 * through the same rule gate and falls back to the original text. On any
 * error (or when disabled) returns null so the bridge runs rules-only.
 */
import { bridgeConfig } from './config'
import type { BridgeCategory } from './classify'

export interface AiReview {
  isRequest: boolean
  category: BridgeCategory | null
  cleaned: string | null
}

const SYSTEM = `أنت مساعد لتطبيق أحياء سعودي اسمه "حي". تصلك رسالة من مجموعة واتساب.
مهمتك: قرر هل هي "طلب" حقيقي مناسب للنشر للجيران (طلب خدمة/توصية، سؤال عن الحي، أو غرض مفقود/موجود)، وإن كانت كذلك أعد صياغتها كطلب واضح ومهذب ومختصر بالعربية.
قواعد إعادة الصياغة: احفظ جوهر الطلب والكلمات المفتاحية، واحذف أرقام الهواتف والروابط والأسماء والشتائم والكلام الجانبي. لا تخترع معلومات. أقل من 280 حرفاً.
أعد فقط JSON صالح بالشكل: {"isRequest": boolean, "category": "SERVICES"|"GENERAL"|"LOST_FOUND"|null, "cleaned": string}
إن لم تكن طلباً مناسباً: isRequest=false و cleaned="".`

const ALLOWED: ReadonlySet<string> = new Set(['SERVICES', 'GENERAL', 'LOST_FOUND'])

export async function aiReview(text: string): Promise<AiReview | null> {
  const cfg = bridgeConfig()
  if (!cfg.ai.enabled || !cfg.ai.apiKey) return null

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': cfg.ai.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: cfg.ai.model,
        max_tokens: 400,
        temperature: 0,
        system: SYSTEM,
        messages: [{ role: 'user', content: text.slice(0, 1500) }],
      }),
    })
    if (!res.ok) {
      console.error('[BRIDGE] ai call failed', res.status, (await res.text().catch(() => '')).slice(0, 200))
      return null
    }
    const data: any = await res.json()
    const raw: string = data?.content?.[0]?.text ?? ''
    const parsed = parseJson(raw)
    if (!parsed) return null

    const category = ALLOWED.has(parsed.category) ? (parsed.category as BridgeCategory) : null
    return {
      isRequest: parsed.isRequest === true,
      category,
      cleaned: typeof parsed.cleaned === 'string' && parsed.cleaned.trim() ? parsed.cleaned.trim() : null,
    }
  } catch (err) {
    console.error('[BRIDGE] ai error', err)
    return null
  }
}

/** Tolerate ```json fences / stray prose around the JSON object. */
function parseJson(raw: string): any | null {
  const fenced = raw.replace(/```json\s*|```/g, '').trim()
  const start = fenced.indexOf('{')
  const end = fenced.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  try { return JSON.parse(fenced.slice(start, end + 1)) } catch { return null }
}
