import { notFound } from 'next/navigation'
import { directoryServerMode } from './featureFlag'
import { isDirectoryModerator } from './isDirectoryModerator'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'

/** Server-page equivalent of routeGate.gatePublicRoute. Calls
 *  Next.js notFound() to render the standard 404 page when the
 *  caller isn't allowed. */
export function ssrPublicGateOrNotFound(role: string | null | undefined): void {
  const mode = directoryServerMode()
  if (mode === 'on') return
  if (mode === 'admin') {
    if (!isDirectoryModerator(role)) notFound()
    return
  }
  if (!isSuperAdminRole(role)) notFound()
}
