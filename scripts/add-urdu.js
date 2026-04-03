const fs = require('fs');
const path = require('path');

// Urdu translations for all keys
const urdu = {
  // Navigation
  nav_feed: 'ہوم', nav_market: 'مارکیٹ', nav_services: 'خدمات', nav_profile: 'پروفائل',
  // Feed
  feed_title: 'حی', feed_all: 'سب', feed_new_post: 'نئی پوسٹ',
  feed_quick_ask: 'کچھ ڈھونڈ رہے ہیں؟', feed_quick_ask_btn: 'پوچھیں', feed_empty: 'ابھی کوئی پوسٹ نہیں',
  feed_browse_mode: 'براؤز موڈ — آپ یہاں پوسٹ نہیں کر سکتے', feed_browse_label: 'دوسرا محلہ دیکھیں',
  feed_search_area: 'محلہ تلاش کریں...', feed_readonly_banner: 'دوسرا محلہ دیکھ رہے ہیں — صرف پڑھنے کیلئے',
  feed_return_home: 'واپس جائیں', feed_no_posts_own: 'پہلے لکھنے والے بنیں!',
  feed_no_posts_readonly: 'اس محلے میں کوئی پوسٹ نہیں', feed_browse_title: 'محلے دیکھیں',
  feed_your_nbhd: 'آپ کا محلہ', feed_current_nbhd: '● آپ کا موجودہ محلہ',
  feed_return_nbhd: 'اپنے محلے واپس', feed_other_nbhds: 'دوسرے محلے',
  feed_ask_placeholder: 'کچھ ڈھونڈ رہے ہیں؟ پڑوسیوں سے پوچھیں...', feed_suggest_ask: 'پڑوسیوں سے پوچھیں',
  feed_suggest_service: 'خدمت پیش کریں', feed_suggest_issue: 'مسئلہ رپورٹ کریں',
  feed_be_first: 'اپنے محلے کی مدد کرنے والے پہلے بنیں!', feed_example_label: 'مثالیں',
  feed_load_more: 'مزید دکھائیں', feed_cta_title: 'آپ کے محلے کو آپ کی ضرورت ہے!',
  feed_cta_ask: 'پڑوسیوں سے پوچھیں', feed_cta_service: 'خدمت مانگیں', feed_cta_report: 'مسئلہ رپورٹ کریں', feed_cta_help: 'مدد پیش کریں',
  // Categories
  cat_ALERT: 'الرٹ', cat_LOST_FOUND: 'گمشدہ و پائے', cat_MARKETPLACE: 'بازار', cat_FOOD_HOME: 'گھریلو کھانا',
  cat_REAL_ESTATE: 'جائیداد', cat_SERVICES: 'خدمات', cat_LOOKING_FOR: 'تلاش', cat_RIDE_REQUEST: 'سواری کی درخواست',
  cat_NEIGHBORHOOD_ISSUE: 'محلے کا مسئلہ', cat_MOSQUE: 'مسجد', cat_GENERAL: 'عام', cat_WOMEN_ONLY: 'صرف خواتین',
  cat_EID_RAMADAN: 'تقریبات', cat_CONTESTS: 'مقابلے اور انعامات',
  contests_coming_soon: 'جلد آرہا ہے', contests_desc: 'محلے کے رہائشیوں کیلئے خصوصی مقابلے اور انعامات!',
  // Post
  post_comment: 'تبصرہ', post_comments: 'تبصرے', post_reply: 'جواب', post_replies: 'جوابات',
  post_react: 'ردعمل', post_report: 'رپورٹ', post_help: 'مدد کریں 🤝', post_share_contact: 'نمبر شیئر کریں',
  post_add_comment: 'تبصرہ لکھیں...', post_add_reply: 'جواب لکھیں...', post_send: 'بھیجیں',
  post_show_replies: 'جوابات دکھائیں', post_ago_just: 'ابھی', post_ago_min: 'م', post_ago_hour: 'گھ', post_ago_day: 'د',
  post_reported: 'رپورٹ ہو گئی', post_pinned: '📌 پن شدہ',
  post_no_comments: 'کوئی تبصرہ نہیں — پہلے لکھیں', post_share_contacts: 'رابطوں سے نمبر شیئر کریں',
  post_comment_placeholder: 'تبصرہ لکھیں...', post_share_placeholder: 'نمبر یا سفارش شیئر کریں...',
  post_neighbor: 'پڑوسی', post_helped: 'مدد کی', post_help_btn: 'مدد کریں', post_ago_prefix: '', post_ago_suffix: 'پہلے',
  // Profile
  profile_account: 'اکاؤنٹ', profile_settings: 'سیٹنگز', profile_name: 'نام', profile_first_name: 'پہلا نام',
  profile_last_name: 'خاندانی نام', profile_phone: 'فون نمبر', profile_email: 'ای میل',
  profile_email_add: 'ای میل شامل کریں', profile_verified: 'تصدیق شدہ', profile_unverified: 'غیر تصدیق شدہ',
  profile_language: 'زبان', profile_appearance: 'ظاہری شکل', profile_light: 'ہلکا', profile_dark: 'گہرا',
  profile_system: 'خودکار', profile_logout: 'لاگ آؤٹ', profile_reputation: 'ساکھ', profile_posts: 'میری پوسٹیں',
  profile_joined: 'شامل ہوئے', profile_save: 'محفوظ', profile_saving: 'محفوظ ہو رہا...', profile_cancel: 'منسوخ',
  profile_verify_code: 'تصدیقی کوڈ (6 ہندسے)', profile_verify_hint: 'اپنا ای میل چیک کریں', profile_verify_btn: 'تصدیق کریں',
  profile_send_code: 'تصدیقی کوڈ بھیجیں',
  // Onboarding
  onboard_hello: 'خوش آمدید!', onboard_your_name: 'آپ کا نام کیا ہے؟', onboard_first_name: 'پہلا نام',
  onboard_last_name: 'خاندانی نام', onboard_next: 'اگلا', onboard_finish: 'شروع کریں',
  onboard_gender: 'جنس', onboard_male: 'مرد', onboard_female: 'عورت', onboard_location: 'آپ کا محلہ',
  onboard_detecting: 'آپ کا مقام معلوم ہو رہا ہے...', onboard_detected: 'کیا آپ یہاں ہیں',
  onboard_yes: 'ہاں، یہ میرا محلہ ہے', onboard_no: 'غلط ہے',
  onboard_select_nearby: 'فہرست سے محلہ منتخب کریں (10 کلومیٹر)', onboard_back: 'واپس',
  // Home
  home_tagline: 'آپ کا محلہ، منظم.', home_feature_alerts: 'محلے کے فوری الرٹس',
  home_feature_market: 'قابل اعتماد مقامی بازار', home_feature_services: 'حقیقی جائزوں کے ساتھ تصدیق شدہ خدمات',
  home_feature_mosque: 'مسجد کے اعلانات اور تقریبات', home_cta_start: 'شروع کریں — مفت',
  home_login: 'لاگ ان', home_cities: 'مکہ · جدہ · ریاض',
  // Auth
  auth_phone_label: 'فون نمبر', auth_send_otp: 'تصدیقی کوڈ بھیجیں', auth_sending: 'بھیج رہے ہیں...',
  auth_register: 'رجسٹر', auth_login: 'لاگ ان', auth_verify_title: 'تصدیق', auth_verify_subtitle: 'اپنا کوڈ درج کریں',
  auth_verify_btn: 'تصدیق کریں', auth_resend: 'دوبارہ بھیجیں', auth_wrong_number: 'غلط نمبر؟',
  // Roles
  role_RESIDENT: 'رہائشی', role_NEIGHBORHOOD_MOD: 'محلے کا منتظم', role_COMPOUND_ADMIN: 'کمپاؤنڈ ایڈمن',
  role_PLATFORM_MOD: 'پلیٹ فارم منتظم', role_SUPER_ADMIN: 'سپر ایڈمن',
  // Threads
  thread_title: 'پیغامات', thread_empty: 'کوئی گفتگو نہیں', thread_contact: 'رابطہ', thread_in_progress: 'جاری',
  thread_claimed: 'پہلے سے لیا گیا', thread_end: 'گفتگو ختم کریں', thread_end_confirm: 'واقعی ختم کریں؟',
  thread_end_request: 'درخواست ختم کریں', thread_closed: 'گفتگو ختم ہو گئی', nav_threads: 'پیغامات',
  // Notifications
  notif_title: 'اطلاعات', notif_empty: 'ابھی کوئی اطلاع نہیں',
  notif_comment_on_post: 'نے آپ کی پوسٹ پر تبصرہ کیا', notif_react_on_post: 'نے آپ کی پوسٹ پسند کی',
  notif_reply_to_comment: 'نے آپ کے تبصرے کا جواب دیا', notif_looking_for_post: 'نے مدد مانگی',
  notif_new_message: 'نے پیغام بھیجا', notif_clear_all: 'سب صاف کریں',
  notif_reactions_toggle: 'ردعمل کی اطلاعات', notif_comments_toggle: 'تبصرے کی اطلاعات',
  notif_replies_toggle: 'جوابات کی اطلاعات', notif_looking_toggle: 'تلاش کی اطلاعات',
  // Neighborhood
  nbhd_change_title: 'محلہ تبدیل کریں', nbhd_change_new: 'نیا محلہ', nbhd_search: 'محلہ تلاش کریں...',
  nbhd_change_reason: 'وجہ', nbhd_change_explain: 'وضاحت کریں', nbhd_change_submit: 'درخواست بھیجیں',
  nbhd_change_success: 'محلہ تبدیل ہو گیا!', nbhd_change_pending: 'درخواست بھیج دی — جلد جواب آئے گا',
  nbhd_changes_remaining: 'باقی تبدیلیاں:', nbhd_select_neighborhood: 'محلہ منتخب کریں',
  // Admin
  admin_title: 'کنٹرول پینل', admin_home: '← ہوم', admin_overview: 'جائزہ', admin_posts: 'پوسٹیں',
  admin_reports: 'رپورٹیں', admin_requests: 'منتقلی کی درخواستیں', admin_users: 'صارفین', admin_logs: 'لاگ',
  admin_active_posts: 'فعال پوسٹیں', admin_users_count: 'صارفین', admin_pending_reports: 'زیر التوا رپورٹیں',
  admin_transfer_reqs: 'منتقلی کی درخواستیں', admin_removed: 'ہٹائی گئیں', admin_banned: 'پابندی شدہ',
  admin_loading: 'لوڈ ہو رہا ہے...', admin_no_reports: 'کوئی رپورٹ نہیں', admin_no_posts: 'کوئی پوسٹ نہیں',
  admin_no_requests: 'کوئی زیر التوا درخواست نہیں', admin_no_logs: 'کوئی لاگ نہیں',
  admin_search_posts: 'پوسٹیں تلاش کریں...', admin_search_users: 'نام یا نمبر سے تلاش...',
  admin_search: 'تلاش', admin_hide: 'چھپائیں', admin_delete: 'مکمل حذف', admin_restore: 'بحال کریں',
  admin_dismiss: 'رپورٹیں خارج', admin_reviewed: 'جائزہ لیا', admin_approve: 'منظور', admin_reject: 'مسترد',
  admin_temp_ban: 'عارضی پابندی', admin_perm_ban: 'مستقل پابندی', admin_unban: 'پابندی ہٹائیں',
  admin_nbhd_mod: 'محلے کا منتظم', admin_platform_mod: 'پلیٹ فارم منتظم', admin_remove_role: 'کردار ہٹائیں',
  admin_delete_user: 'مکمل حذف', admin_delete_confirm: 'صارف کو مکمل حذف کریں؟ واپس نہیں ہو سکتا',
  admin_no_name: 'بغیر نام', admin_report_count: 'رپورٹیں', admin_from: 'سے:', admin_to: 'تک:',
  admin_reason: 'وجہ:', admin_filter_all: 'سب', admin_filter_active: 'فعال', admin_filter_hidden: 'چھپا ہوا',
  admin_filter_removed: 'حذف شدہ', admin_filter_progress: 'زیر عمل', admin_filter_pending: 'زیر التوا',
  admin_verify: 'تصدیق کی درخواستیں', admin_no_verify: 'کوئی تصدیق کی درخواست نہیں',
  admin_mod_requests: 'انتظامی درخواستیں', admin_no_mod_requests: 'کوئی انتظامی درخواست نہیں',
  // Reputation
  rep_title: 'ساکھ کے پوائنٹس', rep_level: 'درجہ:', rep_recent: 'حالیہ تبدیلیاں', rep_no_activity: 'ابھی کوئی تبدیلی نہیں',
  rep_how: 'پوائنٹس کیسے بڑھائیں؟', rep_tip_service: 'خدمت یا سواری مکمل کریں',
  rep_tip_rating: 'مثبت درجہ بندی حاصل کریں', rep_tip_helpful: 'مفید تبصروں سے مدد کریں',
  rep_act_ride_completed: 'سواری مکمل', rep_act_service_completed: 'خدمت مکمل',
  rep_act_positive_rating: 'مثبت درجہ بندی', rep_act_negative_rating: 'منفی درجہ بندی',
  rep_act_reaction_received: 'پوسٹ پر ردعمل', rep_act_comment_engaged: 'تبصرہ پسند کیا', rep_act_report_confirmed: 'رپورٹ تصدیق شدہ',
  // Rides
  nav_rides: 'سواری', rides_title: 'سواری', rides_new: 'سواری کی درخواست',
  rides_empty: 'کوئی کھلی درخواست نہیں', rides_my_tab: 'میری درخواستیں', rides_offers_tab: 'میری پیشکشیں',
  rides_all_tab: 'سب', rides_late: 'تاخیر', rides_offers: 'پیشکشیں',
  ride_from: 'سے', ride_to: 'تک', ride_km: 'کلومیٹر', ride_min: 'منٹ', ride_now: 'ابھی', ride_scheduled: 'مقررہ',
  ride_estimate: 'اندازہ', ride_sar: 'ریال', ride_pickup: 'اٹھانے کی جگہ', ride_dropoff: 'چھوڑنے کی جگہ',
  ride_notes: 'نوٹس', ride_notes_placeholder: 'اضافی نوٹس (اختیاری)', ride_time: 'کب؟',
  ride_publish: 'درخواست شائع کریں', ride_submit_offer: 'پیشکش دیں', ride_edit_offer: 'پیشکش تبدیل کریں',
  ride_your_price: 'آپ کی پیشکش', ride_arrival_time: 'پہنچنے کا وقت', ride_message: 'مختصر پیغام',
  ride_select: 'منظوری', ride_best_price: 'کم ترین', ride_fastest: 'قریب ترین', ride_top_rated: 'اعلیٰ درجہ',
  ride_trips: 'سواری', ride_cancel_rate: 'منسوخی', ride_confirm_in: 'تصدیق کریں',
  ride_waiting_confirm: 'تصدیق کا انتظار', ride_confirmed: 'تصدیق ہو گئی', ride_en_route: 'راستے میں',
  ride_arrived: 'پہنچ گئے', ride_in_progress: 'جاری ہے', ride_pending_complete: 'آپ کی تصدیق کا انتظار',
  ride_completed: 'مکمل ہو گئی', ride_cancelled: 'منسوخ', ride_expired: 'ختم ہو گئی', ride_disputed: 'زیر جائزہ',
  ride_confirm_arrival: 'پہنچنے کی تصدیق', ride_auto_close: 'خودکار بند ہو جائے گی',
  ride_rate_trip: 'تجربے کی درجہ بندی', ride_rate_driver: 'شخص کی درجہ بندی', ride_rate_requester: 'درخواست گزار کی درجہ بندی',
  ride_comment: 'تبصرہ (اختیاری)', ride_send_rating: 'درجہ بندی بھیجیں', ride_chat: 'گفتگو',
  ride_type_message: 'پیغام لکھیں...', ride_cancel_trip: 'منسوخ کریں', ride_cancel_reason: 'منسوخی کی وجہ',
  ride_driver_action_en_route: 'راستے میں', ride_driver_action_arrived: 'پہنچ گئے',
  ride_driver_action_start: 'چلیں شروع کریں', ride_driver_action_done: 'پہنچ گئے',
  ride_price_warning_low: 'بہت کم پیشکش', ride_price_warning_high: 'زیادہ پیشکش', ride_auto_closed: 'خودکار بند ہوا',
  ride_dispute: 'تنازعہ کھولیں',
  ride_community_note: 'یہ درخواست صارفین کے درمیان سواری کے تعاون کیلئے ہے — معاہدہ براہ راست فریقین کے درمیان ہوتا ہے',
  ride_disclaimer: 'ایپ صرف صارفین کے درمیان رابطے کی سہولت فراہم کرتی ہے اور نقل و حمل کی خدمت فراہم نہیں کرتی',
  // Common
  common_retry: 'دوبارہ کوشش', common_close: 'بند کریں', common_confirm: 'تصدیق',
  // Support
  support_title: 'مدد اور تجاویز', support_new: 'نئی ٹکٹ', support_type: 'ٹکٹ کی قسم',
  support_bug: '🐛 تکنیکی مسئلہ', support_feature: '💡 تجویز', support_complaint: '⚠️ شکایت', support_other: '📝 دیگر',
  support_subject: 'موضوع', support_body: 'تفصیل سے بتائیں', support_submit: 'ٹکٹ بھیجیں',
  support_sent: 'ٹکٹ بھیج دی — جلد جواب آئے گا', support_empty: 'کوئی پرانی ٹکٹ نہیں',
  support_open: 'کھلی', support_in_progress: 'زیر عمل', support_resolved: 'حل ہو گئی', support_closed: 'بند',
  support_admin_reply: 'ایڈمن کا جواب', admin_support: 'سپورٹ ٹکٹیں', admin_no_tickets: 'کوئی ٹکٹ نہیں',
  // Polls
  poll_create: 'ووٹنگ بنائیں', poll_question: 'سوال', poll_options: 'اختیارات', poll_add_option: '+ اختیار شامل کریں',
  poll_publish: 'ووٹنگ شائع کریں', poll_votes: 'ووٹ', poll_voted: 'ووٹ دیا', poll_closed: 'ووٹنگ بند', poll_expires: 'ختم ہوتی ہے',
  // Contact admin
  contact_admin: 'محلے کی رپورٹیں', nbhd_report_new: 'نئی رپورٹ',
  nbhd_report_complaint: '⚠️ شکایت', nbhd_report_suggestion: '💡 تجویز',
  nbhd_report_issue: '🔧 مسئلہ', nbhd_report_other: '📝 دیگر',
  nbhd_report_sent: 'رپورٹ بھیج دی — منتظم جلد جواب دے گا', nbhd_report_empty: 'کوئی پرانی رپورٹ نہیں',
  nbhd_report_reply: 'منتظم کا جواب', admin_nbhd_reports: 'محلے کی رپورٹیں',
  // Mod request
  mod_request_title: 'محلے کی نگرانی کی درخواست', mod_request_desc: 'اپنے محلے کا منتظم بننے کیلئے درخواست دیں',
  mod_request_btn: 'درخواست دیں', mod_request_reason: 'آپ منتظم کیوں بننا چاہتے ہیں؟',
  mod_request_submit: 'درخواست بھیجیں', mod_request_cancel: 'منسوخ',
  mod_request_pending: 'آپ کی درخواست زیر جائزہ ہے', mod_request_approved: 'منظور! آپ اب منتظم ہیں',
  mod_request_rejected: 'مسترد ہو گئی۔ بعد میں دوبارہ درخواست دیں', mod_request_req_days: 'اکاؤنٹ 7 دن پرانا ہونا ضروری',
  mod_request_req_rep: 'کم از کم 20 ساکھ پوائنٹس ضروری',
};

// Read the file
const filePath = path.join(__dirname, '..', 'src', 'lib', 'i18n.ts');
let content = fs.readFileSync(filePath, 'utf8');

// For each key, find the line and add ur: if missing
let added = 0;
for (const [key, urText] of Object.entries(urdu)) {
  // Match pattern: key: { ar: '...', en: '...' } or key: { ar: '...', en: '...', ur: '...' }
  const regex = new RegExp(`(${key}:\\s*\\{[^}]*?)\\}`, 'g');
  content = content.replace(regex, (match, prefix) => {
    if (match.includes("ur:")) return match; // already has ur
    // Add ur before closing }
    const replacement = `${prefix}, ur: '${urText}' }`;
    added++;
    return replacement;
  });
}

fs.writeFileSync(filePath, content, 'utf8');
console.log(`Added Urdu to ${added} keys`);
