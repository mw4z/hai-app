import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { cached } from '@/lib/cache'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const profile = await cached(`profile:${params.id}`, 120_000, async () => {
      const user = await db.user.findUnique({
        where: { id: params.id },
        select: {
          id: true,
          name: true,
          lastName: true,
          avatarUrl: true,
          bio: true,
          reputation: true,
          accountType: true,
          serviceDescription: true,
          createdAt: true,
          neighborhood: { select: { name: true, nameEn: true } },
          _count: { select: { posts: true } },
        },
      })
      if (!user) return null
      return {
        id: user.id,
        name: user.name,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        reputation: user.reputation,
        accountType: user.accountType,
        serviceDescription: user.serviceDescription,
        createdAt: user.createdAt,
        neighborhood: user.neighborhood,
        postCount: user._count.posts,
      }
    })

    if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(profile)
  } catch (error) {
    console.error('user profile error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
