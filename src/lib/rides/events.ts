/**
 * Ride event logging — append-only audit trail.
 *
 * Every important action is recorded as a RideEvent.
 * Events are immutable once written.
 */

import { db } from '@/lib/db'

export type RideEventType =
  | 'REQUEST_CREATED'
  | 'OFFER_SUBMITTED'
  | 'OFFER_WITHDRAWN'
  | 'OFFER_REJECTED'
  | 'OFFER_SELECTED'
  | 'OFFERS_PASSED'
  | 'DRIVER_CONFIRMED'
  | 'DRIVER_EN_ROUTE'
  | 'DRIVER_ARRIVED'
  | 'TRIP_STARTED'
  | 'DRIVER_MARKED_DONE'
  | 'REQUESTER_CONFIRMED_DONE'
  | 'AUTO_COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'DISPUTE_OPENED'
  | 'DISPUTE_RESOLVED'
  | 'TIMEOUT_REOPEN'
  | 'NOSHOW_CANCEL'
  | 'RATING_SUBMITTED'
  | 'INVALID_TRANSITION'
  | 'OFFER_UPDATED'
  | 'STALE_CANCEL'
  | 'STALE_DISPUTED'

export type ActorType = 'requester' | 'driver' | 'system' | 'admin'

interface LogEventParams {
  rideRequestId: string
  tripId?: string | null
  eventType: RideEventType
  actorType: ActorType
  actorId?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Log a ride event. Fire-and-forget by default to avoid blocking the main flow.
 * Use `await logRideEvent(...)` when audit is critical (e.g., cancellations).
 */
export async function logRideEvent(params: LogEventParams): Promise<void> {
  await db.rideEvent.create({
    data: {
      rideRequestId: params.rideRequestId,
      tripId: params.tripId ?? null,
      eventType: params.eventType,
      actorType: params.actorType,
      actorId: params.actorId ?? null,
      metadata: (params.metadata ?? undefined) as any,
    },
  })
}

/**
 * Log an invalid transition attempt (for debugging/security).
 */
export async function logInvalidTransition(
  rideRequestId: string,
  actorId: string,
  actorType: ActorType,
  fromStatus: string,
  toStatus: string,
  error: string,
): Promise<void> {
  await logRideEvent({
    rideRequestId,
    eventType: 'INVALID_TRANSITION',
    actorType,
    actorId,
    metadata: { fromStatus, toStatus, error },
  })
}
