/**
 * Ride-specific notification helper.
 * Wraps the existing notification system with ride-aware defaults.
 */

import { db } from '@/lib/db'

interface RideNotifyParams {
  userId: string
  type: 'RIDE_OFFER' | 'RIDE_STATUS' | 'RIDE_MESSAGE' | 'RIDE_RATING'
  titleAr: string
  titleEn: string
  bodyAr: string
  bodyEn: string
  actorId: string
  rideRequestId: string
}

export async function notifyRide(params: RideNotifyParams): Promise<void> {
  await db.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      actorId: params.actorId,
      title: params.titleAr,
      titleEn: params.titleEn,
      body: params.bodyAr,
      bodyEn: params.bodyEn,
      rideRequestId: params.rideRequestId,
    },
  })
}

/**
 * Notify requester about a new offer.
 */
export async function notifyNewOffer(
  requesterId: string,
  driverId: string,
  driverName: string,
  rideRequestId: string,
  price: number,
): Promise<void> {
  await notifyRide({
    userId: requesterId,
    type: 'RIDE_OFFER',
    titleAr: 'عرض جديد على طلبك',
    titleEn: 'New offer on your ride',
    bodyAr: `${driverName} عرض ${price} ريال`,
    bodyEn: `${driverName} offered ${price} SAR`,
    actorId: driverId,
    rideRequestId,
  })
}

/**
 * Notify driver that they were selected.
 */
export async function notifyDriverSelected(
  driverId: string,
  requesterId: string,
  rideRequestId: string,
): Promise<void> {
  await notifyRide({
    userId: driverId,
    type: 'RIDE_STATUS',
    titleAr: 'تم اختيارك!',
    titleEn: 'You were selected!',
    bodyAr: 'أكّد خلال 5 دقائق',
    bodyEn: 'Confirm within 5 minutes',
    actorId: requesterId,
    rideRequestId,
  })
}

/**
 * Notify other drivers that they were passed.
 */
export async function notifyOffersPassed(
  driverIds: string[],
  rideRequestId: string,
): Promise<void> {
  for (const driverId of driverIds) {
    await notifyRide({
      userId: driverId,
      type: 'RIDE_STATUS',
      titleAr: 'تم اختيار شخص آخر',
      titleEn: 'Another person was selected',
      bodyAr: 'يمكنك تقديم عروض على طلبات أخرى',
      bodyEn: 'You can submit offers on other rides',
      actorId: 'system',
      rideRequestId,
    })
  }
}

/**
 * Notify requester of a status change.
 */
export async function notifyRequesterStatus(
  requesterId: string,
  driverId: string,
  rideRequestId: string,
  titleAr: string,
  titleEn: string,
  bodyAr: string,
  bodyEn: string,
): Promise<void> {
  await notifyRide({
    userId: requesterId,
    type: 'RIDE_STATUS',
    titleAr, titleEn, bodyAr, bodyEn,
    actorId: driverId,
    rideRequestId,
  })
}

/**
 * Notify both parties of trip completion.
 */
export async function notifyTripCompleted(
  requesterId: string,
  driverId: string,
  rideRequestId: string,
): Promise<void> {
  const titleAr = 'اكتمل المشوار'
  const titleEn = 'Ride completed'
  const bodyAr = 'قيّم تجربتك'
  const bodyEn = 'Rate your experience'

  await Promise.all([
    notifyRide({ userId: requesterId, type: 'RIDE_STATUS', titleAr, titleEn, bodyAr, bodyEn, actorId: driverId, rideRequestId }),
    notifyRide({ userId: driverId, type: 'RIDE_STATUS', titleAr, titleEn, bodyAr, bodyEn, actorId: requesterId, rideRequestId }),
  ])
}

/**
 * Notify requester of driver confirm timeout.
 */
export async function notifyConfirmTimeout(
  requesterId: string,
  rideRequestId: string,
): Promise<void> {
  await notifyRide({
    userId: requesterId,
    type: 'RIDE_STATUS',
    titleAr: 'لم يتم الرد',
    titleEn: 'No response received',
    bodyAr: 'طلبك مفتوح مجدداً للعروض',
    bodyEn: 'Your request is open for offers again',
    actorId: 'system',
    rideRequestId,
  })
}
