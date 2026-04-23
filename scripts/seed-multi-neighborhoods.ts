/**
 * Seed multiple neighborhoods with users and posts for demo.
 * Creates 3-5 users + 5-8 posts per neighborhood.
 */

import { Client } from 'pg'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

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
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
    if (!process.env[key]) process.env[key] = val
  }
}
loadEnvFile(path.resolve('.env.local'))
loadEnvFile(path.resolve('.env'))

const DIRECT_URL = process.env.DIRECT_URL || process.env.DATABASE_URL!
const cuid = () => crypto.randomBytes(12).toString('hex')
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
const pick = <T>(arr: T[]): T => arr[rand(0, arr.length - 1)]

function svgAvatar(emoji: string, bg1: string, bg2: string): string {
  return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#${bg1}"/><stop offset="1" stop-color="#${bg2}"/></linearGradient></defs><circle cx="100" cy="100" r="100" fill="url(#g)"/><text x="100" y="118" text-anchor="middle" font-size="80">${emoji}</text></svg>`)
}

const MALE_NAMES = ['محمد', 'عبدالله', 'أحمد', 'سعود', 'ناصر', 'بندر', 'ماجد', 'سلطان', 'تركي', 'فيصل', 'عمر', 'يوسف', 'إبراهيم', 'حسن', 'علي']
const FEMALE_NAMES = ['نورة', 'سارة', 'فاطمة', 'هند', 'ريم', 'لطيفة', 'منيرة', 'عبير', 'أمل', 'دانة', 'لمى', 'هيا', 'مشاعل', 'غادة']

const MALE_AVATARS = [
  svgAvatar('👨', '0ea5e9', '0284c7'),
  svgAvatar('👨', '7c3aed', '6d28d9'),
  svgAvatar('👨', '1e3a5f', '0f172a'),
  svgAvatar('👨', 'd97706', '92400e'),
  svgAvatar('🧑', '0d9488', '0f766e'),
  svgAvatar('👨', '334155', '475569'),
]
const FEMALE_AVATARS = [
  svgAvatar('👩', 'e11d48', '9f1239'),
  svgAvatar('👩', '7c3aed', '6d28d9'),
  svgAvatar('👩', '0ea5e9', '0284c7'),
  svgAvatar('👩', 'ec4899', 'db2777'),
  svgAvatar('👩', 'f59e0b', 'd97706'),
  svgAvatar('👩', '0d9488', '0f766e'),
]

const COVERS = [
  'url("data:image/svg+xml,%3Csvg width=\'50\' height=\'50\' viewBox=\'0 0 50 50\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M25 8l2 5h5l-4 3 2 5-5-3-5 3 2-5-4-3h5z\' fill=\'white\' opacity=\'.06\'/%3E%3C/svg%3E"), linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
  'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'20\' viewBox=\'0 0 100 20\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 10c25-10 25 10 50 0s25-10 50 0\' fill=\'none\' stroke=\'white\' stroke-width=\'.5\' opacity=\'.06\'/%3E%3C/svg%3E"), linear-gradient(135deg, #0ea5e9 0%, #2563eb 50%, #4f46e5 100%)',
  'url("data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' viewBox=\'0 0 40 40\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M20 5l15 15-15 15L5 20z\' fill=\'none\' stroke=\'white\' stroke-width=\'.3\' opacity=\'.08\'/%3E%3C/svg%3E"), linear-gradient(135deg, #e11d48 0%, #be185d 50%, #9d174d 100%)',
  'url("data:image/svg+xml,%3Csvg width=\'20\' height=\'20\' viewBox=\'0 0 20 20\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Ccircle cx=\'10\' cy=\'10\' r=\'1\' fill=\'white\' opacity=\'.07\'/%3E%3C/svg%3E"), linear-gradient(135deg, #d97706 0%, #b45309 50%, #92400e 100%)',
  'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'20\' viewBox=\'0 0 100 20\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 10c25-10 25 10 50 0s25-10 50 0\' fill=\'none\' stroke=\'white\' stroke-width=\'.5\' opacity=\'.06\'/%3E%3C/svg%3E"), linear-gradient(135deg, #f59e0b 0%, #ef4444 50%, #ec4899 100%)',
  'url("data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' viewBox=\'0 0 40 40\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M20 5l15 15-15 15L5 20z\' fill=\'none\' stroke=\'white\' stroke-width=\'.3\' opacity=\'.08\'/%3E%3C/svg%3E"), linear-gradient(135deg, #334155 0%, #475569 50%, #64748b 100%)',
  'url("data:image/svg+xml,%3Csvg width=\'20\' height=\'20\' viewBox=\'0 0 20 20\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Ccircle cx=\'10\' cy=\'10\' r=\'1\' fill=\'white\' opacity=\'.07\'/%3E%3C/svg%3E"), linear-gradient(135deg, #25d366 0%, #2dd4bf 30%, #818cf8 70%, #c084fc 100%)',
  'url("data:image/svg+xml,%3Csvg width=\'80\' height=\'60\' viewBox=\'0 0 80 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M40 10c0 0-6 8-6 14s6 8 6 8 6-2 6-8-6-14-6-14z\' fill=\'none\' stroke=\'white\' stroke-width=\'.4\' opacity=\'.07\'/%3E%3C/svg%3E"), linear-gradient(135deg, #7c3aed 0%, #6d28d9 50%, #5b21b6 100%)',
]

const BIOS = [
  'ساكن بالحي من زمان، أحب أساعد الجيران',
  'مهندس، أهتم بتطوير الحي',
  'ربة بيت، أحب الطبخ والحلويات',
  'أبو عيال، دايم موجود لو أحد يحتاج شيء',
  'مقدم خدمات صيانة منزلية',
  'معلم، أحب العلم والمعرفة',
  'تاجر، عندي محل بالحي',
  '',
]

const POSTS: Record<string, { title: string; body: string }[]> = {
  ALERT: [
    { title: 'انتبهوا — كلاب ضالة بالشارع الرئيسي', body: 'شفت مجموعة كلاب ضالة عند المدرسة، خلوا بالكم من العيال' },
    { title: 'تسريب مياه بالشارع', body: 'فيه تسريب مياه كبير عند التقاطع، البلدية ما ردوا' },
    { title: 'أصوات غريبة بالليل', body: 'أحد سمع أصوات غريبة أمس الليل عند الحديقة؟' },
  ],
  LOOKING_FOR: [
    { title: 'أحد يعرف سباك كويس؟', body: 'عندي تسريب بالمطبخ محتاج سباك اليوم ضروري' },
    { title: 'محتاج كهربائي', body: 'الكهرب يفصل عندي كل شوي، أحد عنده رقم كهربائي؟' },
    { title: 'وين ألقى بقالة قريبة؟', body: 'جديد بالحي، وين أقرب بقالة أو سوبرماركت؟' },
    { title: 'معلمة تأسيس للأطفال', body: 'أدور معلمة تأسيس لبنتي، يفضل من الحي' },
  ],
  MARKETPLACE: [
    { title: 'ثلاجة للبيع — حالة ممتازة', body: 'ثلاجة سامسونج استخدام سنة، السعر 1200 ريال قابل للتفاوض' },
    { title: 'أثاث غرفة نوم كامل', body: 'غرفة نوم كاملة مع دولاب ومرتبة، بسبب النقل' },
    { title: 'آيفون 15 مستعمل', body: 'آيفون 15 برو ماكس 256 قيقا، مع كل ملحقاته، استخدام 6 شهور' },
    { title: 'دراجة أطفال للبيع', body: 'دراجة هوائية حجم 16 بوصة، مناسبة عمر 5-8 سنوات' },
  ],
  NEIGHBORHOOD_ISSUE: [
    { title: 'الإنارة ضعيفة بالشارع', body: 'أعمدة الإنارة مطفية من أسبوع، الشارع مظلم بالليل' },
    { title: 'الحفر بالشارع خطيرة', body: 'فيه حفر كبيرة قدام المسجد، خطر على السيارات' },
    { title: 'مستوى النظافة تراجع', body: 'الحاويات ممتلئة وما أحد ينظفها من يومين' },
  ],
  FOOD_HOME: [
    { title: 'كبسة بيتي — طلبات اليوم', body: 'كبسة لحم بيتي، الصحن الكبير بـ 35 ريال، التوصيل مجاني بالحي' },
    { title: 'حلويات بيتية طازجة', body: 'بسبوسة وكنافة طازجة كل يوم، الأسعار تبدأ من 15 ريال' },
  ],
  SERVICES: [
    { title: 'خدمات سباكة — أبو محمد', body: 'سباك خبرة 15 سنة، صيانة وتركيب، أسعار مناسبة' },
    { title: 'غسيل سيارات متنقل', body: 'غسيل سيارتك عند بيتك، داخلي وخارجي بـ 50 ريال' },
  ],
  GENERAL: [
    { title: 'السلام عليكم يا أهل الحي', body: 'جديد بالحي، أتمنى نتعرف على بعض ونتعاون' },
    { title: 'شكراً لكل من ساعد أمس', body: 'الله يجزاكم خير على تعاونكم أمس بتنظيف الحديقة' },
  ],
}

const EMOJIS = ['❤️', '😂', '👍', '😮', '🙏', '🔥']

async function main() {
  const c = new Client({ connectionString: DIRECT_URL })
  await c.connect()
  console.log('Connected!\n')

  // Get neighborhoods with most population potential (near major cities)
  const nbhds = await c.query(`
    SELECT n.id, n.name, c.name as city FROM "Neighborhood" n
    JOIN "City" c ON n."cityId" = c.id
    WHERE n.hidden = false
    ORDER BY RANDOM() LIMIT 15
  `)

  // Exclude الزايدي (already seeded)
  const neighborhoods = nbhds.rows.filter((n: any) => n.name !== 'الزايدي')
  console.log(`Seeding ${neighborhoods.length} neighborhoods...\n`)

  let totalUsers = 0, totalPosts = 0, totalComments = 0

  for (const nbhd of neighborhoods) {
    console.log(`\n── ${nbhd.name} (${nbhd.city}) ──`)

    // Create 3-5 users
    const numUsers = rand(3, 5)
    const userIds: string[] = []

    for (let i = 0; i < numUsers; i++) {
      const isFemale = Math.random() < 0.4
      const name = isFemale ? pick(FEMALE_NAMES) : pick(MALE_NAMES)
      const phone = `059${rand(1000000, 9999999)}`
      const avatar = isFemale ? pick(FEMALE_AVATARS) : pick(MALE_AVATARS)
      const userId = cuid()

      await c.query(`
        INSERT INTO "User" (id, phone, name, gender, "neighborhoodId", "isVerified", reputation, "avatarUrl", "coverUrl", bio, "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, $9, NOW(), NOW())
        ON CONFLICT (phone) DO NOTHING
      `, [userId, phone, name, isFemale ? 'FEMALE' : 'MALE', nbhd.id, rand(30, 300), avatar, pick(COVERS), pick(BIOS)])

      userIds.push(userId)
      totalUsers++
    }

    console.log(`  ${numUsers} users created`)

    // Create 5-8 posts
    const numPosts = rand(5, 8)
    const categories = Object.keys(POSTS)

    for (let i = 0; i < numPosts; i++) {
      const cat = pick(categories)
      const postData = pick(POSTS[cat])
      const authorId = pick(userIds)
      const postId = cuid()
      const hoursAgo = rand(1, 20)

      await c.query(`
        INSERT INTO "Post" (id, title, body, category, "authorId", "neighborhoodId", status, "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', NOW() - interval '${hoursAgo} hours', NOW())
      `, [postId, postData.title, postData.body, cat, authorId, nbhd.id])

      totalPosts++

      // Add 1-3 reactions
      const reactors = userIds.filter(id => id !== authorId).slice(0, rand(1, 3))
      for (const reactor of reactors) {
        await c.query(`
          INSERT INTO "Reaction" (id, emoji, "postId", "userId", "createdAt")
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT DO NOTHING
        `, [cuid(), pick(EMOJIS), postId, reactor])
      }

      // Add 1-2 comments
      const commentCat = POSTS[cat] ? cat : 'GENERAL'
      const commenters = userIds.filter(id => id !== authorId).slice(0, rand(1, 2))
      for (const commenter of commenters) {
        const COMMENT_MAP: Record<string, string[]> = {
          MARKETPLACE: ['كم السعر؟', 'لسى متوفر؟', 'هل قابل للتفاوض؟', 'ممكن ترسل صور أوضح؟'],
          LOOKING_FOR: ['أنا أعرف واحد ممتاز', 'أبشر أنا أقدر أساعدك', 'راسلتك خاص'],
          ALERT: ['الله يحفظ الجميع', 'شكراً على التنبيه', 'لازم نبلغ 911'],
          NEIGHBORHOOD_ISSUE: ['نحتاج نرفع شكوى', 'عندي نفس المشكلة', 'يا ليت تتحل'],
          FOOD_HOME: ['شكلها لذيذة!', 'كم الطلب الواحد؟', 'هل فيه توصيل؟'],
          SERVICES: ['كم تاخذ تقريباً؟', 'شغله ممتاز', 'أنا جربته وأنصح فيه'],
          GENERAL: ['الله يبارك فيك', 'أهلاً وسهلاً', 'ماشاء الله'],
        }
        const comments = COMMENT_MAP[commentCat] || COMMENT_MAP.GENERAL
        await c.query(`
          INSERT INTO "Comment" (id, body, "postId", "authorId", "createdAt")
          VALUES ($1, $2, $3, $4, NOW() - interval '${rand(0, hoursAgo)} hours')
        `, [cuid(), pick(comments), postId, commenter])
        totalComments++
      }
    }

    console.log(`  ${numPosts} posts + comments created`)
  }

  console.log(`\n========================================`)
  console.log(`  DONE`)
  console.log(`  Neighborhoods: ${neighborhoods.length}`)
  console.log(`  Users: ${totalUsers}`)
  console.log(`  Posts: ${totalPosts}`)
  console.log(`  Comments: ${totalComments}`)
  console.log(`========================================`)

  await c.end()
}

main().catch(console.error)
