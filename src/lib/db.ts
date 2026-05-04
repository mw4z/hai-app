import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

// Warn if DATABASE_URL is unset. Was a hard throw, but Codemagic's
// page-data collection step (which loads every route module to
// enumerate exports — but never queries the DB) doesn't have the
// env var and was failing the build. NEXT_PHASE / NEXT_RUNTIME both
// proved unreliable signals for "we're in the build phase".
//
// Safety net: if a deploy is genuinely missing DATABASE_URL at
// runtime, Prisma's adapter-pg throws a clear error on the first
// query ("no connection string"), so the misconfiguration doesn't go
// silent — it just surfaces on first request rather than at boot.
// That's a tiny regression in error-locality vs the previous throw,
// but it's the only way to keep CI builds green without injecting
// fake env vars into the build pipeline.
//
// The localhost-fallback footgun (the original reason this guard
// exists) is closed by NOT supplying a fallback: empty string +
// adapter-pg = explicit failure, no silent connection to a wrong DB.
if (!process.env.DATABASE_URL) {
  console.warn(
    '[DB] ⚠️  DATABASE_URL is unset. Module is loading anyway (likely a build-time scan). Any runtime query will fail.',
  )
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
