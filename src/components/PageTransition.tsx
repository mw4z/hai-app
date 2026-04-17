'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

/**
 * Animates page content on every navigation. The `key` on pathname forces
 * a remount of the wrapper, which retriggers the CSS animation. Subtle and
 * short so it doesn't feel sluggish — 180ms ease-out fade + slight slide.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  return (
    <div key={pathname} className="page-transition">
      {children}
    </div>
  )
}
