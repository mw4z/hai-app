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
} | null

async function getPost(id: string): Promise<PublicPost> {
  try {
    const p = await db.post.findUnique({
      where: { id },
      select: { title: true, body: true, category: true, status: true, neighborhoodId: true },
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
    return { headline, snippet, category: p.category, neighborhoodName }
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
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: 'حي · Hai',
      type: 'website',
      images: [{ url: OG_IMAGE, width: 1024, height: 1024, alt: 'Hai' }],
    },
    twitter: { card: 'summary', title, description, images: [OG_IMAGE] },
  }
}

export default async function PostSharePage({ params }: { params: { id: string } }) {
  const post = await getPost(params.id)
  return <PostShareView post={post} postId={params.id} />
}
