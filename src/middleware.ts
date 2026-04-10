import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const ua = req.headers.get('user-agent') || ''

  // Allow native app requests (Capacitor adds "HaiNativeApp" to user-agent)
  if (ua.includes('HaiNativeApp')) return NextResponse.next()

  // Redirect browser users to the landing page
  return NextResponse.redirect('https://hai-app.net')
}

export const config = {
  // Only apply to page routes — skip API, static files, images, etc.
  matcher: [
    '/((?!api|_next|favicon|icons|images|manifest|sw|workbox|.*\\.).*)',
  ],
}
