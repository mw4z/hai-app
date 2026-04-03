/**
 * Balady migration report — shows the status of neighborhood data migration.
 * Usage: npx tsx scripts/migration-report.ts
 */

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const DATABASE_URL = 'postgresql://postgres:1999**@localhost:5432/hai_db'
const adapter = new PrismaPg({ connectionString: DATABASE_URL })
const db = new PrismaClient({ adapter } as any)

async function main() {
  const all = await db.neighborhood.findMany({
    include: { city: { select: { name: true } }, _count: { select: { users: true, posts: true } } },
    orderBy: [{ city: { name: 'asc' } }, { name: 'asc' }],
  })

  const balady = all.filter((n: any) => n.source === 'balady')
  const legacy = all.filter((n: any) => n.source === 'legacy' || !n.source)
  const withBoundary = all.filter((n: any) => n.boundary !== null)
  const withUsers = legacy.filter((n: any) => n._count.users > 0)
  const withPosts = legacy.filter((n: any) => n._count.posts > 0)

  console.log('═══════════════════════════════════════════════════')
  console.log('  BALADY MIGRATION REPORT')
  console.log('═══════════════════════════════════════════════════\n')

  console.log(`  Total neighborhoods:     ${all.length}`)
  console.log(`  Balady-backed:           ${balady.length} (${Math.round(balady.length / all.length * 100)}%)`)
  console.log(`  Legacy-only:             ${legacy.length}`)
  console.log(`  With polygon boundary:   ${withBoundary.length}`)
  console.log(`  Without boundary:        ${all.length - withBoundary.length}\n`)

  console.log('── LEGACY NEIGHBORHOODS (need migration) ────────\n')

  if (legacy.length === 0) {
    console.log('  🎉 None! All neighborhoods are Balady-backed.\n')
  } else {
    for (const n of legacy) {
      const hasUsers = (n as any)._count.users > 0
      const hasPosts = (n as any)._count.posts > 0
      const flag = hasUsers || hasPosts ? '⚠️  HAS DATA' : '   empty'
      console.log(`  ${flag}  ${n.name} (${n.nameEn}) — ${(n as any).city.name}`)
      if (hasUsers) console.log(`           users: ${(n as any)._count.users}`)
      if (hasPosts) console.log(`           posts: ${(n as any)._count.posts}`)
    }
  }

  console.log('\n── BLOCKING ISSUES ──────────────────────────────\n')

  if (withUsers.length > 0) {
    console.log(`  ⚠️  ${withUsers.length} legacy neighborhoods have active users:`)
    for (const n of withUsers) {
      console.log(`     - ${n.name} (${(n as any).city.name}): ${(n as any)._count.users} users`)
    }
    console.log('     → These need manual Balady matching before they can be removed.\n')
  } else {
    console.log('  ✅ No legacy neighborhoods have users.\n')
  }

  if (withPosts.length > 0) {
    console.log(`  ⚠️  ${withPosts.length} legacy neighborhoods have posts:`)
    for (const n of withPosts) {
      console.log(`     - ${n.name} (${(n as any).city.name}): ${(n as any)._count.posts} posts`)
    }
    console.log('     → Posts need to be migrated to Balady neighborhoods.\n')
  } else {
    console.log('  ✅ No legacy neighborhoods have posts.\n')
  }

  console.log('── READY TO REMOVE LEGACY? ──────────────────────\n')

  const canRemove = withUsers.length === 0 && withPosts.length === 0
  if (canRemove) {
    console.log('  ✅ YES — All legacy neighborhoods are empty.')
    console.log('     Safe to delete legacy-only entries.\n')
  } else {
    console.log('  ❌ NO — Some legacy neighborhoods have active data.')
    console.log('     Complete manual mapping first.\n')
  }
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
