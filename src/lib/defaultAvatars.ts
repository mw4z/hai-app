/**
 * Built-in avatars — neighborhood-themed, matching the Hai (حي) app identity.
 * Each avatar represents a role or persona in a neighborhood community.
 */

export interface AvatarOption {
  id: string
  url: string
  category: string
}

function svgAvatar(emoji: string, bg1: string, bg2: string): string {
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23${bg1}'/%3E%3Cstop offset='1' stop-color='%23${bg2}'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='100' cy='100' r='100' fill='url(%23g)'/%3E%3Ctext x='100' y='118' text-anchor='middle' font-size='80'%3E${encodeURIComponent(emoji)}%3C/text%3E%3C/svg%3E`
}

// Neighbors & People — who lives in a حي
const NEIGHBORS: AvatarOption[] = [
  { id: 'n1', url: svgAvatar('👨', '16a34a', '065f46'), category: 'neighbors' },
  { id: 'n2', url: svgAvatar('👩', '16a34a', '065f46'), category: 'neighbors' },
  { id: 'n3', url: svgAvatar('👴', '15803d', '14532d'), category: 'neighbors' },
  { id: 'n4', url: svgAvatar('👵', '15803d', '14532d'), category: 'neighbors' },
  { id: 'n5', url: svgAvatar('👨‍👩‍👧', '059669', '047857'), category: 'neighbors' },
  { id: 'n6', url: svgAvatar('🧑', '0d9488', '0f766e'), category: 'neighbors' },
  { id: 'n7', url: svgAvatar('👷', 'ca8a04', 'a16207'), category: 'neighbors' },
  { id: 'n8', url: svgAvatar('👨‍🍳', 'dc2626', 'b91c1c'), category: 'neighbors' },
]

// Neighborhood Life — what happens in a حي
const LIFE: AvatarOption[] = [
  { id: 'l1', url: svgAvatar('🏠', '0ea5e9', '0284c7'), category: 'life' },
  { id: 'l2', url: svgAvatar('🕌', '7c3aed', '6d28d9'), category: 'life' },
  { id: 'l3', url: svgAvatar('🌴', '16a34a', '15803d'), category: 'life' },
  { id: 'l4', url: svgAvatar('☕', '92400e', '78350f'), category: 'life' },
  { id: 'l5', url: svgAvatar('🛒', 'e11d48', 'be185d'), category: 'life' },
  { id: 'l6', url: svgAvatar('🚗', '2563eb', '1d4ed8'), category: 'life' },
  { id: 'l7', url: svgAvatar('🍽️', 'f59e0b', 'd97706'), category: 'life' },
  { id: 'l8', url: svgAvatar('📦', '64748b', '475569'), category: 'life' },
]

// Saudi Culture — identity of the land
const CULTURE: AvatarOption[] = [
  { id: 'c1', url: svgAvatar('🌙', '1e3a5f', '0f172a'), category: 'culture' },
  { id: 'c2', url: svgAvatar('⭐', 'f59e0b', 'b45309'), category: 'culture' },
  { id: 'c3', url: svgAvatar('🐪', 'd97706', '92400e'), category: 'culture' },
  { id: 'c4', url: svgAvatar('🏔️', '334155', '1e293b'), category: 'culture' },
  { id: 'c5', url: svgAvatar('🌅', 'f97316', 'ea580c'), category: 'culture' },
  { id: 'c6', url: svgAvatar('🤲', '16a34a', '065f46'), category: 'culture' },
  { id: 'c7', url: svgAvatar('🕋', '1e293b', '0f172a'), category: 'culture' },
  { id: 'c8', url: svgAvatar('🌹', 'e11d48', '9f1239'), category: 'culture' },
]

export const DEFAULT_AVATARS: AvatarOption[] = [...NEIGHBORS, ...LIFE, ...CULTURE]

export const AVATAR_CATEGORIES = [
  { key: 'neighbors', labelAr: 'جيران', labelEn: 'Neighbors' },
  { key: 'life', labelAr: 'حياة الحي', labelEn: 'Neighborhood' },
  { key: 'culture', labelAr: 'ثقافة', labelEn: 'Culture' },
]
