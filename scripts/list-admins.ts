/**
 * One-off diagnostic. Dumps admin roster + pending user-reports.
 * Usage:  npx tsx scripts/list-admins.ts
 */
import { db } from '../src/lib/db'

async function main() {
  // First, list all tables so we can verify UserReport exists
  const tables = await db.$queryRawUnsafe<{ table_name: string }[]>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name",
  )
  console.log('===== TABLES IN public SCHEMA =====')
  for (const t of tables) console.log('  ' + t.table_name)
  console.log()

  const admins = await db.user.findMany({
    where: {
      status: 'ACTIVE',
      role: { in: ['SUPER_ADMIN', 'PLATFORM_MOD', 'NEIGHBORHOOD_MOD'] },
    },
    select: {
      id: true,
      name: true,
      phone: true,
      role: true,
      neighborhoodId: true,
      neighborhood: { select: { name: true, nameEn: true } },
    },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  })

  console.log('===== ADMIN ROSTER =====')
  for (const a of admins) {
    const nbhd = a.neighborhood
      ? `${a.neighborhood.name} / ${a.neighborhood.nameEn || '-'}`
      : '(no neighborhood)'
    console.log(
      [
        a.role.padEnd(18),
        (a.name || '(no name)').padEnd(20),
        (a.phone || '(no phone)').padEnd(15),
        `nbhd=${a.neighborhoodId || '-'}`,
        `[${nbhd}]`,
      ].join('  '),
    )
  }
  console.log(`\nTotal: ${admins.length} active admins\n`)

  // Try UserReport only if the table exists
  const hasUserReport = tables.some((t) => t.table_name === 'UserReport')
  if (!hasUserReport) {
    console.log('⚠️  UserReport table does not exist in public schema.')
    console.log('   Run: npx prisma db push')
    await db.$disconnect()
    return
  }

  const pending = await db.userReport.findMany({
    where: { status: 'PENDING' },
    select: {
      id: true,
      reason: true,
      createdAt: true,
      reportedUser: {
        select: { id: true, name: true, neighborhoodId: true, neighborhood: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  console.log('===== PENDING USER REPORTS (latest 20) =====')
  for (const r of pending) {
    console.log(
      [
        new Date(r.createdAt).toISOString(),
        r.reason.padEnd(22),
        `reported=${r.reportedUser?.name || '?'}`,
        `nbhd=${r.reportedUser?.neighborhoodId || '-'} (${r.reportedUser?.neighborhood?.name || '-'})`,
      ].join('  '),
    )
  }
  console.log(`\nTotal pending: ${pending.length}\n`)

  await db.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
