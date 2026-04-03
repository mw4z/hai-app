import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

const MIN_ACCOUNT_AGE_DAYS = 3
const MIN_POSTS = 2

// POST — submit a verification request
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { accountType: true, createdAt: true },
  })

  // Must be SERVICE_PROVIDER
  if (user?.accountType !== 'SERVICE_PROVIDER') {
    return NextResponse.json({ error: 'يجب أن تكون مقدم خدمة أولاً' }, { status: 400 })
  }

  // Account age check
  const ageDays = (Date.now() - new Date(user.createdAt).getTime()) / 86400_000
  if (ageDays < MIN_ACCOUNT_AGE_DAYS) {
    return NextResponse.json({
      error: `حسابك جديد. يرجى الانتظار ${Math.ceil(MIN_ACCOUNT_AGE_DAYS - ageDays)} يوم قبل طلب التوثيق`,
    }, { status: 400 })
  }

  // Minimum activity check
  const postCount = await db.post.count({
    where: { authorId: session.userId, status: { in: ['ACTIVE', 'IN_PROGRESS'] } },
  })
  if (postCount < MIN_POSTS) {
    return NextResponse.json({
      error: `يجب أن يكون لديك ${MIN_POSTS} منشورات على الأقل قبل طلب التوثيق`,
    }, { status: 400 })
  }

  // Check for existing pending/approved request
  const existing = await db.verificationRequest.findFirst({
    where: { userId: session.userId, status: { in: ['pending', 'approved'] } },
  })
  if (existing) {
    const msg = existing.status === 'pending' ? 'لديك طلب توثيق معلّق بالفعل' : 'حسابك موثّق بالفعل'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const { businessName, description } = await req.json()
  if (!description || description.trim().length < 10) {
    return NextResponse.json({ error: 'اشرح نشاطك بالتفصيل (10 أحرف على الأقل)' }, { status: 400 })
  }

  await db.verificationRequest.create({
    data: {
      userId: session.userId,
      businessName: businessName?.trim() || null,
      description: description.trim(),
    },
  })

  return NextResponse.json({ success: true })
}

// GET — check current request status
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const request = await db.verificationRequest.findFirst({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
    select: { status: true, createdAt: true },
  })

  return NextResponse.json({ request })
}
