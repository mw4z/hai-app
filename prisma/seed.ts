import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

// Load .env.local for seed script
function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return
  const content = fs.readFileSync(filePath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let val = trimmed.slice(eqIdx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}
loadEnvFile(path.resolve('.env.local'))
loadEnvFile(path.resolve('.env'))

const DATABASE_URL = process.env.DIRECT_URL || process.env.DATABASE_URL || 'postgresql://postgres:1999**@localhost:5432/hai_db'
const adapter = new PrismaPg({ connectionString: DATABASE_URL })
const prisma = new PrismaClient({ adapter } as any)

const CITIES = [
  { name: 'مكة المكرمة', nameEn: 'Mecca' },
  { name: 'جدة',         nameEn: 'Jeddah' },
  { name: 'الرياض',      nameEn: 'Riyadh' },
]

async function main() {
  console.log('🌱 Seeding database...\n')

  // Clear in dependency order
  await prisma.notification.deleteMany()
  await prisma.message.deleteMany()
  await prisma.thread.deleteMany()
  await prisma.reaction.deleteMany()
  await prisma.comment.deleteMany()
  await prisma.report.deleteMany()
  await prisma.payment.deleteMany()
  await prisma.post.deleteMany()
  await prisma.otpCode.deleteMany()
  await prisma.maintenanceRequest.deleteMany()
  await prisma.announcement.deleteMany()
  await prisma.compound.deleteMany()
  await prisma.user.deleteMany()
  await prisma.neighborhood.deleteMany()
  await prisma.city.deleteMany()

  for (const city of CITIES) {
    await prisma.city.create({ data: city })
    console.log(`✅ ${city.name}`)
  }

  console.log('\n🗺️  Loading Balady neighborhoods...\n')

  // Automatically run the Balady fetch script
  try {
    execSync('npx tsx scripts/fetch-boundaries.ts', { stdio: 'inherit', cwd: process.cwd() })
  } catch (e) {
    console.error('⚠️  Balady fetch failed. Run manually: npx tsx scripts/fetch-boundaries.ts')
  }

  console.log('\n✅ Seed complete!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
