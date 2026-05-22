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

// ── Hashing (dedup / match key) ─────────────────────────────────────
// HMAC-SHA256 over the E.164 with a server pepper. Deterministic (so the
// same number always maps to the same ServiceIdentity) but not
// reversible, so a DB dump can't recover the phone list. The pepper has
// a stable fallback — overriding it via env rotates the dedup space, so
// only set SERVICE_PHONE_PEPPER once at launch.
const PEPPER = process.env.SERVICE_PHONE_PEPPER || 'hai-service-phone-pepper-v1'

export function phoneHash(e164: string): string {
  return crypto.createHmac('sha256', PEPPER).update(e164).digest('hex')
}

// ── Encryption at rest (AES-256-GCM) ────────────────────────────────
// Encrypts the E.164 when SERVICE_PHONE_KEY (64 hex chars = 32 bytes) is
// set; otherwise stores it plaintext-tagged so the app keeps working in
// dev / before the key is provisioned. Decryption is server-only and
// happens just before a PUBLIC contact card is built (community contacts
// display the number to call).
const KEY_HEX = process.env.SERVICE_PHONE_KEY || ''

function aesKey(): Buffer | null {
  return /^[0-9a-fA-F]{64}$/.test(KEY_HEX) ? Buffer.from(KEY_HEX, 'hex') : null
}

export function encryptPhone(e164: string): string {
  const k = aesKey()
  if (!k) return 'plain:' + e164
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
