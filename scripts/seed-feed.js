const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');
const adapter = new PrismaPg({ connectionString: 'postgresql://postgres:1999**@localhost:5432/hai_db' });
const db = new PrismaClient({ adapter });

async function main() {
  const users = await db.user.findMany({ select: { id: true, name: true, neighborhoodId: true } });
  const posts = await db.post.findMany({ where: { status: 'ACTIVE' }, select: { id: true, authorId: true, title: true } });
  const u = (name) => users.find(x => x.name === name);
  const p = (title) => posts.find(x => x.title === title);
  const nbhd = users[0]?.neighborhoodId;

  // 1. Update reputation and badges
  const reps = {
    'أبو عبدالله': { rep: 210, type: 'VERIFIED_PROVIDER' },
    'خالد': { rep: 175, type: 'SERVICE_PROVIDER' },
    'سارة': { rep: 95, type: 'NORMAL' },
    'عبدالرحمن': { rep: 320, type: 'NORMAL' },
    'أم نورة': { rep: 55, type: 'NORMAL' },
    'وليد': { rep: 140, type: 'NORMAL' },
    'أبو سلطان': { rep: 430, type: 'VERIFIED_PROVIDER' },
    'منيرة': { rep: 85, type: 'NORMAL' },
    'ولاء': { rep: 45, type: 'NORMAL' },
    'إياد': { rep: 260, type: 'SERVICE_PROVIDER' },
    'مطعم الغامدي': { rep: 190, type: 'VERIFIED_PROVIDER' },
    'فهد': { rep: 300, type: 'NORMAL' },
  };
  for (const [name, data] of Object.entries(reps)) {
    const user = u(name);
    if (user) {
      await db.user.update({ where: { id: user.id }, data: { reputation: data.rep, accountType: data.type } });
      console.log('Rep:', name, data.rep, data.type);
    }
  }

  // 2. Add comments
  const comments = [
    ['معلم دهان تحت أمركم', 'أم نورة', 'تواصلت معه شغله ممتاز ونظيف'],
    ['معلم دهان تحت أمركم', 'خالد', 'كم سعر الغرفة الواحدة؟'],
    ['معلم دهان تحت أمركم', 'عبدالرحمن', 'الله يعطيك العافية شغلك ممتاز'],
    ['السيارات تطير أمام المدرسة', 'أبو سلطان', 'والله مشكلة كبيرة لازم نبلغ المرور'],
    ['السيارات تطير أمام المدرسة', 'سارة', 'أطفالي يخافون يعبرون الشارع'],
    ['السيارات تطير أمام المدرسة', 'وليد', 'نحتاج مطب أو إشارة ضوئية'],
    ['السيارات تطير أمام المدرسة', 'أبو عبدالله', 'أنا كلمت البلدية وقالوا بيشوفوها'],
    ['لقيت مفاتيح عند المسجد', 'منيرة', 'الله يجزاك خير أخوي ضايعين منه!'],
    ['لقيت مفاتيح عند المسجد', 'فهد', 'ماشاء الله أهل الحي طيبين'],
    ['وين أقرب خياطة؟', 'ولاء', 'فيه وحدة عند شارع الحج اسمها خياطة الأمل'],
    ['وين أقرب خياطة؟', 'أم نورة', 'أنا أخيط بالبيت لو تبين تواصلي معي'],
    ['مكيف سبليت نظيف للبيع', 'إياد', 'لسا موجود؟ كم آخر سعر؟'],
    ['مكيف سبليت نظيف للبيع', 'وليد', 'أنا مهتم راسلتك على الخاص'],
    ['أحد يعرف سباك كويس؟', 'أبو سلطان', 'أبو فيصل سباك ممتاز أنصح فيه'],
    ['أحد يعرف سباك كويس؟', 'خالد', 'أنا سباك وكهربائي تحت أمرك'],
    ['أحد يعرف سباك كويس؟', 'سارة', 'جزاكم الله خير على المساعدة'],
    ['الجو يقلب الليلة ترى', 'فهد', 'خلوا بالكم من السيارات المكشوفة'],
    ['الجو يقلب الليلة ترى', 'عبدالرحمن', 'الحمدلله على كل حال'],
    ['كتب مدرسية ببلاش', 'ولاء', 'جزاك الله خير بنتي بتستفيد منها'],
    ['كتب مدرسية ببلاش', 'أم نورة', 'فيه كتب ثانوي؟'],
    ['نقل عفش مع فك وتركيب', 'إياد', 'كم تاخذون على النقل داخل مكة؟'],
    ['فيه درس كل ثلاثاء بالمسجد', 'أبو عبدالله', 'بارك الله فيك على التذكير'],
    ['فيه درس كل ثلاثاء بالمسجد', 'منيرة', 'هل فيه قسم للنساء؟'],
    ['الله يجزاه خير اللي رجع محفظتي', 'سارة', 'الحمدلله أهل الحي ما يخيبون'],
    ['الله يجزاه خير اللي رجع محفظتي', 'أبو سلطان', 'ماشاء الله الأمانة موجودة'],
    ['فيه حفرة خطيرة عند المنعطف', 'وليد', 'تكلمت مع البلدية أمس بخصوصها'],
    ['فيه حفرة خطيرة عند المنعطف', 'فهد', 'حطوا عليها علامة تحذير على الأقل'],
    ['يعطيهم العافية شباب الحي', 'عبدالرحمن', 'الله يحفظهم ويبارك فيهم'],
    ['يعطيهم العافية شباب الحي', 'ولاء', 'فعلاً حي مبارك'],
    ['أحد شاف قطة بيضا تايهة؟', 'أم نورة', 'شفتها عند البقالة أمس الظهر'],
    ['فيه كلب يتمشى بالحي', 'خالد', 'بلغوا البلدية أحسن'],
  ];
  let cc = 0;
  for (const [title, name, body] of comments) {
    const post = p(title);
    const commenter = u(name);
    if (post && commenter) {
      await db.comment.create({ data: { postId: post.id, authorId: commenter.id, body } });
      cc++;
    }
  }
  console.log('Comments:', cc);

  // 3. Add reactions
  const emojis = ['👍', '❤️', '😂', '🙏', '👏', '🔥', '💪'];
  let rc = 0;
  for (const post of posts) {
    const reactors = users.filter(x => x.id !== post.authorId).sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 5));
    for (const reactor of reactors) {
      try {
        await db.reaction.create({ data: { postId: post.id, userId: reactor.id, emoji: emojis[Math.floor(Math.random() * emojis.length)] } });
        rc++;
      } catch { /* dup */ }
    }
  }
  console.log('Reactions:', rc);

  // 4. New posts
  const newPosts = [
    { a: 'سارة', cat: 'GENERAL', t: 'شكرا لجيراننا الطيبين', b: 'أبغى أشكر كل أهل الحي على تعاونهم الجميل فعلا حي مبارك وناسه أهل خير' },
    { a: 'أبو سلطان', cat: 'ALERT', t: 'انتبهوا المويه بتنقطع بكرة', b: 'البلدية أعلنت إن المويه بتنقطع يوم الخميس من 8 الصبح ل 4 العصر خزنوا مويه' },
    { a: 'خالد', cat: 'SERVICES', t: 'كهربائي متوفر اليوم', b: 'أنا كهربائي خبرة 15 سنة تمديدات صيانة تركيب مكيفات أسعار مناسبة لأهل الحي' },
    { a: 'ولاء', cat: 'FOOD_HOME', t: 'كبسة وسمبوسة اليوم', b: 'متوفر كبسة دجاج ب 25 ريال وسمبوسة الصينية ب 15 الطلب على الخاص' },
    { a: 'عبدالرحمن', cat: 'LOOKING_FOR', t: 'أبحث عن معلم رياضيات لابني', b: 'ولدي بالصف الثالث متوسط يحتاج معلم رياضيات لو أحد يعرف معلم كويس بالحي' },
    { a: 'أم نورة', cat: 'MARKETPLACE', t: 'ثلاجة للبيع شبه جديدة', b: 'ثلاجة سامسونج 18 قدم عمرها سنة نقلنا بيت أصغر ما فيه مكان لها ب 1200 ريال' },
    { a: 'مطعم الغامدي', cat: 'FOOD_HOME', t: 'عرض اليوم وجبة عائلية ب 59', b: 'وجبة عائلية كاملة رز ولحم وسلطة تكفي 4 أشخاص ب 59 ريال فقط التوصيل مجاني داخل الحي' },
    { a: 'فهد', cat: 'NEIGHBORHOOD_ISSUE', t: 'القمامة متراكمة عند الحديقة', b: 'صار لها أسبوع القمامة متراكمة عند مدخل الحديقة وريحتها صارت تأذي الجيران هل أحد يقدر يبلغ' },
    { a: 'إياد', cat: 'SERVICES', t: 'صيانة جوالات بالبيت', b: 'أقدم خدمة صيانة جوالات بالحي تغيير شاشة بطارية سوفتوير بدون ما تروح محل' },
    { a: 'وليد', cat: 'GENERAL', t: 'مبروك لأهل الحي الحديقة الجديدة', b: 'الحمدلله تم افتتاح الحديقة الجديدة يعطيهم العافية البلدية' },
  ];
  for (const np of newPosts) {
    const author = u(np.a);
    if (author) {
      await db.post.create({
        data: { title: np.t, body: np.b, category: np.cat, authorId: author.id, neighborhoodId: author.neighborhoodId || nbhd, status: 'ACTIVE', imageUrls: [] },
      });
      console.log('Post:', np.t);
    }
  }

  console.log('\nDone! Feed is alive.');
  await db.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
