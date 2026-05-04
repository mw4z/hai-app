import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

// Hard fail rather than silently connecting to a localhost DB. Was
// a "warn + use fallback string" before, which meant a misconfigured
// production deploy would happily run against an unreachable local
// DB and surface as cryptic ECONNREFUSED later.
//
// Build-phase exception: Next.js's static page-data collection step
// loads every route module at build time even though the DB never
// gets queried. NEXT_PHASE === 'phase-production-build' identifies
// that pass; CI environments (like Codemagic) don't expose
// DATABASE_URL during the web-app build, so we let the import
// succeed there and defer the throw until an actual route runs.
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build'

if (!process.env.DATABASE_URL && !isBuildPhase) {
  throw new Error('DATABASE_URL is required. Set it in your environment (Vercel project settings or .env) before booting.')
}
const DATABASE_URL = process.env.DATABASE_URL || ''

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  // During the build phase the URL is "" — Prisma's adapter-pg lazily
  // resolves the connection string on first query, so constructing the
  // client doesn't actually connect. Any route that runs at request
  // time will have DATABASE_URL set (Vercel injects it), at which
  // point queries succeed normally.
  const adapter = new PrismaPg({ connectionString: DATABASE_URL })
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  } as any)
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
