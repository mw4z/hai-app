'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/** Reset scroll to top on every route change — prevents scroll leaking between pages */
export default function ScrollReset() {
  const pathname = usePathname()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}
