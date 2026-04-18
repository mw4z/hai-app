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
  // Root نيك (Arabic sexual slur, past/imperative/noun forms + common misspellings
  // with letter doubling). The normalizer collapses 3+ repeats, so these explicit
  // doubled variants catch the 2-letter repeat bypass (e.g. ناكك, نااك, نيييك).
  { word: 'نيك', language: 'ar', severity: 3, variations: [
    'ناك', 'انيك', 'انيكك', 'نياك', 'نيكك', 'ناكك', 'نااك', 'ناااك',
    'نيوك', 'منيوك', 'منيوكه', 'منيوكة', 'منيوكين',
    'نياكه', 'نياكة', 'نياكين', 'نياكي',
    'نيكها', 'ناكها', 'نيكتك', 'نيكك', 'نيكو',
    'ينيك', 'ينيكك', 'انيكك', 'انيككم',
    // Franco-Arabic
    'neek', 'naak', 'neik', 'nayek', 'manyook', 'manyouk', 'manyuk',
  ]},
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

  // ── Saudi dialect expansion (v4 dictionary, 2026-04) ──────────────────
  // خفيف → severity 1 (warn). متوسط → severity 2 (block). قوي → severity 3 (block).

  // Animal insults (خفيف/متوسط → warn → block on accumulation)
  { word: 'حيوان', language: 'ar', severity: 2, variations: ['حيوانات', 'بهيم', 'بهايم'] },
  { word: 'تيس', language: 'ar', severity: 2, variations: ['تيوس'] },
  { word: 'جحش', language: 'ar', severity: 2 },

  // Character insults (متوسط → block)
  { word: 'اهبل', language: 'ar', severity: 2, variations: ['هبل', 'هبله', 'هبيل', 'اهبال'] },
  { word: 'بليد', language: 'ar', severity: 2 },
  { word: 'سطل', language: 'ar', severity: 2, variations: ['يا سطل'] },
  { word: 'ابله', language: 'ar', severity: 2 },
  { word: 'اجدب', language: 'ar', severity: 2 },
  { word: 'جبان', language: 'ar', severity: 2, variations: ['جبانه'] },
  { word: 'فاشل', language: 'ar', severity: 1, variations: ['فاشله', 'فاشلين'] },
  { word: 'رخم', language: 'ar', severity: 1, variations: ['رخمه'] },
  { word: 'قذر', language: 'ar', severity: 2, variations: ['قذره'] },
  { word: 'رخيص', language: 'ar', severity: 2, variations: ['رخيصه'] },
  { word: 'زفت', language: 'ar', severity: 2, variations: ['زبالة', 'زباله'] },
  { word: 'جزمة', language: 'ar', severity: 2, variations: ['جزمه'] },
  { word: 'فاجر', language: 'ar', severity: 3, variations: ['فاجره', 'فاجرين'] },
  { word: 'فاسق', language: 'ar', severity: 3, variations: ['فاسقه', 'فاسقين'] },
  { word: 'ساقط', language: 'ar', severity: 3, variations: ['ساقطه', 'ساقطين'] },

  // Body / sexual (قوي → block)
  { word: 'خرا', language: 'ar', severity: 3, variations: ['خرى', 'كول خرا', 'خرا عليك', 'خرا في وجهك'] },
  { word: 'طيز', language: 'ar', severity: 3, variations: ['طيزك', 'طيزه', 'طيز أمك', 'طيز امك'] },
  { word: 'تيز', language: 'ar', severity: 3, variations: ['تيزك', 'تيزه', 'تيز أمك', 'تيز امك'] },
  { word: 'مكوه', language: 'ar', severity: 3, variations: ['مكوهك', 'مكوه امك', 'مكوه أمك'] },
  { word: 'زب', language: 'ar', severity: 3, variations: ['زبي', 'زبك', 'زبه', 'زبوب'] },
  { word: 'اير', language: 'ar', severity: 3, variations: ['أير', 'أيري', 'ايري', 'اير الكلب', 'اير الحمار', 'اير الجحش'] },
  { word: 'عير', language: 'ar', severity: 3, variations: ['عيري', 'عيرة', 'عيره'] },
  { word: 'فشخ', language: 'ar', severity: 3, variations: ['فشخك', 'فشخ طيزك', 'فشخ كسك'] },
  { word: 'مص', language: 'ar', severity: 3, variations: ['مص زبي', 'مص أيري', 'مص ايري', 'مص طيزي', 'مص زب أمك'] },
  { word: 'لحس', language: 'ar', severity: 3, variations: ['تلحس', 'تلحس طيزي', 'تلحس تيزي', 'تلحس أيري', 'تلحس زبي'] },
  { word: 'متناك', language: 'ar', severity: 3, variations: ['متناكة', 'متناكه', 'ابن المتناكة', 'ابن المتناكه'] },
  { word: 'مومس', language: 'ar', severity: 3, variations: ['مومسه', 'مومسة'] },
  { word: 'داعر', language: 'ar', severity: 3, variations: ['داعره', 'داعرة', 'دعاره'] },
  { word: 'مهتوك', language: 'ar', severity: 3, variations: ['مهتوكه', 'مهتوكة'] },
  { word: 'شلكه', language: 'ar', severity: 3, variations: ['شلكة'] },

  // Slurs for gay men (قوي → block)
  { word: 'زامل', language: 'ar', severity: 3 },
  { word: 'خنيث', language: 'ar', severity: 3, variations: ['مخنث', 'مخنثين'] },
  { word: 'بزرنجي', language: 'ar', severity: 3 },
  { word: 'قواد', language: 'ar', severity: 3, variations: ['قوادين'] },
  { word: 'جرار', language: 'ar', severity: 3, variations: ['جرارين'] },

  // Compound sexual phrases — substring scan will catch these even when
  // users insert spaces/punctuation/diacritics (normalizer strips them).
  { word: 'كس امك', language: 'ar', severity: 3, variations: [
    'كسمك', 'كسامك', 'كس امك اللي جابتك', 'كس أم اللي جابك',
    'كس اختك', 'كسختك', 'كس بنتك', 'كس طيزك', 'كسك',
    'يلعن كس امك', 'يلعن كس أمك', 'كس امك وأيري فيك',
  ]},
  { word: 'نيك امك', language: 'ar', severity: 3, variations: [
    'نيك أمك', 'نيك اختك', 'نيك أختك', 'نيك طيزك', 'نيك كسك',
    'نيك مكوهك', 'نيك طيز امك', 'نيك في طيزك',
  ]},
  { word: 'اير فيك', language: 'ar', severity: 3, variations: [
    'أيري فيك', 'ايري فيك', 'عيري فيك', 'عير فيك',
    'أير في امك', 'أيري في امك', 'أيري في اختك', 'أيري في طيزك',
    'أيري في مكوهك', 'أيري في كس امك', 'أيري في طيز امك',
    'عير في امك', 'عير في اختك', 'أيري باللي جابك',
  ]},
  { word: 'ابن القحبه', language: 'ar', severity: 3, variations: [
    'ابن القحبة', 'ابن قحبه', 'ابن قحبة', 'ابن الشرموطه', 'ابن الشرموطة',
    'ابن العاهره', 'ابن العاهرة', 'ابن الزانيه', 'ابن الزانية',
    'ابن المنيوك', 'ابن المنيوكه', 'ابن الديوث', 'ابن الجرار', 'ابن المكوه',
  ]},
  { word: 'ملعون ابوك', language: 'ar', severity: 3, variations: [
    'يلعن ابوك', 'يلعن أبوك', 'الله يلعن ابوك', 'الله يلعن أبوك',
    'الله يلعن أمك', 'الله يلعن امك', 'الله يلعن اختك', 'الله يلعن أختك',
    'يلعن أمك وأختك', 'يلعن امك واختك', 'يخرب بيتك', 'يخرب بيت امك',
    'الله ياخذك', 'الله ياخذ امك', 'الله يعميك', 'الله يعمي امك',
  ]},
  { word: 'كول خرا', language: 'ar', severity: 3, variations: ['كول زفت', 'كل خرا', 'كل زفت'] },

  // Franco-Arabic expansions of the new additions
  { word: 'tiz', language: 'ar', severity: 3, variations: ['tez', '6iz', '6ez', 'tizak', 'tezak'] },
  { word: 'zeb', language: 'ar', severity: 3, variations: ['zob', 'zobi', 'zby'] },
  { word: 'ayr', language: 'ar', severity: 3, variations: ['3yr', 'ayri', '3yri', 'ayr fek', '3yr fyk', 'ayr feek'] },
  { word: 'fshkh', language: 'ar', severity: 3, variations: ['fshkhk', 'f4kh'] },
  { word: 'diyouth', language: 'ar', severity: 3, variations: ['dayouth', 'dayoot'] },
  { word: 'koss omak', language: 'ar', severity: 3, variations: ['kos omak', 'kosomak', 'kusumk', 'ksumk', 'kes omak'] },
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
