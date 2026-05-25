import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { validatePollRequest } from '@/lib/pollRequest'
import { kickNotifCron } from '@/lib/kickNotifCron'
import { log } from '@/lib/logger'

const MOD_ROLES = new Set(['NEIGHBORHOOD_MOD', 'PLATFORM_MOD', 'SUPER_ADMIN'])

/**
 * POST /api/mod/poll-requests/[id]/approve — mod approves a pending
 * suggestion and a real Poll is created.
 *
 * Body (all optional — edit-before-approve):
 *   { title?: string, options?: string[] }
 *
 * If the mod edits the title or options, the FINAL values are stored
 * back onto PollRequest.title / .options for the audit trail; the
 * pre-edit values move to titleOriginal / optionsOriginal so anyone
 * inspecting the row can see what was changed. The approved Poll is
 * authored by the mod (Poll.authorId = mod.id) — the requester's name
 * is NEVER exposed on the PollCard.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    log.api('POST', `/api/mod/poll-requests/${params.id}/approve`, session.userId)

    const me = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, role: true, neighborhoodId: true },
    })
    if (!me || !MOD_ROLES.has(me.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const pr = await db.pollRequest.findUnique({
      where: { id: params.id },
      select: {
        id: true, status: true, title: true, options: true,
        neighborhoodId: true, userId: true,
      },
    })
    if (!pr) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isPlatform = me.role === 'PLATFORM_MOD' || me.role === 'SUPER_ADMIN'
    if (!isPlatform && pr.neighborhoodId !== me.neighborhoodId) {
      return NextResponse.json({ error: 'Out of scope' }, { status: 403 })
    }
    if (pr.status !== 'PENDING') {
      return NextResponse.json({ error: 'Already reviewed' }, { status: 409 })
    }

    let body: any
    try { body = await req.json().catch(() => ({})) } catch { body = {} }

    const wantsEdit =
      (typeof body?.title === 'string' && body.title !== pr.title) ||
      (Array.isArray(body?.options) &&
       JSON.stringify(body.options) !== JSON.stringify(pr.options))

    let finalTitle = pr.title
    let finalOptions = pr.options
    if (wantsEdit) {
      const validated = validatePollRequest({
        title: typeof body?.title === 'string' ? body.title : pr.title,
        options: Array.isArray(body?.options) ? body.options : pr.options,
      })
      if (!validated.ok) {
        return NextResponse.json({ error: validated.error }, { status: 400 })
      }
      finalTitle = validated.value.title
      finalOptions = validated.value.options
    }

    // Create the real Poll and update the request in one transaction so
    // a half-committed approval can't leave PENDING + a stray Poll.
    const [poll, updated] = await db.$transaction([
      db.poll.create({
        data: {
          question: finalTitle,
          options: finalOptions,
          authorId: me.id,
          neighborhoodId: pr.neighborhoodId,
          status: 'active',
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48h auto-expiry
        },
        select: { id: true },
      }),
      db.pollRequest.update({
        where: { id: pr.id },
        data: {
          status: 'APPROVED',
          reviewedById: me.id,
          reviewedAt: new Date(),
          title: finalTitle,
          options: finalOptions,
          // Audit: keep the pre-edit values only when an edit actually
          // happened. Otherwise leave the *Original columns null/empty
          // so a glance tells you "approved as-submitted".
          titleOriginal:   wantsEdit ? pr.title   : null,
          optionsOriginal: wantsEdit ? pr.options : [],
        },
        select: { id: true, status: true },
      }),
    ])
    // Attach the new Poll id back onto the request (separate write so
    // the transaction above can reference both new IDs).
    await db.pollRequest.update({
      where: { id: pr.id },
      data: { approvedPollId: poll.id },
      select: { id: true },
    })

    // Audit log — only when the mod actually edited the submission.
    if (wantsEdit) {
      await db.moderationLog.create({
        data: {
          adminId: me.id,
          action: 'APPROVE_POLL_REQUEST_WITH_EDITS',
          targetType: 'PollRequest',
          targetId: pr.id,
          reason: `Approved with edits → Poll ${poll.id}`,
        },
      }).catch(() => { /* audit best-effort */ })
    }

    // Notify the requester — both the in-app bell row AND a push job
    // so they get a banner on their phone. SYSTEM type; no new enum
    // value needed.
    await db.notification.create({
      data: {
        userId: pr.userId,
        type: 'SYSTEM',
        actorId: me.id,
        title: '✅ تم قبول اقتراح الاستفتاء',
        titleEn: '✅ Your poll suggestion was approved',
        body: finalTitle.slice(0, 120),
        bodyEn: finalTitle.slice(0, 120),
      },
    }).catch(() => { /* notification best-effort */ })

    await db.notifJob.create({
      data: {
        type: 'poll_request_approved',
        priority: 'normal',
        targetType: 'user',
        targetRef: pr.userId,
        payload: {
          requestId: pr.id,
          pollId: poll.id,
          title: finalTitle,
        },
      },
    }).catch(() => { /* push best-effort */ })
    kickNotifCron()

    return NextResponse.json({
      pollId: poll.id,
      requestId: updated.id,
      edited: wantsEdit,
    })
  } catch (error) {
    log.error('Handler failed', error, { route: '/api/mod/poll-requests/[id]/approve' })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
