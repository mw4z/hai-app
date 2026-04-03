const fs = require('fs');
const path = require('path');

const urdu = {
  auth_otp_sent: 'تصدیقی کوڈ بھیج دیا', auth_invalid_phone: 'درست سعودی فون نمبر درج کریں (05xxxxxxxx)',
  auth_connection_err: 'رابطہ ناکام', login_title: 'لاگ ان', login_subtitle: 'جاری رکھنے کیلئے فون نمبر درج کریں',
  login_no_account: 'اکاؤنٹ نہیں ہے؟', login_signup: 'ابھی رجسٹر کریں',
  register_title: 'اکاؤنٹ بنائیں', register_subtitle: 'ہم آپ کے فون پر تصدیقی کوڈ بھیجیں گے',
  register_has_account: 'پہلے سے اکاؤنٹ ہے؟', register_terms: 'رجسٹر کرکے آپ متفق ہیں',
  register_terms_link: 'استعمال کی شرائط', register_and: 'اور', register_privacy_link: 'رازداری کی پالیسی',
  verify_title: 'تصدیقی کوڈ', verify_subtitle: 'ہم نے 6 ہندسوں کا کوڈ بھیجا', verify_confirm: 'تصدیق',
  verify_verifying: 'تصدیق ہو رہی ہے...', verify_resend_after: 'دوبارہ بھیجیں', verify_seconds: 'سیکنڈ',
  verify_resend: 'دوبارہ بھیجیں', verify_wrong: 'غلط نمبر؟', verify_change: 'نمبر تبدیل کریں',
  verify_expired: 'کوڈ ختم ہو گیا', verify_invalid: 'غلط کوڈ', verify_error: 'خرابی — دوبارہ کوشش کریں',

  // Feed additional
  cat_RIDE_REQUEST: 'سواری کی درخواست',

  // Notification toggle labels
  notif_reactions_toggle: 'ردعمل کی اطلاعات', notif_comments_toggle: 'تبصرے کی اطلاعات',
  notif_replies_toggle: 'جوابات کی اطلاعات', notif_looking_toggle: 'تلاش کی اطلاعات',

  // Thread additional
  thread_end_confirm: 'واقعی گفتگو ختم کریں؟', thread_end_request: 'درخواست ختم کریں',

  // Neighborhood change additional
  nbhd_select_neighborhood: 'محلہ منتخب کریں',

  // Admin additional
  admin_filter_progress: 'زیر عمل', admin_filter_pending: 'زیر التوا',
};

const filePath = path.join(__dirname, '..', 'src', 'lib', 'i18n.ts');
let content = fs.readFileSync(filePath, 'utf8');

let added = 0;
for (const [key, urText] of Object.entries(urdu)) {
  const regex = new RegExp(`(${key}:\\s*\\{[^}]*?)\\}`, 'g');
  content = content.replace(regex, (match, prefix) => {
    if (match.includes("ur:")) return match;
    added++;
    return `${prefix}, ur: '${urText}' }`;
  });
}

fs.writeFileSync(filePath, content, 'utf8');
console.log(`Added Urdu to ${added} more keys`);
