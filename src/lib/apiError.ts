import toast from 'react-hot-toast'

type Lang = 'ar' | 'en' | 'ur'

/**
 * Extract a user-friendly error message from an API response body.
 * Always returns a message in the user's current language with a
 * brief explanation of why the error happened.
 */
export function translateApiError(body: any, lang: Lang): string {
  const code = body?.error
  const serverMsg = typeof body?.message === 'string' ? body.message : ''

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

    default:
      // Server provided a human-readable message? Use it.
      if (serverMsg) return serverMsg
      if (typeof code === 'string' && code.length > 0 && code.length < 120) return code
      return lang === 'en'
        ? 'Something went wrong. Please try again.'
        : lang === 'ur'
          ? 'کچھ مسئلہ ہو گیا۔ دوبارہ کوشش کریں۔'
          : 'حدث خطأ. يرجى المحاولة مرة أخرى.'
  }
}

/**
 * One-shot: parse a failed response and show a localized toast.
 * Use this after `fetch()` when `!res.ok`.
 *
 *   if (!res.ok) { await showApiError(res, lang); return }
 */
export async function showApiError(res: Response, lang: Lang): Promise<void> {
  let body: any = null
  try { body = await res.json() } catch { /* */ }
  const msg = translateApiError(body, lang)
  if (body?.error === 'not_verified') {
    // Guide the user to the verify-location page with an actionable toast.
    toast.error(msg, { duration: 5000 })
  } else {
    toast.error(msg)
  }
}
