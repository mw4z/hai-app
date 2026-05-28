import type { Metadata } from 'next'
import type { PostCategory } from '@prisma/client'
import { db } from '@/lib/db'
import { buildDisplayTitle } from '@/lib/posts/displayTitle'
import PostShareView from './PostShareView'

export const dynamic = 'force-dynamic'

const ORIGIN = 'https://app.hai-app.net'
const OG_IMAGE = `${ORIGIN}/icon-1024.png`
const TEASER_LEN = 120

export type PublicPost = {
  headline: string          // title, or a short body excerpt (teaser only)
  snippet: string | null    // ~120-char body teaser when a separate title exists
  category: PostCategory
  neighborhoodName: string | null
  /** First image attached to the post — used as the og:image so
   *  WhatsApp / Twitter previews show the actual post photo instead
   *  of the generic Hai app icon. Null when the post has no images;
   *  the metadata builder then falls back to OG_IMAGE. */
  coverImage: string | null
} | null

async function getPost(id: string): Promise<PublicPost> {
  try {
    const p = await db.post.findUnique({
      where: { id },
      select: { title: true, body: true, category: true, status: true, neighborhoodId: true, imageUrls: true },
    })
    // Only ACTIVE posts are surfaced publicly — never hidden/removed ones.
    if (!p || p.status !== 'ACTIVE') return null

    const headline = buildDisplayTitle({ title: p.title, body: p.body, category: p.category }, 'ar')
    // Add a short body teaser only when the author gave a real title (so the
    // headline isn't already the body excerpt). Capped — never the full post.
    const hasTitle = !!(p.title || '').trim()
    const flatBody = p.body.replace(/\s+/g, ' ').trim()
    const snippet = hasTitle && flatBody
      ? (flatBody.length > TEASER_LEN ? flatBody.slice(0, TEASER_LEN).trimEnd() + '…' : flatBody)
      : null

    let neighborhoodName: string | null = null
    if (p.neighborhoodId) {
      const n = await db.neighborhood
        .findUnique({ where: { id: p.neighborhoodId }, select: { name: true } })
        .catch(() => null)
      neighborhoodName = n?.name ?? null
    }

    // First valid https:// image, if any. Defensive: drops blob:/data:/relative
    // entries that could sneak in from old drafts or corrupt rows.
    const rawImages = Array.isArray(p.imageUrls) ? p.imageUrls : []
    const coverImage = rawImages.find(
      (u): u is string => typeof u === 'string' && u.startsWith('https://'),
    ) ?? null

    return { headline, snippet, category: p.category, neighborhoodName, coverImage }
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const post = await getPost(params.id)
  const title = post?.headline ? post.headline : 'منشور في حي · Hai'
  const description = post?.neighborhoodName
    ? `منشور من ${post.neighborhoodName} — افتحه في تطبيق حي`
    : 'افتحه في تطبيق حي'
  const url = `${ORIGIN}/s/post/${params.id}`

  // Prefer the post's own first photo as the share-card image (what
  // people are actually about to look at). Fall back to the app icon
  // when the post has no images. With a real photo, switch the
  // Twitter card to summary_large_image so the preview renders the
  // image full-width instead of as a small thumbnail.
  const hasCover = !!post?.coverImage
  const shareImage = post?.coverImage ?? OG_IMAGE
  const ogImages = hasCover
    ? [{ url: shareImage, alt: post?.headline || 'Hai' }]
    : [{ url: shareImage, width: 1024, height: 1024, alt: 'Hai' }]

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: 'حي · Hai',
      type: 'website',
      images: ogImages,
    },
    twitter: {
      card: hasCover ? 'summary_large_image' : 'summary',
      title,
      description,
      images: [shareImage],
    },
  }
}

export default async function PostSharePage({ params }: { params: { id: string } }) {
  const post = await getPost(params.id)
  return <PostShareView post={post} postId={params.id} />
}
