import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

/**
 * GET /api/notifications/quiet-hours — current state.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const u = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      quietHoursEnabled: true,
      quietHoursStart:   true,
      quietHoursEnd:     true,
      timezone:          true,
    },
  })
  if (!u) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  return NextResponse.json(u)
}

/**
 * PATCH /api/notifications/quiet-hours
 *
 * Body (all fields optional — partial PATCH):
 *   { enabled?: boolean, start?: number, end?: number, timezone?: string }
 *
 * Validation:
 *   start, end ∈ [0, 1440)
 *   start === end → 400 (zero-width window not allowed)
 *   timezone must be a valid IANA tz (verified by trying Intl.DateTimeFormat)
 */
export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { enabled?: unknown; start?: unknown; end?: unknown; timezone?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const data: {
    quietHoursEnabled?: boolean
    quietHoursStart?: number
    quietHoursEnd?: number
    timezone?: string
  } = {}

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be boolean' }, { status: 400 })
    }
    data.quietHoursEnabled = body.enabled
  }

  if (body.start !== undefined) {
    if (typeof body.start !== 'number' || !Number.isInteger(body.start) || body.start < 0 || body.start >= 1440) {
      return NextResponse.json({ error: 'start must be int in [0,1440)' }, { status: 400 })
    }
    data.quietHoursStart = body.start
  }

  if (body.end !== undefined) {
    if (typeof body.end !== 'number' || !Number.isInteger(body.end) || body.end < 0 || body.end >= 1440) {
      return NextResponse.json({ error: 'end must be int in [0,1440)' }, { status: 400 })
    }
    data.quietHoursEnd = body.end
  }

  // Reject zero-width window if BOTH ends would be equal post-update.
  if (data.quietHoursStart !== undefined || data.quietHoursEnd !== undefined) {
    const u = await db.user.findUnique({
      where: { id: session.userId },
      select: { quietHoursStart: true, quietHoursEnd: true },
    })
    if (!u) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    const finalStart = data.quietHoursStart ?? u.quietHoursStart
    const finalEnd   = data.quietHoursEnd   ?? u.quietHoursEnd
    if (finalStart === finalEnd) {
      return NextResponse.json({ error: 'start and end must differ' }, { status: 400 })
    }
  }

  if (body.timezone !== undefined) {
    if (typeof body.timezone !== 'string') {
      return NextResponse.json({ error: 'timezone must be string' }, { status: 400 })
    }
    try {
      // Throws RangeError on invalid IANA tz.
      new Intl.DateTimeFormat('en-US', { timeZone: body.timezone })
    } catch {
      return NextResponse.json({ error: 'invalid timezone' }, { status: 400 })
    }
    data.timezone = body.timezone
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const u = await db.user.update({
    where: { id: session.userId },
    data,
    select: {
      quietHoursEnabled: true,
      quietHoursStart:   true,
      quietHoursEnd:     true,
      timezone:          true,
    },
  })

  return NextResponse.json(u)
}
