/**
 * Minimal WhatsApp Cloud API client for the bridge. Sends only into the
 * 24h customer-service window opened when a user messages the bot (so no
 * message templates are needed). Never throws — logs + returns ok:false so
 * the webhook can always 200 Meta back.
 */
import { bridgeConfig } from './config'

const YES_PREFIX = 'bridge_yes:'
const NO_PREFIX = 'bridge_no:'

export const BUTTON = {
  yesId: (recordId: string) => `${YES_PREFIX}${recordId}`,
  noId: (recordId: string) => `${NO_PREFIX}${recordId}`,
  parse(id: string): { decision: 'yes' | 'no'; recordId: string } | null {
    if (id.startsWith(YES_PREFIX)) return { decision: 'yes', recordId: id.slice(YES_PREFIX.length) }
    if (id.startsWith(NO_PREFIX)) return { decision: 'no', recordId: id.slice(NO_PREFIX.length) }
    return null
  },
}

function endpoint(): { url: string; token: string } | null {
  const cfg = bridgeConfig()
  if (!cfg.cloud.token || !cfg.cloud.phoneNumberId) return null
  return {
    url: `https://graph.facebook.com/${cfg.cloud.graphVersion}/${cfg.cloud.phoneNumberId}/messages`,
    token: cfg.cloud.token,
  }
}

async function post(payload: Record<string, unknown>): Promise<{ ok: boolean }> {
  const ep = endpoint()
  if (!ep) {
    console.error('[BRIDGE] cloud client not configured (token/phoneNumberId missing)')
    return { ok: false }
  }
  try {
    const res = await fetch(ep.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ep.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[BRIDGE] cloud send failed', res.status, body.slice(0, 300))
      return { ok: false }
    }
    return { ok: true }
  } catch (err) {
    console.error('[BRIDGE] cloud send error', err)
    return { ok: false }
  }
}

/** Plain text reply. */
export function sendText(to: string, body: string) {
  return post({ to, type: 'text', text: { preview_url: false, body } })
}

/**
 * Confirm prompt with two reply buttons. `to` is the sender's wa_id, the
 * preview is the message we'd publish, and recordId ties the tap back to the
 * pending audit row.
 */
export function sendConfirmButtons(to: string, preview: string, recordId: string) {
  const clipped = preview.length > 900 ? preview.slice(0, 897) + '…' : preview
  return post({
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: `📨 وصلتنا هذه الرسالة:\n\n«${clipped}»\n\nتبغى ننشرها في تطبيق حي كطلب للجيران (بدون اسمك ولا رقمك)؟\n\nDo you want this published on Hai as an anonymous neighborhood request?`,
      },
      action: {
        buttons: [
          { type: 'reply', reply: { id: BUTTON.yesId(recordId), title: '✅ انشرها' } },
          { type: 'reply', reply: { id: BUTTON.noId(recordId), title: '✖️ لا، إلغاء' } },
        ],
      },
    },
  })
}
