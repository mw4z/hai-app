#!/usr/bin/env node
// Render the marketing template natively at each store's required
// canvas size — no scale-and-pad, no letterbox bars. Each device gets
// its own layout proportions so the phone screenshot fills the canvas
// the way it would on that device's listing.
//
// Outputs:
//   public/screenshots-store-iphone/  → 1290×2796 (App Store iPhone 6.7")
//   public/screenshots-store-ipad/    → 2048×2732 (App Store iPad 12.9")
//   public/screenshots-store-android/ → 1080×1920 (Play Store, iOS chrome stripped)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import os from 'node:os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SRC_DIR = path.join(ROOT, 'public/screenshots')           // iPhone-aspect sources (1080×2335)
const IPAD_SRC_DIR = path.join(ROOT, 'public/screenshots-ipad-raw') // iPad-aspect sources (3:4)

const COPY = {
  '01-feed.png':    { title: 'اكتشف حيّك',     sub: 'تنبيهات، طلبات، ونبض حيّك في مكان واحد' },
  '02-market.png':  { title: 'سوق حيّك',       sub: 'بيع واشترِ من جيرانك بثقة' },
  '03-ride.png':    { title: 'مشاوير الحي',    sub: 'وفّر وقتك، شارك مشوارك مع جيرانك' },
  '04-provider.png':{ title: 'مقدّمو الخدمات', sub: 'سبّاك، كهربائي، صيانة — كلهم على بُعد ضغطة' },
  '05-compose.png': { title: 'انشر بسهولة',    sub: 'شارك حيك بكل تفاصيله' },
  '06-threads.png': { title: 'محادثات خاصة',   sub: 'تواصل مع جيرانك بأمان وخصوصية' },
  '07-profile.png': { title: 'هويتك في الحي',  sub: 'ابنِ سمعتك بين جيرانك' },
  '08-onboarding.png': { title: 'ابدأ من حيّك', sub: 'منصة جيرانك الذكية' },
}

// Per-device layout. The phone always preserves the 1080:2335 source
// aspect — we just scale everything (canvas, phone, type) so the result
// looks balanced for that device's typical listing thumbnail.
const DEVICES = [
  {
    name: 'iphone',
    out: 'public/screenshots-store-iphone',
    canvasW: 1290, canvasH: 2796,
    titleTop: 160, titlePadX: 80,
    titleSize: 110, subSize: 42, titleGap: 18,
    phoneW: 1060, phoneTop: 460,
    stripIosChrome: false,
  },
  {
    name: 'ipad',
    srcDir: 'public/screenshots-ipad-raw',
    srcAspect: 1280 / 959,
    out: 'public/screenshots-store-ipad',
    canvasW: 2048, canvasH: 2732,
    titleTop: 130, titlePadX: 200,
    titleSize: 130, subSize: 50, titleGap: 22,
    phoneW: 1500, phoneTop: 460,
    stripIosChrome: false,
    skipCollapse: true,        // iPad sources are already clean — don't collapse
    fixedAspect: true,         // use the device-level srcAspect for ALL iPad slots so they all match
  },
  {
    name: 'android',
    out: 'public/screenshots-store-android',
    canvasW: 1080, canvasH: 1920,
    titleTop: 110, titlePadX: 60,
    titleSize: 84, subSize: 32, titleGap: 14,
    phoneW: 640, phoneTop: 320,
    stripIosChrome: true,
  },
]

function findChrome() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA &&
      path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe'),
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean)
  for (const p of candidates) {
    try { if (fs.statSync(p).isFile()) return p } catch { /* nope */ }
  }
  return null
}
const chrome = findChrome()
if (!chrome) { console.error('Chrome not found.'); process.exit(1) }
if (!fs.existsSync(SRC_DIR)) { console.error('Run scripts/process-screenshots.mjs first.'); process.exit(1) }

function listSources(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort()
}
const sources = listSources(SRC_DIR)
if (sources.length === 0) { console.log('No screenshots in', SRC_DIR); process.exit(0) }

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hai-devices-'))
const sharp = (await import('sharp')).default

async function stripIosChrome(src) {
  const out = path.join(tmpDir, `nochrome-${path.basename(src)}`)
  const meta = await sharp(src).metadata()
  await sharp(src)
    .extract({ left: 0, top: 80, width: meta.width, height: meta.height - 80 - 40 })
    .png({ compressionLevel: 9 })
    .toFile(out)
  return out
}

// Collapse any interior all-white run > 200 rows down to a 60-row gap.
// Empties out the dead middle of sparse screens (e.g. a threads list with
// only 3-4 conversations) so the bottom nav lands right under the content
// instead of stranded after a giant white bar.
async function collapseInteriorWhite(src) {
  const out = path.join(tmpDir, `tight-${path.basename(src)}`)
  const raw = await sharp(src).raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = raw.info
  const isWhite = new Array(height)
  for (let y = 0; y < height; y++) {
    let allWhite = true
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels
      if (raw.data[i] < 245 || raw.data[i + 1] < 245 || raw.data[i + 2] < 245) {
        allWhite = false; break
      }
    }
    isWhite[y] = allWhite
  }
  let runStart = -1, longestStart = -1, longestLen = 0
  for (let y = 0; y < height; y++) {
    if (isWhite[y]) {
      if (runStart < 0) runStart = y
    } else if (runStart >= 0) {
      const len = y - runStart
      // ignore runs that touch the top or bottom edge — those are
      // status-bar or home-indicator gutters, not empty middles.
      if (runStart > 50 && y < height - 50 && len > longestLen) {
        longestLen = len; longestStart = runStart
      }
      runStart = -1
    }
  }
  if (longestLen <= 200) {
    fs.copyFileSync(src, out)
    return out
  }
  const gap = 60
  const aboveH = longestStart
  const belowStart = longestStart + longestLen
  const belowH = height - belowStart
  const above = await sharp(src).extract({ left: 0, top: 0, width, height: aboveH }).png().toBuffer()
  const below = await sharp(src).extract({ left: 0, top: belowStart, width, height: belowH }).png().toBuffer()
  await sharp({ create: { width, height: aboveH + gap + belowH, channels: 3, background: '#ffffff' } })
    .composite([
      { input: above, top: 0, left: 0 },
      { input: below, top: aboveH + gap, left: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toFile(out)
  return out
}

function buildHtml(d, imgFileUrl, title, sub, srcW, srcH) {
  // For devices marked fixedAspect, lock to the device's srcAspect so all
  // phones in that set are the exact same size. Otherwise size to the
  // actual source aspect (used for iPhone, where collapseWhite changes
  // height per-screen and we want each phone to fill its container).
  const aspect = d.fixedAspect && d.srcAspect ? d.srcAspect : (srcH / srcW)
  const phoneH = Math.round(d.phoneW * aspect)
  const phoneLeft = Math.round((d.canvasW - d.phoneW) / 2)
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
    width: ${d.canvasW}px; height: ${d.canvasH}px;
    background: linear-gradient(160deg, #00c896 0%, #00a884 30%, #008066 70%, #005a47 100%);
    position: relative; overflow: hidden;
    font-family: 'Cairo', system-ui, sans-serif; color: #fff;
  }
  .glow-tl {
    position: absolute; top: -200px; right: -200px;
    width: ${Math.round(d.canvasW * 0.7)}px; height: ${Math.round(d.canvasW * 0.7)}px; border-radius: 50%;
    background: radial-gradient(circle, rgba(255,255,255,0.22), rgba(255,255,255,0) 70%);
    pointer-events: none;
  }
  .glow-br {
    position: absolute; bottom: -250px; left: -200px;
    width: ${Math.round(d.canvasW * 0.85)}px; height: ${Math.round(d.canvasW * 0.85)}px; border-radius: 50%;
    background: radial-gradient(circle, rgba(0,0,0,0.28), rgba(0,0,0,0) 70%);
    pointer-events: none;
  }
  .dots {
    position: absolute; inset: 0; opacity: 0.04;
    background-image: radial-gradient(circle, #fff 1.2px, transparent 1.2px);
    background-size: 28px 28px; pointer-events: none;
  }
  .header {
    position: absolute;
    top: ${d.titleTop}px; left: 0; right: 0;
    text-align: center; padding: 0 ${d.titlePadX}px;
  }
  .title {
    font-family: 'Cairo', sans-serif; font-weight: 900;
    font-size: ${d.titleSize}px; line-height: 1.05;
    margin: 0 0 ${d.titleGap}px; color: #fff;
    letter-spacing: -1px; text-shadow: 0 6px 30px rgba(0,0,0,0.30);
  }
  .sub {
    font-family: 'Cairo', sans-serif; font-weight: 600;
    font-size: ${d.subSize}px; line-height: 1.35;
    margin: 0; color: rgba(255,255,255,0.92);
    max-width: ${Math.round(d.canvasW * 0.85)}px; margin-inline: auto;
  }
  .phone {
    position: absolute;
    top: ${d.phoneTop}px; left: ${phoneLeft}px;
    width: ${d.phoneW}px; height: ${phoneH}px;
    border-radius: 56px; overflow: hidden; background: #fff;
    box-shadow:
      0 60px 120px rgba(0,0,0,0.50),
      0 20px 40px rgba(0,0,0,0.30),
      inset 0 0 0 2px rgba(255,255,255,0.12);
  }
  .phone img { width: 100%; height: 100%; display: block; }
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
  <div class="phone"><img src="${imgFileUrl}" alt="" /></div>
</body>
</html>`
}

for (const d of DEVICES) {
  const outDir = path.join(ROOT, d.out)
  fs.mkdirSync(outDir, { recursive: true })
  const deviceSrcDir = d.srcDir ? path.join(ROOT, d.srcDir) : SRC_DIR
  const deviceSources = listSources(deviceSrcDir)
  console.log(`\n→ ${d.name} ${d.canvasW}×${d.canvasH}  (${deviceSources.length} sources)`)
  for (const name of deviceSources) {
    // COPY uses .png keys but iPad sources are .jpg — normalize to .png
    const copyKey = name.replace(/\.(jpe?g|png)$/i, '.png')
    const copy = COPY[copyKey]
    if (!copy) continue
    const srcRaw = path.join(deviceSrcDir, name)
    const stripped = d.stripIosChrome ? await stripIosChrome(srcRaw) : srcRaw
    const src = d.skipCollapse ? stripped : await collapseInteriorWhite(stripped)
    const meta = await sharp(src).metadata()
    const imgUrl = `file:///${src.replace(/\\/g, '/')}`
    const html = buildHtml(d, imgUrl, copy.title, copy.sub, meta.width, meta.height)
    const htmlPath = path.join(tmpDir, `${d.name}-${name}.html`)
    fs.writeFileSync(htmlPath, html, 'utf8')
    const shotPath = path.join(tmpDir, `${d.name}-${name}.shot.png`)
    const args = [
      '--headless=new', '--disable-gpu', '--no-sandbox',
      '--hide-scrollbars', '--force-device-scale-factor=1',
      `--window-size=${d.canvasW},${d.canvasH}`,
      `--screenshot=${shotPath}`,
      '--virtual-time-budget=3000',
      `file:///${htmlPath.replace(/\\/g, '/')}`,
    ]
    const r = spawnSync(chrome, args, { stdio: 'pipe', encoding: 'utf8' })
    if (r.status !== 0 || !fs.existsSync(shotPath)) {
      console.error('Chrome failed for', name, r.stderr?.slice(0, 200))
      continue
    }
    // Always write PNG to the output (App Store/Play Store want PNG).
    const dst = path.join(outDir, name.replace(/\.(jpe?g|png)$/i, '.png'))
    await sharp(shotPath)
      .resize(d.canvasW, d.canvasH)
      .flatten({ background: '#00a884' })
      .png({ compressionLevel: 9 })
      .toFile(dst)
    const { size } = fs.statSync(dst)
    console.log(`  ${name}  ${d.canvasW}×${d.canvasH}  ${(size / 1024).toFixed(0)}KB`)
  }
}

try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
console.log('\nDone.')
