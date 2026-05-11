#!/usr/bin/env node
// Take the 4 tutorial mockups (public/tutorial/{feed,ride,chat,profile}.png)
// and render them onto branded marketing canvases at the exact pixel sizes
// the App Store / Play Store require:
//
//   iOS    → 1284 × 2778   (iPhone 6.7" Display — accepted by App Store
//                            Connect alongside 1242×2688 / 2688×1242 /
//                            2778×1284. Hai's listing is on the legacy
//                            6.5"/6.7" size set, so 1290×2796 (6.9") is
//                            rejected.)
//   Android→ 1080 × 1920   (Google Play portrait phone, 9:16 — within Play
//                            Store's 320–3840 / max 2:1 envelope)
//
// Output:
//   public/store-screenshots/ios/{feed,ride,chat,profile}.png
//   public/store-screenshots/android/{feed,ride,chat,profile}.png
//
// Same headless-Chrome path as scripts/style-screenshots.mjs — Chrome shapes
// Arabic ligatures correctly where sharp/librsvg/opentype.js can't.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import os from 'node:os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_BASE = path.join(ROOT, 'public/store-screenshots')

// THEME = 'light' | 'dark'. Light pulls *-light.png variants from
// screenshots-raw/ and recolors the canvas (white/teal-tinted gradient,
// dark text). Dark uses the tutorial mockups + the original teal-deep
// gradient with white text.
const THEME = (process.env.THEME || 'light').toLowerCase() === 'dark' ? 'dark' : 'light'

const SLOTS = THEME === 'light'
  ? [
      { srcDir: 'public/screenshots-raw', file: '01-feed-light.png',    out: 'feed.png',    title: 'اكتشف حيّك',     sub: 'تنبيهات، طلبات، ونبض حيّك في مكان واحد' },
      { srcDir: 'public/screenshots-raw', file: '03-ride-light.png',    out: 'ride.png',    title: 'مشاوير وتوصيل',  sub: 'وفّر وقتك، شارك مشوارك مع جيرانك' },
      { srcDir: 'public/screenshots-raw', file: '06-threads-light.png', out: 'chat.png',    title: 'محادثات خاصة',   sub: 'تواصل مع جيرانك بأمان وخصوصية' },
      { srcDir: 'public/screenshots-raw', file: '07-profile-light.png', out: 'profile.png', title: 'هويتك في الحي',  sub: 'ابنِ سمعتك بين جيرانك' },
    ]
  : [
      { srcDir: 'public/tutorial', file: 'feed.png',    out: 'feed.png',    title: 'اكتشف حيّك',     sub: 'تنبيهات، طلبات، ونبض حيّك في مكان واحد' },
      { srcDir: 'public/tutorial', file: 'ride.png',    out: 'ride.png',    title: 'مشاوير وتوصيل',  sub: 'وفّر وقتك، شارك مشوارك مع جيرانك' },
      { srcDir: 'public/tutorial', file: 'chat.png',    out: 'chat.png',    title: 'محادثات خاصة',   sub: 'تواصل مع جيرانك بأمان وخصوصية' },
      { srcDir: 'public/tutorial', file: 'profile.png', out: 'profile.png', title: 'هويتك في الحي',  sub: 'ابنِ سمعتك بين جيرانك' },
    ]

// Per-theme palette for the marketing canvas. Light keeps a hint of the
// brand teal so it doesn't read as a generic white poster.
const PALETTE = THEME === 'light'
  ? {
      bgGradient: 'linear-gradient(160deg, #e8fff7 0%, #c9f5e6 30%, #a8ead4 70%, #7ed8bb 100%)',
      glowTl:     'radial-gradient(circle, rgba(0,168,132,0.18), rgba(0,168,132,0) 70%)',
      glowBr:     'radial-gradient(circle, rgba(0,109,87,0.18), rgba(0,109,87,0) 70%)',
      dotsColor:  'rgba(0,109,87,0.18)',
      titleColor: '#063e30',
      subColor:   'rgba(6,62,48,0.78)',
      titleShadow:'0 4px 18px rgba(0,109,87,0.18)',
      flatten:    '#cdf0e2',
      phoneBg:    '#ffffff',
      phoneShadow:
        '0 60px 120px rgba(0,80,64,0.28),' +
        '0 20px 40px rgba(0,80,64,0.18),' +
        'inset 0 0 0 2px rgba(0,80,64,0.06)',
    }
  : {
      bgGradient: 'linear-gradient(160deg, #00c896 0%, #00a884 30%, #008066 70%, #005a47 100%)',
      glowTl:     'radial-gradient(circle, rgba(255,255,255,0.22), rgba(255,255,255,0) 70%)',
      glowBr:     'radial-gradient(circle, rgba(0,0,0,0.28), rgba(0,0,0,0) 70%)',
      dotsColor:  '#fff',
      titleColor: '#fff',
      subColor:   'rgba(255,255,255,0.92)',
      titleShadow:'0 6px 30px rgba(0,0,0,0.30)',
      flatten:    '#00a884',
      phoneBg:    '#fff',
      phoneShadow:
        '0 60px 120px rgba(0,0,0,0.50),' +
        '0 20px 40px rgba(0,0,0,0.30),' +
        'inset 0 0 0 2px rgba(255,255,255,0.12)',
    }

// Each preset is the canvas; phone container is sized so the 1080:2335
// source fills it without cropping (height = width * 2335/1080).
const PRESETS = {
  ios: {
    out: path.join(OUT_BASE, 'ios'),
    canvas: { w: 1284, h: 2778 },
    header: { top: 140, paddingX: 90, titleFs: 108, subFs: 44, gap: 60, subMaxW: 1100 },
    phone:  { w: 910, top: 590, radius: 72 },  // 910 * 2335/1080 ≈ 1967
  },
  android: {
    out: path.join(OUT_BASE, 'android'),
    canvas: { w: 1080, h: 1920 },
    header: { top: 100, paddingX: 60, titleFs: 84, subFs: 32, gap: 40, subMaxW: 880 },
    phone:  { w: 640, top: 340, radius: 56 },  // 640 * 2335/1080 ≈ 1383
  },
}

function findChrome() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA &&
      path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe'),
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
  console.error('Chrome not found.')
  process.exit(1)
}
// Validate every per-slot source up front so we fail fast with a clear
// message instead of mid-render.
for (const s of SLOTS) {
  const p = path.join(ROOT, s.srcDir, s.file)
  if (!fs.existsSync(p)) {
    console.error('Missing source:', path.relative(ROOT, p))
    console.error('Run scripts/mockup-screenshots.mjs first.')
    process.exit(1)
  }
}

function buildHtml({ canvas, header, phone }, imgFileUrl, title, sub) {
  const phoneH = Math.round(phone.w * 2335 / 1080)
  const phoneLeft = Math.round((canvas.w - phone.w) / 2)
  return `<!doctype html>
<html lang="ar">
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;900&display=swap" rel="stylesheet">
<style>
  html, body { margin: 0; padding: 0; }
  body {
    width: ${canvas.w}px; height: ${canvas.h}px;
    background: ${PALETTE.bgGradient};
    position: relative;
    overflow: hidden;
    font-family: 'Cairo', system-ui, sans-serif;
    color: ${PALETTE.titleColor};
  }
  .glow-tl {
    position: absolute; top: -260px; right: -260px;
    width: ${Math.round(canvas.w * 0.85)}px; height: ${Math.round(canvas.w * 0.85)}px;
    border-radius: 50%;
    background: ${PALETTE.glowTl};
    pointer-events: none;
  }
  .glow-br {
    position: absolute; bottom: -300px; left: -260px;
    width: ${Math.round(canvas.w * 0.95)}px; height: ${Math.round(canvas.w * 0.95)}px;
    border-radius: 50%;
    background: ${PALETTE.glowBr};
    pointer-events: none;
  }
  .dots {
    position: absolute; inset: 0; opacity: ${THEME === 'light' ? 0.10 : 0.04};
    background-image: radial-gradient(circle, ${PALETTE.dotsColor} 1.2px, transparent 1.2px);
    background-size: 28px 28px;
    pointer-events: none;
  }
  .header {
    position: absolute;
    top: ${header.top}px; left: 0; right: 0;
    text-align: center;
    padding: 0 ${header.paddingX}px;
  }
  .title {
    font-family: 'Cairo', sans-serif;
    font-weight: 900;
    font-size: ${header.titleFs}px;
    line-height: 1.05;
    margin: 0 0 ${header.gap}px;
    color: ${PALETTE.titleColor};
    letter-spacing: -1px;
    text-shadow: ${PALETTE.titleShadow};
  }
  .sub {
    font-family: 'Cairo', sans-serif;
    font-weight: 600;
    font-size: ${header.subFs}px;
    line-height: 1.35;
    margin: 0 auto;
    color: ${PALETTE.subColor};
    max-width: ${header.subMaxW}px;
  }
  .phone {
    position: absolute;
    top: ${phone.top}px;
    left: ${phoneLeft}px;
    width: ${phone.w}px;
    height: ${phoneH}px;
    border-radius: ${phone.radius}px;
    overflow: hidden;
    background: ${PALETTE.phoneBg};
    box-shadow: ${PALETTE.phoneShadow};
  }
  .phone img {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
</head>
<body>
  <div class="glow-tl"></div>
  <div class="glow-br"></div>
  <div class="dots"></div>
  <div class="header" dir="rtl">
    <h1 class="title">${title}</h1>
    <p class="sub">${sub}</p>
  </div>
  <div class="phone">
    <img src="${imgFileUrl}" alt="" />
  </div>
</body>
</html>`
}

const sharp = (await import('sharp')).default
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hai-store-'))

let total = 0
for (const [presetName, preset] of Object.entries(PRESETS)) {
  fs.mkdirSync(preset.out, { recursive: true })
  for (const slot of SLOTS) {
    const src = path.join(ROOT, slot.srcDir, slot.file)
    if (!fs.existsSync(src)) {
      console.log('skip', slot.file, '(missing source)')
      continue
    }
    const imgUrl = `file:///${src.replace(/\\/g, '/')}`
    const html = buildHtml(preset, imgUrl, slot.title, slot.sub)
    const htmlPath = path.join(tmpDir, `${presetName}-${slot.out}.html`)
    fs.writeFileSync(htmlPath, html, 'utf8')

    const shotPath = path.join(tmpDir, `${presetName}-${slot.out}.shot.png`)
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--window-size=${preset.canvas.w},${preset.canvas.h}`,
      `--screenshot=${shotPath}`,
      '--virtual-time-budget=4000',
      `file:///${htmlPath.replace(/\\/g, '/')}`,
    ]
    const result = spawnSync(chrome, args, { stdio: 'pipe', encoding: 'utf8' })
    if (result.status !== 0 || !fs.existsSync(shotPath)) {
      console.error('Chrome failed for', presetName, slot.out, result.stderr?.slice(0, 200))
      continue
    }

    const dst = path.join(preset.out, slot.out)
    // Force the exact pixel size the stores require. Chrome usually hits
    // it on the nose, but resizing also flattens any sub-pixel drift.
    await sharp(shotPath)
      .resize(preset.canvas.w, preset.canvas.h, { fit: 'cover', position: 'center' })
      .flatten({ background: PALETTE.flatten })
      .png({ compressionLevel: 9 })
      .toFile(dst)
    const { size } = fs.statSync(dst)
    console.log('wrote', path.relative(ROOT, dst),
      `${preset.canvas.w}x${preset.canvas.h} ${(size / 1024).toFixed(0)}KB`)
    total++
  }
}

try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
console.log(`\nDone. ${total} store screenshots (${THEME} mode) → public/store-screenshots/{ios,android}/`)
