import { db } from '@/lib/db'
import { PostCategory } from '@prisma/client'

// ── Seed user personas — realistic Saudi-style first names ──────────────────
// 12 distinct names that feel like real neighbors, not templates.
const SEED_PERSONAS = [
  { name: 'أبو عبدالله',   phone: '0599900001' },
  { name: 'فهد',           phone: '0599900002' },
  { name: 'أم نورة',       phone: '0599900003' },
  { name: 'عبدالرحمن',     phone: '0599900004' },
  { name: 'سارة',          phone: '0599900005' },
  { name: 'خالد',          phone: '0599900006' },
  { name: 'أبو سلطان',     phone: '0599900007' },
  { name: 'منيرة',          phone: '0599900008' },
  { name: 'ياسر',          phone: '0599900009' },
  { name: 'أم خالد',       phone: '0599900010' },
  { name: 'تركي',          phone: '0599900011' },
  { name: 'نوف',           phone: '0599900012' },
]

// ── Content pool — multiple variants per category ───────────────────────────

const CONTENT_POOL: Record<string, { title: string; body: string }[]> = {
  LOOKING_FOR: [
    { title: 'أحد يعرف سباك كويس؟', body: 'عندي تسريب بالمطبخ من يومين وما لقيت أحد، اللي عنده رقم سباك زين ياليت يرسله' },
    { title: 'وين ألقى معلمة تأسيس؟', body: 'بنتي بثاني ابتدائي ومحتاجة معلمة تأسيس، يفضل وحدة من الحي عشان قريبة' },
    { title: 'محتاج كهربائي بأسرع وقت', body: 'الكهرب يفصل عندي كل شوي، أحد عنده رقم كهربائي يفهم شغله؟' },
    { title: 'أحد يعرف شقة فاضية بالحي؟', body: 'أدور شقة 3 غرف هنا بالحي أو قريب، اللي يعرف شي يكلمني' },
    { title: 'وين أقرب خياطة؟', body: 'محتاجة خياطة تعدل لي ثوب بأسرع وقت، أفضل وحدة قريبة' },
    { title: 'أحد جرب مغسلة السيارات الجديدة؟', body: 'شفت مغسلة جديدة فتحت بالحي، أحد جربها؟ كيف شغلهم؟' },
    { title: 'محتاج نجار يركب لي رفوف', body: 'أبي أحد يركب رفوف بالصالة، من عنده رقم نجار سعره معقول؟' },
    { title: 'أحد يوصي بحداد كويس؟', body: 'أبي أسوي باب حديد للمدخل، محتاج حداد شغله نظيف' },
  ],
  NEIGHBORHOOD_ISSUE: [
    { title: 'ليه الإنارة طافية بالشارع؟', body: 'الشارع الخلفي مظلم من أسبوع تقريباً، أحد بلّغ البلدية؟' },
    { title: 'فيه حفرة خطيرة عند المنعطف', body: 'انتبهوا فيه حفرة كبيرة عند المنعطف الثاني، بالليل ما تنشاف' },
    { title: 'مين رمى مخلفات بناء؟', body: 'أحد رمى أنقاض ومخلفات آخر الشارع، وش الحل؟ نبلّغ البلدية؟' },
    { title: 'السيارات تطير أمام المدرسة', body: 'السرعة أمام المدرسة مو طبيعية خصوصاً وقت الطلعة، لازم مطبات' },
    { title: 'ريحة المجاري ما تنطاق', body: 'عند تقاطع الشارع الرئيسي فيه ريحة صرف صحي قوية من كم يوم' },
    { title: 'القطط صارت كثيرة مرة', body: 'عند الحاويات القطط تكاثرت بشكل مو طبيعي، لازم نتصرف' },
  ],
  ALERT: [
    { title: 'فيه انقطاع موية اليوم؟', body: 'الموية قاطعة عندي من الصبح، هل عندكم نفس المشكلة ولا بس أنا؟' },
    { title: 'انتبهوا حفريات بالشارع الرئيسي', body: 'شركة الكهرب فاتحين الشارع الرئيسي، الله يعينكم بالزحمة' },
    { title: 'الجو يقلب الليلة ترى', body: 'الأرصاد محذرة من أمطار قوية، لا تنسون تسكرون شبابيككم' },
    { title: 'فيه كلب يتمشى بالحي', body: 'شفت كلب ضال كبير يدور بالحي، خلوا بالكم على العيال' },
  ],
  SERVICES: [
    { title: 'فني تكييف إذا أحد يحتاج', body: 'أصلح تكييف سبليت ومركزي، شغال بالحي وأسعاري مناسبة، كلموني' },
    { title: 'معلم دهان تحت أمركم', body: 'دهان داخلي وخارجي، الشغل نظيف ومضمون إن شاء الله، راسلوني خاص' },
    { title: 'غسيل سيارات عند بيتك', body: 'أغسل سيارتك عند البيت، غسيل كامل بـ 50 وتلميع بـ 100' },
    { title: 'معلمة قرآن للنساء والأطفال', body: 'أعلم قرآن حفظ وتجويد، حضوري أو أونلاين، رسلوني للتفاصيل' },
    { title: 'نقل عفش مع فك وتركيب', body: 'عندنا فريق نقل عفش كامل، فك وتركيب ونقل، أسعارنا حلوة' },
  ],
  MARKETPLACE: [
    { title: 'مكيف سبليت نظيف للبيع', body: 'مكيف 18 وحدة استخدام سنتين بس، شغال تمام. أبيعه بـ 800' },
    { title: 'طاولة أكل مع 6 كراسي', body: 'طاولة خشب مع كراسيها بحالة ممتازة، أبيها بـ 600 ريال' },
    { title: 'سيكل أطفال شبه جديد', body: 'سيكل مقاس 16 استخدام خفيف، ولدي كبر عليه. بـ 150 ريال' },
    { title: 'غسالة LG للبيع', body: 'غسالة 8 كيلو عمرها 3 سنوات تشتغل زي الجديدة، أبيها بـ 500' },
    { title: 'كتب مدرسية ببلاش', body: 'عندي كتب متوسط السنة اللي فاتت، اللي يبيها يجي ياخذها مجاناً' },
  ],
  LOST_FOUND: [
    { title: 'لقيت مفاتيح عند المسجد', body: 'بعد صلاة العشاء لقيت كم مفتاح عند الباب، اللي ضايعة منه يكلمني' },
    { title: 'ضايعة مني محفظتي', body: 'ضيعت محفظة جلد بني قرب البقالة أمس، فيها بطاقاتي، الله يجزاكم خير' },
    { title: 'أحد شاف قطة بيضا تايهة؟', body: 'قطتي شيرازي أبيض ضاع من أمس، آخر مرة كان عند الحديقة' },
    { title: 'لقيت جوال بالحديقة', body: 'لقيت آيفون على المقاعد بالحديقة، صاحبه يوصف لي إياه وأعطيه' },
  ],
  MOSQUE: [
    { title: 'التراويح الليلة الساعة كم؟', body: 'أحد يعرف وقت صلاة التراويح الليلة بمسجد الحي؟' },
    { title: 'فيه درس كل ثلاثاء بالمسجد', body: 'تذكير: كل ثلاثاء بعد المغرب فيه درس بالمسجد، حياكم' },
  ],
  GENERAL: [
    { title: 'الله يجزاه خير اللي رجع محفظتي', body: 'أشكر الجار اللي لقى محفظتي ورجعها لي أمس، ما قصّر والله' },
    { title: 'رمضان مبارك يا جيران', body: 'كل سنة وأنتم طيبين، رمضان كريم على أهل الحي كلهم' },
    { title: 'يعطيهم العافية شباب الحي', body: 'الشباب نظفوا الحديقة اليوم ما شاء الله عليهم، يستاهلون الشكر' },
  ],
}

// ── Two-phase distribution ──────────────────────────────────────────────────
// Phase 1: initial seed (6-8 posts) — diverse, community-first
//   Core = always included, Optional = randomly included (0-2 of them)
// Phase 2: lazy backfill (up to ~13 total) — triggered later if still low

const PHASE_1_CORE: { category: PostCategory; count: number }[] = [
  { category: 'LOOKING_FOR', count: 2 },
  { category: 'NEIGHBORHOOD_ISSUE', count: 1 },
  { category: 'ALERT', count: 1 },
  { category: 'LOST_FOUND', count: 1 },
  { category: 'SERVICES', count: 1 },
]
// 0, 1, or 2 of these are randomly added each time → total 6-8
const PHASE_1_OPTIONAL: { category: PostCategory; count: number }[] = [
  { category: 'GENERAL', count: 1 },
  { category: 'MOSQUE', count: 1 },
]

function buildPhase1(): { category: PostCategory; count: number }[] {
  const extras = pickRandom(PHASE_1_OPTIONAL, Math.floor(Math.random() * 3)) // 0, 1, or 2
  return [...PHASE_1_CORE, ...extras]
}

const PHASE_1_MIN = PHASE_1_CORE.reduce((s, d) => s + d.count, 0) // 6
const PHASE_1_MAX = PHASE_1_MIN + PHASE_1_OPTIONAL.reduce((s, d) => s + d.count, 0) // 8

const PHASE_2: { category: PostCategory; count: number }[] = [
  { category: 'LOOKING_FOR', count: 1 },
  { category: 'NEIGHBORHOOD_ISSUE', count: 1 },
  { category: 'MARKETPLACE', count: 2 },
  { category: 'SERVICES', count: 1 },
]

const MAX_SEED_POSTS = PHASE_1_MAX + PHASE_2.reduce((s, d) => s + d.count, 0) // 13
const REAL_POST_THRESHOLD = 15 // stop all seeding
const LOW_CONTENT_THRESHOLD = 8  // trigger phase 1
const BACKFILL_THRESHOLD = 5     // trigger phase 2 (still low after phase 1 + some time)
const BACKFILL_MIN_AGE_HOURS = 12 // only backfill if oldest seed is > 12h old

// ── Helpers ─────────────────────────────────────────────────────────────────

function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, n)
}

/** Generate N unique random timestamps spread across a window.
 *  Each timestamp is fully random within the window — no even spacing. */
function generateTimestamps(count: number, windowHoursMin: number, windowHoursMax: number): Date[] {
  const now = Date.now()
  const minMs = windowHoursMin * 3600_000
  const maxMs = windowHoursMax * 3600_000
  return Array.from({ length: count }, () => {
    const offset = minMs + Math.random() * (maxMs - minMs)
    return new Date(now - offset)
  }).sort((a, b) => b.getTime() - a.getTime()) // newest first
}

/** Shuffle array in place (Fisher-Yates) */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function getOrCreateSeedUser(neighborhoodId: string, personaIndex: number): Promise<string> {
  const persona = SEED_PERSONAS[personaIndex % SEED_PERSONAS.length]

  let user = await db.user.findUnique({ where: { phone: persona.phone } })
  if (!user) {
    try {
      user = await db.user.create({
        data: {
          phone: persona.phone,
          name: persona.name,
          isVerified: true,
          isSeed: true,
          neighborhoodId,
        },
      })
    } catch {
      // Race condition: another call created it first — just fetch it
      user = await db.user.findUnique({ where: { phone: persona.phone } })
    }
  } else if (!user.isSeed) {
    // Backfill the flag for pre-existing seed users (one-time, cheap)
    await db.user.update({ where: { id: user.id }, data: { isSeed: true } })
  }
  return user!.id
}

async function insertSeedPosts(
  neighborhoodId: string,
  distribution: { category: PostCategory; count: number }[],
  existingTitles: Set<string>,
  timestampWindow: { minHours: number; maxHours: number },
): Promise<number> {
  // Step 1: collect content picks per category
  const rawPicks: { title: string; body: string; category: PostCategory }[] = []

  for (const { category, count } of distribution) {
    const pool = CONTENT_POOL[category] || []
    const available = pool.filter(p => !existingTitles.has(p.title))
    const picks = pickRandom(available, Math.min(count, available.length))
    for (const pick of picks) {
      rawPicks.push({ ...pick, category })
    }
  }

  if (rawPicks.length === 0) return 0

  // Step 2: shuffle so categories are interleaved, not sequential
  const shuffledPicks = shuffle(rawPicks)

  // Step 3: assign random personas — avoid same author on consecutive posts
  const personaOrder = shuffle(
    Array.from({ length: shuffledPicks.length }, (_, i) => i % SEED_PERSONAS.length)
  )
  // Fix consecutive duplicates
  for (let i = 1; i < personaOrder.length; i++) {
    if (personaOrder[i] === personaOrder[i - 1]) {
      const swap = personaOrder.findIndex((v, j) => j > i && v !== personaOrder[i])
      if (swap !== -1) [personaOrder[i], personaOrder[swap]] = [personaOrder[swap], personaOrder[i]]
    }
  }

  // Step 4: generate fully random timestamps (not evenly spaced)
  const timestamps = generateTimestamps(
    shuffledPicks.length,
    timestampWindow.minHours,
    timestampWindow.maxHours,
  )

  // Step 5: build final post records (sequential to avoid user creation race)
  const postsToCreate = []
  for (let i = 0; i < shuffledPicks.length; i++) {
    const pick = shuffledPicks[i]
    const authorId = await getOrCreateSeedUser(neighborhoodId, personaOrder[i])
    existingTitles.add(pick.title)
    postsToCreate.push({
      title: pick.title,
      body: pick.body,
      category: pick.category,
      authorId,
      neighborhoodId,
      status: 'ACTIVE' as const,
      isSeed: true as const,
      createdAt: timestamps[i],
    })
  }

  await db.post.createMany({ data: postsToCreate })
  return postsToCreate.length
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function seedNeighborhood(neighborhoodId: string): Promise<number> {
  const realPostCount = await db.post.count({
    where: { neighborhoodId, isSeed: false, status: 'ACTIVE' },
  })
  if (realPostCount >= REAL_POST_THRESHOLD) return 0

  const existingSeeds = await db.post.findMany({
    where: { neighborhoodId, isSeed: true },
    select: { title: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const existingSeedCount = existingSeeds.length
  const existingTitles = new Set(existingSeeds.map(p => p.title))

  if (existingSeedCount >= MAX_SEED_POSTS) return 0

  // Phase 1: initial seed (0 → 6-8 posts, randomized each time)
  if (existingSeedCount < PHASE_1_MIN) {
    const phase1 = buildPhase1() // randomly includes 0-2 optional categories
    const count = await insertSeedPosts(
      neighborhoodId, phase1, existingTitles,
      { minHours: 2, maxHours: 48 }, // spread across last 2-48 hours
    )
    console.log(`[SEED] Phase 1: ${count} posts in ${neighborhoodId}`)
    return count
  }

  // Phase 2: lazy backfill — only if oldest seed is > 12h old AND still low content
  const totalPosts = realPostCount + existingSeedCount
  if (totalPosts < LOW_CONTENT_THRESHOLD + BACKFILL_THRESHOLD) {
    const oldestSeed = existingSeeds[0]
    const ageHours = oldestSeed
      ? (Date.now() - new Date(oldestSeed.createdAt).getTime()) / 3600_000
      : 999

    if (ageHours >= BACKFILL_MIN_AGE_HOURS) {
      const count = await insertSeedPosts(
        neighborhoodId, PHASE_2, existingTitles,
        { minHours: 1, maxHours: 24 }, // phase 2 feels more recent
      )
      console.log(`[SEED] Phase 2: ${count} posts in ${neighborhoodId}`)
      return count
    }
  }

  return 0
}

export async function seedAllNeighborhoods(): Promise<{ total: number; neighborhoods: number }> {
  const neighborhoods = await db.neighborhood.findMany({ select: { id: true } })

  let totalSeeded = 0
  let nbhdSeeded = 0

  for (const nbhd of neighborhoods) {
    const count = await seedNeighborhood(nbhd.id)
    if (count > 0) {
      totalSeeded += count
      nbhdSeeded++
    }
  }

  if (totalSeeded > 0) {
    console.log(`[SEED] Done: ${totalSeeded} posts across ${nbhdSeeded} neighborhoods`)
  }

  return { total: totalSeeded, neighborhoods: nbhdSeeded }
}

export async function ensureNeighborhoodContent(neighborhoodId: string): Promise<void> {
  const postCount = await db.post.count({
    where: { neighborhoodId, status: 'ACTIVE' },
  })

  if (postCount < LOW_CONTENT_THRESHOLD) {
    await seedNeighborhood(neighborhoodId)
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN-FACING: custom quantities + seed comments + clear ops
// ══════════════════════════════════════════════════════════════════════════

// ── Seed comment pool ──────────────────────────────────────────────────────
const SEED_COMMENT_POOL: string[] = [
  'شكراً على المعلومة 🙏',
  'نفس المشكلة عندي، الله يعين',
  'بلّغت البلدية قبل، خذوا بالكم',
  'وأخيراً أحد انتبه لهذا الموضوع',
  'عندي رقم كويس، راسلني خاص',
  'صح كلامك، نحتاج نتحرك',
  'الله يعطيك العافية',
  'شكراً جزيلاً، معلومة مهمة',
  'تسلم على المبادرة',
  'نفس رأيي، أتفق معك',
  'الله يجزاك خير',
  'جربت شي مشابه، ما نفع معي',
  'فعلاً نحتاج حل عاجل',
  'أبشرك، فيه عند الدكان الجديد',
  'هذي المشكلة من زمان',
]

/**
 * Generate seed comments on seed posts in a neighborhood.
 * Picks random seed users as authors, random seed posts as targets.
 */
export async function generateSeedComments(
  neighborhoodId: string,
  commentsPerPost: number,
): Promise<number> {
  const seedPosts = await db.post.findMany({
    where: { neighborhoodId, isSeed: true, status: 'ACTIVE' },
    select: { id: true, authorId: true },
  })
  if (seedPosts.length === 0) return 0

  const seedUsers = await db.user.findMany({
    where: { isSeed: true },
    select: { id: true },
  })
  if (seedUsers.length === 0) return 0

  // Ensure at least a few personas exist in this neighborhood by touching each
  for (let i = 0; i < Math.min(SEED_PERSONAS.length, 6); i++) {
    await getOrCreateSeedUser(neighborhoodId, i)
  }
  const seedUsersAll = await db.user.findMany({
    where: { isSeed: true },
    select: { id: true },
  })

  let created = 0
  const commentsToCreate: any[] = []

  for (const post of seedPosts) {
    const count = Math.max(0, Math.min(commentsPerPost, SEED_COMMENT_POOL.length))
    const picks = pickRandom(SEED_COMMENT_POOL, count)
    for (const body of picks) {
      // Pick a seed user that's not the post author
      const candidates = seedUsersAll.filter(u => u.id !== post.authorId)
      if (candidates.length === 0) continue
      const author = candidates[Math.floor(Math.random() * candidates.length)]
      // Backdate between 5 min and 36 hours ago
      const minutesAgo = 5 + Math.floor(Math.random() * (36 * 60 - 5))
      commentsToCreate.push({
        body,
        postId: post.id,
        authorId: author.id,
        createdAt: new Date(Date.now() - minutesAgo * 60_000),
      })
    }
  }

  if (commentsToCreate.length > 0) {
    // createMany in chunks of 100 to avoid argument size limits
    for (let i = 0; i < commentsToCreate.length; i += 100) {
      const chunk = commentsToCreate.slice(i, i + 100)
      const res = await db.comment.createMany({ data: chunk })
      created += res.count
    }
  }
  return created
}

/**
 * Generate up to `targetCount` seed posts in a neighborhood, ignoring
 * the lazy-backfill thresholds. For SUPER_ADMIN "bulk generate" button.
 *
 * Caps strictly at targetCount — picks are distributed across available
 * categories round-robin and then trimmed so we never over-generate.
 */
export async function generateSeedPostsExact(
  neighborhoodId: string,
  targetCount: number,
): Promise<number> {
  if (targetCount <= 0) return 0

  const existingSeeds = await db.post.findMany({
    where: { neighborhoodId, isSeed: true },
    select: { title: true },
  })
  const existingTitles = new Set(existingSeeds.map((p) => p.title))

  // Collect available picks per category, then round-robin until we
  // reach targetCount. This guarantees we never exceed the target and
  // keeps the mix diverse when the target < number of categories.
  const categories = Object.keys(CONTENT_POOL) as PostCategory[]
  const pools: Record<string, { title: string; body: string }[]> = {}
  for (const cat of categories) {
    pools[cat] = shuffle(
      (CONTENT_POOL[cat] || []).filter((p) => !existingTitles.has(p.title)),
    )
  }

  const picked: { category: PostCategory; count: number }[] = []
  const catMap: Record<string, number> = {}
  let total = 0
  let exhausted = 0

  while (total < targetCount && exhausted < categories.length) {
    exhausted = 0
    for (const cat of categories) {
      if (total >= targetCount) break
      const pool = pools[cat]
      if (!pool || pool.length === 0) {
        exhausted++
        continue
      }
      // Pop one — we only use it once
      pool.pop()
      catMap[cat] = (catMap[cat] || 0) + 1
      total++
    }
  }

  for (const cat of categories) {
    if (catMap[cat]) {
      picked.push({ category: cat, count: catMap[cat] })
    }
  }

  if (picked.length === 0) return 0

  return insertSeedPosts(
    neighborhoodId,
    picked,
    existingTitles,
    { minHours: 1, maxHours: 72 },
  )
}

/**
 * Delete seed content. Scope options:
 *  - posts:    only seed posts (and their cascade-deleted comments/reactions)
 *  - comments: only seed comments authored by seed users
 *  - all:      seed posts + seed comments + (optionally) seed users
 */
export async function clearSeedContent(options: {
  neighborhoodId?: string
  scope: 'posts' | 'comments' | 'all'
  includeUsers?: boolean
}): Promise<{ posts: number; comments: number; users: number }> {
  const { neighborhoodId, scope, includeUsers } = options
  let postsDeleted = 0
  let commentsDeleted = 0
  let usersDeleted = 0

  const nbhdFilter = neighborhoodId ? { neighborhoodId } : {}

  if (scope === 'comments' || scope === 'all') {
    // Delete comments authored by seed users, scoped by neighborhood if given
    const del = await db.comment.deleteMany({
      where: {
        author: { isSeed: true },
        ...(neighborhoodId ? { post: { neighborhoodId } } : {}),
      },
    })
    commentsDeleted = del.count
  }

  if (scope === 'posts' || scope === 'all') {
    // Cascade-delete comments + reactions when posts go via Prisma cascade
    const del = await db.post.deleteMany({
      where: {
        isSeed: true,
        ...nbhdFilter,
      },
    })
    postsDeleted = del.count
  }

  if (scope === 'all' && includeUsers) {
    // Deleting seed users is risky (they may have real rep history) — only
    // when explicitly requested. Unscoped by neighborhood since seed users
    // are shared across all neighborhoods via phone convention.
    const del = await db.user.deleteMany({ where: { isSeed: true } })
    usersDeleted = del.count
  }

  return { posts: postsDeleted, comments: commentsDeleted, users: usersDeleted }
}

/**
 * Return aggregate seed stats for admin dashboard.
 */
export async function getSeedStats(): Promise<{
  totalSeedUsers: number
  totalSeedPosts: number
  totalSeedComments: number
  perNeighborhood: Array<{
    id: string
    name: string
    nameEn: string
    seedPosts: number
    seedComments: number
    realPosts: number
  }>
}> {
  // Self-heal: backfill isSeed for any pre-existing users matching the seed
  // phone pattern that haven't been flagged yet.
  await db.user.updateMany({
    where: {
      phone: { startsWith: '059990000' },
      isSeed: false,
    },
    data: { isSeed: true },
  })

  const [totalSeedUsers, totalSeedPosts, totalSeedComments, neighborhoods] =
    await Promise.all([
      db.user.count({ where: { isSeed: true } }),
      db.post.count({ where: { isSeed: true } }),
      db.comment.count({ where: { author: { isSeed: true } } }),
      db.neighborhood.findMany({
        where: { hidden: false },
        select: { id: true, name: true, nameEn: true },
        orderBy: { name: 'asc' },
      }),
    ])

  const perNeighborhood = await Promise.all(
    neighborhoods.map(async (n) => {
      const [seedPosts, seedComments, realPosts] = await Promise.all([
        db.post.count({ where: { neighborhoodId: n.id, isSeed: true } }),
        db.comment.count({
          where: {
            post: { neighborhoodId: n.id },
            author: { isSeed: true },
          },
        }),
        db.post.count({
          where: {
            neighborhoodId: n.id,
            isSeed: false,
            status: { in: ['ACTIVE', 'IN_PROGRESS'] },
          },
        }),
      ])
      return {
        id: n.id,
        name: n.name,
        nameEn: n.nameEn,
        seedPosts,
        seedComments,
        realPosts,
      }
    }),
  )

  return {
    totalSeedUsers,
    totalSeedPosts,
    totalSeedComments,
    perNeighborhood,
  }
}
