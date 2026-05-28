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
  // POOL CONFIG (added after the second EMAXCONN incident):
  //   - max = 4: each serverless instance keeps at most 4 sockets to
  //     Postgres. Supabase's pooled tier caps at 200 concurrent
  //     connections; with Vercel autoscaling across N warm instances,
  //     a per-instance cap of 4 lets ~50 warm instances coexist
  //     before saturating the backend (50 × 4 = 200). Previously
  //     uncapped — each instance could grab as many sockets as the
  //     pg pool would hand out, and a small traffic burst exhausted
  //     the whole pool.
  //   - idleTimeoutMillis = 10s: aggressive recycle so cold
  //     instances release their pool quickly instead of holding
  //     sockets nothing is using.
  //   - connectionTimeoutMillis = 5s: fail fast if the pool is
  //     genuinely exhausted, instead of queueing requests and
  //     piling on backend pressure.
  const adapter = new PrismaPg({
    connectionString: DATABASE_URL,
    max: 4,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  } as any)
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  } as any)
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
