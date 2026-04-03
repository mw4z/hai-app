import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET /api/bookmarks — get user's bookmarked posts
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const bookmarks = await db.bookmark.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        post: {
          select: {
            id: true, title: true, body: true, category: true, status: true,
            createdAt: true, imageUrls: true,
            author: { select: { id: true, name: true, reputation: true, accountType: true, avatarUrl: true, neighborhood: { select: { name: true, nameEn: true } } } },
            reactions: { select: { emoji: true, userId: true } },
            _count: { select: { comments: true, reactions: true } },
          },
        },
      },
      take: 50,
    })

    return NextResponse.json(bookmarks.map(b => ({
      ...b.post,
      isArchived: b.post.status === 'ARCHIVED' || b.post.status === 'EXPIRED',
    })))
  } catch (error) {
    console.error('bookmarks error:', error)
    return NextResponse.json([], { status: 500 })
  }
}
