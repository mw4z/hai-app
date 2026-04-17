import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  // If the user already completed onboarding, never show it again — forward
  // straight to the feed. Prevents loop-back bugs that bounced Apple reviewers.
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { name: true, neighborhoodId: true },
  })
  if (user?.name && user?.neighborhoodId) redirect('/feed')

  return <>{children}</>
}
