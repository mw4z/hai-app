import { decryptPhone } from './phone'

/** Trust badge shown on the card — derived from verification only. */
export type ServiceTrust = 'COMMUNITY_UNVERIFIED' | 'PENDING_OWNER' | 'VERIFIED_PROVIDER'

export function serviceTrustBadge(verification: string): ServiceTrust {
  if (verification === 'VERIFIED' || verification === 'CLAIMED') return 'VERIFIED_PROVIDER'
  if (verification === 'PENDING_OWNER_CONFIRMATION') return 'PENDING_OWNER'
  return 'COMMUNITY_UNVERIFIED'
}

export interface PublicServiceContact {
  id: string
  category: string
  displayName: string
  description: string | null
  serviceArea: string | null
  phone: string        // decrypted E.164 — community contacts are public to call
  whatsapp: boolean
  neighborhoodId: string
  ratingAvg: number
  ratingCount: number
  trust: ServiceTrust
  /**
   * The registered user who EXPLICITLY owns this number (ownerUserId) — set
   * only via self-add or an accepted claim, so exposing it is consented and
   * lets the card offer an in-app DM. NEVER sourced from linkedUserId (the
   * privacy marker that merely means "a number matched some app user").
   */
  messageableUserId: string | null
}

type ContactRow = {
  id: string
  category: string
  displayName: string
  description: string | null
  serviceArea: string | null
  whatsapp: boolean
  neighborhoodId: string
  ratingAvg: number
  ratingCount: number
  verification: string
  serviceIdentity: { phoneEnc: string; ownerUserId?: string | null }
}

/**
 * Public shape — deliberately omits createdByUserId, notes, status, source,
 * and everything on serviceIdentity except the (decrypted) phone and the
 * consented ownerUserId. linkedUserId is never read here, so a matched normal
 * user's identity can't leak through the listing.
 */
export function toPublicServiceContact(c: ContactRow): PublicServiceContact {
  return {
    id: c.id,
    category: c.category,
    displayName: c.displayName,
    description: c.description,
    serviceArea: c.serviceArea,
    phone: decryptPhone(c.serviceIdentity.phoneEnc),
    whatsapp: c.whatsapp,
    neighborhoodId: c.neighborhoodId,
    ratingAvg: c.ratingAvg,
    ratingCount: c.ratingCount,
    trust: serviceTrustBadge(c.verification),
    messageableUserId: c.serviceIdentity.ownerUserId ?? null,
  }
}
