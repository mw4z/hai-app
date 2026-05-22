/**
 * Client-safe phone formatting for service contacts. NO node:crypto, so
 * it's importable from client components (the post/comment extraction
 * action, the add form). The hashing/encryption half lives in phone.ts
 * (server-only) and reuses toE164 from here.
 */

/**
 * Normalize any Saudi-ish input to E.164 (+9665XXXXXXXX etc.). Handles
 * 05…, bare 5…, 966…, +966…, 00966…, and Saudi landline / 800 / 92xx
 * business lines. Returns null when it doesn't look like a usable number.
 * International (+) numbers from outside KSA are accepted as-is.
 */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null
  const hadPlus = String(raw).trim().startsWith('+')
  let d = String(raw).replace(/[^\d]/g, '')
  if (!d) return null
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('0')) d = '966' + d.slice(1)
  else if (/^5\d{8}$/.test(d)) d = '966' + d
  else if (!d.startsWith('966') && /^(1\d{8}|800\d{6,7}|92\d{6,8})$/.test(d)) d = '966' + d
  if (/^966(5\d{8}|1\d{8}|800\d{6,7}|92\d{6,8})$/.test(d)) return '+' + d
  if (hadPlus && d.length >= 8 && d.length <= 15) return '+' + d
  return null
}

export function isValidServicePhone(raw: string | null | undefined): boolean {
  return toE164(raw) !== null
}
