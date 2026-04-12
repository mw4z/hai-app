const STORAGE_KEY = 'hai_pending_invite'
const MAX_RETRIES = 3
const STALE_AFTER_MS = 14 * 24 * 60 * 60_000
const CODE_PATTERN = /^HAI-[A-Z0-9]{3,10}$/

export type PendingInvite = {
  code: string
  capturedAt: number
  retries: number
}

const TERMINAL_ERRORS = new Set<string>([
  'already_redeemed',
  'self_invite',
  'code_not_found',
  'too_late',
  'same_device',
  'inviter_unavailable',
  'forbidden',
  'code_required',
  'invalid_body',
])

export function isValidInviteCode(code: string): boolean {
  return CODE_PATTERN.test(code.trim().toUpperCase())
}

export function savePendingInviteCode(code: string): boolean {
  if (typeof window === 'undefined') return false
  const normalized = code.trim().toUpperCase()
  if (!isValidInviteCode(normalized)) return false
  try {
    const data: PendingInvite = {
      code: normalized,
      capturedAt: Date.now(),
      retries: 0,
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    console.log('[INVITE] captured', { code: normalized })
    return true
  } catch {
    return false
  }
}

export function getPendingInviteCode(): PendingInvite | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PendingInvite>
    if (!parsed?.code || !isValidInviteCode(parsed.code)) {
      window.localStorage.removeItem(STORAGE_KEY)
      return null
    }
    if (
      typeof parsed.capturedAt !== 'number' ||
      Date.now() - parsed.capturedAt > STALE_AFTER_MS
    ) {
      window.localStorage.removeItem(STORAGE_KEY)
      return null
    }
    const retries = typeof parsed.retries === 'number' ? parsed.retries : 0
    if (retries >= MAX_RETRIES) {
      window.localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return { code: parsed.code, capturedAt: parsed.capturedAt, retries }
  } catch {
    return null
  }
}

export function clearPendingInviteCode(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
    console.log('[INVITE] cleared')
  } catch {}
}

function bumpRetries(): number {
  if (typeof window === 'undefined') return MAX_RETRIES
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return MAX_RETRIES
    const parsed = JSON.parse(raw) as PendingInvite
    parsed.retries = (parsed.retries || 0) + 1
    if (parsed.retries >= MAX_RETRIES) {
      window.localStorage.removeItem(STORAGE_KEY)
      return parsed.retries
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed))
    return parsed.retries
  } catch {
    return MAX_RETRIES
  }
}

export type RedeemOutcome =
  | { status: 'success'; inviterName?: string | null }
  | { status: 'cleared'; reason: string }
  | { status: 'retry'; reason?: string }
  | { status: 'skip' }

let inflight: Promise<RedeemOutcome> | null = null

export async function tryRedeemPendingInvite(
  deviceId?: string | null,
): Promise<RedeemOutcome> {
  if (inflight) return inflight
  const pending = getPendingInviteCode()
  if (!pending) return { status: 'skip' }

  inflight = (async (): Promise<RedeemOutcome> => {
    console.log('[INVITE] redeem attempt', {
      code: pending.code,
      retries: pending.retries,
    })
    try {
      const res = await fetch('/api/invites/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: pending.code,
          // TODO: pass Capacitor Device.getId() once @capacitor/device is installed
          deviceId: deviceId || undefined,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        inviterName?: string
      }

      if (res.ok) {
        clearPendingInviteCode()
        console.log('[INVITE] redeem success', {
          inviter: data.inviterName || null,
        })
        return { status: 'success', inviterName: data.inviterName ?? null }
      }

      if (data.error && TERMINAL_ERRORS.has(data.error)) {
        clearPendingInviteCode()
        console.log('[INVITE] redeem cleared', { reason: data.error })
        return { status: 'cleared', reason: data.error }
      }

      const retries = bumpRetries()
      console.log('[INVITE] redeem retry', {
        retries,
        reason: data.error || `http_${res.status}`,
      })
      return { status: 'retry', reason: data.error || `http_${res.status}` }
    } catch {
      const retries = bumpRetries()
      console.log('[INVITE] redeem network error', { retries })
      return { status: 'retry' }
    } finally {
      inflight = null
    }
  })()

  return inflight
}
