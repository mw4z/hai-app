#!/usr/bin/env node
// Render the Play Store feature graphic 1024x500 via headless Chrome.
//
// Why Chrome instead of sharp/librsvg or opentype.js:
//  - sharp's bundled librsvg doesn't reliably resolve @font-face
//    data URIs at large display sizes, so the Arabic wordmark fell
//    back to a system font and looked Arial-flat.
//  - opentype.js can't fully shape Arabic — letters that should
//    connect (e.g. ح + ي in "حي") render isolated.
//  - Chrome's text engine handles Arabic shaping, bidi, and
//    @font-face perfectly. Easy + portable: every Windows machine
//    has Chrome, we drive it via --headless --screenshot.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import os from 'node:os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'public/feature-graphic-1024x500.png')

// Locate Chrome — try the standard Windows install paths first.
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
  console.error('Chrome not found. Install Chrome or set CHROME_PATH env var.')
  process.exit(1)
}

// HTML page: 1024x500 with Google Fonts Reem Kufi (display) and
// Cairo (body) loaded normally. Browser shapes the Arabic correctly.
const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>feature</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Reem+Kufi:wght@700&family=Cairo:wght@500;700&display=swap" rel="stylesheet">
<style>
  html, body { margin: 0; padding: 0; }
  body {
    /* Render at 2x size; sharp downscales for the final output.
       Larger raster → better Arabic glyph rendering. */
    width: 2048px; height: 1000px;
    background: linear-gradient(135deg, #0a1518 0%, #0d2429 55%, #06181c 100%);
    position: relative;
    overflow: hidden;
    font-family: 'Cairo', system-ui, sans-serif;
    color: #fff;
  }
  /* Centered radial brand glow */
  .glow {
    position: absolute; inset: 0;
    background: radial-gradient(ellipse at 50% 36%, rgba(0,168,132,0.20), rgba(0,168,132,0.05) 60%, transparent 80%);
    pointer-events: none;
  }
  .grid-dot { position: absolute; width: 8px; height: 8px; border-radius: 50%; background: rgba(0,168,132,0.06); }
  .stack {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center;
    gap: 32px;
  }
  .wordmark {
    font-family: 'Reem Kufi', sans-serif;
    font-weight: 700;
    font-size: 400px;
    line-height: 0.95;
    letter-spacing: -2px;
    margin: 0;
    /* No explicit padding; flex centers it. */
  }
  .underline {
    width: 560px; height: 8px;
    background: linear-gradient(90deg, transparent, rgba(0,168,132,0.95) 50%, transparent);
    border-radius: 4px;
    margin-top: -32px;
  }
  .subtitle {
    font-family: 'Cairo', sans-serif;
    font-weight: 700;
    font-size: 76px;
    color: #fff;
    margin: 0;
  }
  .tagline {
    font-family: 'Cairo', sans-serif;
    font-weight: 500;
    font-size: 48px;
    color: rgba(255,255,255,0.6);
    margin: 0;
    margin-top: -16px;
  }
  .categories {
    font-family: 'Cairo', sans-serif;
    font-weight: 500;
    font-size: 44px;
    color: #00a884;
    letter-spacing: 2px;
    margin: 0;
    margin-top: 24px;
  }
  .pages {
    display: flex; gap: 16px; margin-top: 12px;
  }
  .pages span {
    width: 12px; height: 12px; border-radius: 50%;
    background: rgba(255,255,255,0.4);
  }
  .pages span.active { background: rgba(255,255,255,0.85); width: 14px; height: 14px; }
</style>
</head>
<body>
  <div class="glow"></div>
  <div class="grid-dot" style="top:160px; left:160px;"></div>
  <div class="grid-dot" style="top:240px; left:320px;"></div>
  <div class="grid-dot" style="top:400px; left:120px;"></div>
  <div class="grid-dot" style="top:760px; left:240px;"></div>
  <div class="grid-dot" style="top:120px; left:1800px;"></div>
  <div class="grid-dot" style="top:320px; left:1940px;"></div>
  <div class="grid-dot" style="top:640px; left:1960px;"></div>
  <div class="grid-dot" style="top:860px; left:1800px;"></div>

  <div class="stack">
    <h1 class="wordmark">حي</h1>
    <div class="underline"></div>
    <p class="subtitle">منصة حيّك الذكية</p>
    <p class="tagline">جارك أقرب مما تتوقع</p>
    <p class="categories">تنبيهات&nbsp;&nbsp;·&nbsp;&nbsp;دردشة&nbsp;&nbsp;·&nbsp;&nbsp;خدمات&nbsp;&nbsp;·&nbsp;&nbsp;سوق</p>
    <div class="pages">
      <span></span><span></span><span class="active"></span><span></span><span></span>
    </div>
  </div>
</body>
</html>`

// Write HTML to a temp file
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hai-feature-'))
const htmlPath = path.join(tmpDir, 'page.html')
fs.writeFileSync(htmlPath, html, 'utf8')

// Drive Chrome headless to render and screenshot
const screenshotPath = path.join(tmpDir, 'shot.png')
// Chrome's --screenshot output dimensions on Windows don't always
// match --window-size due to default DPR and the new headless mode's
// behavior. Solution: ask for a much larger window so the screenshot
// is at least 1024x500, then sharp does a precise resize-with-fit.
const args = [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  '--window-size=2048,1000',
  `--screenshot=${screenshotPath}`,
  `--virtual-time-budget=2000`, // give Google Fonts time to load
  `file:///${htmlPath.replace(/\\/g, '/')}`,
]
const result = spawnSync(chrome, args, { stdio: 'pipe', encoding: 'utf8' })
if (result.status !== 0) {
  console.error('Chrome failed:', result.stderr)
  process.exit(1)
}

// Strip alpha channel (Play Store rule) by recompositing onto a
// solid background, save to public/. Use sharp for the conversion.
const sharp = (await import('sharp')).default
await sharp(screenshotPath)
  .resize(1024, 500)
  .flatten({ background: '#0a1518' })
  .png({ compressionLevel: 9 })
  .toFile(OUT)

// Cleanup
try {
  fs.unlinkSync(htmlPath)
  fs.unlinkSync(screenshotPath)
  fs.rmdirSync(tmpDir)
} catch { /* ignore */ }

console.log('wrote', path.relative(ROOT, OUT), '1024x500 (no-alpha, headless Chrome render)')
