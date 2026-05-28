import { Prisma } from '@prisma/client'

/**
 * Narrow predicate: returns true ONLY when the error indicates a
 * Square table does not exist yet in the database. This is the
 * transient state during the deploy → migration window:
 *
 *   1. Code is deployed referencing `db.squareMessage`.
 *   2. The manual migration file has not been applied yet.
 *   3. Any query against the table raises P2021 from Prisma /
 *      "undefined_table" (42P01) from Postgres.
 *
 * It is the ONLY error we want to swallow into an "empty Square"
 * fallback — every other Prisma / DB / runtime error must surface
 * (logged on the server, propagated to the caller) so a broken
 * connection pool, a syntax error, or an outage doesn't silently
 * render as an empty list forever.
 *
 * Usage:
 *
 *   try { rows = await db.squareMessage.findMany({ ... }) }
 *   catch (err) {
 *     if (isSquareTableMissingError(err)) {
 *       console.warn('[square] table missing — apply migration', err)
 *       rows = []
 *     } else {
 *       throw err   // SSR → Next.js error boundary; API → return 500
 *     }
 *   }
 */
export function isSquareTableMissingError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // Prisma's "Table {table} does not exist in the current database."
    return err.code === 'P2021'
  }
  return false
}
