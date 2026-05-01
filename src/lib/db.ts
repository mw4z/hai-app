import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

if (!process.env.DATABASE_URL) {
  // Hard fail rather than silently connecting to a localhost DB. Was
  // a "warn + use fallback string" before, which meant a misconfigured
  // production deploy would happily run against an unreachable local
  // DB and surface as cryptic ECONNREFUSED later.
  throw new Error('DATABASE_URL is required. Set it in your environment (Vercel project settings or .env) before booting.')
}
const DATABASE_URL = process.env.DATABASE_URL

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: DATABASE_URL })
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  } as any)
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
