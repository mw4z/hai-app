import { PlaceCategory } from '@prisma/client'
import { isValidPlacePhone } from '@/lib/phone'
import { normalizePlaceName } from './normalize'

/**
 * Place-creation limit for normal residents: a flat 10 places per rolling
 * 24 hours, regardless of reputation. (Mods/admins bypass the limit
 * entirely — see the directory POST route.) The reputation threshold is
 * retained for any other callers but no longer changes the place limit.
 */
export const DIRECTORY_TRUSTED_REPUTATION = 150

export const PLACE_LIMIT_NORMAL = 10
export const PLACE_LIMIT_TRUSTED = 10
export const PLACE_LIMIT_WINDOW_MS = 24 * 3600 * 1000

export const CLAIM_PENDING_MAX = 3
export const REPORT_DAILY_MAX = 10

const NAME_MIN = 2
const NAME_MAX = 80
const DESCRIPTION_MAX = 500
const ADDRESS_MAX = 200
const HOURS_MAX = 300
const MESSAGE_MAX = 500

const SAFE_URL_HOSTS = new Set([
  'maps.google.com',
  'goo.gl',
  'maps.app.goo.gl',
  'www.google.com',
  'google.com',
  'maps.apple.com',
  'g.co',
])

/** Validate an https:// URL against a small safelist of map hosts.
 *  Other origins fall through to a permissive "https://" check so
 *  social/menu URLs aren't over-blocked at MVP. */
export function isSafeMapUrl(input: string | null | undefined): boolean {
  if (!input) return true
  if (typeof input !== 'string') return false
  if (input.length > 500) return false
  try {
    const u = new URL(input)
    if (u.protocol !== 'https:') return false
    return SAFE_URL_HOSTS.has(u.host)
  } catch {
    return false
  }
}

/** Sanitize an imageUrls array for write paths. Drops anything
 *  that doesn't look like a real https blob URL; caps the count
 *  at 5 (same as posts). Returns the cleaned list — never throws.
 *
 *  Callers should pair this with the existing upload pipeline
 *  (uploadFiles → /api/upload) which validates the file BEFORE
 *  it ever produces one of these URLs, so by the time bytes
 *  arrive here the only realistic shapes are Vercel-Blob hosts
 *  or the /uploads/* fallback. */
export const MAX_PLACE_IMAGES = 5
export function sanitizeImageUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const cleaned: string[] = []
  for (const u of raw) {
    if (typeof u !== 'string') continue
    const v = u.trim()
    if (!v || v.length > 500) continue
    if (!v.startsWith('https://') && !v.startsWith('/uploads/')) continue
    cleaned.push(v)
    if (cleaned.length >= MAX_PLACE_IMAGES) break
  }
  return cleaned
}

/** Permissive http(s) URL check for website / instagram. Accepts
 *  both http:// and https:// (some small business sites are still
 *  http-only); rejects other schemes (javascript:, data:, etc.). */
export function isSafeHttpsUrl(input: string | null | undefined): boolean {
  if (!input) return true
  if (typeof input !== 'string') return false
  if (input.length > 500) return false
  try {
    const u = new URL(input)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

export interface PlaceInput {
  name?: unknown
  category?: unknown
  description?: unknown
  phone?: unknown
  whatsapp?: unknown
  website?: unknown
  instagram?: unknown
  snapchat?: unknown
  tiktok?: unknown
  x?: unknown
  mapUrl?: unknown
  latitude?: unknown
  longitude?: unknown
  addressText?: unknown
  openingHours?: unknown
}

export interface ValidatedPlace {
  name: string
  nameNormalized: string
  category: PlaceCategory
  description: string | null
  phone: string | null
  whatsapp: string | null
  website: string | null
  instagram: string | null
  snapchat: string | null
  tiktok: string | null
  x: string | null
  mapUrl: string | null
  latitude: number | null
  longitude: number | null
  addressText: string | null
  openingHours: string | null
}

export type ValidationOk = { ok: true; value: ValidatedPlace }
export type ValidationErr = { ok: false; error: string; field?: string }

const VALID_CATEGORIES = new Set<string>(Object.values(PlaceCategory))

/** Validate a place create / edit payload. Returns the cleaned
 *  shape ready to write, or an error string + offending field.
 *
 *  Image URLs are intentionally NOT in PlaceInput — the API strips
 *  imageUrls before calling this helper. Phase 1.5 will reintroduce
 *  it through a dedicated upload path. */
export function validatePlaceInput(input: PlaceInput): ValidationOk | ValidationErr {
  // ── name ──
  const rawName = typeof input.name === 'string' ? input.name.trim() : ''
  if (rawName.length < NAME_MIN) {
    return { ok: false, error: 'الاسم قصير جداً', field: 'name' }
  }
  if (rawName.length > NAME_MAX) {
    return { ok: false, error: 'الاسم طويل جداً', field: 'name' }
  }
  const nameNormalized = normalizePlaceName(rawName)
  // Catches zero-width-only / whitespace-only bypass — after
  // normalization there must still be content.
  if (nameNormalized.length < NAME_MIN) {
    return { ok: false, error: 'الاسم غير صالح', field: 'name' }
  }

  // ── category ──
  if (typeof input.category !== 'string' || !VALID_CATEGORIES.has(input.category)) {
    return { ok: false, error: 'تصنيف غير صالح', field: 'category' }
  }
  const category = input.category as PlaceCategory

  // ── description ──
  let description: string | null = null
  if (typeof input.description === 'string') {
    const d = input.description.trim()
    if (d.length > DESCRIPTION_MAX) {
      return { ok: false, error: 'الوصف طويل جداً', field: 'description' }
    }
    description = d || null
  }

  // ── phone / whatsapp (Saudi format optional) ──
  const phone = optionalSaudiPhone(input.phone)
  if (phone === false) return { ok: false, error: 'رقم الجوال غير صالح', field: 'phone' }
  const whatsapp = optionalSaudiPhone(input.whatsapp)
  if (whatsapp === false) return { ok: false, error: 'رقم واتساب غير صالح', field: 'whatsapp' }

  // ── website / instagram / mapUrl ──
  let website: string | null = null
  if (typeof input.website === 'string' && input.website.trim()) {
    if (!isSafeHttpsUrl(input.website.trim())) {
      return { ok: false, error: 'الموقع الإلكتروني غير صالح', field: 'website' }
    }
    website = input.website.trim()
  }
  // Social handle gate — shared for instagram / snapchat / tiktok /
  // x. Accepts either a bare handle ("@hai") or a full https URL.
  // Anything else (http://, javascript:, mailto:) is rejected.
  const socialField = (raw: unknown, fieldName: string): string | null | ValidationErr => {
    if (typeof raw !== 'string' || !raw.trim()) return null
    const v = raw.trim()
    if (v.length > 200) {
      return { ok: false, error: 'رابط الحساب غير صالح', field: fieldName }
    }
    if (v.startsWith('http') && !isSafeHttpsUrl(v)) {
      return { ok: false, error: 'رابط الحساب غير صالح', field: fieldName }
    }
    return v
  }
  const instagramRes = socialField(input.instagram, 'instagram')
  if (instagramRes && typeof instagramRes === 'object' && 'ok' in instagramRes) return instagramRes
  const instagram = (instagramRes as string | null) ?? null

  const snapchatRes = socialField(input.snapchat, 'snapchat')
  if (snapchatRes && typeof snapchatRes === 'object' && 'ok' in snapchatRes) return snapchatRes
  const snapchat = (snapchatRes as string | null) ?? null

  const tiktokRes = socialField(input.tiktok, 'tiktok')
  if (tiktokRes && typeof tiktokRes === 'object' && 'ok' in tiktokRes) return tiktokRes
  const tiktok = (tiktokRes as string | null) ?? null

  const xRes = socialField(input.x, 'x')
  if (xRes && typeof xRes === 'object' && 'ok' in xRes) return xRes
  const x = (xRes as string | null) ?? null
  let mapUrl: string | null = null
  if (typeof input.mapUrl === 'string' && input.mapUrl.trim()) {
    if (!isSafeMapUrl(input.mapUrl.trim())) {
      return { ok: false, error: 'رابط الخريطة غير مدعوم', field: 'mapUrl' }
    }
    mapUrl = input.mapUrl.trim()
  }

  // ── coordinates (WGS84) ──
  let latitude: number | null = null
  let longitude: number | null = null
  if (input.latitude !== undefined && input.latitude !== null) {
    const n = Number(input.latitude)
    if (!Number.isFinite(n) || n < -90 || n > 90) {
      return { ok: false, error: 'إحداثيات غير صالحة', field: 'latitude' }
    }
    latitude = n
  }
  if (input.longitude !== undefined && input.longitude !== null) {
    const n = Number(input.longitude)
    if (!Number.isFinite(n) || n < -180 || n > 180) {
      return { ok: false, error: 'إحداثيات غير صالحة', field: 'longitude' }
    }
    longitude = n
  }
  // Either both or neither.
  if ((latitude === null) !== (longitude === null)) {
    return { ok: false, error: 'إحداثيات غير مكتملة', field: 'latitude' }
  }

  // ── addressText ──
  let addressText: string | null = null
  if (typeof input.addressText === 'string' && input.addressText.trim()) {
    const v = input.addressText.trim()
    if (v.length > ADDRESS_MAX) {
      return { ok: false, error: 'العنوان طويل جداً', field: 'addressText' }
    }
    addressText = v
  }

  // ── openingHours ──
  let openingHours: string | null = null
  if (typeof input.openingHours === 'string' && input.openingHours.trim()) {
    const v = input.openingHours.trim()
    if (v.length > HOURS_MAX) {
      return { ok: false, error: 'ساعات العمل طويلة', field: 'openingHours' }
    }
    openingHours = v
  }

  return {
    ok: true,
    value: {
      name: rawName,
      nameNormalized,
      category,
      description,
      phone,
      whatsapp,
      website,
      instagram,
      snapchat,
      tiktok,
      x,
      mapUrl,
      latitude,
      longitude,
      addressText,
      openingHours,
    },
  }
}

/** Validate a claim or report message body. Returns the cleaned
 *  string (possibly empty) or false if it exceeds the cap. */
export function validateMessage(input: unknown): string | false | null {
  if (input === undefined || input === null) return null
  if (typeof input !== 'string') return false
  const v = input.trim()
  if (!v) return null
  if (v.length > MESSAGE_MAX) return false
  return v
}

/** Place-phone gate that allows the field to be absent. Accepts
 *  mobile, 800 toll-free, and 920 unified business numbers. Returns
 *  the cleaned phone, null if absent, or false if present-but-bad. */
function optionalSaudiPhone(input: unknown): string | null | false {
  if (input === undefined || input === null) return null
  if (typeof input !== 'string') return false
  const v = input.trim()
  if (!v) return null
  if (!isValidPlacePhone(v)) return false
  return v
}

/** Limit applicable to this user. */
export function placeLimitForUser(reputation: number): number {
  return reputation >= DIRECTORY_TRUSTED_REPUTATION ? PLACE_LIMIT_TRUSTED : PLACE_LIMIT_NORMAL
}
