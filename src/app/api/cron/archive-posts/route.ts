import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { shouldArchivePost } from '@/lib/postExpiry'
import { del } from '@vercel/blob'
import { invalidateHighlights } from '@/lib/highlights'

/**
 * Archives expired posts. Run periodically (e.g. every hour).
 * Deletes images from Blob storage if no one bookmarked the post.
 *
 * Exposes both GET and POST so Vercel Cron (which calls with GET) can
 * trigger it alongside manual invocations.
 */
function authorize(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || ''
  const expected = process.env.CRON_SECRET
  return !!expected && auth === `Bearer ${expected}`
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return runArchive()
}
export async function POST(req: NextRequest) {
  if (!authorize(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return runArchive()
}

async function runArchive() {
  try {
    // Get all active posts with their comment counts and bookmark/image info
    const posts = await db.post.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        category: true,
        createdAt: true,
        activeThreadId: true,
        isPinned: true,
        imageUrls: true,
        neighborhoodId: true,
        _count: { select: { comments: true, bookmarks: true } },
      },
    })

    let archived = 0
    let imagesDeleted = 0
    const toArchive: string[] = []
    const blobUrlsToDelete: string[] = []

    for (const post of posts) {
      if (shouldArchivePost(post)) {
        toArchive.push(post.id)

        // Delete images from Blob if no one saved this post
        if (post._count.bookmarks === 0 && post.imageUrls.length > 0) {
          for (const url of post.imageUrls) {
            if (url.startsWith('https://')) {
              blobUrlsToDelete.push(url)
            }
          }
        }
      }
    }

    if (toArchive.length > 0) {
      const result = await db.post.updateMany({
        where: { id: { in: toArchive } },
        data: { status: 'ARCHIVED' },
      })
      archived = result.count

      // Drop highlight caches for every neighborhood that just lost a
      // post — keeps Highlights clean immediately instead of waiting up
      // to 30 min for the dynamic layer to refresh. Cheap (in-memory
      // Map.delete per nbhd × 3 audience keys × 2 layers).
      const affectedNbhds = new Set<string>()
      for (const p of posts) {
        if (toArchive.includes(p.id)) affectedNbhds.add(p.neighborhoodId)
      }
      affectedNbhds.forEach(invalidateHighlights)

      // Clear imageUrls for posts whose images we're deleting
      if (blobUrlsToDelete.length > 0) {
        // Find which posts had their images queued for deletion
        const postsToClean = posts.filter(
          p => toArchive.includes(p.id) && p._count.bookmarks === 0 && p.imageUrls.length > 0
        )
        if (postsToClean.length > 0) {
          await db.post.updateMany({
            where: { id: { in: postsToClean.map(p => p.id) } },
            data: { imageUrls: [] },
          })
        }

        // Delete from Blob storage in batches
        try {
          await del(blobUrlsToDelete)
          imagesDeleted = blobUrlsToDelete.length
        } catch (e) {
          console.error('[CRON] Blob delete error:', e)
        }
      }
    }

    console.log(`[CRON] Archive: checked ${posts.length} posts, archived ${archived}, images deleted ${imagesDeleted}`)
    return NextResponse.json({ checked: posts.length, archived, imagesDeleted })
  } catch (error) {
    console.error('[CRON] Archive error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
