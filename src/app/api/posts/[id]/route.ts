import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { cleanupNotificationsFor } from '@/lib/notifications'
import { normalizeName } from '@/lib/nameValidation'
import { isTitleRequired } from '@/lib/posts/titleRequired'

/** PATCH — Edit own post (title, body, price) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const post = await db.post.findUnique({
    where: { id: params.id },
    // category / intent / marketplaceType pulled so we can apply the
    // same title-required policy as the POST route — author can
    // remove the title on a GENERAL post, but not on a MARKETPLACE
    // listing where the headline is the listing.
    select: {
      authorId: true,
      status: true,
      category: true,
      intent: true,
      marketplaceType: true,
    },
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
    // normalizeName: NFKC + zero-width strip + trim. Closes the
    // bypass where a 1-char title padded with U+200B counted as
    // 3 chars at .length time and slipped past the floor.
    const t = normalizeName(body.title)
    if (t.length === 0) {
      // Allow clearing the title only when the post's category
      // doesn't require one. MARKETPLACE / EVENTS / OFFER-side
      // SERVICES etc. keep their original title — the author
      // can't accidentally strip the listing's headline.
      if (isTitleRequired(post.category, post.intent, post.marketplaceType)) {
        return NextResponse.json({ error: 'هذا القسم يحتاج موضوعاً' }, { status: 400 })
      }
      updates.title = ''
    } else {
      if (t.length < 3) {
        return NextResponse.json({ error: 'الموضوع قصير جداً' }, { status: 400 })
      }
      if (t.length > 200) {
        return NextResponse.json({ error: 'الموضوع طويل جداً' }, { status: 400 })
      }
      updates.title = t
    }
  }

  if (body.body !== undefined) {
    const b = normalizeName(body.body)
    if (b.length < 10) {
      return NextResponse.json({ error: 'المحتوى قصير جداً' }, { status: 400 })
    }
    if (b.length > 5000) {
      return NextResponse.json({ error: 'المحتوى طويل جداً' }, { status: 400 })
    }
    updates.body = b
  }

  if (body.price !== undefined) {
    if (body.price === null) {
      updates.price = null
    } else {
      // Strict validation: number type, finite, > 0, capped. Was
      // `parseFloat(body.price)` only — accepted negative values, NaN,
      // and Infinity. Negative price was the marketplace "sell for
      // negative SAR" foot-gun (audit C-1).
      const n = typeof body.price === 'number' ? body.price : parseFloat(String(body.price))
      if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) {
        return NextResponse.json({ error: 'السعر غير صالح' }, { status: 400 })
      }
      updates.price = n
    }
  }

  // originalPrice — the "was" price on offer posts. Same validation
  // shape as price. Clearing via null is allowed.
  if (body.originalPrice !== undefined) {
    if (body.originalPrice === null) {
      updates.originalPrice = null
    } else {
      const n = typeof body.originalPrice === 'number' ? body.originalPrice : parseFloat(String(body.originalPrice))
      if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) {
        return NextResponse.json({ error: 'السعر السابق غير صالح' }, { status: 400 })
      }
      updates.originalPrice = n
    }
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
    select: { id: true, title: true, body: true, price: true, originalPrice: true, editedAt: true, imageUrls: true },
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

  // Look up author name to surface on the OS replacement banner
  // ("حذف جواد المنشور"). Non-fatal if the lookup fails.
  const actor = await db.user.findUnique({
    where: { id: session.userId },
    select: { name: true },
  }).catch(() => null)

  // Clear bell notifications that point at this post (comments,
  // reactions, replies). The push tray sync on next app foreground
  // catches the system-tray side.
  await cleanupNotificationsFor(
    { postId: params.id },
    actor?.name?.trim() || undefined,
  ).catch(() => { /* non-fatal */ })

  return NextResponse.json({ success: true })
}
