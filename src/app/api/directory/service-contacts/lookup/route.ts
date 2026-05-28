import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { phoneHash, serviceContactCryptoReady, toE164 } from '@/lib/services/phone'

export const dynamic = 'force-dynamic'

/**
 * GET /api/directory/service-contacts/lookup?phones=+9665...,+9665...
 *
 * Bulk-lookup: for each phone, return the matching ACTIVE service
 * contact in the viewer's neighborhood if one exists. Used by the
 * post / comment body renderer to surface a card under any phone
 * number written in the text — works for BOTH new and existing posts
 * because lookup happens at view time, not write time.
 *
 * Result shape:
 *   { matches: { [e164]: { id, displayName, category, whatsapp } | null } }
 *
 * The phone numbers themselves are NEVER echoed back to the client
 * outside the keys (which the client already had). The matched
 * record contains only the directory listing's public fields — no
 * cross-reference to ServiceIdentity.linkedUserId etc.
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!serviceContactCryptoReady()) {
    // No pepper / key configured → return empty matches so the
    // renderer falls back to the "no directory match" generic card.
    return NextResponse.json({ matches: {} })
  }

  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: { neighborhoodId: true },
  })
  if (!me?.neighborhoodId) return NextResponse.json({ matches: {} })

  const url = new URL(req.url)
  const raw = url.searchParams.get('phones') || ''
  const phones = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 20) // cap at 20 per body

  if (phones.length === 0) return NextResponse.json({ matches: {} })

  // Normalise + dedup. Build a hash→e164 reverse map so we can
  // attribute matches back to the caller's key.
  const hashToE164 = new Map<string, string>()
  for (const p of phones) {
    const e164 = toE164(p)
    if (!e164) continue
    hashToE164.set(phoneHash(e164), e164)
  }
  if (hashToE164.size === 0) return NextResponse.json({ matches: {} })

  const hashes = Array.from(hashToE164.keys())
  const e164List = Array.from(hashToE164.values())
  const identities = await db.serviceIdentity.findMany({
    where: { phoneHash: { in: hashes } },
    select: {
      phoneHash: true,
      contacts: {
        where: {
          neighborhoodId: me.neighborhoodId,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          displayName: true,
          category: true,
          whatsapp: true,
        },
        take: 1,
      },
    },
  })

  const matches: Record<string, {
    id: string
    displayName: string
    category: string
    whatsapp: boolean
  } | null> = {}
  for (const e164 of e164List) {
    matches[e164] = null
  }
  for (const id of identities) {
    const e164 = hashToE164.get(id.phoneHash)
    if (!e164) continue
    const c = id.contacts[0]
    if (c) {
      matches[e164] = {
        id: c.id,
        displayName: c.displayName,
        category: c.category as string,
        whatsapp: c.whatsapp,
      }
    }
  }

  return NextResponse.json({ matches })
}
