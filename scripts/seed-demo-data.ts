/**
 * seed-demo-data.ts
 * Fills the database with realistic demo data for the feed:
 *   1. Updates existing seed users with reputation, avatars, bios, gender, roles
 *   2. Adds comments to existing posts
 *   3. Adds reactions to posts
 *   4. Updates the real user (مؤيد)
 *
 * Usage: npx tsx scripts/seed-demo-data.ts
 */

import { Client } from 'pg'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

// ── Load .env.local ────────────────────────────────────────────────────────

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return
  const content = fs.readFileSync(filePath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let val = trimmed.slice(eqIdx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnvFile(path.resolve(__dirname, '..', '.env.local'))
loadEnvFile(path.resolve(__dirname, '..', '.env'))

const DIRECT_URL = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!DIRECT_URL) {
  console.error('ERROR: No DIRECT_URL or DATABASE_URL found in .env.local')
  process.exit(1)
}

// ── Helpers ────────────────────────────────────────────────────────────────

function cuid(): string {
  // Simple cuid-like ID generator
  const timestamp = Date.now().toString(36)
  const random = crypto.randomBytes(8).toString('hex')
  return `c${timestamp}${random}`
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, n)
}

// ── Seed user data ─────────────────────────────────────────────────────────

interface SeedUser {
  phone: string
  name: string
  gender: 'MALE' | 'FEMALE'
  role: 'RESIDENT' | 'NEIGHBORHOOD_MOD'
  accountType: 'NORMAL' | 'SERVICE_PROVIDER'
  bio: string
}

const SEED_USERS: SeedUser[] = [
  {
    phone: '0599900001',
    name: 'أبو عبدالله',
    gender: 'MALE',
    role: 'NEIGHBORHOOD_MOD',
    accountType: 'NORMAL',
    bio: 'مشرف الحي، أحب أساعد الجيران وأحرص على نظافة وأمان حينا',
  },
  {
    phone: '0599900002',
    name: 'فهد',
    gender: 'MALE',
    role: 'RESIDENT',
    accountType: 'NORMAL',
    bio: 'ساكن بالحي من زمان، أحب أطلع أمشي بالحديقة كل يوم',
  },
  {
    phone: '0599900003',
    name: 'أم نورة',
    gender: 'FEMALE',
    role: 'RESIDENT',
    accountType: 'NORMAL',
    bio: 'أم وربة بيت، أحب الطبخ وأشارك وصفاتي مع جاراتي',
  },
  {
    phone: '0599900004',
    name: 'عبدالرحمن',
    gender: 'MALE',
    role: 'RESIDENT',
    accountType: 'NORMAL',
    bio: 'مهندس، أهتم بتطوير الحي ورفع المشاكل للجهات المختصة',
  },
  {
    phone: '0599900005',
    name: 'سارة',
    gender: 'FEMALE',
    role: 'RESIDENT',
    accountType: 'NORMAL',
    bio: 'معلمة، أحب أساعد أطفال الحي بالدراسة',
  },
  {
    phone: '0599900006',
    name: 'خالد',
    gender: 'MALE',
    role: 'RESIDENT',
    accountType: 'SERVICE_PROVIDER',
    bio: 'كهربائي وسباك، خبرة ١٥ سنة، خدماتي لأهل الحي بأسعار مناسبة',
  },
  {
    phone: '0599900007',
    name: 'أبو سلطان',
    gender: 'MALE',
    role: 'NEIGHBORHOOD_MOD',
    accountType: 'NORMAL',
    bio: 'متقاعد وأقضي وقتي بخدمة الحي والجيران، مشرف سابق بالبلدية',
  },
  {
    phone: '0599900008',
    name: 'منيرة',
    gender: 'FEMALE',
    role: 'RESIDENT',
    accountType: 'NORMAL',
    bio: 'طالبة جامعية، أحب التطوع وتنظيم فعاليات الحي',
  },
  {
    phone: '0599900009',
    name: 'ياسر',
    gender: 'MALE',
    role: 'RESIDENT',
    accountType: 'SERVICE_PROVIDER',
    bio: 'فني صيانة جوالات وإلكترونيات، الخدمة عندك بالبيت',
  },
  {
    phone: '0599900010',
    name: 'أم خالد',
    gender: 'FEMALE',
    role: 'RESIDENT',
    accountType: 'SERVICE_PROVIDER',
    bio: 'طباخة بيتي، أسوي أكلات شعبية ومناسبات، الطلب مقدما',
  },
  {
    phone: '0599900011',
    name: 'تركي',
    gender: 'MALE',
    role: 'RESIDENT',
    accountType: 'NORMAL',
    bio: 'شاب من أهل الحي، أحب الرياضة وتنظيف الحدائق',
  },
  {
    phone: '0599900012',
    name: 'نوف',
    gender: 'FEMALE',
    role: 'RESIDENT',
    accountType: 'NORMAL',
    bio: 'مصممة داخلية، أقدم استشارات لأهل الحي بتأثيث بيوتهم',
  },
]

// ── Comment templates ──────────────────────────────────────────────────────

// Category-specific comments
const CATEGORY_COMMENTS: Record<string, string[]> = {
  MARKETPLACE: [
    'كم آخر سعر؟',
    'هل قابل للتفاوض؟',
    'لسى متوفر؟',
    'الحالة كيف؟ استخدام كم سنة؟',
    'وين موقعك بالضبط عشان أمر أشوفه؟',
    'يبيله توصيل ولا لازم أجي آخذه؟',
    'عندك ضمان عليه؟',
    'ممكن ترسل صور أوضح؟',
    'سعر ممتاز، راسلتك خاص',
  ],
  LOOKING_FOR: [
    'أنا أعرف واحد ممتاز، أرسلك رقمه خاص',
    'جرب تسأل بالمحل اللي عند المسجد',
    'أبشر، أنا أقدر أساعدك بهالشي',
    'عندي نفس المشكلة بالضبط، لو أحد يعرف ياليت يفيدنا',
    'راسلتك على الخاص بالتفاصيل',
    'جارنا أبو عبدالله يسوي هالشغل، رقمه معروف',
  ],
  ALERT: [
    'الله يحفظ الجميع، شكراً على التنبيه',
    'لازم نبلغ الجهات المختصة فوراً',
    'شفت نفس الشي من أمس، الحمدلله نبهتنا',
    'لا تنسون تبلغون 911',
    'الله يستر، متى صار هالشي؟',
    'خلوا بالكم يا جماعة وانتبهوا لعيالكم',
  ],
  NEIGHBORHOOD_ISSUE: [
    'فعلاً المشكلة هذي من زمان وما أحد حلها',
    'يا ليت أحد يتواصل مع البلدية',
    'نحتاج نرفع شكوى جماعية على بلدي',
    'عندي نفس المشكلة بالضبط قدام بيتي',
    'نبي حل سريع، الوضع صعب',
    'سجلت شكوى على تطبيق بلدي من أسبوع وما رد أحد',
  ],
  SERVICES: [
    'شغله ممتاز ماشاء الله، أنصح فيه',
    'كم يأخذ تقريباً؟',
    'تجربتي معاه كانت ممتازة، سريع وأمين',
    'هل يجي للبيت ولا لازم نروح له؟',
    'أنا مهتم، كيف أتواصل معك؟',
    'جربته الأسبوع الماضي، شغل نظيف',
  ],
  FOOD_HOME: [
    'يمممم شكلها لذيذة! كيف أطلب؟',
    'كم سعر الوجبة الكاملة؟',
    'هل فيه توصيل للحي؟',
    'جربت منها قبل، طبخها رهييب',
    'ماشاء الله، الله يبارك لك',
    'متى تكون جاهزة لو طلبت اليوم؟',
  ],
  RIDE_REQUEST: [
    'أنا رايح نفس الجهة، أقدر أوصلك',
    'متى تبي تطلع بالضبط؟',
    'الله يوفقك، لو كنت فاضي كان وصلتك',
    'راسلتك خاص',
  ],
  GENERAL: [
    'الله يعطيك العافية',
    'جزاك الله خير على المعلومة',
    'ماشاء الله أهل الحي ما يقصرون',
    'موضوع مهم، متابعين',
    'الله يبارك فيكم يا أهل الحي',
    'إن شاء الله الأمور تتحسن',
  ],
}

// Fallback for categories not in the map
const DEFAULT_COMMENTS = CATEGORY_COMMENTS.GENERAL

// ── Emojis for reactions ───────────────────────────────────────────────────

const EMOJIS = ['❤️', '😂', '👍', '😮', '🙏', '🔥']

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const client = new Client({ connectionString: DIRECT_URL })

  try {
    console.log('Connecting to database...')
    await client.connect()
    console.log('Connected!\n')

    // ================================================================
    // 1. UPDATE SEED USERS
    // ================================================================
    console.log('=== Step 1: Updating seed users ===\n')

    const seedUserIds: { id: string; name: string }[] = []

    for (const user of SEED_USERS) {
      const reputation = randomInt(50, 500)
      const avatarUrl = `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(user.name)}`

      const result = await client.query(
        `UPDATE "User"
         SET reputation = $1,
             role = $2,
             "accountType" = $3,
             "avatarUrl" = $4,
             bio = $5,
             gender = $6,
             "updatedAt" = NOW()
         WHERE phone = $7
         RETURNING id, name`,
        [reputation, user.role, user.accountType, avatarUrl, user.bio, user.gender, user.phone]
      )

      if (result.rows.length > 0) {
        const row = result.rows[0]
        seedUserIds.push({ id: row.id, name: row.name })
        console.log(`  Updated: ${row.name} | rep=${reputation} | ${user.role} | ${user.accountType} | ${user.gender}`)
      } else {
        console.log(`  SKIP: No user found with phone ${user.phone}`)
      }
    }

    console.log(`\n  Total users updated: ${seedUserIds.length}\n`)

    if (seedUserIds.length === 0) {
      console.log('No seed users found. Exiting.')
      return
    }

    // ================================================================
    // 2. ADD COMMENTS TO EXISTING POSTS
    // ================================================================
    console.log('=== Step 2: Adding comments to posts ===\n')

    const postsResult = await client.query(
      `SELECT id, "authorId", title, category FROM "Post" WHERE status = 'ACTIVE' ORDER BY "createdAt" DESC`
    )
    const posts = postsResult.rows
    console.log(`  Found ${posts.length} active posts\n`)

    let totalComments = 0
    let totalCommentLikes = 0

    for (const post of posts) {
      const numComments = randomInt(2, 5)
      // Pick random commenters (not the post author)
      const eligibleCommenters = seedUserIds.filter(u => u.id !== post.authorId)
      const commenters = pickRandom(eligibleCommenters, Math.min(numComments, eligibleCommenters.length))

      for (const commenter of commenters) {
        const pool = CATEGORY_COMMENTS[post.category] || DEFAULT_COMMENTS
        const commentBody = pool[randomInt(0, pool.length - 1)]
        const commentId = cuid()
        const createdAt = new Date(Date.now() - randomInt(60_000, 86_400_000 * 3)) // 1 min to 3 days ago

        await client.query(
          `INSERT INTO "Comment" (id, body, "postId", "authorId", "createdAt")
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING`,
          [commentId, commentBody, post.id, commenter.id, createdAt]
        )
        totalComments++

        // 40% chance of getting a like from another user
        if (Math.random() < 0.4) {
          const liker = pickRandom(seedUserIds.filter(u => u.id !== commenter.id), 1)[0]
          if (liker) {
            const likeId = cuid()
            try {
              await client.query(
                `INSERT INTO "CommentLike" (id, "commentId", "userId", "createdAt")
                 VALUES ($1, $2, $3, NOW())
                 ON CONFLICT DO NOTHING`,
                [likeId, commentId, liker.id]
              )
              totalCommentLikes++
            } catch {
              // duplicate, skip
            }
          }
        }
      }
    }

    console.log(`  Added ${totalComments} comments`)
    console.log(`  Added ${totalCommentLikes} comment likes\n`)

    // ================================================================
    // 3. ADD REACTIONS TO POSTS
    // ================================================================
    console.log('=== Step 3: Adding reactions to posts ===\n')

    let totalReactions = 0

    for (const post of posts) {
      const numReactions = randomInt(3, 8)
      const eligibleReactors = seedUserIds.filter(u => u.id !== post.authorId)
      const reactors = pickRandom(eligibleReactors, Math.min(numReactions, eligibleReactors.length))

      for (const reactor of reactors) {
        const emoji = EMOJIS[randomInt(0, EMOJIS.length - 1)]
        const reactionId = cuid()

        try {
          await client.query(
            `INSERT INTO "Reaction" (id, emoji, "postId", "userId", "createdAt")
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT ("postId", "userId") DO NOTHING`,
            [reactionId, emoji, post.id, reactor.id]
          )
          totalReactions++
        } catch {
          // duplicate user+post, skip
        }
      }
    }

    console.log(`  Added ${totalReactions} reactions\n`)

    // ================================================================
    // 4. UPDATE REAL USER (مؤيد)
    // ================================================================
    console.log('=== Step 4: Updating real user (مؤيد) ===\n')

    const realUserResult = await client.query(
      `UPDATE "User"
       SET reputation = 150,
           "updatedAt" = NOW()
       WHERE phone = '+966564375970'
         AND role = 'SUPER_ADMIN'
       RETURNING id, name, role, reputation`,
    )

    if (realUserResult.rows.length > 0) {
      const ru = realUserResult.rows[0]
      console.log(`  Updated: ${ru.name} | rep=${ru.reputation} | role=${ru.role}`)
    } else {
      // Try without role filter
      const fallback = await client.query(
        `UPDATE "User"
         SET reputation = 150,
             "updatedAt" = NOW()
         WHERE phone = '+966564375970'
         RETURNING id, name, role, reputation`,
      )
      if (fallback.rows.length > 0) {
        const ru = fallback.rows[0]
        console.log(`  Updated: ${ru.name} | rep=${ru.reputation} | role=${ru.role}`)
      } else {
        console.log('  Real user not found with phone +966564375970')
      }
    }

    // ================================================================
    // SUMMARY
    // ================================================================
    console.log('\n========================================')
    console.log('  SEED COMPLETE')
    console.log('========================================')
    console.log(`  Users updated:    ${seedUserIds.length}`)
    console.log(`  Comments added:   ${totalComments}`)
    console.log(`  Comment likes:    ${totalCommentLikes}`)
    console.log(`  Reactions added:  ${totalReactions}`)
    console.log(`  Posts processed:  ${posts.length}`)
    console.log('========================================\n')

  } catch (err) {
    console.error('ERROR:', err)
    process.exit(1)
  } finally {
    await client.end()
    console.log('Database connection closed.')
  }
}

main()
