import toast from 'react-hot-toast'

type Lang = 'ar' | 'en' | 'ur'

/**
 * Extract a user-friendly error message from an API response body.
 * Always returns a message in the user's current language explaining
 * *why* the request failed — never a generic "something went wrong"
 * when the server told us something specific.
 *
 * Supports every error shape the API emits:
 *   • { error: 'DUPLICATE_POST' }                 ← flat code
 *   • { error: 'CONTENT_BLOCKED' }
 *   • { error: { code: 'ERR_400', message: '…' } } ← apiError() helper
 *   • { error: 'some raw error', message: '…' }
 *   • unknown / empty body
 */
export function translateApiError(body: any, lang: Lang): string {
  // ── 1. Normalize both possible shapes ─────────────────────────────
  let code: string | undefined
  let serverMsg: string | undefined

  if (body && typeof body === 'object') {
    const err = body.error
    if (typeof err === 'string') {
      // Flat shape: { error: 'some string' }. Treat the string as BOTH
      // a candidate symbolic code (for the switch below) AND a server
      // message (for the SERVER_MSG_MAP / pattern-rule lookup). Without
      // this, full sentences like "Maximum ride distance is 500 km"
      // would match neither path and fall through to the raw English
      // string — the exact bug the user hit.
      code = err
      serverMsg = err
    } else if (err && typeof err === 'object') {
      if (typeof err.code === 'string') code = err.code
      if (typeof err.message === 'string') serverMsg = err.message
    }
    if (!serverMsg && typeof body.message === 'string') serverMsg = body.message
  }

  // ── 2. Known semantic codes → bilingual canonical copy ────────────
  switch (code) {
    case 'not_verified':
      return lang === 'en'
        ? 'Location verification required. Verify your neighborhood to use this feature.'
        : lang === 'ur'
          ? 'مقام کی تصدیق ضروری ہے۔ اس خصوصیت کیلئے اپنے محلے کی تصدیق کریں۔'
          : 'يلزم التحقق من الموقع. تحقّق من حيّك لاستخدام هذه الميزة.'

    case 'neighborhood_mismatch':
      return lang === 'en'
        ? "This neighborhood doesn't match your current location."
        : lang === 'ur'
          ? 'یہ محلہ آپ کے موجودہ مقام سے میل نہیں کھاتا۔'
          : 'هذا الحي لا يتطابق مع موقعك الحالي.'

    case 'unauthorized':
    case 'Unauthorized':
      return lang === 'en'
        ? 'Session expired. Please sign in again.'
        : lang === 'ur'
          ? 'سیشن ختم ہو گیا۔ دوبارہ سائن ان کریں۔'
          : 'انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى.'

    case 'forbidden':
    case 'Forbidden':
      return lang === 'en'
        ? "You don't have permission to do that."
        : lang === 'ur'
          ? 'آپ کو اس کی اجازت نہیں ہے۔'
          : 'ليست لديك الصلاحية لذلك.'

    case 'Invalid request':
    case 'invalid_request':
      return lang === 'en'
        ? 'Invalid request.'
        : lang === 'ur'
          ? 'درخواست درست نہیں۔'
          : 'الطلب غير صالح.'

    case 'Invalid action':
    case 'invalid_action':
      return lang === 'en'
        ? 'That action is not allowed right now.'
        : lang === 'ur'
          ? 'یہ عمل اس وقت ممکن نہیں۔'
          : 'هذا الإجراء غير متاح الآن.'

    case 'Coordinates required':
      return lang === 'en'
        ? 'Location coordinates are required.'
        : lang === 'ur'
          ? 'مقام کے نقاط درکار ہیں۔'
          : 'الإحداثيات مطلوبة.'

    case 'Image URL required':
      return lang === 'en'
        ? 'Image is required.'
        : lang === 'ur'
          ? 'تصویر درکار ہے۔'
          : 'الصورة مطلوبة.'

    case 'User not found':
      return lang === 'en'
        ? 'User not found.'
        : lang === 'ur'
          ? 'صارف نہیں ملا۔'
          : 'لم يتم العثور على المستخدم.'

    case 'rate_limited':
    case 'too_many_requests':
      return lang === 'en'
        ? 'Too many attempts. Please wait a moment and try again.'
        : lang === 'ur'
          ? 'بہت زیادہ کوششیں۔ تھوڑا رک کر دوبارہ کوشش کریں۔'
          : 'محاولات كثيرة. انتظر قليلاً وحاول مرة أخرى.'

    case 'banned':
    case 'user_banned':
    case 'BANNED':
      return lang === 'en'
        ? 'Your account is temporarily restricted.'
        : lang === 'ur'
          ? 'آپ کا اکاؤنٹ عارضی طور پر محدود ہے۔'
          : 'حسابك مقيّد مؤقتاً.'

    case 'not_found':
    case 'Not found':
      return lang === 'en'
        ? 'This content is no longer available.'
        : lang === 'ur'
          ? 'یہ مواد اب دستیاب نہیں ہے۔'
          : 'هذا المحتوى لم يعد متاحاً.'

    case 'image_required':
    case 'invalid_image':
      return lang === 'en'
        ? 'Image is invalid or could not be uploaded.'
        : lang === 'ur'
          ? 'تصویر درست نہیں یا اپ لوڈ نہیں ہو سکی۔'
          : 'الصورة غير صالحة أو لم يتم رفعها.'

    case 'CONTENT_BLOCKED':
      return lang === 'en'
        ? 'Your post contains inappropriate language. Please edit it and try again.'
        : lang === 'ur'
          ? 'آپ کی پوسٹ میں نامناسب الفاظ ہیں۔ درست کر کے دوبارہ کوشش کریں۔'
          : 'المنشور يحتوي على كلمات غير لائقة. يرجى تعديله والمحاولة مرة أخرى.'

    case 'DUPLICATE_POST':
      return lang === 'en'
        ? "You've already posted something similar in the last 3 hours. Please rephrase or wait a bit before posting again."
        : lang === 'ur'
          ? 'آپ نے پچھلے 3 گھنٹوں میں ملتی جلتی پوسٹ کر دی ہے۔ متن تبدیل کریں یا تھوڑی دیر بعد دوبارہ کوشش کریں۔'
          : 'لديك منشور مشابه خلال آخر 3 ساعات. غيّر الصياغة أو انتظر قليلاً قبل النشر مرة أخرى.'
  }

  // ── 3. Map specific Arabic server messages that post routes emit ──
  //     These come from `apiError('…', status)` without a symbolic code.
  //     We translate them into the user's language so EN/UR users get a
  //     real explanation instead of an untranslated Arabic string.
  if (serverMsg) {
    const trimmed = serverMsg.trim()
    const m = SERVER_MSG_MAP[trimmed]
    if (m) return m[lang] || m.ar
    // Pattern match for messages with interpolated numbers / variables
    // (e.g. "حسابك يجب أن يكون عمره 7 أيام على الأقل") so the same
    // translation works regardless of the specific value the server
    // plugged in.
    for (const rule of PATTERN_RULES) {
      const match = trimmed.match(rule.pattern)
      if (match) return rule.translate(match, lang)
    }
    // Fall through: server sent a message we haven't mapped yet; surface
    // it verbatim. Any message is better than a generic "حدث خطأ".
    return serverMsg
  }

  // ── 4. Last resort — only when the server said literally nothing. ──
  if (typeof code === 'string' && code.length > 0 && code.length < 120) return code
  return lang === 'en'
    ? 'Something went wrong. Please try again.'
    : lang === 'ur'
      ? 'کچھ مسئلہ ہو گیا۔ دوبارہ کوشش کریں۔'
      : 'حدث خطأ. يرجى المحاولة مرة أخرى.'
}

/**
 * Server-side specific messages → trilingual canonical copy.
 * Keyed by the exact Arabic string the API emits so existing routes
 * keep working without a migration. Additions here stay backwards-
 * compatible with routes that already ship those messages.
 */
const SERVER_MSG_MAP: Record<string, { ar: string; en: string; ur: string }> = {
  'يجب تسجيل الدخول': {
    ar: 'يجب تسجيل الدخول.',
    en: 'You need to be signed in.',
    ur: 'سائن ان کرنا ضروری ہے۔',
  },
  'أكمل ملفك الشخصي أولاً': {
    ar: 'أكمل ملفك الشخصي أولاً.',
    en: 'Please complete your profile first.',
    ur: 'پہلے اپنی پروفائل مکمل کریں۔',
  },
  'حسابك موقوف': {
    ar: 'حسابك موقوف.',
    en: 'Your account is suspended.',
    ur: 'آپ کا اکاؤنٹ معطل ہے۔',
  },
  'تصنيف غير صالح': {
    ar: 'اختر تصنيفاً صالحاً.',
    en: 'Please pick a valid category.',
    ur: 'ایک درست زمرہ منتخب کریں۔',
  },
  'بيانات ناقصة': {
    ar: 'البيانات ناقصة — تأكد من العنوان والمحتوى.',
    en: 'Missing fields — make sure the title and body are filled in.',
    ur: 'معلومات نامکمل — عنوان اور تفصیل دونوں پُر کریں۔',
  },
  'سعر غير صالح': {
    ar: 'السعر غير صالح — أدخل رقماً صحيحاً.',
    en: 'Price is invalid — enter a number.',
    ur: 'قیمت درست نہیں — صحیح نمبر درج کریں۔',
  },
  'هذا القسم للنساء فقط': {
    ar: 'هذا القسم مخصّص للنساء فقط.',
    en: 'This category is for women only.',
    ur: 'یہ زمرہ صرف خواتین کے لیے ہے۔',
  },
  'هذا القسم متاح فقط لمقدمي الخدمات': {
    ar: 'هذا القسم متاح فقط لحسابات مقدّمي الخدمات.',
    en: 'This category is only available to service-provider accounts.',
    ur: 'یہ زمرہ صرف سروس پرووائیڈر اکاؤنٹس کے لیے ہے۔',
  },
  'المسابقات متاحة فقط للمشرفين': {
    ar: 'المسابقات لا ينشرها سوى المشرفين.',
    en: 'Only moderators can publish contests.',
    ur: 'مسابقے صرف منتظم شائع کر سکتے ہیں۔',
  },
  'انتظر قليلاً قبل نشر منشور جديد': {
    ar: 'انتظر قليلاً قبل نشر منشور جديد.',
    en: 'Please wait a bit before creating another post.',
    ur: 'نئی پوسٹ بنانے سے پہلے تھوڑا انتظار کریں۔',
  },
  'وصلت الحد الأقصى للمنشورات اليوم': {
    ar: 'وصلت الحد الأقصى للمنشورات اليوم — حاول مجدداً غداً.',
    en: "You've hit today's post limit — try again tomorrow.",
    ur: 'آج کی پوسٹنگ کی حد مکمل ہو گئی — کل دوبارہ کوشش کریں۔',
  },
  'خطأ في الخادم': {
    ar: 'خطأ في الخادم. حاول بعد لحظات.',
    en: 'Server error. Please try again in a moment.',
    ur: 'سرور میں مسئلہ۔ چند لمحوں میں دوبارہ کوشش کریں۔',
  },

  // ── Rides API (new/offers/status/messages/confirm) ───────────────
  'بيانات نقطة الانطلاق ناقصة': {
    ar: 'بيانات نقطة الانطلاق ناقصة.',
    en: 'Pickup location details are missing.',
    ur: 'اٹھانے کی جگہ کی تفصیل نامکمل ہے۔',
  },
  'بيانات الوجهة ناقصة': {
    ar: 'بيانات الوجهة ناقصة.',
    en: 'Drop-off location details are missing.',
    ur: 'منزل کی تفصیل نامکمل ہے۔',
  },
  'بيانات الإحداثيات غير صالحة': {
    ar: 'بيانات الإحداثيات غير صالحة.',
    en: 'The location coordinates are invalid.',
    ur: 'مقام کے نقاط درست نہیں۔',
  },
  'عنوان الانطلاق غير صالح': {
    ar: 'عنوان نقطة الانطلاق غير صالح.',
    en: 'Pickup address is invalid.',
    ur: 'اٹھانے کی جگہ کا پتہ درست نہیں۔',
  },
  'عنوان الوجهة غير صالح': {
    ar: 'عنوان الوجهة غير صالح.',
    en: 'Drop-off address is invalid.',
    ur: 'منزل کا پتہ درست نہیں۔',
  },
  'الملاحظات طويلة جداً': {
    ar: 'الملاحظات طويلة جداً.',
    en: 'Notes are too long.',
    ur: 'نوٹس بہت طویل ہیں۔',
  },
  'حدد وقت الرحلة': {
    ar: 'حدّد وقت الرحلة.',
    en: 'Please set the trip time.',
    ur: 'سفر کا وقت مقرر کریں۔',
  },
  'وقت الرحلة يجب أن يكون بين 30 دقيقة و48 ساعة من الآن': {
    ar: 'وقت الرحلة يجب أن يكون بين 30 دقيقة و48 ساعة من الآن.',
    en: 'Trip time must be between 30 minutes and 48 hours from now.',
    ur: 'سفر کا وقت ابھی سے 30 منٹ اور 48 گھنٹوں کے درمیان ہونا چاہیے۔',
  },
  'لديك طلب نشط بالفعل': {
    ar: 'لديك طلب نشط بالفعل — أغلقه قبل إنشاء طلب جديد.',
    en: 'You already have an active request — close it before starting a new one.',
    ur: 'آپ کی پہلے سے ایک فعال درخواست موجود ہے — نئی بنانے سے پہلے اسے بند کریں۔',
  },
  'تجاوزت الحد الأقصى (3 طلبات بالساعة)': {
    ar: 'تجاوزت الحد الأقصى (3 طلبات بالساعة). انتظر قليلاً.',
    en: "You've hit the limit (3 requests per hour). Please wait a bit.",
    ur: 'حد مکمل ہو گئی (فی گھنٹہ 3 درخواستیں)۔ تھوڑا انتظار کریں۔',
  },
  'المحادثة مغلقة': {
    ar: 'المحادثة مغلقة.',
    en: 'This chat is closed.',
    ur: 'یہ گفتگو بند ہے۔',
  },
  'المحادثة غير متاحة في هذه المرحلة': {
    ar: 'المحادثة غير متاحة في هذه المرحلة.',
    en: "Chat isn't available at this stage of the ride.",
    ur: 'سفر کے اس مرحلے پر گفتگو دستیاب نہیں۔',
  },
  'الرسالة فارغة': {
    ar: 'الرسالة فارغة.',
    en: 'Message is empty.',
    ur: 'پیغام خالی ہے۔',
  },
  'الرسالة طويلة جداً': {
    ar: 'الرسالة طويلة جداً.',
    en: 'Message is too long.',
    ur: 'پیغام بہت طویل ہے۔',
  },
  'الرسالة طويلة جداً (100 حرف كحد أقصى)': {
    ar: 'الرسالة طويلة جداً (الحد 100 حرف).',
    en: 'Message is too long (max 100 characters).',
    ur: 'پیغام بہت طویل ہے (زیادہ سے زیادہ 100 حروف)۔',
  },
  'أنت لست الشخص المختار': {
    ar: 'أنت لست الشخص المختار لهذه الرحلة.',
    en: "You aren't the selected offer for this ride.",
    ur: 'آپ اس سفر کے لیے منتخب شخص نہیں ہیں۔',
  },
  'انتهت مهلة التأكيد': {
    ar: 'انتهت مهلة التأكيد.',
    en: 'The confirmation window has expired.',
    ur: 'تصدیق کی مہلت ختم ہو گئی۔',
  },
  'لم يعد بالإمكان التأكيد': {
    ar: 'لم يعد بالإمكان تأكيد هذه الرحلة.',
    en: 'This ride can no longer be confirmed.',
    ur: 'اس سفر کی تصدیق اب ممکن نہیں۔',
  },
  'الطلب لم يعد يقبل عروض': {
    ar: 'هذا الطلب لم يعد يقبل عروضاً جديدة.',
    en: 'This request is no longer accepting new offers.',
    ur: 'یہ درخواست نئی پیشکشیں قبول نہیں کر رہی۔',
  },
  'لا يمكنك تقديم عرض على طلبك': {
    ar: 'لا يمكنك تقديم عرض على طلبك الخاص.',
    en: "You can't make an offer on your own request.",
    ur: 'آپ اپنی ہی درخواست پر پیشکش نہیں دے سکتے۔',
  },
  'أدخل سعراً صحيحاً': {
    ar: 'أدخل سعراً صحيحاً.',
    en: 'Please enter a valid price.',
    ur: 'درست قیمت درج کریں۔',
  },
  'وقت الوصول يجب أن يكون بين 1 و120 دقيقة': {
    ar: 'وقت الوصول يجب أن يكون بين 1 و120 دقيقة.',
    en: 'Arrival time must be between 1 and 120 minutes.',
    ur: 'پہنچنے کا وقت 1 سے 120 منٹ کے درمیان ہونا چاہیے۔',
  },
  'تجاوزت الحد الأقصى للعروض': {
    ar: 'تجاوزت الحد الأقصى للعروض.',
    en: "You've hit the offers limit.",
    ur: 'پیشکشوں کی حد مکمل ہو گئی۔',
  },
  'لديك عرض على هذا الطلب بالفعل': {
    ar: 'لديك عرض على هذا الطلب بالفعل.',
    en: 'You already have an offer on this request.',
    ur: 'آپ کی اس درخواست پر پہلے سے ایک پیشکش موجود ہے۔',
  },
  'سبب الإلغاء مطلوب': {
    ar: 'اكتب سبب الإلغاء.',
    en: 'Please provide a cancellation reason.',
    ur: 'منسوخی کی وجہ لکھیں۔',
  },
  'اشرح سبب النزاع (10 أحرف على الأقل)': {
    ar: 'اشرح سبب النزاع (10 أحرف على الأقل).',
    en: 'Please explain the dispute reason (at least 10 characters).',
    ur: 'تنازع کی وجہ بیان کریں (کم از کم 10 حروف)۔',
  },

  // ── Ride distance validation (src/lib/rides/distance.ts) ─────────
  'Pickup and dropoff must be at least 500m apart': {
    ar: 'يجب أن تكون نقطة الانطلاق والوجهة على بُعد 500 متر على الأقل.',
    en: 'Pickup and drop-off must be at least 500 m apart.',
    ur: 'اٹھانے کی جگہ اور منزل کے درمیان کم از کم 500 میٹر ہونا ضروری ہے۔',
  },
  'Maximum ride distance is 500 km': {
    ar: 'الحد الأقصى للمسافة هو 500 كم.',
    en: 'Maximum ride distance is 500 km.',
    ur: 'سفر کی زیادہ سے زیادہ مسافت 500 کلومیٹر ہے۔',
  },
}

/** Pattern-match rules for server messages that interpolate values
 *  (numbers, usernames, etc.). Checked AFTER exact-match lookup in
 *  SERVER_MSG_MAP misses — keeps simple cases fast while still
 *  translating dynamic ones. */
interface PatternRule {
  pattern: RegExp
  translate: (match: RegExpMatchArray, lang: Lang) => string
}
const PATTERN_RULES: PatternRule[] = [
  // Account-age minimum for making a ride offer:
  //   "حسابك يجب أن يكون عمره {N} أيام على الأقل"
  {
    pattern: /^حسابك يجب أن يكون عمره\s+(\d+)\s+أيام على الأقل\.?$/,
    translate: (m, lang) => {
      const n = m[1]
      if (lang === 'en') return `Your account must be at least ${n} days old to do that.`
      if (lang === 'ur') return `یہ کام کرنے کے لیے آپ کا اکاؤنٹ کم از کم ${n} دن پرانا ہونا چاہیے۔`
      return `حسابك يجب أن يكون عمره ${n} أيام على الأقل.`
    },
  },
]

/**
 * One-shot: parse a failed response and show a localized toast.
 * Use this after `fetch()` when `!res.ok`.
 *
 *   if (!res.ok) { await showApiError(res, lang); return }
 */
export async function showApiError(res: Response, lang: Lang): Promise<void> {
  let body: any = null
  try { body = await res.json() } catch { /* body may be empty / non-json */ }
  const msg = translateApiError(body, lang)
  const code = typeof body?.error === 'string'
    ? body.error
    : typeof body?.error?.code === 'string'
      ? body.error.code
      : undefined

  if (code === 'not_verified') {
    // Guide the user to the verify-location page with an actionable toast.
    toast.error(msg, { duration: 5000 })
  } else {
    // Longer duration for content/validation failures so the user has
    // time to read the specific reason (otherwise a 3s toast whips past
    // and they never catch what they did wrong).
    toast.error(msg, { duration: 4500 })
  }
}
