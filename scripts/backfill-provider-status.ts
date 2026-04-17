/**
 * Backfill `providerStatus` on existing users.
 *
 * Policy:
 *   accountType === VERIFIED_PROVIDER → providerStatus = VERIFIED
 *   accountType === SERVICE_PROVIDER  → providerStatus = computeProviderStatus(user)
 *                                       (i.e. ACTIVE if quality gate passes, else PENDING)
 *   accountType === NORMAL            → providerStatus = NONE
 *
 * Safety rules:
 *   - Idempotent: rows already at the desired state are skipped.
 *   - Never downgrades an existing VERIFIED user, regardless of drift — admin
 *     verification is authoritative.
 *   - Uses the same `computeProviderStatus` helper the runtime apply endpoint
 *     uses, so the backfill and live traffic agree on what "quality" means.
 *
 * Usage:
 *   npx tsx scripts/backfill-provider-status.ts           # apply writes
 *   npx tsx scripts/backfill-provider-status.ts --dry-run # preview only
 */

import fs from 'fs'
import path from 'path'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import type { ProviderStatus } from '@prisma/client'
import { computeProviderStatus } from '../src/lib/provider'

// Load env from .env.local / .env so DATABASE_URL is available when run via tsx
function loadEnvFile(p: string) {
  if (!fs.existsSync(p)) return
  for (const raw of fs.readFileSync(p, 'utf-8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}
loadEnvFile(path.resolve(process.cwd(), '.env.local'))
loadEnvFile(path.resolve(process.cwd(), '.env'))

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
} as any)
const BATCH_SIZE = 200
const DRY_RUN = process.argv.includes('--dry-run')

type StatusKey = 'NONE' | 'PENDING' | 'ACTIVE' | 'VERIFIED'

function emptyCounts(): Record<StatusKey, number> {
  return { NONE: 0, PENDING: 0, ACTIVE: 0, VERIFIED: 0 }
}

const LOCK_KEY = 7731042

async function main() {
  if (DRY_RUN) {
    console.log('[DRY-RUN] No writes will be made.')
  } else {
    console.log('Applying changes to database...')
    const lock = await db.$queryRaw<Array<{ got: boolean }>>`
      SELECT pg_try_advisory_lock(${LOCK_KEY}) AS got
    `
    if (!lock[0]?.got) {
      throw new Error('migration_lock_held: another backfill is already running')
    }
  }

  const written = emptyCounts()      // rows we actually wrote, grouped by new status
  const finalDist = emptyCounts()    // full distribution across all users at end of run
  let skippedAlreadyCorrect = 0
  let skippedVerifiedSafety = 0
  let processed = 0
  let cursor: string | undefined = undefined

  // Cursor-paginated scan — avoids loading the whole users table into memory.
  async function nextBatch(afterId: string | undefined) {
    return db.user.findMany({
      take: BATCH_SIZE,
      ...(afterId ? { skip: 1, cursor: { id: afterId } } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        accountType: true,
        providerStatus: true,
        serviceDescription: true,
        serviceAddress: true,
        serviceLat: true,
        serviceLng: true,
      },
    })
  }

  while (true) {
    const users = await nextBatch(cursor)
    if (users.length === 0) break
    cursor = users[users.length - 1].id

    const updates: Array<{ id: string; desired: ProviderStatus }> = []

    for (const user of users) {
      processed++

      // Decide desired status. Single source of truth for the quality gate:
      // the same helper used by /api/provider/apply at runtime.
      let desired: ProviderStatus
      if (user.accountType === 'VERIFIED_PROVIDER') {
        desired = 'VERIFIED'
      } else if (user.accountType === 'SERVICE_PROVIDER') {
        desired = computeProviderStatus({
          serviceDescription: user.serviceDescription,
          serviceAddress: user.serviceAddress,
          serviceLat: user.serviceLat,
          serviceLng: user.serviceLng,
        })
      } else {
        desired = 'NONE'
      }

      // Safety: never downgrade a VERIFIED user. Admin verification is the
      // authoritative signal, even if accountType drifted away from VERIFIED_PROVIDER.
      if (user.providerStatus === 'VERIFIED' && desired !== 'VERIFIED') {
        skippedVerifiedSafety++
        finalDist.VERIFIED++
        continue
      }

      // Idempotency: row is already at the target state, nothing to do.
      if (user.providerStatus === desired) {
        skippedAlreadyCorrect++
        finalDist[desired as StatusKey]++
        continue
      }

      updates.push({ id: user.id, desired })
      finalDist[desired as StatusKey]++
    }

    if (updates.length > 0 && !DRY_RUN) {
      // Batch all writes for this page in a single transaction so a partial
      // failure rolls back cleanly and the script can be rerun.
      await db.$transaction(
        updates.map((u) =>
          db.user.update({
            where: { id: u.id },
            data: { providerStatus: u.desired },
          }),
        ),
      )
    }

    for (const u of updates) written[u.desired as StatusKey]++

    console.log(
      `Batch done: processed=${processed}, writes_in_batch=${updates.length} ` +
      `(written_total: N=${written.NONE} P=${written.PENDING} A=${written.ACTIVE} V=${written.VERIFIED})`,
    )
  }

  console.log('\n=== Summary ===')
  console.log(`Total users processed:       ${processed}`)
  console.log(`Skipped (already correct):   ${skippedAlreadyCorrect}`)
  console.log(`Skipped (VERIFIED safety):   ${skippedVerifiedSafety}`)
  console.log('')
  console.log('Rows written by new status:')
  console.log(`  NONE:     ${written.NONE}`)
  console.log(`  PENDING:  ${written.PENDING}`)
  console.log(`  ACTIVE:   ${written.ACTIVE}`)
  console.log(`  VERIFIED: ${written.VERIFIED}`)
  console.log('')
  console.log('Final distribution of providerStatus across all users:')
  console.log(`  NONE:     ${finalDist.NONE}`)
  console.log(`  PENDING:  ${finalDist.PENDING}`)
  console.log(`  ACTIVE:   ${finalDist.ACTIVE}`)
  console.log(`  VERIFIED: ${finalDist.VERIFIED}`)
  if (DRY_RUN) console.log('\n[DRY-RUN] No changes were written.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
