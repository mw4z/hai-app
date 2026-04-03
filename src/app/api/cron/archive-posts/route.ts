import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { shouldArchivePost } from '@/lib/postExpiry'

/**
 * POST /api/cron/archive-posts
 * Archives expired posts. Run periodically (e.g. every hour).
 * Can be called by a cron service or manually.
 */
export async function POST() {
  try {
    // Get all active posts with their comment counts
    const posts = await db.post.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        category: true,
        createdAt: true,
        activeThreadId: true,
        isPinned: true,
        _count: { select: { comments: true } },
      },
    })

    let archived = 0
    const toArchive: string[] = []

    for (const post of posts) {
      if (shouldArchivePost(post)) {
        toArchive.push(post.id)
      }
    }

    if (toArchive.length > 0) {
      const result = await db.post.updateMany({
        where: { id: { in: toArchive } },
        data: { status: 'ARCHIVED' },
      })
      archived = result.count
    }

    console.log(`[CRON] Archive: checked ${posts.length} posts, archived ${archived}`)
    return NextResponse.json({ checked: posts.length, archived })
  } catch (error) {
    console.error('[CRON] Archive error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
