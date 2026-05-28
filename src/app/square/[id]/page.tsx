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
  const row = await db.squareThread.findUnique({
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
  if (!row) notFound()
  // Neighborhood scope — same-hood only, unless PLATFORM_MOD / SUPER.
  if (
    row.neighborhoodId !== user.neighborhoodId &&
    user.role !== 'PLATFORM_MOD' &&
    user.role !== 'SUPER_ADMIN'
  ) notFound()

  const [replies, follow] = await Promise.all([
    db.squareReply.findMany({
      where: { threadId: id, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      take: FIRST_REPLY_PAGE + 1,
      include: {
        author: {
          select: {
            id: true, name: true, lastName: true, avatarUrl: true,
            reputation: true, membership: true, role: true,
          },
        },
      },
    }),
    db.squareFollow.findUnique({
      where: { threadId_userId: { threadId: id, userId: user.id } },
      select: { id: true },
    }),
  ])

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
