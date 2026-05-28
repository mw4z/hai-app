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

  // Graceful failure if the SquareThread table isn't there yet (deploy
  // ordering: code can ship before the manual migration is applied —
  // see the runbook in the PR / project memory). The page renders the
  // empty state instead of crashing with a 500. The lambda preserves
  // the include shape so TypeScript still sees `row.author` downstream.
  const fetchThreadRows = () => db.squareThread.findMany({
    where: {
      neighborhoodId: user.neighborhoodId!,
      status: 'ACTIVE' as const,
    },
    orderBy: [
      { isPinned: 'desc' as const },
      { lastActivityAt: 'desc' as const },
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
  let rows: Awaited<ReturnType<typeof fetchThreadRows>> = []
  try {
    rows = await fetchThreadRows()
  } catch (err) {
    console.error('[square] list query failed — migration may not be applied yet', err)
  }

  const hasMore = rows.length > PAGE_SIZE
  const slice = hasMore ? rows.slice(0, PAGE_SIZE) : rows
  let followingThreadIds = new Set<string>()
  if (slice.length > 0) {
    try {
      const follows = await db.squareFollow.findMany({
        where: { userId: user.id, threadId: { in: slice.map((t) => t.id) } },
        select: { threadId: true },
      })
      followingThreadIds = new Set(follows.map((f) => f.threadId))
    } catch (err) {
      console.error('[square] follow query failed', err)
    }
  }
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
