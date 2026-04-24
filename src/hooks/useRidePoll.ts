'use client'

import { useState, useEffect, useCallback } from 'react'

interface PollData {
  status: string
  offerCount: number
  confirmDeadline: string | null
  isLate: boolean
  autoCloseAt: string | null
  trip: {
    confirmedAt: string | null
    enRouteAt: string | null
    arrivedAt: string | null
    startedAt: string | null
    driverMarkedDoneAt: string | null
    completedAt: string | null
    completionMode: string | null
    cancelledAt: string | null
  } | null
  lastMessageAt: string | null
  myOfferStatus: 'OFFER_PENDING' | 'OFFER_ACCEPTED' | 'OFFER_PASSED' | 'OFFER_WITHDRAWN' | null
}

const TERMINAL_STATES = ['RIDE_COMPLETED', 'RIDE_CANCELLED', 'RIDE_EXPIRED']

/**
 * Poll a ride's status every `intervalMs` (default 3s).
 * Stops polling on terminal states.
 */
export function useRidePoll(rideId: string, intervalMs = 3000) {
  const [data, setData] = useState<PollData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/rides/${rideId}/poll`)
      if (!res.ok) return
      const d = await res.json()
      setData(d)
      setError(null)
    } catch {
      setError('Connection error')
    }
  }, [rideId])

  useEffect(() => {
    poll() // initial fetch
    const id = setInterval(() => {
      if (data && TERMINAL_STATES.includes(data.status)) return
      poll()
    }, intervalMs)
    return () => clearInterval(id)
  }, [poll, intervalMs, data?.status])

  return { data, error, refetch: poll }
}
