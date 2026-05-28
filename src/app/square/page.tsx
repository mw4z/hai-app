import { redirect, notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { isSquareAdminRole } from '@/lib/square/isSquareAdmin'
import { isSquareTableMissingError } from '@/lib/square/migrationGate'
import {
  serializeSquareMessage,
  type PublicSquareMessage,
} from '@/lib/square/serializeMessage'
import SquareFeedClient from './SquareFeedClient'

export const dynamic = 'force-dynamic'

/**
 * Square (ساحة الحي) — single shared neighborhood message space.
 * Admin-only in MVP; non-admins get notFound() (matches the /mod
 * convention — we don't advertise the feature's existence yet).
 *
 * SSR seeds the most-recent page so the first paint already shows
 * content; client paginates older on scroll-up.
 */
const PAGE_SIZE = 30

export default async function SquarePage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true, role: true, neighborhoodId: true,
      neighborhood: { select: { name: true, nameEn: true } },
    },
  })
  if (!user) redirect('/login')
  if (!user.neighborhoodId) notFound()
  if (!isSquareAdminRole(user.role)) notFound()

  // ONLY the "SquareMessage table doesn't exist yet" case is swallowed
  // into the empty-state render — that's the brief deploy → migration
  // window where ungated rendering would 500 on every admin tap.
  // Every OTHER Prisma / DB / runtime error is re-thrown so Next.js's
  // error boundary handles it (no silent empty Square).
  // Lambda wrapper preserves the include shape for the serializer.
  const fetchRecent = () => db.squareMessage.findMany({
    where: {
      neighborhoodId: user.neighborhoodId!,
      status: 'ACTIVE' as const,
    },
    orderBy: { createdAt: 'desc' as const },
    take: PAGE_SIZE + 1,
    include: {
      author: {
        select: {
          id: true, name: true, lastName: true, avatarUrl: true,
          reputation: true, membership: true, role: true,
        },
      },
      replyTo: {
        select: {
          id: true, authorId: true, body: true, status: true,
          author: { select: { name: true, lastName: true } },
        },
      },
    },
  })
  let rows: Awaited<ReturnType<typeof fetchRecent>> = []
  try {
    rows = await fetchRecent()
  } catch (err) {
    if (isSquareTableMissingError(err)) {
      console.warn('[square] table missing — empty state (apply migration)', err)
      // rows stays []
    } else {
      throw err
    }
  }

  const hasMoreOlder = rows.length > PAGE_SIZE
  const slice = hasMoreOlder ? rows.slice(0, PAGE_SIZE) : rows
  // Server returns desc; reverse to ascending so the client can append
  // at the bottom and prepend at the top without shuffling.
  const ascending = [...slice].reverse()
  const initialMessages: PublicSquareMessage[] = ascending.map((row) =>
    serializeSquareMessage(row, { viewerId: user.id }),
  )

  return (
    <SquareFeedClient
      initialMessages={initialMessages}
      hasMoreOlder={hasMoreOlder}
      neighborhoodName={user.neighborhood?.name ?? ''}
      currentUserId={user.id}
    />
  )
}
