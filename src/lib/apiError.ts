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

    // ── Emergency alert requests ────────────────────────────────────
    case 'no_neighborhood':
      return lang === 'en'
        ? 'Your account has no neighborhood set.'
        : lang === 'ur'
          ? 'آپ کے اکاؤنٹ میں کوئی محلہ درج نہیں۔'
          : 'لا يوجد حي مرتبط بحسابك.'

    case 'invalid_body':
      return lang === 'en'
        ? 'Invalid request body.'
        : lang === 'ur'
          ? 'درخواست کا مواد درست نہیں۔'
          : 'محتوى الطلب غير صالح.'

    case 'invalid_title':
      return lang === 'en'
        ? 'Title is invalid or too long.'
        : lang === 'ur'
          ? 'عنوان درست نہیں یا بہت طویل ہے۔'
          : 'العنوان غير صالح أو طويل جداً.'

    case 'invalid_body_text':
      return lang === 'en'
        ? 'Message text is invalid or too long.'
        : lang === 'ur'
          ? 'پیغام کا متن درست نہیں یا بہت طویل ہے۔'
          : 'نص الرسالة غير صالح أو طويل جداً.'

    case 'invalid_severity':
      return lang === 'en'
        ? 'Please pick a valid severity level.'
        : lang === 'ur'
          ? 'درست درجۂ خطرہ منتخب کریں۔'
          : 'اختر مستوى خطورة صالحاً.'

    case 'pending_exists':
      return lang === 'en'
        ? 'You already have a pending emergency request.'
        : lang === 'ur'
          ? 'آپ کی پہلے سے ایک ہنگامی درخواست زیرِ غور ہے۔'
          : 'لديك طلب طوارئ قيد المراجعة بالفعل.'

    case 'expired':
      return lang === 'en'
        ? 'This request has expired.'
        : lang === 'ur'
          ? 'یہ درخواست ختم ہو چکی ہے۔'
          : 'انتهت صلاحية هذا الطلب.'

    case 'already_reviewed':
      return lang === 'en'
        ? 'Another moderator has already reviewed this request.'
        : lang === 'ur'
          ? 'کسی اور منتظم نے پہلے ہی اس درخواست کا جائزہ لے لیا ہے۔'
          : 'قام مشرف آخر بمراجعة هذا الطلب بالفعل.'

    // ── Invite codes / redemption ───────────────────────────────────
    case 'code_required':
      return lang === 'en'
        ? 'Invite code is required.'
        : lang === 'ur'
          ? 'دعوتی کوڈ درکار ہے۔'
          : 'رمز الدعوة مطلوب.'

    case 'code_not_found':
      return lang === 'en'
        ? "We couldn't find this invite code."
        : lang === 'ur'
          ? 'یہ دعوتی کوڈ نہیں ملا۔'
          : 'رمز الدعوة غير موجود.'

    case 'too_late':
      return lang === 'en'
        ? 'Invite codes can only be redeemed within your new-user window.'
        : lang === 'ur'
          ? 'دعوتی کوڈ صرف نئے صارف کی مہلت میں استعمال ہو سکتا ہے۔'
          : 'لا يمكن استخدام رمز الدعوة إلا خلال فترة المستخدم الجديد.'

    case 'already_redeemed':
      return lang === 'en'
        ? 'This invite code has already been used.'
        : lang === 'ur'
          ? 'یہ دعوتی کوڈ پہلے استعمال ہو چکا ہے۔'
          : 'تم استخدام رمز الدعوة مسبقاً.'

    case 'self_invite':
      return lang === 'en'
        ? "You can't redeem your own invite code."
        : lang === 'ur'
          ? 'آپ اپنا ہی دعوتی کوڈ استعمال نہیں کر سکتے۔'
          : 'لا يمكنك استخدام رمز دعوتك الخاص.'

    case 'inviter_unavailable':
      return lang === 'en'
        ? 'The inviter is no longer active.'
        : lang === 'ur'
          ? 'دعوت دینے والا اب فعال نہیں۔'
          : 'صاحب الدعوة لم يعد نشطاً.'

    case 'same_device':
      return lang === 'en'
        ? 'Invite codes cannot be redeemed from the same device.'
        : lang === 'ur'
          ? 'ایک ہی ڈیوائس سے دعوتی کوڈ استعمال نہیں ہو سکتا۔'
          : 'لا يمكن استخدام رمز الدعوة من الجهاز نفسه.'

    // ── Rides: offers / rating / transitions ────────────────────────
    case 'OFFER_NOT_EDITABLE':
      return lang === 'en'
        ? 'This offer can no longer be edited.'
        : lang === 'ur'
          ? 'یہ پیشکش اب قابلِ ترمیم نہیں۔'
          : 'لم يعد بالإمكان تعديل هذا العرض.'

    case 'OFFER_NOT_WITHDRAWABLE':
      return lang === 'en'
        ? 'This offer can no longer be withdrawn. Coordination already started.'
        : lang === 'ur'
          ? 'یہ پیشکش اب واپس نہیں لی جا سکتی۔ ہم آہنگی شروع ہو چکی ہے۔'
          : 'لم يعد بالإمكان سحب هذا العرض — بدأ التنسيق.'

    case 'OFFER_NOT_REJECTABLE':
      return lang === 'en'
        ? 'This offer can no longer be rejected. Coordination already started.'
        : lang === 'ur'
          ? 'یہ پیشکش اب مسترد نہیں کی جا سکتی۔ ہم آہنگی شروع ہو چکی ہے۔'
          : 'لم يعد بالإمكان رفض هذا العرض — بدأ التنسيق.'

    case 'INVALID_TRANSITION':
      return lang === 'en'
        ? 'This trip is not complete yet.'
        : lang === 'ur'
          ? 'یہ سفر ابھی مکمل نہیں ہوا۔'
          : 'الرحلة لم تكتمل بعد.'

    case 'RATING_WINDOW_CLOSED':
      return lang === 'en'
        ? 'The rating window has closed.'
        : lang === 'ur'
          ? 'تجزیہ دینے کی مہلت ختم ہو چکی ہے۔'
          : 'انتهت مهلة التقييم.'

    case 'NOT_PARTICIPANT':
      return lang === 'en'
        ? "You aren't a participant in this ride."
        : lang === 'ur'
          ? 'آپ اس سفر میں شریک نہیں۔'
          : 'أنت لست طرفاً في هذه الرحلة.'

    case 'ALREADY_RATED':
      return lang === 'en'
        ? 'You have already rated this trip.'
        : lang === 'ur'
          ? 'آپ اس سفر کی درجہ بندی کر چکے ہیں۔'
          : 'قيّمت هذه الرحلة بالفعل.'

    case 'claimed':
      return lang === 'en'
        ? 'Already coordinated with someone else.'
        : lang === 'ur'
          ? 'کسی اور کے ساتھ طے کر لیا گیا ہے۔'
          : 'تم التنسيق مع شخص آخر.'

    // ── Threads / messaging ─────────────────────────────────────────
    case 'Cannot message yourself':
    case 'cannot_message_self':
      return lang === 'en'
        ? "You can't send a message to yourself."
        : lang === 'ur'
          ? 'آپ اپنے آپ کو پیغام نہیں بھیج سکتے۔'
          : 'لا يمكنك إرسال رسالة لنفسك.'

    case 'Cannot block yourself':
    case 'cannot_block_self':
      return lang === 'en'
        ? "You can't block yourself."
        : lang === 'ur'
          ? 'آپ اپنے آپ کو بلاک نہیں کر سکتے۔'
          : 'لا يمكنك حظر نفسك.'

    case 'userId required':
    case 'user_id_required':
      return lang === 'en'
        ? 'User ID is required.'
        : lang === 'ur'
          ? 'صارف کی شناخت درکار ہے۔'
          : 'معرّف المستخدم مطلوب.'

    case 'Mismatch':
    case 'mismatch':
      return lang === 'en'
        ? 'This item does not belong to that post.'
        : lang === 'ur'
          ? 'یہ آئٹم اس پوسٹ سے مطابقت نہیں رکھتا۔'
          : 'هذا العنصر لا يتبع هذا المنشور.'

    case 'Server error':
    case 'server_error':
      return lang === 'en'
        ? 'Server error. Please try again in a moment.'
        : lang === 'ur'
          ? 'سرور میں مسئلہ۔ چند لمحوں میں دوبارہ کوشش کریں۔'
          : 'خطأ في الخادم. حاول بعد لحظات.'

    case 'Title required':
    case 'title_required':
      return lang === 'en'
        ? 'Title is required.'
        : lang === 'ur'
          ? 'عنوان درکار ہے۔'
          : 'العنوان مطلوب.'
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
  'Price unrealistically low': {
    ar: 'السعر منخفض جداً — راجع الإحصاء المقترح وأعد المحاولة.',
    en: 'Price too low — check the suggested estimate and try again.',
    ur: 'قیمت بہت کم ہے — تجویز کردہ قیمت دیکھ کر دوبارہ کوشش کریں۔',
  },
  'Price unrealistically high': {
    ar: 'السعر مرتفع جداً — راجع الإحصاء المقترح وأعد المحاولة.',
    en: 'Price too high — check the suggested estimate and try again.',
    ur: 'قیمت بہت زیادہ ہے — تجویز کردہ قیمت دیکھ کر دوبارہ کوشش کریں۔',
  },

  // ── Posts: comments ──────────────────────────────────────────────
  'لا يمكنك التعليق على منشورات حي آخر': {
    ar: 'لا يمكنك التعليق على منشورات حيّ آخر.',
    en: "You can't comment on posts from another neighborhood.",
    ur: 'آپ دوسرے محلے کی پوسٹ پر تبصرہ نہیں کر سکتے۔',
  },
  'التعليق فارغ': {
    ar: 'التعليق فارغ.',
    en: 'Comment is empty.',
    ur: 'تبصرہ خالی ہے۔',
  },
  'التعليق طويل جداً': {
    ar: 'التعليق طويل جداً.',
    en: 'Comment is too long.',
    ur: 'تبصرہ بہت طویل ہے۔',
  },
  'التعليق قصير جداً': {
    ar: 'التعليق قصير جداً.',
    en: 'Comment is too short.',
    ur: 'تبصرہ بہت مختصر ہے۔',
  },
  'تعليق غير صالح': {
    ar: 'التعليق غير صالح.',
    en: 'Invalid comment.',
    ur: 'تبصرہ درست نہیں۔',
  },
  'تم حظر التعليق': {
    ar: 'تم حظر التعليق لاحتوائه على محتوى غير لائق.',
    en: 'The comment was blocked for inappropriate content.',
    ur: 'نامناسب مواد کی وجہ سے تبصرہ بلاک کر دیا گیا۔',
  },
  'تم حظر المحتوى': {
    ar: 'تم حظر المحتوى لاحتوائه على كلمات غير لائقة.',
    en: 'The content was blocked for inappropriate language.',
    ur: 'نامناسب الفاظ کی وجہ سے مواد بلاک کر دیا گیا۔',
  },
  'انتهت مهلة التعديل': {
    ar: 'انتهت مهلة تعديل هذا العنصر.',
    en: 'The edit window has closed.',
    ur: 'ترمیم کی مہلت ختم ہو گئی ہے۔',
  },

  // ── Posts: reactions ─────────────────────────────────────────────
  'رمز تعبيري غير صالح': {
    ar: 'الرمز التعبيري غير صالح.',
    en: 'Invalid emoji.',
    ur: 'ایموجی درست نہیں۔',
  },
  'لا يمكنك التفاعل مع منشورات حي آخر': {
    ar: 'لا يمكنك التفاعل مع منشورات حيّ آخر.',
    en: "You can't react to posts from another neighborhood.",
    ur: 'آپ دوسرے محلے کی پوسٹ پر ری ایکشن نہیں دے سکتے۔',
  },

  // ── Rides: offers ────────────────────────────────────────────────
  'لا يوجد عرض لك على هذا الطلب': {
    ar: 'لا يوجد عرض لك على هذا الطلب.',
    en: "You don't have an offer on this request.",
    ur: 'آپ کی اس درخواست پر کوئی پیشکش نہیں۔',
  },
  'العرض لم يعد قابلاً للتعديل': {
    ar: 'العرض لم يعد قابلاً للتعديل.',
    en: 'The offer can no longer be edited.',
    ur: 'پیشکش اب قابلِ ترمیم نہیں۔',
  },
  'لا يوجد تغييرات': {
    ar: 'لا يوجد تغييرات للحفظ.',
    en: 'No changes to save.',
    ur: 'محفوظ کرنے کے لیے کوئی تبدیلیاں نہیں۔',
  },

  // ── Threads / direct messages ────────────────────────────────────
  'لا يمكنك التواصل مع هذا المستخدم / Cannot contact this user': {
    ar: 'لا يمكنك التواصل مع هذا المستخدم.',
    en: "You can't contact this user.",
    ur: 'آپ اس صارف سے رابطہ نہیں کر سکتے۔',
  },
  'هذا النوع من المنشورات لا يدعم المحادثات الخاصة': {
    ar: 'هذا النوع من المنشورات لا يدعم المحادثات الخاصة.',
    en: "This type of post doesn't support private messages.",
    ur: 'اس قسم کی پوسٹ پر نجی گفتگو کی اجازت نہیں۔',
  },
  'تم التنسيق مع شخص آخر': {
    ar: 'تم التنسيق مع شخص آخر بالفعل.',
    en: 'Already coordinated with someone else.',
    ur: 'کسی اور کے ساتھ طے کر لیا گیا ہے۔',
  },

  // ── Profile ──────────────────────────────────────────────────────
  'الاسم مطلوب': {
    ar: 'الاسم مطلوب.',
    en: 'Name is required.',
    ur: 'نام درکار ہے۔',
  },
  'النبذة طويلة جداً (300 حرف كحد أقصى)': {
    ar: 'النبذة طويلة جداً (الحد 300 حرف).',
    en: 'Bio is too long (max 300 characters).',
    ur: 'تعارف بہت طویل ہے (زیادہ سے زیادہ 300 حروف)۔',
  },
  'وصف الخدمة طويل جداً (500 حرف كحد أقصى)': {
    ar: 'وصف الخدمة طويل جداً (الحد 500 حرف).',
    en: 'Service description is too long (max 500 characters).',
    ur: 'خدمت کی تفصیل بہت طویل ہے (زیادہ سے زیادہ 500 حروف)۔',
  },
  'لا يوجد بيانات للتحديث': {
    ar: 'لا توجد بيانات للتحديث.',
    en: 'Nothing to update.',
    ur: 'اپ ڈیٹ کرنے کے لیے کوئی ڈیٹا نہیں۔',
  },

  // ── Moderator requests ───────────────────────────────────────────
  'لديك صلاحيات بالفعل': {
    ar: 'لديك صلاحيات إشراف بالفعل.',
    en: 'You already have moderator permissions.',
    ur: 'آپ کے پاس پہلے سے انتظامی اختیارات ہیں۔',
  },
  'يجب أن تكون مسجلاً في حي': {
    ar: 'يجب أن تكون مسجلاً في حيّ لإتمام هذا الإجراء.',
    en: 'You need to be registered in a neighborhood to do that.',
    ur: 'اس کے لیے کسی محلے میں رجسٹرڈ ہونا ضروری ہے۔',
  },
  'تحتاج 20 نقطة سمعة على الأقل': {
    ar: 'تحتاج 20 نقطة سمعة على الأقل.',
    en: 'You need at least 20 reputation points.',
    ur: 'کم از کم 20 ساکھ پوائنٹس درکار ہیں۔',
  },
  'لديك طلب قيد المراجعة بالفعل': {
    ar: 'لديك طلب قيد المراجعة بالفعل.',
    en: 'You already have a pending request.',
    ur: 'آپ کی ایک درخواست پہلے سے زیرِ غور ہے۔',
  },
  'اكتب سبب طلبك (10 أحرف على الأقل)': {
    ar: 'اكتب سبب طلبك (10 أحرف على الأقل).',
    en: 'Please write a reason (at least 10 characters).',
    ur: 'وجہ لکھیں (کم از کم 10 حروف)۔',
  },
  'حيّك لديه عدد كافٍ من المشرفين حالياً / This neighborhood currently has enough moderators': {
    ar: 'حيّك لديه عدد كافٍ من المشرفين حالياً.',
    en: 'This neighborhood already has enough moderators.',
    ur: 'اس محلے میں پہلے سے کافی منتظم موجود ہیں۔',
  },

  // ── Rides: rating ────────────────────────────────────────────────
  'الرحلة لم تكتمل بعد': {
    ar: 'الرحلة لم تكتمل بعد.',
    en: 'The trip has not completed yet.',
    ur: 'سفر ابھی مکمل نہیں ہوا۔',
  },
  'انتهت مهلة التقييم': {
    ar: 'انتهت مهلة التقييم.',
    en: 'The rating window has closed.',
    ur: 'درجہ بندی کی مہلت ختم ہو گئی۔',
  },
  'ليس لديك صلاحية': {
    ar: 'ليست لديك صلاحية لهذا الإجراء.',
    en: "You don't have permission to do that.",
    ur: 'آپ کو اس کام کی اجازت نہیں۔',
  },
  'قيّمت هذه الرحلة بالفعل': {
    ar: 'قيّمت هذه الرحلة بالفعل.',
    en: 'You have already rated this trip.',
    ur: 'آپ اس سفر کی درجہ بندی کر چکے ہیں۔',
  },
  'التقييم يجب أن يكون بين 1 و5': {
    ar: 'التقييم يجب أن يكون بين 1 و5.',
    en: 'Rating must be between 1 and 5.',
    ur: 'درجہ بندی 1 سے 5 کے درمیان ہونی چاہیے۔',
  },

  // ── Polls ────────────────────────────────────────────────────────
  'التصويت متاح فقط للمشرفين': {
    ar: 'التصويت لا يُنشئه سوى المشرفين.',
    en: 'Only moderators can create polls.',
    ur: 'پولز صرف منتظم بنا سکتے ہیں۔',
  },
  'السؤال قصير جداً': {
    ar: 'السؤال قصير جداً.',
    en: 'The question is too short.',
    ur: 'سوال بہت مختصر ہے۔',
  },
  'يجب أن يكون هناك 2-6 خيارات': {
    ar: 'يجب أن يكون هناك بين 2 و6 خيارات.',
    en: 'You need between 2 and 6 options.',
    ur: '2 سے 6 اختیارات درکار ہیں۔',
  },
  'الخيارات فارغة': {
    ar: 'الخيارات فارغة.',
    en: 'Options cannot be empty.',
    ur: 'اختیارات خالی ہیں۔',
  },

  // ── Service provider items ───────────────────────────────────────
  'متاح فقط لمقدمي الخدمات / Service providers only': {
    ar: 'هذا القسم متاح فقط لحسابات مقدّمي الخدمات.',
    en: 'Service-provider accounts only.',
    ur: 'صرف سروس پرووائیڈر اکاؤنٹس کے لیے۔',
  },
  'وصلت الحد الأقصى للعناصر حالياً / Item limit reached for now': {
    ar: 'وصلت الحد الأقصى للعناصر حالياً.',
    en: "You've hit the item limit for now.",
    ur: 'ابھی آئٹمز کی حد مکمل ہو گئی۔',
  },
  'العنوان مطلوب / Title required': {
    ar: 'العنوان مطلوب.',
    en: 'Title is required.',
    ur: 'عنوان درکار ہے۔',
  },
  'العنوان طويل جداً / Title too long': {
    ar: 'العنوان طويل جداً.',
    en: 'Title is too long.',
    ur: 'عنوان بہت طویل ہے۔',
  },
  'الوصف طويل جداً / Description too long': {
    ar: 'الوصف طويل جداً.',
    en: 'Description is too long.',
    ur: 'تفصیل بہت طویل ہے۔',
  },
  'سعر غير صالح / Invalid price': {
    ar: 'السعر غير صالح — أدخل رقماً صحيحاً.',
    en: 'Price is invalid — enter a valid number.',
    ur: 'قیمت درست نہیں — درست نمبر درج کریں۔',
  },

  // ── Emergency request (English messages from server) ─────────────
  'You already have a pending emergency request': {
    ar: 'لديك طلب طوارئ قيد المراجعة بالفعل.',
    en: 'You already have a pending emergency request.',
    ur: 'آپ کی ایک ہنگامی درخواست پہلے سے زیرِ غور ہے۔',
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
