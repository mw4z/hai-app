#!/usr/bin/env node
// Render the four website mockups (feed / threads / ride / profile) as
// HTML, screenshot them via headless Chrome, write to
// public/screenshots-raw/ in the names process-screenshots.mjs expects.
//
//   node scripts/mockup-screenshots.mjs
//
// Renders each screen in BOTH dark and light variants:
//   01-feed.png          (dark)
//   01-feed-light.png    (light)
//   06-threads.png       (dark)
//   06-threads-light.png (light)
//   ...etc.
//
// Why HTML + Chrome (same approach as style-screenshots.mjs):
// sharp / canvas can't shape Arabic ligatures. Chrome's text engine
// handles Arabic + @font-face + bidi natively. Cairo from Google Fonts
// gives us properly-connected letters that match the in-app font.
//
// Layout note: the website's PhoneFrame component (PhoneMockup.tsx)
// draws a notch at the top-center and a home-indicator bar at the
// bottom-center on top of the screenshot. We leave a 96px clear band
// at the very top (where the OS status bar would be — the notch sits
// in this empty band) and lift the bottom nav to `bottom: 30px` so
// the home indicator clears the in-mockup nav row.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import os from 'node:os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'public/screenshots-raw')

// iPhone 15 Pro logical size at 1× density. Matches the aspect of the
// April-25 screenshots so the website's PhoneFrame component renders
// the four phones at identical aspect ratios.
const W = 1080
const H = 2335

function findChrome() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean)
  for (const p of candidates) {
    try { if (fs.statSync(p).isFile()) return p } catch { /* nope */ }
  }
  return null
}

const chrome = findChrome()
if (!chrome) {
  console.error('Chrome not found. Install Chrome or update findChrome().')
  process.exit(1)
}

fs.mkdirSync(OUT_DIR, { recursive: true })

// ── Theme tokens (kept in sync with src/app/design-tokens.css)
const TOKENS_DARK = `
  --hai-bg:        #0a1518;
  --hai-surface-1: #131e22;
  --hai-surface-2: #1a2429;
  --hai-surface-3: #232f35;
  --hai-border:    rgba(255,255,255,0.08);
  --hai-border-2:  rgba(255,255,255,0.12);
  --hai-primary:    #00a884;
  --hai-primary-2:  #00c896;
  --hai-primary-d:  #006d57;
  --hai-amber:      #f5a623;
  --hai-text:       #e9edef;
  --hai-text-mute:  #8696a0;
  --hai-text-faint: #5e6f7a;
  --hai-blue:       #1e88e5;
  --hai-map-1:      #1a3a3a;
  --hai-map-2:      #0d2d2d;
  --hai-grid:       rgba(255,255,255,0.04);
  --hai-route:      rgba(0,168,132,0.08);
  --hai-purple-bg:  rgba(120,80,200,0.16);
  --hai-purple-fg:  #a78bfa;
`

const TOKENS_LIGHT = `
  --hai-bg:        #f8f9fa;
  --hai-surface-1: #ffffff;
  --hai-surface-2: #f1f3f5;
  --hai-surface-3: #e9ecef;
  --hai-border:    rgba(0,0,0,0.08);
  --hai-border-2:  rgba(0,0,0,0.12);
  --hai-primary:    #00a884;
  --hai-primary-2:  #00c896;
  --hai-primary-d:  #006d57;
  --hai-amber:      #d97706;
  --hai-text:       #1a2429;
  --hai-text-mute:  #6c757d;
  --hai-text-faint: #adb5bd;
  --hai-blue:       #1e88e5;
  --hai-map-1:      #d4ede9;
  --hai-map-2:      #b2dfdb;
  --hai-grid:       rgba(0,0,0,0.06);
  --hai-route:      rgba(0,109,87,0.10);
  --hai-purple-bg:  rgba(120,80,200,0.10);
  --hai-purple-fg:  #6d4ac9;
`

function sharedCss(theme) {
  return `
  :root { ${theme === 'light' ? TOKENS_LIGHT : TOKENS_DARK} }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    width: ${W}px; height: ${H}px;
    background: var(--hai-bg);
    font-family: 'Cairo', 'IBM Plex Sans Arabic', system-ui, sans-serif;
    color: var(--hai-text);
    direction: rtl;
    -webkit-font-smoothing: antialiased;
  }
  .scrn { position: relative; width: 100%; height: 100%; overflow: hidden; }

  /* Bottom nav — anchored at the screen edge but 30px taller than its
     content area so the website's PhoneFrame home-indicator bar sits
     on the nav's surface color (and not on a different body-bg strip
     below it). */
  .bottomnav {
    position: absolute; bottom: 0; left: 0; right: 0;
    height: 230px;
    background: var(--hai-surface-1);
    border-top: 1px solid var(--hai-border);
    display: flex; align-items: flex-start; justify-content: space-around;
    padding-top: 28px;
    z-index: 40;
  }
  /* Make sure the body bg below the nav is also surface-1 — defense in
     depth in case the nav background somehow doesn't paint the bottom
     30px (e.g. browser-specific overflow handling). */
  .scrn::after {
    content: '';
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 30px;
    background: var(--hai-surface-1);
    z-index: 41;
  }
  .nav-item { display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--hai-text-faint); font-size: 22px; }
  .nav-item.active { color: var(--hai-primary); }
  .nav-icon { width: 50px; height: 50px; }
  .nav-fab {
    width: 132px; height: 132px; border-radius: 50%;
    background: var(--hai-primary);
    box-shadow: 0 12px 32px rgba(0,168,132,0.45), 0 0 60px rgba(0,168,132,0.25);
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 84px; font-weight: 300;
    margin-top: -68px;
  }

  /* Avatar */
  .av {
    width: 88px; height: 88px; border-radius: 50%;
    background: linear-gradient(135deg, #00c896, #006d57);
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-weight: 800; font-size: 44px; flex-shrink: 0;
  }
  .av.lg { width: 220px; height: 220px; font-size: 110px; }
  .av.sm { width: 64px; height: 64px; font-size: 30px; }

  .pill {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 10px 22px; border-radius: 999px;
    background: var(--hai-surface-2);
    color: var(--hai-text-mute);
    font-weight: 600; font-size: 26px; white-space: nowrap;
  }
  .pill.active {
    background: var(--hai-primary);
    color: #fff;
  }
  .pill.amber { background: rgba(245,166,35,0.16); color: var(--hai-amber); }
  .pill.green { background: rgba(0,168,132,0.16); color: var(--hai-primary-2); border: 1px solid rgba(0,168,132,0.3); }
  .pill.sm { padding: 6px 16px; font-size: 22px; }

  .card {
    background: var(--hai-surface-1);
    border: 1px solid var(--hai-border);
    border-radius: 28px;
    padding: 28px;
  }
`
}

// ─── 1. FEED ────────────────────────────────────────────────────────
function feedHtml(theme) {
  return `<!doctype html><html lang="ar"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;900&display=swap" rel="stylesheet">
<style>${sharedCss(theme)}
  .feed-header {
    position: absolute; top: 96px; left: 0; right: 0;
    height: 130px;
    background: var(--hai-surface-1);
    border-bottom: 1px solid var(--hai-border);
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 36px;
  }
  .brand-mark {
    width: 64px; height: 64px; border-radius: 18px;
    background: var(--hai-primary);
    display: grid; place-items: center;
    color: #fff; font-weight: 900; font-size: 32px;
    box-shadow: 0 4px 16px rgba(0,168,132,0.4);
  }
  .nbhd-pill {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 22px; border-radius: 999px;
    background: rgba(0,168,132,0.12); color: var(--hai-primary);
    font-weight: 700; font-size: 26px;
    border: 1px solid rgba(0,168,132,0.25);
  }
  .bell { width: 56px; height: 56px; display: grid; place-items: center;
    color: var(--hai-text); font-size: 36px; position: relative; }
  .bell::after {
    content: ''; position: absolute; top: 8px; right: 6px;
    width: 16px; height: 16px; background: #ef4444; border-radius: 50%;
    border: 3px solid var(--hai-surface-1);
  }
  .chips {
    position: absolute; top: 226px; left: 0; right: 0;
    height: 110px;
    display: flex; align-items: center; gap: 16px;
    padding: 0 36px;
    overflow: hidden;
  }
  .feed-list {
    position: absolute; top: 336px; left: 0; right: 0; bottom: 230px;
    padding: 28px 36px 40px;
    display: flex; flex-direction: column; gap: 28px;
    overflow: hidden;
  }
  .post .meta { display: flex; align-items: center; gap: 18px; margin-bottom: 22px; }
  .post .name { font-weight: 700; font-size: 30px; color: var(--hai-text); }
  .post .time { color: var(--hai-text-faint); font-size: 22px; }
  .post .title { font-weight: 700; font-size: 36px; line-height: 1.35; margin-bottom: 12px; color: var(--hai-text); }
  .post .body { color: var(--hai-text-mute); font-size: 28px; line-height: 1.6; margin-bottom: 22px; }
  .post .actions { display: flex; gap: 28px; color: var(--hai-text-faint); font-size: 24px; }
  .post .actions div { display: flex; align-items: center; gap: 8px; }
  .badge-row { display: flex; gap: 10px; margin-right: auto; }
  .price { color: var(--hai-primary); font-weight: 700; font-size: 30px; }
</style></head><body><div class="scrn">

  <!-- header -->
  <div class="feed-header">
    <div style="display:flex; align-items:center; gap: 18px;">
      <div class="brand-mark">حي</div>
      <div class="nbhd-pill">📍 الزايدي · مكة ▾</div>
    </div>
    <div class="bell">🔔</div>
  </div>

  <!-- category chips -->
  <div class="chips">
    <div class="pill active">🏘️ الكل</div>
    <div class="pill">🔎 طلبات</div>
    <div class="pill">🛒 السوق</div>
    <div class="pill">🛠 خدمات</div>
    <div class="pill">🚗 المشاوير</div>
  </div>

  <!-- feed cards -->
  <div class="feed-list">

    <!-- card 1: neighborhood report -->
    <div class="card post">
      <div class="meta">
        <div class="av">و</div>
        <div>
          <div class="name">ولاء</div>
          <div class="time">منذ ٥ د</div>
        </div>
        <div class="badge-row">
          <div class="pill amber sm">⚠️ مشكلة في الحي</div>
        </div>
      </div>
      <div class="title">انقطاع الكهرباء</div>
      <div class="body">إيش سبب انقطاع الكهرباء المتكرر بالأمس؟</div>
      <div class="actions">
        <div>💬 ٣</div><div>🤝 تعليق</div><div>🔔</div><div>↗</div>
      </div>
    </div>

    <!-- card 2: marketplace -->
    <div class="card post">
      <div class="meta">
        <div class="av">خ</div>
        <div>
          <div class="name">خالد <span style="color:var(--hai-primary);font-size:22px;">⚡ موثوق</span></div>
          <div class="time">منذ ١٥ د</div>
        </div>
        <div class="badge-row">
          <div class="pill sm" style="background:var(--hai-purple-bg); color:var(--hai-purple-fg);">🛒 سوق</div>
        </div>
      </div>
      <div class="title">ثلاجة سامسونج ٦٥٠ لتر للبيع</div>
      <div class="body">حالة ممتازة، شهرها سنتين، ضمان ساري</div>
      <div class="actions">
        <span class="price">١٬٢٠٠ ريال</span>
        <div style="margin-right:auto;">💬 ٢</div>
        <div>👍 ٧</div>
      </div>
    </div>

    <!-- card 3: delivery -->
    <div class="card post">
      <div class="meta">
        <div class="av">م</div>
        <div>
          <div class="name">مؤيد</div>
          <div class="time">منذ ساعة</div>
        </div>
        <div class="badge-row">
          <div class="pill amber sm">📦 توصيل</div>
        </div>
      </div>
      <div class="title">احتاج معجنات من سنابل السلام</div>
      <div class="body">أم الجود ← الزايدي · ٢ كم · ٨ د</div>
      <div class="actions">
        <span class="price">١٥–٢٥ ريال</span>
        <div style="margin-right:auto;">💬 ١</div>
      </div>
    </div>

  </div>

  <!-- bottom nav -->
  <div class="bottomnav">
    <div class="nav-item"><div style="font-size:48px;">👤</div>حسابي</div>
    <div class="nav-item"><div style="font-size:48px;">💬</div>المحادثات</div>
    <div class="nav-fab">+</div>
    <div class="nav-item"><div style="font-size:48px;">🛍</div>السوق</div>
    <div class="nav-item active"><div style="font-size:48px;">🏠</div>الرئيسية</div>
  </div>

</div></body></html>`
}

// ─── 2. THREADS LIST ────────────────────────────────────────────────
function threadsHtml(theme) {
  const rows = [
    { letter: 'ن', name: 'نورة السبيعي', preview: 'هل الكنبة لازالت متاحة؟', time: '٢:١٤ م', unread: 2, bold: true, check: false },
    { letter: 'خ', name: 'خالد المالكي', preview: 'تمام، أوصل بعد ١٥ دقيقة 👍', time: '١:٣٠ م', unread: 0, check: 'read' },
    { letter: 'ف', name: 'فهد العتيبي', preview: 'شكراً جزيلاً', time: 'أمس', unread: 0, check: 'sent' },
    { letter: 'ع', name: 'عبدالعزيز السديري', preview: 'الموعد ٤ عصراً، تمام؟', time: 'أمس', unread: 0, check: 'read', verified: true },
    { letter: 'س', name: 'سارة الرشيد', preview: '📷 صورة', time: 'السبت', unread: 0, check: 'sent' },
    { letter: 'م', name: 'محمد ع.', preview: 'تم الإرسال، بانتظار الرد', time: '٢٨/٤', unread: 0, check: 'sent' },
  ]
  return `<!doctype html><html lang="ar"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;900&display=swap" rel="stylesheet">
<style>${sharedCss(theme)}
  .thr-header {
    position: absolute; top: 96px; left: 0; right: 0;
    height: 200px; padding: 28px 36px 0;
    background: var(--hai-surface-1);
    border-bottom: 1px solid var(--hai-border);
  }
  .thr-header h1 { margin: 0 0 28px; color: var(--hai-text); font-size: 56px; font-weight: 800; }
  .search {
    display: flex; align-items: center; gap: 14px;
    padding: 16px 24px; border-radius: 999px;
    background: var(--hai-surface-3);
    color: var(--hai-text-faint);
    font-size: 28px;
  }
  .thr-list {
    position: absolute; top: 296px; bottom: 230px; left: 0; right: 0;
    overflow: hidden;
  }
  .row {
    display: flex; align-items: center; gap: 24px;
    padding: 26px 36px;
    border-bottom: 1px solid var(--hai-border);
  }
  .row .body { flex: 1; min-width: 0; }
  .row .name {
    font-weight: 700; font-size: 32px; color: var(--hai-text);
    display: flex; align-items: center; gap: 12px; margin-bottom: 8px;
  }
  .row .name.bold { font-weight: 800; }
  .verified { font-size: 22px; color: var(--hai-primary); padding: 4px 12px;
    background: rgba(0,168,132,0.14); border-radius: 999px; }
  .row .preview { font-size: 28px; color: var(--hai-text-mute); white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 10px; }
  .row .preview.unread { color: var(--hai-text); font-weight: 600; }
  .row .meta { display: flex; flex-direction: column; align-items: flex-start; gap: 12px;
    color: var(--hai-text-faint); font-size: 24px; min-width: 120px; }
  .unread-pill {
    background: var(--hai-primary); color: #fff; font-weight: 800;
    padding: 4px 16px; border-radius: 999px; font-size: 22px;
  }
  .check { font-size: 22px; }
  .check.read { color: var(--hai-blue); }
  .check.sent { color: var(--hai-text-faint); }
</style></head><body><div class="scrn">

  <div class="thr-header">
    <h1>المحادثات</h1>
    <div class="search">🔎 ابحث عن محادثة...</div>
  </div>

  <div class="thr-list">
    ${rows.map(r => `
    <div class="row">
      <div class="av">${r.letter}</div>
      <div class="body">
        <div class="name ${r.bold ? 'bold' : ''}">${r.name}${r.verified ? '<span class="verified">مقدم خدمة</span>' : ''}</div>
        <div class="preview ${r.unread > 0 ? 'unread' : ''}">${r.check === 'read' ? '<span class="check read">✓✓</span>' : r.check === 'sent' ? '<span class="check sent">✓</span>' : ''}${r.preview}</div>
      </div>
      <div class="meta">
        <span>${r.time}</span>
        ${r.unread > 0 ? `<span class="unread-pill">${r.unread}</span>` : ''}
      </div>
    </div>`).join('')}
  </div>

  <div class="bottomnav">
    <div class="nav-item"><div style="font-size:48px;">👤</div>حسابي</div>
    <div class="nav-item active"><div style="font-size:48px;">💬</div>المحادثات</div>
    <div class="nav-fab">+</div>
    <div class="nav-item"><div style="font-size:48px;">🛍</div>السوق</div>
    <div class="nav-item"><div style="font-size:48px;">🏠</div>الرئيسية</div>
  </div>

</div></body></html>`
}

// ─── 3. RIDE / DELIVERY DETAIL ──────────────────────────────────────
// No map — the real RideDetailClient screen shows pickup/dropoff as
// text rows with green/red FiMapPin icons (no map view). This mockup
// mirrors that: header, status banner, locations card, item description,
// price, then the offers list.
function rideHtml(theme) {
  return `<!doctype html><html lang="ar"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;900&display=swap" rel="stylesheet">
<style>${sharedCss(theme)}
  .top {
    position: absolute; top: 96px; left: 0; right: 0;
    height: 130px; padding: 0 36px;
    display: flex; align-items: center; justify-content: space-between;
    color: var(--hai-text);
    background: var(--hai-surface-1);
    border-bottom: 1px solid var(--hai-border);
  }
  .top h1 { margin: 0; font-size: 44px; font-weight: 800; }
  .top .icon { width: 64px; height: 64px; display: grid; place-items: center; font-size: 36px; color: var(--hai-text-mute); }

  /* Status banner — "open, accepting offers" */
  .banner {
    position: absolute; top: 226px; left: 36px; right: 36px;
    padding: 24px 28px; border-radius: 24px;
    background: linear-gradient(135deg, rgba(0,168,132,0.20), rgba(0,168,132,0.06));
    border: 1px solid rgba(0,168,132,0.35);
    display: flex; align-items: center; gap: 18px;
  }
  .banner .dot { width: 18px; height: 18px; border-radius: 50%; background: var(--hai-primary);
    box-shadow: 0 0 0 6px rgba(0,168,132,0.2); flex-shrink: 0; }
  .banner .head { color: var(--hai-text); font-weight: 800; font-size: 30px; }
  .banner .sub { color: var(--hai-text-mute); font-size: 24px; margin-top: 4px; }

  /* Locations card */
  .locs {
    position: absolute; top: 396px; left: 36px; right: 36px;
    background: var(--hai-surface-1);
    border: 1px solid var(--hai-border);
    border-radius: 28px;
    padding: 28px;
  }
  .loc-row { display: flex; align-items: flex-start; gap: 22px; padding: 14px 0; }
  .loc-row .pin {
    width: 50px; height: 50px; border-radius: 50%;
    display: grid; place-items: center;
    color: #fff; font-size: 24px; flex-shrink: 0; margin-top: 2px;
  }
  .loc-row .pin.pickup  { background: rgba(0,168,132,0.18); color: var(--hai-primary); }
  .loc-row .pin.dropoff { background: rgba(239,68,68,0.18); color: #ef4444; }
  .loc-row .body { flex: 1; min-width: 0; }
  .loc-row .label { color: var(--hai-text-mute); font-size: 22px; margin-bottom: 6px; }
  .loc-row .val { color: var(--hai-text); font-size: 30px; font-weight: 700;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* Vertical divider line connecting the two pins (like the real app) */
  .loc-divider {
    margin-right: 60px;
    border-right: 2px dashed var(--hai-border-2);
    height: 22px;
  }

  /* Item description (delivery) */
  .item-block {
    position: absolute; top: 690px; left: 36px; right: 36px;
    padding: 26px 28px;
    background: rgba(245,166,35,0.08);
    border: 1px solid rgba(245,166,35,0.30);
    border-radius: 24px;
  }
  .item-block .head {
    display: flex; align-items: center; gap: 12px;
    color: var(--hai-amber); font-weight: 700; font-size: 24px; margin-bottom: 12px;
  }
  .item-block .text { color: var(--hai-text); font-size: 28px; line-height: 1.5; }

  /* Price + type chip row */
  .price-row {
    position: absolute; top: 880px; left: 36px; right: 36px;
    display: flex; align-items: center; gap: 18px;
  }
  .price-row .price-main {
    color: var(--hai-primary); font-weight: 800; font-size: 38px;
  }
  .price-row .price-sub {
    color: var(--hai-text-mute); font-size: 24px; margin-right: auto;
  }

  /* Offers section */
  .offers-title {
    position: absolute; top: 980px; right: 36px;
    color: var(--hai-text); font-size: 36px; font-weight: 800;
    display: flex; align-items: center; gap: 14px;
  }
  .offers-title .count {
    background: var(--hai-primary); color: #fff;
    padding: 4px 16px; border-radius: 999px;
    font-size: 24px; font-weight: 800;
  }
  .offers {
    position: absolute; top: 1060px; left: 36px; right: 36px;
    display: flex; flex-direction: column; gap: 20px;
  }
  .offer {
    display: flex; align-items: center; gap: 18px; padding: 24px;
    background: var(--hai-surface-1); border: 1px solid var(--hai-border); border-radius: 24px;
  }
  .offer .body { flex: 1; min-width: 0; }
  .offer .name { color: var(--hai-text); font-weight: 700; font-size: 30px;
    display: flex; align-items: center; gap: 10px; }
  .offer .stars { color: var(--hai-amber); font-size: 22px; margin-top: 6px; }
  .offer .price { color: var(--hai-primary); font-weight: 800; font-size: 32px;
    margin-left: 12px; white-space: nowrap; }
  .offer .accept { padding: 14px 28px; background: var(--hai-primary); color: #fff;
    font-weight: 700; font-size: 26px; border-radius: 999px; white-space: nowrap; }
</style></head><body><div class="scrn">

  <div class="top">
    <div class="icon">›</div>
    <h1>طلب توصيل</h1>
    <div class="icon">⋯</div>
  </div>

  <!-- Status banner -->
  <div class="banner">
    <div class="dot"></div>
    <div>
      <div class="head">في انتظار العروض</div>
      <div class="sub">يمكنك قبول أحد العروض في الأسفل</div>
    </div>
  </div>

  <!-- Pickup / Dropoff -->
  <div class="locs">
    <div class="loc-row">
      <div class="pin pickup">📍</div>
      <div class="body">
        <div class="label">نقطة الاستلام</div>
        <div class="val">بقالة العثيم — شارع التحلية</div>
      </div>
    </div>
    <div class="loc-divider"></div>
    <div class="loc-row">
      <div class="pin dropoff">📍</div>
      <div class="body">
        <div class="label">نقطة التسليم</div>
        <div class="val">حي الزايدي — منزل</div>
      </div>
    </div>
  </div>

  <!-- Item description -->
  <div class="item-block">
    <div class="head">📦 ما تريد توصيله</div>
    <div class="text">كرتون حليب، خبز، بيض، تفاح ٢ كيلو</div>
  </div>

  <!-- Price + type chip -->
  <div class="price-row">
    <div class="pill amber sm">📦 توصيل</div>
    <div class="price-sub">السعر المقترح</div>
    <div class="price-main">١٥ – ٢٥ ريال</div>
  </div>

  <!-- Offers section -->
  <div class="offers-title">العروض <span class="count">٣</span></div>
  <div class="offers">
    <div class="offer">
      <div class="av sm">خ</div>
      <div class="body">
        <div class="name">خالد م.</div>
        <div class="stars">★★★★★ 4.9 · ١٢ توصيلة</div>
      </div>
      <div class="price">١٨ ر.س</div>
      <div class="accept">اقبل</div>
    </div>
    <div class="offer">
      <div class="av sm">ع</div>
      <div class="body">
        <div class="name">عبدالله ر.</div>
        <div class="stars">★★★★★ 4.8 · ٨ توصيلات</div>
      </div>
      <div class="price">٢٠ ر.س</div>
      <div class="accept">اقبل</div>
    </div>
    <div class="offer">
      <div class="av sm">ف</div>
      <div class="body">
        <div class="name">فهد ا.</div>
        <div class="stars">★★★★★ 5.0 · ٢٤ توصيلة</div>
      </div>
      <div class="price">١٧ ر.س</div>
      <div class="accept">اقبل</div>
    </div>
  </div>

</div></body></html>`
}

// ─── 4. PROFILE ─────────────────────────────────────────────────────
function profileHtml(theme) {
  return `<!doctype html><html lang="ar"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;900&display=swap" rel="stylesheet">
<style>${sharedCss(theme)}
  .hero {
    position: absolute; top: 96px; left: 0; right: 0; height: 600px;
    background:
      radial-gradient(circle at 50% 40%, rgba(0,168,132,0.30) 0%, rgba(0,168,132,0.10) 35%, transparent 65%),
      var(--hai-bg);
    display: flex; flex-direction: column; align-items: center; padding-top: 90px;
  }
  .hero .av {
    width: 220px; height: 220px; font-size: 110px;
    border: 6px solid var(--hai-surface-1);
    box-shadow: 0 10px 40px rgba(0,168,132,0.4);
  }
  .hero h1 { margin: 28px 0 12px; font-size: 52px; font-weight: 800; color: var(--hai-text); }
  .role-row { display: flex; gap: 12px; margin-bottom: 16px; }
  .nbhd { color: var(--hai-text-mute); font-size: 26px; }

  .stats {
    position: absolute; top: 720px; left: 36px; right: 36px;
    display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px;
  }
  .stat {
    background: var(--hai-surface-1); border: 1px solid var(--hai-border);
    border-radius: 22px; padding: 22px; text-align: center;
  }
  .stat .n { color: var(--hai-primary); font-weight: 800; font-size: 48px; }
  .stat .l { color: var(--hai-text-mute); font-size: 22px; margin-top: 6px; }

  .cta-banner {
    position: absolute; top: 920px; left: 36px; right: 36px;
    padding: 22px 28px; border-radius: 22px;
    background: linear-gradient(135deg, rgba(0,168,132,0.18), rgba(0,168,132,0.06));
    border: 1px solid rgba(0,168,132,0.35);
    display: flex; align-items: center; gap: 18px;
    color: var(--hai-text); font-weight: 700; font-size: 28px;
  }

  .settings { position: absolute; top: 1080px; left: 36px; right: 36px;
    display: flex; flex-direction: column; gap: 16px; }
  .item {
    background: var(--hai-surface-1); border: 1px solid var(--hai-border);
    border-radius: 22px; padding: 26px;
    display: flex; align-items: center; gap: 18px;
  }
  .item .icon-c {
    width: 56px; height: 56px; border-radius: 16px;
    background: var(--hai-surface-3); display: grid; place-items: center; font-size: 28px;
  }
  .item .body { flex: 1; }
  .item .t { color: var(--hai-text); font-weight: 700; font-size: 30px; }
  .item .s { color: var(--hai-text-mute); font-size: 24px; margin-top: 4px; }
  .item .chev { color: var(--hai-text-faint); font-size: 32px; }
</style></head><body><div class="scrn">

  <div class="hero">
    <div class="av lg">م</div>
    <h1>مؤيد يار</h1>
    <div class="role-row">
      <div class="pill green sm">⚡ مدير عام</div>
      <div class="pill sm" style="background:rgba(0,168,132,0.12); color:var(--hai-primary);">ساكن</div>
    </div>
    <div class="nbhd">📍 الزايدي · مكة المكرمة</div>
  </div>

  <div class="stats">
    <div class="stat"><div class="n">٢٠٢٦</div><div class="l">انضم</div></div>
    <div class="stat"><div class="n">٠</div><div class="l">منشورات</div></div>
    <div class="stat"><div class="n">١٥٧</div><div class="l">السمعة</div></div>
  </div>

  <div class="cta-banner">
    <div style="font-size:36px;">🛡️</div>
    <div style="flex:1;">احصل على دور مشرف الحي</div>
    <div style="font-size:32px; color:var(--hai-text-mute);">›</div>
  </div>

  <div class="settings">
    <div class="item">
      <div class="icon-c">👤</div>
      <div class="body"><div class="t">الحساب</div><div class="s">الاسم والجوال والبريد</div></div>
      <div class="chev">›</div>
    </div>
    <div class="item">
      <div class="icon-c">🌟</div>
      <div class="body"><div class="t">نبذة عنك</div><div class="s">عرّف عن نفسك لجيرانك</div></div>
      <div class="chev">›</div>
    </div>
    <div class="item">
      <div class="icon-c">🛠</div>
      <div class="body"><div class="t">أصبح مقدم خدمة</div><div class="s">قدم خدماتك لجيرانك</div></div>
      <div class="chev">›</div>
    </div>
    <div class="item">
      <div class="icon-c">⭐</div>
      <div class="body"><div class="t">نقاط السمعة</div><div class="s">مكانتك في الحي</div></div>
      <div class="chev">›</div>
    </div>
    <div class="item">
      <div class="icon-c">📑</div>
      <div class="body"><div class="t">المحفوظات</div><div class="s">المنشورات التي حفظتها</div></div>
      <div class="chev">›</div>
    </div>
  </div>

  <div class="bottomnav">
    <div class="nav-item active"><div style="font-size:48px;">👤</div>حسابي</div>
    <div class="nav-item"><div style="font-size:48px;">💬</div>المحادثات</div>
    <div class="nav-fab">+</div>
    <div class="nav-item"><div style="font-size:48px;">🛍</div>السوق</div>
    <div class="nav-item"><div style="font-size:48px;">🏠</div>الرئيسية</div>
  </div>

</div></body></html>`
}

// ─── Render loop ────────────────────────────────────────────────────
const SCREENS = [
  { name: '01-feed.png',     fn: feedHtml },
  { name: '06-threads.png',  fn: threadsHtml },
  { name: '03-ride.png',     fn: rideHtml },
  { name: '07-profile.png',  fn: profileHtml },
]

const THEMES = ['dark', 'light']

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hai-mockup-'))
let processed = 0
let total = 0

for (const theme of THEMES) {
  for (const s of SCREENS) {
    total++
    const filename = theme === 'dark'
      ? s.name
      : s.name.replace('.png', '-light.png')
    const html = s.fn(theme)
    const htmlPath = path.join(tmpDir, filename + '.html')
    fs.writeFileSync(htmlPath, html, 'utf8')
    const dst = path.join(OUT_DIR, filename)

    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--window-size=${W},${H}`,
      `--screenshot=${dst}`,
      '--virtual-time-budget=4000',
      `file:///${htmlPath.replace(/\\/g, '/')}`,
    ]
    const result = spawnSync(chrome, args, { stdio: 'pipe', encoding: 'utf8' })
    if (result.status !== 0 || !fs.existsSync(dst)) {
      console.error('Chrome failed for', filename, result.stderr?.slice(0, 200))
      continue
    }
    const { size } = fs.statSync(dst)
    console.log('wrote', path.relative(ROOT, dst), `${W}x${H} ${(size / 1024).toFixed(0)}KB`)
    processed++
  }
}

try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
console.log(`\nDone. ${processed}/${total} mockups rendered.`)
