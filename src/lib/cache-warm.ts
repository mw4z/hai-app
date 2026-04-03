/**
 * Pre-warm cache on server startup.
 * Loads frequently accessed data so first visitors don't wait.
 */
import { db } from '@/lib/db'
import { cacheSet } from '@/lib/cache'

let warmed = false

export async function warmCache() {
  if (warmed) return
  warmed = true

  try {
    console.log('[CACHE] Warming up...')

    // Pre-load all visible neighborhoods (used by picker)
    const neighborhoods = await db.neighborhood.findMany({
      where: { hidden: false },
      select: { id: true, name: true, nameEn: true, city: { select: { name: true, nameEn: true } } },
      orderBy: { name: 'asc' },
    })
    cacheSet('neighborhoods:all', neighborhoods, 300_000) // 5 min

    console.log(`[CACHE] Warmed: ${neighborhoods.length} neighborhoods`)
  } catch (e) {
    console.error('[CACHE] Warm-up failed:', e)
    warmed = false // allow retry
  }
}
