import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { cached } from '@/lib/cache'
import ProfileClient from './ProfileClient'

export default async function ProfilePage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await db.user.findUnique({
    where: { id: session.userId },
    include: { neighborhood: { include: { city: true } } },
  })
  if (!user) redirect('/login')

  const postCount = await cached(`postcount:${user.id}`, 60_000, () =>
    db.post.count({
      where: { authorId: user.id, status: 'ACTIVE' },
    })
  )

  return (
    <ProfileClient
      user={JSON.parse(JSON.stringify({
        id: user.id,
        name: user.name,
        lastName: user.lastName,
        phone: user.phone,
        gender: user.gender,
        reputation: user.reputation,
        role: user.role,
        neighborhood: user.neighborhood?.name,
        neighborhoodEn: user.neighborhood?.nameEn,
        city: user.neighborhood?.city.name,
        cityEn: user.neighborhood?.city.nameEn,
        createdAt: user.createdAt,
        avatarUrl: user.avatarUrl,
        coverUrl: user.coverUrl,
        email: user.email,
        emailVerified: user.emailVerified,
        notifyComments: user.notifyComments,
        notifyReactions: user.notifyReactions,
        notifyReplies: user.notifyReplies,
        notifyLookingFor: user.notifyLookingFor,
        accountType: user.accountType,
        providerStatus: user.providerStatus,
        bio: user.bio,
        serviceDescription: user.serviceDescription,
        serviceLat: user.serviceLat,
        serviceLng: user.serviceLng,
        serviceAddress: user.serviceAddress,
      }))}
      postCount={postCount}
    />
  )
}
