/**
 * Direct-to-Apple APNs HTTP/2 sender.
 *
 * Bypasses FCM-iOS entirely: the @capacitor/push-notifications plugin
 * on iOS emits a raw APNs device token (no Firebase iOS SDK required),
 * and this module mints a short-lived JWT from the project's APNs
 * auth key (.p8) and POSTs to https://api.push.apple.com.
 *
 * Required env vars on Vercel:
 *   APNS_KEY_BASE64   — the .p8 file, base64-encoded (paste-safe)
 *                       (alternatively set APNS_PRIVATE_KEY with the
 *                        PEM content directly; \n escapes unescaped)
 *   APNS_KEY_ID       — 10-char Apple key ID (e.g. 7ZKN49FBJD)
 *   APNS_TEAM_ID      — 10-char Apple team ID (e.g. XD95FL293Z)
 *   APNS_BUNDLE_ID    — e.g. com.hai.app
 *   APNS_ENV          — optional: 'production' (default) or 'development'
 */

import crypto from 'crypto'

export interface ApnsCredentials {
  keyId: string
  teamId: string
  bundleId: string
  privateKey: string
  env: 'production' | 'development'
}

export function loadApnsCredentials(): ApnsCredentials | null {
  const keyId = process.env.APNS_KEY_ID?.trim()
  const teamId = process.env.APNS_TEAM_ID?.trim()
  const bundleId = process.env.APNS_BUNDLE_ID?.trim()
  if (!keyId || !teamId || !bundleId) return null

  let privateKey: string | undefined
  const b64 = process.env.APNS_KEY_BASE64?.trim()
  if (b64) {
    try {
      privateKey = Buffer.from(b64, 'base64').toString('utf-8')
    } catch { /* fall through */ }
  }
  if (!privateKey) {
    const raw = process.env.APNS_PRIVATE_KEY
    if (raw) privateKey = raw.replace(/\\n/g, '\n').replace(/\r/g, '')
  }
  if (!privateKey || !privateKey.includes('BEGIN PRIVATE KEY')) return null

  const env: 'production' | 'development' =
    process.env.APNS_ENV === 'development' ? 'development' : 'production'
  return { keyId, teamId, bundleId, privateKey, env }
}

/** Mint an Apple JWT (ES256, 1h TTL). Cached in-memory for ~55 minutes. */
interface CachedJwt { token: string; expiresAt: number }
let cachedJwt: CachedJwt | null = null

export function mintApnsJwt(creds: ApnsCredentials): string {
  if (cachedJwt && cachedJwt.expiresAt > Date.now() + 60_000) return cachedJwt.token

  const nowSec = Math.floor(Date.now() / 1000)
  const header = { alg: 'ES256', kid: creds.keyId, typ: 'JWT' }
  const claim = { iss: creds.teamId, iat: nowSec }
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const toSign = `${enc(header)}.${enc(claim)}`
  const signer = crypto.createSign('SHA256')
  signer.update(toSign)
  // Apple wants IEEE-P1363 / raw (R‖S), not DER. Node returns DER by default.
  const der = signer.sign(creds.privateKey)
  const raw = derToRawEcdsa(der, 64) // 64 bytes for P-256
  const jwt = `${toSign}.${raw.toString('base64url')}`

  cachedJwt = { token: jwt, expiresAt: (nowSec + 55 * 60) * 1000 }
  return jwt
}

/** Convert a DER-encoded ECDSA signature to Apple's IEEE-P1363 raw form. */
function derToRawEcdsa(der: Buffer, targetLen: number): Buffer {
  // Parse minimal ASN.1: SEQUENCE { INTEGER r, INTEGER s }
  let off = 0
  if (der[off++] !== 0x30) throw new Error('bad der: not a SEQUENCE')
  let seqLen = der[off++]
  if (seqLen & 0x80) {
    const n = seqLen & 0x7f
    seqLen = 0
    for (let i = 0; i < n; i++) seqLen = (seqLen << 8) | der[off++]
  }
  if (der[off++] !== 0x02) throw new Error('bad der: r not an INTEGER')
  const rLen = der[off++]
  let r = der.slice(off, off + rLen); off += rLen
  if (der[off++] !== 0x02) throw new Error('bad der: s not an INTEGER')
  const sLen = der[off++]
  let s = der.slice(off, off + sLen); off += sLen
  // Strip leading 0x00 padding, then left-pad to targetLen/2
  const half = targetLen / 2
  const normalize = (b: Buffer) => {
    while (b.length > half && b[0] === 0) b = b.slice(1)
    if (b.length < half) {
      const pad = Buffer.alloc(half - b.length, 0)
      b = Buffer.concat([pad, b])
    }
    return b
  }
  return Buffer.concat([normalize(r), normalize(s)])
}

export interface ApnsSendOptions {
  title: string
  body: string
  data?: Record<string, string>
  /** 'high' → priority 10, immediate; 'normal' → priority 5, batched. */
  priority?: 'high' | 'normal'
  /** APNs topic override (defaults to APNS_BUNDLE_ID). */
  topic?: string
  /** Optional collapse ID for dedupe. */
  collapseId?: string
  /** Relevance score 0..1 for iOS notification summary. */
  relevanceScore?: number
}

export interface ApnsSendResult {
  success: number
  failed: number
  invalidTokens: string[]
  firstError?: string
  perToken: Array<{ token: string; ok: boolean; status: number; reason?: string }>
}

/** Send a single APNs push to N device tokens.
 *
 *  Uses Node's `http2` module because Apple's APNs server requires
 *  HTTP/2. Node's global fetch (undici) speaks HTTP/1.1 only, which is
 *  why the naive `fetch()` port of this code dies with `fetch failed`
 *  — the TLS handshake succeeds but the HTTP/1.1 request is dropped.
 */
export async function sendApnsBatch(
  tokens: string[],
  opts: ApnsSendOptions,
  credsArg?: ApnsCredentials | null,
): Promise<ApnsSendResult> {
  const result: ApnsSendResult = {
    success: 0, failed: 0, invalidTokens: [], perToken: [],
  }
  if (tokens.length === 0) return result

  const creds = credsArg ?? loadApnsCredentials()
  if (!creds) {
    result.firstError = 'apns_not_configured'
    return result
  }

  const jwt = mintApnsJwt(creds)
  const host =
    creds.env === 'development' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com'
  const topic = opts.topic || creds.bundleId
  const apnsPriority = opts.priority === 'high' ? 10 : 5
  const apnsPushType = 'alert'

  const payload: Record<string, any> = {
    aps: {
      alert: { title: opts.title, body: opts.body },
      sound: 'default',
      'mutable-content': 1,
      ...(typeof opts.relevanceScore === 'number'
        ? { 'relevance-score': opts.relevanceScore }
        : {}),
    },
    ...(opts.data || {}),
  }
  const jsonBody = JSON.stringify(payload)

  // Open one HTTP/2 session and multiplex every token request over it.
  const http2 = await import('http2')
  const session = http2.connect(`https://${host}`)

  const markAllFailed = (reason: string) => {
    for (const token of tokens) {
      result.failed++
      result.perToken.push({ token, ok: false, status: 0, reason })
    }
    if (!result.firstError) result.firstError = reason
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('apns_session_timeout')),
        10_000,
      )
      session.once('connect', () => { clearTimeout(timer); resolve() })
      session.once('error', (err) => { clearTimeout(timer); reject(err) })
    })
  } catch (err: any) {
    markAllFailed(err?.message || 'apns_connect_failed')
    try { session.close() } catch {}
    return result
  }

  const sendOne = (token: string) =>
    new Promise<void>((resolve) => {
      const headers: Record<string, string> = {
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        authorization: `bearer ${jwt}`,
        'apns-topic': topic,
        'apns-push-type': apnsPushType,
        'apns-priority': String(apnsPriority),
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(jsonBody)),
      }
      if (opts.collapseId) headers['apns-collapse-id'] = opts.collapseId

      const req = session.request(headers)
      let status = 0
      let body = ''
      req.setEncoding('utf8')
      req.on('response', (h) => {
        status = Number(h[':status']) || 0
      })
      req.on('data', (chunk: string) => { body += chunk })
      req.on('end', () => {
        if (status === 200) {
          result.success++
          result.perToken.push({ token, ok: true, status: 200 })
          resolve()
          return
        }
        let reason: string
        try {
          const parsed = body ? JSON.parse(body) : null
          reason = parsed?.reason || `HTTP ${status}`
        } catch {
          reason = `HTTP ${status}`
        }
        result.failed++
        result.perToken.push({ token, ok: false, status, reason })
        if (!result.firstError) result.firstError = reason
        if (
          reason === 'BadDeviceToken' ||
          reason === 'Unregistered' ||
          reason === 'DeviceTokenNotForTopic' ||
          status === 410
        ) {
          result.invalidTokens.push(token)
        }
        resolve()
      })
      req.on('error', (err: Error) => {
        result.failed++
        const reason = err?.message || String(err)
        result.perToken.push({ token, ok: false, status: 0, reason })
        if (!result.firstError) result.firstError = reason
        resolve()
      })
      req.end(jsonBody)
    })

  try {
    await Promise.all(tokens.map(sendOne))
  } finally {
    try { session.close() } catch {}
  }

  return result
}
