import type { PlaceListing, ServiceItem, User } from '@prisma/client'

/**
 * Public-facing shape of a PlaceListing.
 *
 * createdByUser is NEVER included. Replaced by a boolean
 * `addedByCommunity` flag — the client renders the localized
 * "أضافه أحد سكان الحي" / "Added by a neighbor" label from i18n.
 *
 * claimedByUser IS exposed (limited fields) because that user is
 * the public-facing owner of the place. avatarUrl + providerStatus
 * help the UI render a small "managed by" affordance with the
 * existing provider styling.
 */
export interface PublicPlace {
  id: string
  neighborhoodId: string
  name: string
  category: PlaceListing['category']
  status: PlaceListing['status']
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
  imageUrls: string[]
  addedByCommunity: boolean
  claimedByUser: PublicClaimedUser | null
  /** Optional — populated only on the detail endpoint when the
   *  claimedByUser is a service provider with active items. */
  ownerServiceItems?: PublicServiceItem[]
  createdAt: string
  updatedAt: string
}

export interface PublicClaimedUser {
  id: string
  name: string | null
  avatarUrl: string | null
  providerStatus: User['providerStatus']
}

export interface PublicServiceItem {
  id: string
  title: string
  description: string | null
  price: number | null
  imageUrl: string | null
}

type PlaceWithRelations = PlaceListing & {
  claimedByUser?: (Pick<User, 'id' | 'name' | 'avatarUrl' | 'providerStatus'> & {
    serviceItems?: Pick<ServiceItem, 'id' | 'title' | 'description' | 'price' | 'imageUrl' | 'active' | 'sortOrder'>[]
  }) | null
}

/** Strip createdByUser entirely; include claimedByUser only with
 *  the public-safe field subset. Used by every non-mod endpoint. */
export function toPublicPlace(place: PlaceWithRelations): PublicPlace {
  const claimedByUser: PublicClaimedUser | null = place.claimedByUser
    ? {
        id: place.claimedByUser.id,
        name: place.claimedByUser.name,
        avatarUrl: place.claimedByUser.avatarUrl,
        providerStatus: place.claimedByUser.providerStatus,
      }
    : null

  const ownerServiceItems = place.claimedByUser?.serviceItems
    ? place.claimedByUser.serviceItems
        .filter((i) => i.active)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((i) => ({
          id: i.id,
          title: i.title,
          description: i.description,
          price: i.price,
          imageUrl: i.imageUrl,
        }))
    : undefined

  return {
    id: place.id,
    neighborhoodId: place.neighborhoodId,
    name: place.name,
    category: place.category,
    status: place.status,
    description: place.description,
    phone: place.phone,
    whatsapp: place.whatsapp,
    website: place.website,
    instagram: place.instagram,
    snapchat: place.snapchat,
    tiktok: place.tiktok,
    x: place.x,
    mapUrl: place.mapUrl,
    latitude: place.latitude,
    longitude: place.longitude,
    addressText: place.addressText,
    openingHours: place.openingHours,
    imageUrls: place.imageUrls,
    addedByCommunity: !!place.createdByUserId,
    claimedByUser,
    ownerServiceItems,
    createdAt: place.createdAt.toISOString(),
    updatedAt: place.updatedAt.toISOString(),
  }
}

/** Mod-facing shape — extends PublicPlace with the fields mods
 *  need for review / accountability. */
export interface ModPlace extends PublicPlace {
  createdByUser: { id: string; name: string | null } | null
  verifiedByMod: { id: string; name: string | null } | null
  verifiedAt: string | null
  rejectionReason: string | null
}

type PlaceWithModRelations = PlaceWithRelations & {
  createdByUser?: Pick<User, 'id' | 'name'> | null
  verifiedByMod?: Pick<User, 'id' | 'name'> | null
}

export function toModPlace(place: PlaceWithModRelations): ModPlace {
  const base = toPublicPlace(place)
  return {
    ...base,
    createdByUser: place.createdByUser
      ? { id: place.createdByUser.id, name: place.createdByUser.name }
      : null,
    verifiedByMod: place.verifiedByMod
      ? { id: place.verifiedByMod.id, name: place.verifiedByMod.name }
      : null,
    verifiedAt: place.verifiedAt ? place.verifiedAt.toISOString() : null,
    rejectionReason: place.rejectionReason,
  }
}
