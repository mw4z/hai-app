import type { PlaceListing, ServiceItem, User } from '@prisma/client'
import type { GooglePeriodLike } from './openState'

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
  /** Owner-editable status override; null = use auto pill from
   *  openingHours. Shown verbatim when active. */
  manualStatus: string | null
  /** ISO timestamp. When set AND in the past, readers ignore
   *  manualStatus and fall back to the auto pill. */
  manualStatusUntil: string | null
  /** Denormalized review summary — averaged from VISIBLE
   *  reviews only, one decimal. 0 / 0 when no reviews. */
  ratingAvg: number
  ratingCount: number
  imageUrls: string[]
  addedByCommunity: boolean
  /** Where the listing's data came from. 'GOOGLE' rows carry the
   *  Google snapshot below + require the "from Google" attribution
   *  badge; 'LOCAL' rows show the community badge. */
  source: 'LOCAL' | 'GOOGLE'
  /** Google rating snapshot (attribution-required). null on LOCAL. */
  googleRating: number | null
  googleRatingCount: number | null
  /** Google opening hours — weekdayDescriptions joined by \n (per-day display). */
  googleHours: string | null
  /** Raw Google periods — drives the open/closed pill on Google places. */
  googlePeriods: GooglePeriodLike[]
  /** Google photo resource names — render via /api/places/photo. */
  googlePhotoRefs: string[]
  /** Up to 5 Google reviews snapshot (attribution-required). */
  googleReviews: GoogleReviewPublic[]
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

export interface GoogleReviewPublic {
  author: string | null
  rating: number | null
  text: string | null
  relativeTime: string | null
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
    manualStatus: place.manualStatus,
    manualStatusUntil: place.manualStatusUntil
      ? place.manualStatusUntil.toISOString()
      : null,
    ratingAvg: place.ratingAvg,
    ratingCount: place.ratingCount,
    imageUrls: place.imageUrls,
    addedByCommunity: !!place.createdByUserId,
    source: place.source,
    googleRating: place.googleRating,
    googleRatingCount: place.googleRatingCount,
    googleHours: place.googleHours,
    googlePeriods: Array.isArray(place.googlePeriods)
      ? (place.googlePeriods as unknown as GooglePeriodLike[])
      : [],
    googlePhotoRefs: place.googlePhotoRefs,
    googleReviews: Array.isArray(place.googleReviews)
      ? (place.googleReviews as unknown as GoogleReviewPublic[])
      : [],
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
