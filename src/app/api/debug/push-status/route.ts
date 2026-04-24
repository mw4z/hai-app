import { NextResponse } from 'next/server'
import { loadApnsCredentials } from '@/lib/apns'
import { loadFcmCredentials } from '@/lib/fcm'

export const dynamic = 'force-dynamic'

/**
 * Unauthenticated status peek — returns ONLY whether each push provider
 * is configured on the server. No tokens, no user data, no secrets.
 * Safe to hit from any browser to verify env vars were saved and the
 * latest deploy picked them up.
 */
export async function GET() {
  const apns = loadApnsCredentials()
  const fcm = loadFcmCredentials()

  return NextResponse.json({
    apns: {
      configured: !!apns,
      keyId: apns?.keyId ?? null,
      teamId: apns?.teamId ?? null,
      bundleId: apns?.bundleId ?? null,
      env: apns?.env ?? null,
    },
    fcm: {
      configured: !!fcm,
      projectId: fcm?.projectId ?? null,
    },
  })
}
