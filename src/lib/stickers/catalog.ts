/**
 * Hai sticker pack — original, in-house Arabic stickers (no third-party
 * library, no licensing risk). Each sticker is rendered purely from this
 * data by <Sticker> (a CSS bubble: gradient + emoji + bold Arabic), so
 * the same definition powers the picker, the comment/reply render, and
 * chat — and validates server-side.
 *
 * Storage: a sticker is sent as a comment/message whose `imageUrl` holds
 * the sentinel `sticker:<id>` (see toStickerRef / parseStickerRef). This
 * reuses the existing imageUrl column on Comment + Message — no schema
 * migration. Anything not in this catalog is rejected by the API.
 *
 * Heavy on the Islamic compliments Saudis use constantly (ما شاء الله،
 * تبارك الله، جزاك الله خير، بارك الله فيك …) per product direction.
 */

export type StickerCategory =
  | 'blessing'   // مجاملات إسلامية
  | 'congrats'   // تهاني
  | 'condolence' // تعازي
  | 'thikr'      // أذكار
  | 'daily'      // يومي / اجتماعي
  | 'reaction'   // تفاعل

export interface StickerDef {
  id: string
  category: StickerCategory
  /** Large emoji shown above the phrase (or alone for reactions). */
  emoji: string
  /** Arabic phrase, pre-split into 1–2 short lines to avoid overflow. */
  lines: string[]
  /** Background gradient [from, to]. */
  grad: [string, string]
  /** Text colour (defaults to white). */
  fg?: string
  /** Extra search terms (the Arabic in `lines` is always searchable). */
  keywords?: string[]
}

// Shared gradient palette, grouped by mood.
const G = {
  gold:     ['#fbbf24', '#d97706'] as [string, string],
  emerald:  ['#34d399', '#059669'] as [string, string],
  teal:     ['#2dd4bf', '#0d9488'] as [string, string],
  pink:     ['#f472b6', '#db2777'] as [string, string],
  purple:   ['#a78bfa', '#7c3aed'] as [string, string],
  sky:      ['#38bdf8', '#0284c7'] as [string, string],
  indigo:   ['#818cf8', '#4f46e5'] as [string, string],
  rose:     ['#fb7185', '#e11d48'] as [string, string],
  slate:    ['#94a3b8', '#475569'] as [string, string],
  sunrise:  ['#fdba74', '#f97316'] as [string, string],
  night:    ['#64748b', '#1e293b'] as [string, string],
  green2:   ['#86efac', '#16a34a'] as [string, string],
}

export const STICKERS: StickerDef[] = [
  // ── مجاملات إسلامية (Islamic compliments) ────────────────────────────
  { id: 'mashallah',      category: 'blessing', emoji: '🌟', lines: ['ما شاء الله'],            grad: G.gold,    keywords: ['mashallah', 'اعجاب', 'حلو'] },
  { id: 'tabarakallah',   category: 'blessing', emoji: '✨', lines: ['تبارك الله'],            grad: G.teal },
  { id: 'mashallah_tabarak', category: 'blessing', emoji: '🌟', lines: ['ما شاء الله', 'تبارك الله'], grad: G.emerald },
  { id: 'jazak',          category: 'blessing', emoji: '🤲', lines: ['جزاك الله', 'خير'],       grad: G.emerald },
  { id: 'barakallah',     category: 'blessing', emoji: '🌿', lines: ['بارك الله', 'فيك'],       grad: G.green2 },
  { id: 'allahumma_barik',category: 'blessing', emoji: '✨', lines: ['اللهم بارك'],            grad: G.teal },
  { id: 'allah_yaafik',   category: 'blessing', emoji: '💪', lines: ['الله يعطيك', 'العافية'],  grad: G.sky },
  { id: 'yatik_alf',      category: 'blessing', emoji: '🌹', lines: ['يعطيك ألف', 'عافية'],     grad: G.rose },
  { id: 'taslam',         category: 'blessing', emoji: '🙏', lines: ['تسلم'],                  grad: G.indigo },
  { id: 'taslam_yamnak',  category: 'blessing', emoji: '🤝', lines: ['تسلم يمناك'],            grad: G.indigo },
  { id: 'allah_yhfdk',    category: 'blessing', emoji: '🤲', lines: ['الله يحفظك'],            grad: G.emerald },
  { id: 'allah_yjzak',    category: 'blessing', emoji: '🌟', lines: ['الله يجزاك', 'كل خير'],   grad: G.gold },
  { id: 'kfo',            category: 'blessing', emoji: '👏', lines: ['كفو والله'],             grad: G.sunrise },
  { id: 'sah_lsanak',     category: 'blessing', emoji: '👌', lines: ['صح لسانك'],              grad: G.teal },

  // ── تهاني (Congratulations) ──────────────────────────────────────────
  { id: 'mabrook',        category: 'congrats', emoji: '🎉', lines: ['مبروك'],                grad: G.pink },
  { id: 'alf_mabrook',    category: 'congrats', emoji: '🎊', lines: ['ألف مبروك'],            grad: G.purple },
  { id: 'mubarak_3lyk',   category: 'congrats', emoji: '🥳', lines: ['مبارك عليك'],           grad: G.pink },
  { id: 'aqbal',          category: 'congrats', emoji: '🌷', lines: ['عقبالك'],               grad: G.rose },
  { id: 'aqbal_albqyah',  category: 'congrats', emoji: '💐', lines: ['عقبال', 'البقية'],       grad: G.purple },

  // ── تعازي (Condolences) ──────────────────────────────────────────────
  { id: 'allah_yrhmh',    category: 'condolence', emoji: '🤲', lines: ['الله يرحمه'],          grad: G.slate },
  { id: 'albaqa_lillah',  category: 'condolence', emoji: '🕊️', lines: ['البقاء لله'],          grad: G.night },
  { id: 'adham_ajrkm',    category: 'condolence', emoji: '🤍', lines: ['عظم الله', 'أجركم'],    grad: G.slate },
  { id: 'allah_yghfr',    category: 'condolence', emoji: '🤲', lines: ['الله يغفر له'],         grad: G.night },

  // ── أذكار (Thikr / praise) ───────────────────────────────────────────
  { id: 'subhanallah',    category: 'thikr', emoji: '🤍', lines: ['سبحان الله'],              grad: G.emerald },
  { id: 'alhamdulillah',  category: 'thikr', emoji: '🌿', lines: ['الحمد لله'],               grad: G.green2 },
  { id: 'allahuakbar',    category: 'thikr', emoji: '🕌', lines: ['الله أكبر'],               grad: G.teal },
  { id: 'astaghfirullah', category: 'thikr', emoji: '🤲', lines: ['أستغفر الله'],             grad: G.emerald },
  { id: 'salli',          category: 'thikr', emoji: '🤍', lines: ['اللهم صلِّ', 'على محمد'],    grad: G.green2 },
  { id: 'tawakalna',      category: 'thikr', emoji: '🌟', lines: ['توكلنا', 'على الله'],        grad: G.teal },

  // ── يومي / اجتماعي (Daily / social) ──────────────────────────────────
  { id: 'sabah_alkhayr',  category: 'daily', emoji: '☀️', lines: ['صباح الخير'],              grad: G.sunrise },
  { id: 'masa_alkhayr',   category: 'daily', emoji: '🌙', lines: ['مساء الخير'],              grad: G.indigo },
  { id: 'hayak',          category: 'daily', emoji: '🌹', lines: ['حياك الله'],               grad: G.rose },
  { id: 'ya_hala',        category: 'daily', emoji: '👋', lines: ['يا هلا'],                  grad: G.sky },
  { id: 'fee_aman',       category: 'daily', emoji: '🤲', lines: ['في أمان الله'],            grad: G.emerald },
  { id: 'abshir',         category: 'daily', emoji: '😄', lines: ['أبشر'],                    grad: G.gold },
  { id: 'ala_rasi',       category: 'daily', emoji: '🙌', lines: ['على راسي'],                grad: G.purple },
  { id: 'wala_yhmk',      category: 'daily', emoji: '😎', lines: ['ولا يهمك'],                grad: G.sky },

  // ── تفاعل (Reactions — emoji-forward) ────────────────────────────────
  { id: 'dahik',   category: 'reaction', emoji: '😂', lines: ['ضحكتني'],  grad: G.gold,    keywords: ['ضحك', 'haha', 'لول'] },
  { id: 'love',    category: 'reaction', emoji: '❤️', lines: [],         grad: G.rose,    keywords: ['حب', 'قلب', 'love'] },
  { id: 'fire',    category: 'reaction', emoji: '🔥', lines: [],         grad: G.sunrise, keywords: ['نار', 'fire', 'روعة'] },
  { id: 'clap',    category: 'reaction', emoji: '👏', lines: ['أحسنت'],   grad: G.teal },
  { id: 'thumb',   category: 'reaction', emoji: '👍', lines: ['تمام'],    grad: G.sky },
  { id: 'thanks',  category: 'reaction', emoji: '🙏', lines: ['شكراً'],   grad: G.emerald },
  { id: 'hundred', category: 'reaction', emoji: '💯', lines: [],         grad: G.rose },
  { id: 'done',    category: 'reaction', emoji: '✅', lines: ['تم'],      grad: G.green2 },
  { id: 'wow',     category: 'reaction', emoji: '😍', lines: [],         grad: G.pink },
]

export const STICKER_BY_ID: Record<string, StickerDef> =
  Object.fromEntries(STICKERS.map((s) => [s.id, s]))

export function isValidStickerId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(STICKER_BY_ID, id)
}

/** The `imageUrl` sentinel that marks a comment/message as a sticker. */
export const STICKER_PREFIX = 'sticker:'

export function toStickerRef(id: string): string {
  return STICKER_PREFIX + id
}

/**
 * If `value` is a valid sticker reference (`sticker:<knownId>`), return the
 * sticker id; otherwise null. Used both server-side (validation) and
 * client-side (deciding whether to render <Sticker> vs an <img>).
 */
export function parseStickerRef(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || !value.startsWith(STICKER_PREFIX)) return null
  const id = value.slice(STICKER_PREFIX.length)
  return isValidStickerId(id) ? id : null
}

export interface StickerCategoryMeta {
  key: StickerCategory
  ar: string
  en: string
  ur: string
  emoji: string
}

/** Tab order for the picker. */
export const STICKER_CATEGORIES: StickerCategoryMeta[] = [
  { key: 'blessing',   ar: 'مجاملات', en: 'Blessings',   ur: 'تعریف',   emoji: '🌟' },
  { key: 'thikr',      ar: 'أذكار',   en: 'Thikr',       ur: 'اذکار',   emoji: '🤍' },
  { key: 'congrats',   ar: 'تهاني',   en: 'Congrats',    ur: 'مبارک',   emoji: '🎉' },
  { key: 'daily',      ar: 'يومي',    en: 'Daily',       ur: 'روزمرہ',  emoji: '☀️' },
  { key: 'reaction',   ar: 'تفاعل',   en: 'Reactions',   ur: 'ردعمل',   emoji: '😂' },
  { key: 'condolence', ar: 'تعازي',   en: 'Condolences', ur: 'تعزیت',   emoji: '🕊️' },
]

/** Stickers for a given category, in catalog order. */
export function stickersByCategory(cat: StickerCategory): StickerDef[] {
  return STICKERS.filter((s) => s.category === cat)
}

/** Free-text search across phrase lines + keywords. */
export function searchStickers(query: string): StickerDef[] {
  const q = query.trim()
  if (!q) return STICKERS
  return STICKERS.filter((s) => {
    if (s.lines.some((l) => l.includes(q))) return true
    if (s.keywords?.some((k) => k.includes(q) || q.includes(k))) return true
    return false
  })
}
