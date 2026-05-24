import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { cached } from '@/lib/cache'
import { isProviderVisible } from '@/lib/provider'

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
          coverUrl: true,
          bio: true,
          reputation: true,
          role: true,
          gender: true,
          showGender: true,
          accountType: true,
          providerStatus: true,
          membership: true,
          serviceDescription: true,
          serviceAddress: true,
          serviceLat: true,
          serviceLng: true,
          createdAt: true,
          neighborhood: { select: { name: true, nameEn: true } },
          _count: { select: { posts: true } },
        },
      })
      if (!user) return null
      // Hide provider-facing fields from the public when the account hasn't
      // cleared the status gate (PENDING / NONE). The account itself isn't
      // hidden — only the provider-specific surface area.
      const visibleAsProvider = isProviderVisible(user.providerStatus)
      // Full shape the post-author profile popup expects, so it can render
      // everything (bio, service, stats) without a second fetch.
      return {
        id: user.id,
        name: user.name,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        coverUrl: user.coverUrl,
        bio: user.bio,
        reputation: user.reputation,
        role: user.role,
        membership: user.membership,
        gender: user.showGender === false ? null : user.gender,
        accountType: visibleAsProvider ? user.accountType : 'NORMAL',
        providerStatus: visibleAsProvider ? user.providerStatus : 'NONE',
        serviceDescription: visibleAsProvider ? user.serviceDescription : null,
        serviceAddress: visibleAsProvider ? user.serviceAddress : null,
        serviceLat: visibleAsProvider ? user.serviceLat : null,
        serviceLng: visibleAsProvider ? user.serviceLng : null,
        createdAt: user.createdAt,
        neighborhood: user.neighborhood,
        postCount: user._count.posts,
        _count: { posts: user._count.posts },
      }
    })

    if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(profile)
  } catch (error) {
    console.error('user profile error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
