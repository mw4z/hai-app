import crypto from 'crypto'
import { NextRequest } from 'next/server'

export const TIER_THRESHOLDS = [3, 10, 25, 50] // bronze, silver, gold, platinum

export function computeInviteBadgeTier(qualified: number): number {
  if (qualified >= 50) return 4
  if (qualified >= 25) return 3
  if (qualified >= 10) return 2
  if (qualified >= 3) return 1
  return 0
}

export function nextTierThreshold(qualified: number): number | null {
  for (const t of TIER_THRESHOLDS) if (qualified < t) return t
  return null
}

// Short, unambiguous, human-shareable. 30^5 ≈ 24M combinations.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generateInviteCode(): string {
  let out = ''
  for (let i = 0; i < 5; i++) {
    out += ALPHABET[crypto.randomInt(0, ALPHABET.length)]
  }
  return `HAI-${out}`
}

export const INVITE_CODE_PATTERN = /^HAI-[A-Z0-9]{3,10}$/

export function hashIp(req: NextRequest): string | null {
  const salt = process.env.INVITE_IP_SALT
  if (!salt) return null
  const fwd = req.headers.get('x-forwarded-for') || ''
  const ip = fwd.split(',')[0]?.trim() || req.headers.get('x-real-ip') || ''
  if (!ip) return null
  return crypto.createHash('sha256').update(ip + '|' + salt).digest('hex')
}

export function shareUrl(code: string): string {
  const base = process.env.HAI_SHARE_BASE || 'https://hai-app.net'
  return `${base}/i/${encodeURIComponent(code)}`
}
