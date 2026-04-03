/**
 * Promote a user to admin role.
 * Usage: npx tsx scripts/make-admin.ts 05XXXXXXXX SUPER_ADMIN
 *
 * Roles: SUPER_ADMIN | PLATFORM_MOD | NEIGHBORHOOD_MOD
 */

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const DATABASE_URL = 'postgresql://postgres:1999**@localhost:5432/hai_db'
const adapter = new PrismaPg({ connectionString: DATABASE_URL })
const db = new PrismaClient({ adapter } as any)

const VALID_ROLES = ['SUPER_ADMIN', 'PLATFORM_MOD', 'NEIGHBORHOOD_MOD', 'RESIDENT']

async function main() {
  const phone = process.argv[2]
  const role = process.argv[3]

  if (!phone || !role) {
    console.log('Usage: npx tsx scripts/make-admin.ts <phone> <role>')
    console.log('Roles:', VALID_ROLES.join(', '))
    process.exit(1)
  }

  if (!VALID_ROLES.includes(role)) {
    console.error(`Invalid role: ${role}. Must be one of: ${VALID_ROLES.join(', ')}`)
    process.exit(1)
  }

  // Try multiple formats
  const variants = [
    phone,
    phone.startsWith('0') ? '+966' + phone.slice(1) : phone,
    phone.startsWith('+966') ? '0' + phone.slice(4) : phone,
  ]

  let user = null
  for (const v of variants) {
    user = await db.user.findUnique({ where: { phone: v } })
    if (user) break
  }

  if (!user) {
    console.error(`User not found. Tried: ${variants.join(', ')}`)
    process.exit(1)
  }

  await db.user.update({
    where: { id: user.id },
    data: { role: role as any },
  })

  console.log(`✅ ${user.name || phone} → ${role}`)
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
