import { redirect, notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { isSquareAdminRole } from '@/lib/square/isSquareAdmin'
import { serializeSquareThread, type PublicSquareThread } from '@/lib/square/serializeThread'
import SquareListClient from './SquareListClient'

export const dynamic = 'force-dynamic'

/**
 * Square (ساحة الحي) list page. Admin-only in MVP — non-admins get
 * notFound() (matches the /mod/pinned convention; we don't advertise
 * the feature's existence to users it isn't open for yet).
 *
 * SSR seeds the first page of threads (PINNED first, then by
 * lastActivityAt desc) so first paint has content; client component
 * handles paginated load-more.
 */
const PAGE_SIZE = 20

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

  const rows = await db.squareThread.findMany({
    where: {
      neighborhoodId: user.neighborhoodId,
      status: 'ACTIVE',
    },
    orderBy: [
      { isPinned: 'desc' },
      { lastActivityAt: 'desc' },
    ],
    take: PAGE_SIZE + 1,
    include: {
      author: {
        select: {
          id: true, name: true, lastName: true, avatarUrl: true,
          reputation: true, membership: true, role: true,
        },
      },
    },
  })

  const hasMore = rows.length > PAGE_SIZE
  const slice = hasMore ? rows.slice(0, PAGE_SIZE) : rows
  const followingThreadIds = new Set(
    (await db.squareFollow.findMany({
      where: { userId: user.id, threadId: { in: slice.map((t) => t.id) } },
      select: { threadId: true },
    })).map((f) => f.threadId),
  )
  const initialThreads: PublicSquareThread[] = slice.map((row) =>
    serializeSquareThread(row, { viewerId: user.id, followingThreadIds }),
  )

  return (
    <SquareListClient
      initialThreads={initialThreads}
      hasMore={hasMore}
      neighborhoodName={user.neighborhood?.name ?? ''}
    />
  )
}
