const fs = require('fs');
const path = require('path');

const urdu = {
  verify_resent: 'دوبارہ بھیج دیا', verify_enter_code: 'کوڈ درج کریں',
  onboard_gender_subtitle: 'آپ کی جنس منتخب کریں', onboard_location_found: 'مقام مل گیا',
  onboard_confirm: 'تصدیق کریں', onboard_wrong: 'غلط ہے', onboard_loc_question: 'کیا آپ یہاں رہتے ہیں؟',
  onboard_detecting_title: 'مقام معلوم ہو رہا ہے', onboard_detecting_sub: 'براہ کرم انتظار کریں',
  onboard_detecting_hint: 'GPS فعال رکھیں', onboard_detecting_samples: 'نمونے',
  onboard_gps_high: 'اعلیٰ درستگی', onboard_gps_medium: 'متوسط درستگی', onboard_gps_low: 'کم درستگی',
  onboard_choose_manually: 'دستی طور پر منتخب کریں', onboard_nearby_title: 'قریبی محلے',
  onboard_nearby_subtitle: 'اپنا محلہ منتخب کریں', onboard_nearby_warning: 'آپ کا مقام درست نہیں ہو سکتا',
  onboard_no_nearby: 'کوئی قریبی محلہ نہیں ملا', onboard_no_nearby_soon: 'جلد دستیاب ہوگا',
  onboard_manual_subtitle: 'شہر اور محلہ منتخب کریں', onboard_gps_denied: 'مقام کی اجازت دیں',
  onboard_city_label: 'شہر', onboard_select_city: 'شہر منتخب کریں', onboard_nbhd_label: 'محلہ',
  onboard_select_nbhd: 'محلہ منتخب کریں', onboard_saving: 'محفوظ ہو رہا ہے...',
  onboard_start: 'شروع کریں', onboard_select_first: 'پہلے محلہ منتخب کریں',
  onboard_name_required: 'نام ضروری ہے', onboard_km: 'کلومیٹر', onboard_error: 'خرابی',
  notif_mark_all_read: 'سب پڑھی ہوئی', notif_new: 'نئی', notif_settings: 'سیٹنگز',
  notif_delete: 'حذف', notif_clear_confirm: 'سب صاف کریں؟',
  legal_agree_checkbox: 'میں متفق ہوں', legal_terms_title: 'استعمال کی شرائط',
  legal_privacy_title: 'رازداری کی پالیسی', legal_last_updated: 'آخری تازہ کاری',
  thread_send: 'بھیجیں', thread_placeholder: 'پیغام لکھیں...',
  thread_send_location: 'مقام بھیجیں', thread_my_location: 'میرا مقام',
  thread_open_map: 'نقشہ کھولیں', thread_location_fail: 'مقام حاصل نہیں ہو سکا',
  thread_close: 'گفتگو بند کریں',
  rate_title: 'درجہ بندی', rate_positive: 'بہترین', rate_neutral: 'ٹھیک', rate_negative: 'بُرا',
  rate_thanks: 'شکریہ!', rate_skip: 'چھوڑیں',
  phone_change_title: 'فون نمبر تبدیل کریں', phone_new: 'نیا نمبر', phone_send_code: 'کوڈ بھیجیں',
  phone_enter_code: 'کوڈ درج کریں', phone_verify: 'تصدیق کریں', phone_changed: 'نمبر تبدیل ہو گیا!',
  phone_invalid: 'غلط نمبر',
  nbhd_change_current: 'موجودہ محلہ', nbhd_reason_moved: 'نئے محلے میں منتقل ہو گیا',
  nbhd_reason_temporary: 'سفر / عارضی قیام', nbhd_reason_other: 'دوسری وجہ',
  nbhd_change_limit: 'آپ نے تبدیلی کی حد پوری کر لی',
  upload_add_images: 'تصاویر شامل کریں', upload_max: 'زیادہ سے زیادہ', upload_error: 'اپ لوڈ ناکام',
  upload_too_large: 'فائل بہت بڑی ہے',
  common_back: 'واپس', common_loading: 'لوڈ ہو رہا ہے...', common_error: 'خرابی',
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
console.log(`Added Urdu to ${added} more keys. Total with ur: ${content.match(/ur:/g)?.length || 0}`);
