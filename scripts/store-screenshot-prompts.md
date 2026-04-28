# Hai — Play Store / App Store screenshot prompts

Paste each prompt block below into ChatGPT image generation
(GPT-Image / DALL-E). Output dimension: **1080×1920** portrait.
Save each result as `public/screenshots-raw/<name>.png` and run
`node scripts/process-screenshots.mjs` to resize + frame all of
them at once.

Brand reference (keep consistent across all 8 frames):
- Primary teal: `#00a884`
- Primary dark: `#006d57`
- Surface dark (background): `#0a1518` to `#0d2429` gradient
- Surface light (card): `#ffffff` (light mode) / `#1a2329` (dark mode)
- Text on dark: white 100% / 60% opacity for secondary
- Layout: **RTL Arabic**, sans-serif (Cairo or system Arabic)
- App icon style: white halo ring with 4 white dots on brand teal
- Bottom nav: 5 items — home, market, **big raised + post button** in teal, messages, profile

---

## 1. Feed (home screen) — primary screenshot

```
Mobile app screenshot, 1080×1920 portrait, RTL Arabic, dark mode.
Top header: "حي" brand on the right, neighborhood pill button "حي
الياسمين · الرياض" with chevron, language indicator. Bell icon on
the left with red dot.

Below header, a horizontal pill row of category tabs: الكل ·
سوق · خدمات · رحلات · تنبيهات · مفقودات (selected: الكل, brand
teal pill).

Feed of 3 visible post cards on dark background:

Card 1: "كنبة جلد للبيع — حالة ممتازة" header, post body "كنبة
ثلاث مقاعد، استخدام عام واحد، السعر ٢،٤٠٠ ريال قابل للتفاوض".
Author "محمد ع." with avatar circle, posted "قبل ٢٠ د". Image
preview thumbnail on the right. Reaction count + comment count
icons below.

Card 2: ride request card "رحلة من حي الياسمين إلى مطار الملك
خالد" with map preview, distance "٢٢ كم", price range "٤٠–٦٠
ريال", "قبل ساعة" timestamp.

Card 3: marketplace post "سباك خبرة ١٥ سنة — متوفر اليوم" service
provider, with provider badge.

Bottom nav: 5 items — profile, messages (badge "3"), big raised
brand-teal "+ نشر" FAB button at center, market shopping bag,
home (active, teal).

All RTL. Brand teal #00a884 accents. Very polished, like a real
shipping app in 2026. Subtle shadows, rounded card corners.
```

---

## 2. Conversation (DM thread)

```
Mobile app screenshot, 1080×1920 portrait, RTL Arabic, dark mode
WhatsApp-style chat thread.

Top bar: back arrow on the left, other user's avatar and name "نورة
السبيعي · الآن" (online indicator), call/menu icons on the right.

Subtle warm wallpaper background pattern (faint geometric pattern,
very low opacity).

Messages stream:
- Left side (incoming, dark gray bubble #242625): "السلام عليكم،
  هل الكنبة لازالت متاحة؟" with timestamp "٢:١٤ م"
- Right side (outgoing, brand teal #00a884 bubble): "وعليكم السلام،
  نعم متاحة" timestamp "٢:١٥ م" + double blue check marks
- Left: image preview message (post thumbnail), caption "هذي هي؟"
- Right: "نعم 👍" timestamp + double blue checks
- Left: "متى أقدر أشوفها؟" timestamp
- Right: "اليوم بعد العصر يناسبك؟" timestamp + double blue checks
- Left (just received, animated bubble): "تمام، أرسل لي الموقع"

Bottom: chat composer — emoji icon, attach (paperclip) icon,
text input with placeholder "رسالة...", brand-teal send button
(arrow icon).

Brand teal #00a884 accents. Crisp typography, properly connected
Arabic letters. Very polished.
```

---

## 3. Ride request detail

```
Mobile app screenshot, 1080×1920 portrait, RTL Arabic, dark mode.
Ride coordination screen.

Top bar: back arrow, title "طلب رحلة", share icon.

Top half: rounded map view showing pickup pin (brand teal) and
dropoff pin (red), route line between them, Riyadh map style with
Arabic labels. "٢٢ كم · ٢٥ د" overlay badge.

Below map: trip details card on dark surface
- Pickup row: location pin icon + "حي الياسمين، شارع الأمير محمد"
- Drop-off row: flag icon + "مطار الملك خالد الدولي"
- Time: "الآن" pill (instant) + estimated price range "٤٠ – ٦٠
  ريال" in brand teal

Section: "العروض المتاحة (٣)" header in white. List of 3 driver
offer cards:
- Card 1: avatar + "خالد م." + 4.9 star rating + price "٤٥ ريال"
  + brand-teal "اقبل" button
- Card 2: "عبدالله ر." + 4.8 stars + "٥٠ ريال" + accept
- Card 3: "فهد ا." + 5.0 stars (tiny) + "٤٨ ريال" + accept

Bottom: "سحب الطلب" (cancel) text button in red.

Brand teal #00a884 throughout. Map has dark mode style.
```

---

## 4. Provider profile popup

```
Mobile app screenshot, 1080×1920 portrait, RTL Arabic, dark mode.
A user profile popup overlay covers the lower 80% of the screen,
with the dimmed feed visible behind it (slight blur).

Popup card with rounded top corners, dark background (#1a2329):

- Cover photo banner at top (teal-tinted gradient)
- User avatar overlapping the cover (large circle, soft shadow)
- Name "عبدالعزيز السديري" in white, large bold
- "VERIFIED مقدم خدمة" green check badge under name
- Neighborhood pill: "حي الياسمين · الرياض"
- Reputation row: "⭐ ١٢٤ نقطة سمعة · مستوى موثوق"

Service description block:
- "وصف الخدمة" small label
- "سباكة عامة، خبرة ١٥ سنة. متوفر للأعطال الطارئة على مدار الساعة"

Service area: pin icon + "حي الياسمين"

Social media chip row (5 round icon buttons in a horizontal line):
Instagram (pink-purple), TikTok (white on black tile), X (white on
black), Snapchat (black on yellow), WhatsApp (white on green).

Service catalog section: small grid of 3 service items with prices.

Buttons row at bottom: large brand-teal "تواصل" (contact) button
+ secondary "إبلاغ" (report) text button.

Polished, matches 2026 modern app design. Brand teal #00a884.
```

---

## 5. Compose new post

```
Mobile app screenshot, 1080×1920 portrait, RTL Arabic, dark mode.
Post creation screen.

Top bar: cancel arrow on the right, title "منشور جديد" centered,
brand-teal pill button "نشر" with send icon on the left (the
publish CTA).

Body (scroll view):

Step indicator: "اختر التصنيف" small label
Category grid 3 columns × 3 rows of tappable category cards with
icons:
- 🛒 السوق · 🛠 الخدمات · 🚗 رحلات
- 🍲 طعام · 🏠 عقارات · 📦 مفقودات
- 🚨 تنبيهات · 🤝 طلبات · ⚖️ مسابقات
(SERVICES card highlighted/selected with brand-teal border)

Title input: "العنوان" label, text input with placeholder
"اكتب عنواناً واضحاً", current text "سباك خبرة ١٥ سنة..."

Body textarea: "التفاصيل", with sample text "متوفر اليوم لجميع
الأعطال السباكية. أسعار مناسبة، خبرة طويلة." Character counter
"١٥٢ / ١٠٠٠".

Image picker row: 3 image thumbnails added + "+" button to add more.

Optional location picker: "حدد الموقع (اختياري)" with pin icon.

Brand teal #00a884 used for selected category outline + the
publish button. Dark surface throughout.
```

---

## 6. Conversations list

```
Mobile app screenshot, 1080×1920 portrait, RTL Arabic, dark mode.
WhatsApp-style threads list.

Top bar: title "الرسائل" in white, large bold. Search icon on
the left.

List of 6 thread rows separated by thin dividers:

Row 1: avatar + name "نورة السبيعي" + last message "تمام، أرسل لي
الموقع" + timestamp "الآن" in teal. Unread indicator: solid teal
dot.

Row 2: avatar + "خالد المطيري" (pinned, with pin icon) + post
title chip "🚗 رحلة لمطار الملك خالد" + last msg "أنت: ثاني العصر
يناسبك؟" + double blue check + timestamp "٢ د".

Row 3: avatar + "عبدالعزيز السديري" + post chip "🛠 سباك خبرة" +
last msg "أنت: شكراً جزيلاً" + double GREY check (delivered, not
read) + timestamp "٥ د".

Row 4: avatar + "فاطمة العبدلي" + post chip "🛒 كنبة للبيع" +
last msg "كم آخر سعر؟" + timestamp "ساعة" (no checkmark, incoming).

Row 5: avatar + "أحمد الحارثي" + last msg "أنت: 📷" (image
indicator) + double blue check + timestamp "أمس".

Row 6: avatar + "سعد الزهراني" + post chip "🚗 رحلة" + "أنت: 📍"
(location pin) + single grey check (sent only) + timestamp "أمس".

Bottom nav same as feed.

Brand teal accents. Read-receipt double-tick colors:
- Sent only: light grey
- Delivered: medium grey
- Read: brand blue (#1E88E5)
```

---

## 7. Profile (own)

```
Mobile app screenshot, 1080×1920 portrait, RTL Arabic, dark mode.
User's own profile.

Hero (top quarter): cover photo (subtle teal gradient) + circular
avatar overlapping it. Below avatar:
- Name "موعد ياسر" white bold
- Role pill "ساكن · مشرف الحي 🛡️" green
- Neighborhood pin "حي الياسمين · الرياض"

Stats row (3 columns): reputation "١٢٤" + posts "٣٢" + joined
"٢٠٢٦"

Mod-applicant CTA banner (just below stats, brand-teal subtle):
"احصل على دور مشرف الحي" with chevron arrow.

Big raised "+ نشر" FAB visible at the bottom center of nav.

Settings list (collapsed sections, only headers visible):
- 👤 الحساب
- 🔔 الإشعارات
- 🌍 اللغة (العربية ▾)
- 🌗 المظهر (داكن ▾)
- 🛡️ الخصوصية
- ❓ الدعم
- ↪︎ تسجيل الخروج (red)

Footer text: "الإصدار 1.1.2"

Bottom nav highlighted on profile tab.

Brand teal #00a884 accents on the role pill + mod banner.
```

---

## 8. Onboarding / hero (welcome)

```
Mobile app screenshot, 1080×1920 portrait, RTL Arabic, dark mode.
The first-launch landing screen before login.

Centered composition:

Top center: large rounded brand-teal app icon tile with the four
white dots and halo ring, soft drop shadow (the Hai logo).

Below icon: "حي" big Arabic wordmark in white, Reem Kufi or Cairo
Black weight, ~72pt.

Below wordmark: rotating tagline "ابدأ من حيّك" in brand-teal
color medium weight.

Feature list (3 small rows):
- 🔔 تنبيهات حيّك أولاً بأول
- 🛒 سوق محلي وخدمات قريبة
- 🚗 مشاوير من جيرانك

Two big CTA buttons stacked:
- Primary brand-teal "ابدأ الآن" (get started) + arrow
- Secondary outlined "لدي حساب · سجّل الدخول"

Tiny footer: "بالمتابعة، توافق على الشروط وسياسة الخصوصية"

Background: dark navy gradient (#0a1518 to #06181c) with VERY
faint dot grid for texture. Polished, modern.
```

---

## After generating

Save each result in `public/screenshots-raw/` with these filenames:

```
01-feed.png
02-chat.png
03-ride.png
04-provider.png
05-compose.png
06-threads.png
07-profile.png
08-onboarding.png
```

Then run:

```
node scripts/process-screenshots.mjs
```

That script (next file) will:
1. Resize each to exact 1080×1920
2. Strip alpha channels (Play Store rule)
3. Optimize PNG compression
4. Output to `public/screenshots/` ready for upload
