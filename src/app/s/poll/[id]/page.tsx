import type { Metadata } from 'next'
import { db } from '@/lib/db'
import PollShareView from './PollShareView'

export const dynamic = 'force-dynamic'

const ORIGIN = 'https://app.hai-app.net'
const OG_IMAGE = `${ORIGIN}/icon-1024.png`

type PublicPoll = {
  question: string
  options: string[]
  votes: number
  neighborhoodName: string | null
  closed: boolean
} | null

async function getPoll(id: string): Promise<PublicPoll> {
  try {
    const p = await db.poll.findUnique({
      where: { id },
      select: {
        question: true,
        options: true,
        status: true,
        neighborhoodId: true,
        _count: { select: { votes: true } },
      },
    })
    if (!p) return null
    // Poll has no neighborhood relation — only neighborhoodId. Look up the name.
    let neighborhoodName: string | null = null
    if (p.neighborhoodId) {
      const n = await db.neighborhood
        .findUnique({ where: { id: p.neighborhoodId }, select: { name: true } })
        .catch(() => null)
      neighborhoodName = n?.name ?? null
    }
    return {
      question: p.question,
      options: Array.isArray(p.options) ? (p.options as string[]) : [],
      votes: p._count.votes,
      neighborhoodName,
      closed: p.status !== 'active',
    }
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const poll = await getPoll(params.id)
  const q = poll?.question?.trim()
  const title = q ? `📊 ${q}` : 'استطلاع في حي · Hai'
  const description = poll?.neighborhoodName
    ? `استطلاع في ${poll.neighborhoodName} — صوّت وشوف النتائج في تطبيق حي`
    : 'صوّت وشوف النتائج في تطبيق حي'
  const url = `${ORIGIN}/s/poll/${params.id}`
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

export default async function PollSharePage({ params }: { params: { id: string } }) {
  const poll = await getPoll(params.id)
  return <PollShareView poll={poll} pollId={params.id} />
}
