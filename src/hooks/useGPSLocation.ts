'use client'

import { useState, useCallback, useRef } from 'react'
import type { LocationDecision, LocationStatus } from '@/lib/location/types'
import { collectSamples } from '@/lib/location/web-collector'
import { makeDecision } from '@/lib/location/shared-decision'

export interface GPSResult {
  lat: number
  lng: number
  accuracy: number
  confidence: 'high' | 'medium' | 'low'
}

export type GPSError = 'denied' | 'unavailable' | 'timeout' | 'low_accuracy'

interface UseGPSLocationReturn {
  startCollecting: () => void
  cancel: () => void
  result: GPSResult | null
  error: GPSError | null
  status: LocationStatus
  collecting: boolean
  sampleCount: number
}

function statusToError(status: LocationStatus): GPSError | null {
  switch (status) {
    case 'denied': return 'denied'
    case 'unavailable': return 'unavailable'
    case 'timeout': return 'timeout'
    case 'low_accuracy': return 'low_accuracy'
    default: return null
  }
}

export function useGPSLocation(): UseGPSLocationReturn {
  const [result, setResult] = useState<GPSResult | null>(null)
  const [error, setError] = useState<GPSError | null>(null)
  const [status, setStatus] = useState<LocationStatus>('prompt')
  const [collecting, setCollecting] = useState(false)
  const [sampleCount, setSampleCount] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  const startCollecting = useCallback(() => {
    // Reset
    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort

    setResult(null)
    setError(null)
    setStatus('granted')
    setCollecting(true)
    setSampleCount(0)

    async function run() {
      const { samples, permissionState } = await collectSamples(
        (count) => setSampleCount(count),
        abort.signal,
      )

      if (abort.signal.aborted) return

      const decision = makeDecision(samples, permissionState)

      setStatus(decision.status)
      setCollecting(false)

      if (decision.sample) {
        setResult({
          lat: decision.sample.lat,
          lng: decision.sample.lng,
          accuracy: decision.sample.accuracy,
          confidence: decision.confidence!,
        })
        // For low_accuracy, still set result but also set error so UI can differentiate
        if (decision.status === 'low_accuracy') {
          setError('low_accuracy')
        }
      } else {
        setError(statusToError(decision.status))
      }
    }

    run()
  }, [])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setCollecting(false)
  }, [])

  return { startCollecting, cancel, result, error, status, collecting, sampleCount }
}
