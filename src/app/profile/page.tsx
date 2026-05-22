import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { cached } from '@/lib/cache'
import { getVisibleReputation } from '@/lib/reputation/visibleReputation'
import ProfileClient from './ProfileClient'

export default async function ProfilePage() {
  const session = await getSession()
  if (!session) redirect('/login')

  // Parallelize the user fetch and the post-count cache lookup.
  // postCount keys off session.userId so it doesn't need user to
  // resolve first. Saves one DB roundtrip per profile open.
  const [user, postCount] = await Promise.all([
    // Explicit `select` (not `include`) so we don't pull every scalar on
    // User. `include` selects ALL columns — which 500s the page whenever
    // schema.prisma is ahead of the deployed DB (e.g. the `language`
    // column before its migration lands). List exactly what the client
    // needs and nothing more.
    db.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        name: true,
        lastName: true,
        phone: true,
        gender: true,
        reputation: true,
        role: true,
        createdAt: true,
        avatarUrl: true,
        coverUrl: true,
        email: true,
        emailVerified: true,
        notifyComments: true,
        notifyReactions: true,
        notifyReplies: true,
        notifyLookingFor: true,
        accountType: true,
        providerStatus: true,
        bio: true,
        serviceDescription: true,
        serviceLat: true,
        serviceLng: true,
        serviceAddress: true,
        socialLinks: true,
        modStatus: true,
        neighborhood: {
          select: {
            name: true,
            nameEn: true,
            city: { select: { name: true, nameEn: true } },
          },
        },
      },
    }),
    cached(`postcount:${session.userId}`, 60_000, () =>
      db.post.count({
        where: { authorId: session.userId, status: 'ACTIVE' },
      })
    ),
  ])
  if (!user) redirect('/login')

  // ONE visible reputation = social (User.reputation) + approved directory
  // points (ReputationEvent). Directory points are display-only here; they
  // don't touch the social score enforcement reads.
  const visibleReputation = await getVisibleReputation(session.userId)

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
        city: user.neighborhood?.city?.name,
        cityEn: user.neighborhood?.city?.nameEn,
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
        socialLinks: user.socialLinks,
        modStatus: user.modStatus,
      }))}
      postCount={postCount}
      visibleReputation={visibleReputation}
    />
  )
}
