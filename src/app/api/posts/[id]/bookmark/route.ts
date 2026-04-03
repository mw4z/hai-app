import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { cacheDelete } from '@/lib/cache'

// POST /api/posts/[id]/bookmark — toggle bookmark
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const existing = await db.bookmark.findUnique({
      where: { postId_userId: { postId: params.id, userId: session.userId } },
    })

    if (existing) {
      await db.bookmark.delete({ where: { id: existing.id } })
      cacheDelete(`bookmarks:${session.userId}`)
      return NextResponse.json({ bookmarked: false })
    } else {
      await db.bookmark.create({
        data: { postId: params.id, userId: session.userId },
      })
      cacheDelete(`bookmarks:${session.userId}`)
      return NextResponse.json({ bookmarked: true })
    }
  } catch (error) {
    console.error('bookmark error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
