import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const ua = req.headers.get('user-agent') || ''

  // Allow native app requests (Capacitor adds "HaiNativeApp" to user-agent)
  if (ua.includes('HaiNativeApp')) return NextResponse.next()

  // Redirect browser users to the landing page
  return NextResponse.redirect('https://hai-app.net')
}

export const config = {
  // Only apply to page routes — skip API, static files, public pages, invite
  // links, and public share pages (/s/...) so shared links render a preview
  // instead of bouncing browser visitors to the marketing site.
  matcher: [
    '/((?!api|_next|favicon|icons|images|manifest|sw|workbox|privacy|contact|child-safety|i/|s/|\\.well-known|.*\\.).*)',
  ],
}
