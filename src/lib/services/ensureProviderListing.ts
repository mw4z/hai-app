import { db } from '@/lib/db'
import { toE164 } from './phoneFormat'
import { phoneHash, encryptPhone } from './phone'
import { inferServiceCategory } from './inferServiceCategory'

/**
 * Idempotently ensure an ACTIVE/VERIFIED provider has a self-owned directory
 * listing in their neighborhood, with the category guessed from their service
 * description / bio. Best-effort and NEVER throws (call fire-and-forget after
 * provider activation, or in the backfill script).
 *
 * No-op when: not a visible provider, no phone/neighborhood, crypto missing,
 * or ANY listing already exists for this identity in this hood (incl. one a
 * mod REMOVED — we respect that and don't resurrect it, and we never
 * duplicate). The owner can edit/remove their own listing from the card.
 */
export async function ensureProviderListing(userId: string): Promise<'created' | 'skipped'> {
  try {
    const u = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, lastName: true, phone: true, neighborhoodId: true,
        providerStatus: true, serviceDescription: true, bio: true,
      },
    })
    if (!u || !u.phone || !u.neighborhoodId) return 'skipped'
    if (u.providerStatus !== 'ACTIVE' && u.providerStatus !== 'VERIFIED') return 'skipped'

    const e164 = toE164(u.phone)
    if (!e164) return 'skipped'
    const hash = phoneHash(e164)

    const identity = await db.serviceIdentity.upsert({
      where: { phoneHash: hash },
      create: { phoneHash: hash, phoneEnc: encryptPhone(e164), ownerUserId: u.id, linkedUserId: u.id },
      update: { ownerUserId: u.id, linkedUserId: u.id },
      select: { id: true },
    })

    // Respect any existing listing (any category, any status) — idempotent +
    // never resurrects a mod-removed one.
    const existing = await db.directoryServiceContact.findFirst({
      where: { serviceIdentityId: identity.id, neighborhoodId: u.neighborhoodId },
      select: { id: true },
    })
    if (existing) return 'skipped'

    const category = inferServiceCategory(u.serviceDescription, u.bio, u.name)
    const displayName = [u.name?.trim(), u.lastName?.trim()].filter(Boolean).join(' ') || u.name || 'مزود خدمة'

    await db.directoryServiceContact.create({
      data: {
        serviceIdentityId: identity.id,
        neighborhoodId: u.neighborhoodId,
        category,
        displayName,
        description: (u.serviceDescription || u.bio || '').trim().slice(0, 280) || null,
        whatsapp: true,
        source: 'OWNER_SUBMITTED',
        verification: 'VERIFIED',
        status: 'ACTIVE',
        createdByUserId: u.id,
      },
    })
    return 'created'
  } catch (e) {
    console.error('[PROVIDER_LISTING] ensure failed', { userId, e })
    return 'skipped'
  }
}
