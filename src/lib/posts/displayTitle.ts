import type { PostCategory } from '@prisma/client'

/**
 * Computed display title for a post. Never stored in the DB — every
 * caller that needs a "headline" string for a post (PostCard, share
 * sheet, push notification subject) calls this. When the author
 * provided a real title, that's used verbatim; when they didn't, we
 * derive a short excerpt from the body, falling back to a generic
 * category label only if the body is too short to summarize.
 *
 * Rule 5 of the optional-title spec ("Do not store fake generic
 * titles if avoidable") is the reason this is a runtime computation
 * rather than a persisted column.
 */

const MAX_EXCERPT_LEN = 60
const MIN_EXCERPT_LEN = 12

interface PostLike {
  title: string | null | undefined
  body: string
  category: PostCategory
}

export function buildDisplayTitle(
  post: PostLike,
  lang: 'ar' | 'en' | 'ur' = 'ar',
): string {
  // Real title wins — even a 4-char "كيك" is the author's call.
  const explicit = (post.title || '').trim()
  if (explicit) return explicit

  // Body excerpt. Collapse whitespace, strip control chars, cap at
  // MAX_EXCERPT_LEN. We DO NOT break on word boundaries — Arabic body
  // text often runs without spaces in places, and slicing at 60 chars
  // is fine.
  const flat = post.body
    .replace(/\s+/g, ' ')
    .replace(/[​-‏‪-‮﻿]/g, '') // zero-width / bidi marks
    .trim()
  if (flat.length >= MIN_EXCERPT_LEN) {
    if (flat.length <= MAX_EXCERPT_LEN) return flat
    return flat.slice(0, MAX_EXCERPT_LEN).trimEnd() + '…'
  }

  // Body too short → category fallback. These strings are intentionally
  // generic; they only render when the body is < 12 chars (rare).
  return categoryFallback(post.category, lang)
}

function categoryFallback(category: PostCategory, lang: 'ar' | 'en' | 'ur'): string {
  const map: Record<PostCategory, { ar: string; en: string; ur: string }> = {
    MARKETPLACE:          { ar: 'إعلان',           en: 'Listing',         ur: 'اشتہار' },
    SERVICES:             { ar: 'خدمة',            en: 'Service',         ur: 'خدمت' },
    HOME_BUSINESSES:      { ar: 'أسرة منتجة',     en: 'Home business',   ur: 'گھریلو کاروبار' },
    RIDES:                { ar: 'مشوار',           en: 'Ride',            ur: 'سواری' },
    REAL_ESTATE:          { ar: 'عقار',            en: 'Property',        ur: 'جائیداد' },
    LOST_FOUND:           { ar: 'مفقود',           en: 'Lost & found',    ur: 'گمشدہ' },
    NEIGHBORHOOD_REPORTS: { ar: 'بلاغ',            en: 'Report',          ur: 'رپورٹ' },
    EVENTS:               { ar: 'فعالية',          en: 'Event',           ur: 'تقریب' },
    COMPETITIONS:         { ar: 'مسابقة',          en: 'Competition',     ur: 'مقابلہ' },
    GENERAL:              { ar: 'منشور',           en: 'Post',            ur: 'پوسٹ' },
  }
  return map[category]?.[lang] ?? map[category]?.ar ?? 'منشور'
}

/** Public category label (AR/EN/UR). Used by the share-preview pages. */
export function categoryLabel(category: PostCategory, lang: 'ar' | 'en' | 'ur' = 'ar'): string {
  return categoryFallback(category, lang)
}

/**
 * Short variant used as the push-notification subject (max 80 chars
 * by long-standing convention in this codebase). Always returns
 * something — never empty.
 */
export function buildNotifTitle(post: PostLike): string {
  const t = buildDisplayTitle(post, 'ar')
  return t.slice(0, 80)
}
