/**
 * Phone-identity helpers for the service-contact directory. SERVER-ONLY
 * (uses node:crypto). The phone of a service contact is matched/deduped
 * via a non-reversible HMAC hash, and the E.164 number is stored
 * encrypted at rest when a key is configured.
 */
import crypto from 'crypto'

// E.164 normalization lives in the client-safe phoneFormat module so the
// post/comment extraction + add form can import it without pulling in
// node:crypto. Re-exported here for server callers' convenience.
export { toE164, isValidServicePhone } from './phoneFormat'
import { toE164 } from './phoneFormat'
void toE164 // referenced by callers via the re-export above

// In production we FAIL CLOSED: a missing pepper or key throws rather than
// silently falling back to a default pepper / plaintext storage. The
// plaintext-tagged fallback exists ONLY for local dev convenience. Env is
// read at call time (not module load) so the guard reflects the live env.
const IS_PROD = process.env.NODE_ENV === 'production'
const DEV_PEPPER = 'hai-service-phone-pepper-dev-only'

/** True when BOTH secrets are present + well-formed. The API uses this to
 *  return a clean 503 in production instead of throwing mid-request. */
export function serviceContactCryptoReady(): boolean {
  const pepper = process.env.SERVICE_PHONE_PEPPER || ''
  const key = process.env.SERVICE_PHONE_KEY || ''
  return pepper.length >= 16 && /^[0-9a-fA-F]{64}$/.test(key)
}

// ── Hashing (dedup / match key) ─────────────────────────────────────
// HMAC-SHA256 over the E.164 with a stable server pepper. Deterministic
// (same number → same ServiceIdentity) but not reversible. The pepper is
// PERMANENT: changing it re-buckets every hash, so it must only change as
// part of a deliberate full rehash migration.
function pepper(): string {
  const p = process.env.SERVICE_PHONE_PEPPER || ''
  if (p.length >= 16) return p
  if (IS_PROD) throw new Error('SERVICE_PHONE_PEPPER missing in production — refusing to hash with a default pepper')
  return DEV_PEPPER
}

export function phoneHash(e164: string): string {
  return crypto.createHmac('sha256', pepper()).update(e164).digest('hex')
}

// ── Encryption at rest (AES-256-GCM) ────────────────────────────────
// Encrypts the E.164 with SERVICE_PHONE_KEY (64 hex = 32 bytes). In
// production a missing/invalid key THROWS — we never write a plaintext-
// tagged phone in prod. Locally (dev) it falls back to a plaintext tag so
// the feature works before the key is provisioned.
function aesKey(): Buffer | null {
  const hex = process.env.SERVICE_PHONE_KEY || ''
  return /^[0-9a-fA-F]{64}$/.test(hex) ? Buffer.from(hex, 'hex') : null
}

export function encryptPhone(e164: string): string {
  const k = aesKey()
  if (!k) {
    if (IS_PROD) throw new Error('SERVICE_PHONE_KEY missing/invalid in production — refusing to store a plaintext phone')
    return 'plain:' + e164
  }
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', k, iv)
  const enc = Buffer.concat([cipher.update(e164, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return 'enc:' + Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptPhone(stored: string | null | undefined): string {
  if (!stored) return ''
  if (stored.startsWith('plain:')) return stored.slice(6)
  if (stored.startsWith('enc:')) {
    const k = aesKey()
    if (!k) return '' // key rotated away / missing — fail closed, no leak
    try {
      const raw = Buffer.from(stored.slice(4), 'base64')
      const iv = raw.subarray(0, 12)
      const tag = raw.subarray(12, 28)
      const data = raw.subarray(28)
      const decipher = crypto.createDecipheriv('aes-256-gcm', k, iv)
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
    } catch {
      return ''
    }
  }
  return stored // legacy untagged value
}
