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
// CORS headers so the bundled offline.html (which loads from
// file:// inside the WebView) can probe this endpoint cross-origin.
// Without them, the browser blocks the fetch and the probe ALWAYS
// reports "still offline" even after connectivity is restored.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
} as const

export function GET() {
  return NextResponse.json(
    { ok: true, t: Date.now() },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'CDN-Cache-Control': 'no-store',
        ...CORS_HEADERS,
      },
    },
  )
}

export const HEAD = GET

// CORS preflight — some WebViews send OPTIONS for the probe even on
// a simple GET when the request originates from file://.
export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { ...CORS_HEADERS },
  })
}
