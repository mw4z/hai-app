import { redirect, notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { isSquareAdminRole } from '@/lib/square/isSquareAdmin'
import {
  serializeSquareThread,
  serializeSquareReply,
  type PublicSquareThread,
  type PublicSquareReply,
} from '@/lib/square/serializeThread'
import SquareDetailClient from './SquareDetailClient'

export const dynamic = 'force-dynamic'

const FIRST_REPLY_PAGE = 30

interface Params { params: Promise<{ id: string }> }

export default async function SquareThreadDetailPage({ params }: Params) {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, neighborhoodId: true },
  })
  if (!user) redirect('/login')
  if (!user.neighborhoodId) notFound()
  if (!isSquareAdminRole(user.role)) notFound()

  const { id } = await params
  // Graceful failure if the table doesn't exist yet (migration not
  // applied). A 404 reads to the user as "thread not found" — the
  // best fallback when there's literally no data to show. Lambda
  // wrapper preserves the include shape for downstream type checks.
  const fetchThread = () => db.squareThread.findUnique({
    where: { id },
    include: {
      author: {
        select: {
          id: true, name: true, lastName: true, avatarUrl: true,
          reputation: true, membership: true, role: true,
        },
      },
    },
  })
  let row: Awaited<ReturnType<typeof fetchThread>> = null
  try {
    row = await fetchThread()
  } catch (err) {
    console.error('[square] thread fetch failed — migration may not be applied yet', err)
  }
  if (!row) notFound()
  // Neighborhood scope — same-hood only, unless PLATFORM_MOD / SUPER.
  if (
    row.neighborhoodId !== user.neighborhoodId &&
    user.role !== 'PLATFORM_MOD' &&
    user.role !== 'SUPER_ADMIN'
  ) notFound()

  // Replies + follow lookup — same graceful-failure pattern as the
  // thread fetch, lambdas preserve the include shape for the
  // serializer's downstream type checks.
  const fetchReplies = () => db.squareReply.findMany({
    where: { threadId: id, status: 'ACTIVE' as const },
    orderBy: { createdAt: 'asc' as const },
    take: FIRST_REPLY_PAGE + 1,
    include: {
      author: {
        select: {
          id: true, name: true, lastName: true, avatarUrl: true,
          reputation: true, membership: true, role: true,
        },
      },
    },
  })
  const fetchFollow = () => db.squareFollow.findUnique({
    where: { threadId_userId: { threadId: id, userId: user.id } },
    select: { id: true },
  })
  let replies: Awaited<ReturnType<typeof fetchReplies>> = []
  let follow: Awaited<ReturnType<typeof fetchFollow>> = null
  try {
    [replies, follow] = await Promise.all([fetchReplies(), fetchFollow()])
  } catch (err) {
    console.error('[square] replies/follow fetch failed', err)
  }

  const hasMoreReplies = replies.length > FIRST_REPLY_PAGE
  const replySlice = hasMoreReplies ? replies.slice(0, FIRST_REPLY_PAGE) : replies
  const initialThread: PublicSquareThread = serializeSquareThread(row, {
    viewerId: user.id,
    followingThreadIds: follow ? new Set([row.id]) : new Set(),
  })
  const initialReplies: PublicSquareReply[] = replySlice.map((r) =>
    serializeSquareReply(r, { viewerId: user.id }),
  )

  return (
    <SquareDetailClient
      thread={initialThread}
      initialReplies={initialReplies}
      hasMoreReplies={hasMoreReplies}
    />
  )
}
