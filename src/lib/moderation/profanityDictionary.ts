/**
 * Profanity Dictionary — Arabic + English
 * Severity: 1 = mild, 2 = moderate, 3 = severe
 *
 * Words are stored in normalized form (no diacritics, lowercase).
 * Add new entries here — the filter engine picks them up automatically.
 */

export interface ProfanityEntry {
  word: string
  language: 'ar' | 'en'
  severity: 1 | 2 | 3
  variations?: string[]
}

export const PROFANITY_DICTIONARY: ProfanityEntry[] = [
  // ── Arabic — Severity 3 (severe insults / slurs) ───────────────────────
  { word: 'كلب', language: 'ar', severity: 3, variations: ['جلب', 'كلبه'] },
  { word: 'حمار', language: 'ar', severity: 2, variations: ['حمير', 'حماره'] },
  { word: 'غبي', language: 'ar', severity: 2, variations: ['غبيه', 'اغبياء', 'غباء'] },
  { word: 'احمق', language: 'ar', severity: 2, variations: ['حمقاء', 'حماقه'] },
  { word: 'تافه', language: 'ar', severity: 2, variations: ['تافهه', 'تافهين'] },
  { word: 'زبال', language: 'ar', severity: 3 },
  { word: 'خنزير', language: 'ar', severity: 3, variations: ['خنازير'] },
  { word: 'منافق', language: 'ar', severity: 2, variations: ['منافقين', 'نفاق'] },
  { word: 'كذاب', language: 'ar', severity: 2, variations: ['كذابه', 'كذابين'] },
  { word: 'لعنه', language: 'ar', severity: 3, variations: ['لعنة', 'يلعن', 'الله يلعنك'] },
  { word: 'شرموط', language: 'ar', severity: 3, variations: ['شرموطه', 'شراميط'] },
  { word: 'عاهر', language: 'ar', severity: 3, variations: ['عاهره', 'عاهرات'] },
  { word: 'قحب', language: 'ar', severity: 3, variations: ['قحبه', 'قحاب'] },
  { word: 'زنا', language: 'ar', severity: 3, variations: ['زاني', 'زانيه'] },
  { word: 'كس امك', language: 'ar', severity: 3, variations: ['كس أمك', 'كسمك', 'كس اختك', 'كس ابوك'] },
  { word: 'كس', language: 'ar', severity: 3 },
  { word: 'خول', language: 'ar', severity: 3, variations: ['مخول'] },
  { word: 'ديوث', language: 'ar', severity: 3 },
  { word: 'اخس', language: 'ar', severity: 2, variations: ['خسيس', 'خسه'] },
  { word: 'وسخ', language: 'ar', severity: 2, variations: ['وسخه', 'اوساخ'] },
  { word: 'نجس', language: 'ar', severity: 2, variations: ['نجاسه'] },
  { word: 'طز', language: 'ar', severity: 1 },
  { word: 'اطلع', language: 'ar', severity: 1 }, // context: "اطلع برا"
  { word: 'انقلع', language: 'ar', severity: 2 },
  { word: 'وجهك', language: 'ar', severity: 1 }, // context: "على وجهك"
  { word: 'حقير', language: 'ar', severity: 2, variations: ['حقيره', 'حقراء'] },
  { word: 'سافل', language: 'ar', severity: 2, variations: ['سافله', 'سفاله'] },
  { word: 'معفن', language: 'ar', severity: 2, variations: ['معفنه'] },
  { word: 'متخلف', language: 'ar', severity: 2, variations: ['متخلفه', 'متخلفين'] },
  { word: 'اهبل', language: 'ar', severity: 2, variations: ['هبل', 'هبله', 'هبيل'] },
  { word: 'مجنون', language: 'ar', severity: 1, variations: ['مجنونه'] },
  { word: 'ابليس', language: 'ar', severity: 2 },
  { word: 'شيطان', language: 'ar', severity: 1 },
  { word: 'ملعون', language: 'ar', severity: 3, variations: ['ملعونه'] },

  // ── Arabic — Threats / harassment ──────────────────────────────────────
  { word: 'اقتلك', language: 'ar', severity: 3, variations: ['بقتلك', 'اذبحك', 'بذبحك'] },
  { word: 'اضربك', language: 'ar', severity: 3, variations: ['بضربك', 'اكسرك'] },
  { word: 'تهديد', language: 'ar', severity: 3 },

  // ── English — Severity 3 ──────────────────────────────────────────────
  { word: 'fuck', language: 'en', severity: 3, variations: ['fck', 'fuk', 'fuq', 'f*ck', 'fking', 'fucking', 'fucked', 'fucker'] },
  { word: 'shit', language: 'en', severity: 2, variations: ['sh1t', 'sht', 'shitty', 'bullshit'] },
  { word: 'bitch', language: 'en', severity: 3, variations: ['b1tch', 'btch', 'biatch'] },
  { word: 'ass', language: 'en', severity: 1, variations: ['a$$', 'asshole', 'a**hole'] },
  { word: 'damn', language: 'en', severity: 1, variations: ['dammit', 'goddamn'] },
  { word: 'bastard', language: 'en', severity: 3, variations: ['bastrd'] },
  { word: 'whore', language: 'en', severity: 3, variations: ['wh0re', 'h0e', 'hoe'] },
  { word: 'slut', language: 'en', severity: 3, variations: ['sl*t'] },
  { word: 'dick', language: 'en', severity: 2, variations: ['d1ck'] },
  { word: 'crap', language: 'en', severity: 1 },
  { word: 'idiot', language: 'en', severity: 1, variations: ['idi0t'] },
  { word: 'stupid', language: 'en', severity: 1, variations: ['stup1d'] },
  { word: 'dumb', language: 'en', severity: 1, variations: ['dumba$$', 'dumbass'] },
  { word: 'nigger', language: 'en', severity: 3, variations: ['n1gger', 'nigg3r', 'nigga'] },
  { word: 'retard', language: 'en', severity: 3, variations: ['retarded', 'r3tard'] },
  { word: 'kill you', language: 'en', severity: 3, variations: ['gonna kill', 'i will kill'] },
  { word: 'die', language: 'en', severity: 2 }, // context-dependent

  // ── Franco-Arabic (Arabic written in Latin letters) ────────────────────
  { word: 'kalb', language: 'ar', severity: 3, variations: ['kelb'] },
  { word: '7mar', language: 'ar', severity: 2, variations: ['7amar', 'hmar'] },
  { word: 'a7maq', language: 'ar', severity: 2 },
  { word: 'sharmouta', language: 'ar', severity: 3, variations: ['sharmou6a', 'shar-mouta'] },
  { word: 'kha5', language: 'ar', severity: 2 },
  { word: 'ya7mar', language: 'ar', severity: 2 },
  { word: '5anzeir', language: 'ar', severity: 3, variations: ['5anzer', 'khanzeir'] },
  { word: 'toz', language: 'ar', severity: 1 },
  { word: 'kosomak', language: 'ar', severity: 3, variations: ['kos omak', 'kos', 'kosomk'] },
]

// ── Build lookup sets for fast O(1) matching ─────────────────────────────

interface CompiledDict {
  exactSet: Set<string>
  wordMap: Map<string, ProfanityEntry>
  allWords: string[] // sorted by length desc for longest-match-first
}

let compiled: CompiledDict | null = null

export function getCompiledDictionary(): CompiledDict {
  if (compiled) return compiled

  const exactSet = new Set<string>()
  const wordMap = new Map<string, ProfanityEntry>()

  for (const entry of PROFANITY_DICTIONARY) {
    const words = [entry.word, ...(entry.variations || [])]
    for (const w of words) {
      const normalized = w.toLowerCase()
      exactSet.add(normalized)
      wordMap.set(normalized, entry)
    }
  }

  const allWords = Array.from(exactSet).sort((a, b) => b.length - a.length)

  compiled = { exactSet, wordMap, allWords }
  return compiled
}
