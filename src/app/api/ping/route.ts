import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Tiny reachability check used by the network layer.
 *
 * Returns 200 with a fixed body fast enough that a slow / captive-
 * portal response is the only thing distinguishing "we have wifi but
 * the backend is down" from "we have full connectivity". The client
 * times this out at ~3.5s — anything slower counts as unreachable.
 *
 * No DB calls, no auth, no logging — has to stay cheap because every
 * online client may hit it on visibilitychange, focus, or after a
 * failed request.
 */
export function GET() {
  return NextResponse.json(
    { ok: true, t: Date.now() },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'CDN-Cache-Control': 'no-store',
      },
    },
  )
}

export const HEAD = GET
