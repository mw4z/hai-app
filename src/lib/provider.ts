import type { ProviderStatus } from '@prisma/client'

export const PROVIDER_DESC_MIN = 20
export const LAT_MIN = -90
export const LAT_MAX = 90
export const LNG_MIN = -180
export const LNG_MAX = 180

/** True if the provider should be visible in public listings/badges. */
export function isProviderVisible(status?: ProviderStatus | null): boolean {
  return status === 'ACTIVE' || status === 'VERIFIED'
}

/** Valid WGS84 lat/lng and not (0,0). */
export function isValidCoord(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  if (lat < LAT_MIN || lat > LAT_MAX) return false
  if (lng < LNG_MIN || lng > LNG_MAX) return false
  if (lat === 0 && lng === 0) return false
  return true
}

/**
 * Decide a newly-applying provider's status from the fields they submitted.
 * PENDING if anything quality-related is missing, ACTIVE if it all looks good.
 */
export function computeProviderStatus(args: {
  serviceDescription?: string | null
  serviceAddress?: string | null
  serviceLat?: number | null
  serviceLng?: number | null
}): 'PENDING' | 'ACTIVE' {
  const desc = (args.serviceDescription || '').trim()
  const addr = (args.serviceAddress || '').trim()
  if (desc.length < PROVIDER_DESC_MIN) return 'PENDING'
  if (!addr) return 'PENDING'
  if (!isValidCoord(args.serviceLat, args.serviceLng)) return 'PENDING'
  return 'ACTIVE'
}
