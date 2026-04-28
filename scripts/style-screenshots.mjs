#!/usr/bin/env node
// Wrap each processed screenshot in a Snapchat-style marketing frame:
// brand-teal background, big bold Arabic headline, subtitle, phone
// screenshot floating below with rounded corners + soft drop shadow.
//
// Output: public/screenshots-store/<name>.png at 1080x1920 (Play Store
// portrait phone size), no alpha.
//
// Why headless Chrome (same as scripts/generate-feature-graphic.mjs):
// sharp/librsvg can't shape Arabic ligatures, opentype.js can't either.
// Chrome's text engine handles Arabic + @font-face + bidi natively.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import os from 'node:os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SRC_DIR = path.join(ROOT, 'public/screenshots')
const OUT_DIR = path.join(ROOT, 'public/screenshots-store')

// Headline copy per slot — keeps Arabic alongside the marketing voice
// that already runs across the website / app launcher / store listing.
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

if (!fs.existsSync(SRC_DIR)) {
  console.error('Run scripts/process-screenshots.mjs first.')
  process.exit(1)
}
fs.mkdirSync(OUT_DIR, { recursive: true })

const sources = fs.readdirSync(SRC_DIR)
  .filter((f) => /\.png$/i.test(f))
  .sort()

if (sources.length === 0) {
  console.log('No screenshots in', path.relative(ROOT, SRC_DIR))
  process.exit(0)
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hai-style-'))

function buildHtml(imgFileUrl, title, sub) {
  // body is dir=ltr (so absolute positioning + flex behave normally),
  // text wrappers are dir=rtl for proper Arabic shaping/bidi.
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
    width: 1080px; height: 1920px;
    background: linear-gradient(160deg, #00c896 0%, #00a884 30%, #008066 70%, #005a47 100%);
    position: relative;
    overflow: hidden;
    font-family: 'Cairo', system-ui, sans-serif;
    color: #fff;
  }
  /* layered glow for depth */
  .glow-tl {
    position: absolute; top: -200px; right: -200px;
    width: 800px; height: 800px; border-radius: 50%;
    background: radial-gradient(circle, rgba(255,255,255,0.22), rgba(255,255,255,0) 70%);
  }
  .glow-br {
    position: absolute; bottom: -250px; left: -200px;
    width: 900px; height: 900px; border-radius: 50%;
    background: radial-gradient(circle, rgba(0,0,0,0.28), rgba(0,0,0,0) 70%);
  }
  .dots {
    position: absolute; inset: 0; opacity: 0.04;
    background-image: radial-gradient(circle, #fff 1.2px, transparent 1.2px);
    background-size: 28px 28px;
    pointer-events: none;
  }
  .header {
    position: absolute;
    top: 110px; left: 0; right: 0;
    text-align: center;
    padding: 0 60px;
  }
  .title {
    font-family: 'Cairo', sans-serif;
    font-weight: 900;
    font-size: 84px;
    line-height: 1.05;
    margin: 0 0 14px;
    color: #fff;
    letter-spacing: -1px;
    text-shadow: 0 6px 30px rgba(0,0,0,0.30);
  }
  .sub {
    font-family: 'Cairo', sans-serif;
    font-weight: 600;
    font-size: 32px;
    line-height: 1.35;
    margin: 0;
    color: rgba(255,255,255,0.92);
    max-width: 880px;
    margin-inline: auto;
  }
  /* Phone shifted up so bottom has ~280px of teal breathing room. */
  .phone {
    position: absolute;
    top: 320px;
    left: 220px;          /* (1080 - 640) / 2 */
    width: 640px;
    height: 1383px;       /* 640 * (2335/1080) ≈ 1383 */
    border-radius: 56px;
    overflow: hidden;
    background: #fff;
    box-shadow:
      0 60px 120px rgba(0,0,0,0.50),
      0 20px 40px rgba(0,0,0,0.30),
      inset 0 0 0 2px rgba(255,255,255,0.12);
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

// Trim only top/bottom whitespace (don't touch interior — object-fit
// cover crops to a fixed aspect anyway, so we keep natural source
// aspect ratios and let the frame do the work).
async function trimToTemp(src) {
  const out = path.join(tmpDir, `trim-${path.basename(src)}`)
  const raw = await sharp(src).raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = raw.info
  const isWhite = (y) => {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels
      if (raw.data[i] < 245 || raw.data[i + 1] < 245 || raw.data[i + 2] < 245) return false
    }
    return true
  }
  let topCrop = 0
  while (topCrop < height && isWhite(topCrop)) topCrop++
  topCrop = Math.max(0, topCrop - 4)
  let bottomCrop = height - 1
  while (bottomCrop > topCrop && isWhite(bottomCrop)) bottomCrop--
  bottomCrop = Math.min(height - 1, bottomCrop + 4)
  await sharp(src)
    .extract({ left: 0, top: topCrop, width, height: bottomCrop - topCrop + 1 })
    .png({ compressionLevel: 9 })
    .toFile(out)
  return out
}

let processed = 0
for (const name of sources) {
  const copy = COPY[name]
  if (!copy) {
    console.log('skip', name, '(no copy defined)')
    continue
  }
  const src = path.join(SRC_DIR, name)
  // Use raw source — no trim. All 4 sources are uniform 1080×2335 and
  // the phone container matches that aspect exactly, so any pre-trim
  // would change one image's height and break the "identical phones"
  // look across the set.
  const imgUrl = `file:///${src.replace(/\\/g, '/')}`
  const html = buildHtml(imgUrl, copy.title, copy.sub)
  const htmlPath = path.join(tmpDir, `${name}.html`)
  fs.writeFileSync(htmlPath, html, 'utf8')

  const shotPath = path.join(tmpDir, `${name}.shot.png`)
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=1080,1920',
    `--screenshot=${shotPath}`,
    '--virtual-time-budget=3000',
    `file:///${htmlPath.replace(/\\/g, '/')}`,
  ]
  const result = spawnSync(chrome, args, { stdio: 'pipe', encoding: 'utf8' })
  if (result.status !== 0 || !fs.existsSync(shotPath)) {
    console.error('Chrome failed for', name, result.stderr?.slice(0, 200))
    continue
  }

  // Chrome already renders at 1080x1920. Just flatten alpha + recompress;
  // skip the resize step that was introducing left/right white bars when
  // Chrome's actual screenshot dimensions diverged from --window-size.
  const dst = path.join(OUT_DIR, name)
  await sharp(shotPath)
    .flatten({ background: '#00a884' })
    .png({ compressionLevel: 9 })
    .toFile(dst)
  const { size } = fs.statSync(dst)
  console.log('wrote', path.relative(ROOT, dst), `1080x1920 ${(size / 1024).toFixed(0)}KB`)
  processed++
}

try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
console.log(`\nDone. ${processed} styled.`)
