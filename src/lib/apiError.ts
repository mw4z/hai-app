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
      code = err
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
    const m = SERVER_MSG_MAP[serverMsg.trim()]
    if (m) return m[lang] || m.ar
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
}

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
