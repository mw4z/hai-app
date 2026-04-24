import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

/** PATCH — Edit own post (title, body, price) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const post = await db.post.findUnique({
    where: { id: params.id },
    select: { authorId: true, status: true },
  })
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (post.authorId !== session.userId) {
    return NextResponse.json({ error: 'لا يمكنك تعديل منشور غيرك' }, { status: 403 })
  }
  if (!['ACTIVE', 'IN_PROGRESS', 'PENDING_AI'].includes(post.status)) {
    return NextResponse.json({ error: 'لا يمكن تعديل هذا المنشور' }, { status: 409 })
  }

  const body = await req.json()
  const updates: Record<string, unknown> = {}

  if (body.title !== undefined) {
    if (!body.title?.trim() || body.title.trim().length < 3) {
      return NextResponse.json({ error: 'العنوان قصير جداً' }, { status: 400 })
    }
    updates.title = body.title.trim()
  }

  if (body.body !== undefined) {
    if (!body.body?.trim() || body.body.trim().length < 10) {
      return NextResponse.json({ error: 'المحتوى قصير جداً' }, { status: 400 })
    }
    updates.body = body.body.trim()
  }

  if (body.price !== undefined) {
    updates.price = body.price === null ? null : parseFloat(body.price)
  }

  // Image edit — the author can add/remove/reorder photos on an
  // already-published post. Validate the array the same way the
  // create route does (max 5, https:// or /uploads/ prefix, total
  // URL length cap). Sending an empty array explicitly clears all
  // photos.
  if (Array.isArray(body.imageUrls)) {
    const cleaned: string[] = []
    for (const url of body.imageUrls.slice(0, 5)) {
      if (typeof url === 'string' && (url.startsWith('/uploads/') || url.startsWith('https://')) && url.length < 500) {
        cleaned.push(url)
      }
    }
    updates.imageUrls = cleaned
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'لا يوجد تغييرات' }, { status: 400 })
  }

  updates.editedAt = new Date()

  const updated = await db.post.update({
    where: { id: params.id },
    data: updates as any,
    select: { id: true, title: true, body: true, price: true, editedAt: true, imageUrls: true },
  })

  return NextResponse.json(updated)
}

/** DELETE — Delete own post */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const post = await db.post.findUnique({
    where: { id: params.id },
    select: { authorId: true },
  })
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (post.authorId !== session.userId) {
    return NextResponse.json({ error: 'لا يمكنك حذف منشور غيرك' }, { status: 403 })
  }

  // Soft delete: mark as REMOVED
  await db.post.update({
    where: { id: params.id },
    data: { status: 'REMOVED' },
  })

  return NextResponse.json({ success: true })
}
