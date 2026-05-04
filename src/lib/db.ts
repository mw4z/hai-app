import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

// Hard fail rather than silently connecting to a localhost DB. Was
// a "warn + use fallback string" before, which meant a misconfigured
// production deploy would happily run against an unreachable local
// DB and surface as cryptic ECONNREFUSED later.
//
// Runtime-only check: NEXT_RUNTIME is set by Next.js to 'nodejs' (or
// 'edge') only when the module is loaded inside a request handler.
// During `next build`'s page-data collection step (which loads every
// route module to enumerate exports — but never queries the DB),
// NEXT_RUNTIME is unset, so we skip the throw. Any genuine
// runtime-with-no-DATABASE_URL still trips the guard on first request.
//
// We also skip if NODE_ENV is 'test' to allow the Vitest / node:test
// suites to import this module for snapshots without a live DB.
const isRuntime = !!process.env.NEXT_RUNTIME
const isTest = process.env.NODE_ENV === 'test'

if (!process.env.DATABASE_URL && isRuntime && !isTest) {
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
