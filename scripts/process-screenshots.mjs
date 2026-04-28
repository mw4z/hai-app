#!/usr/bin/env node
// Resize + alpha-strip Play Store / App Store screenshots.
//
//   node scripts/process-screenshots.mjs
//
// Reads any PNGs from public/screenshots-raw/, normalizes each to
// the exact 1080x1920 portrait the stores expect, flattens alpha
// (Play Store rejects transparency on listing images), and writes
// the cleaned files to public/screenshots/ ready for upload.
//
// The companion file scripts/store-screenshot-prompts.md has the
// ChatGPT image-gen prompts for the 8 source screens.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const RAW = path.join(ROOT, 'public/screenshots-raw')
const OUT = path.join(ROOT, 'public/screenshots')

// Width-locked, height free. Phone screenshots from iPhone/modern
// Android are taller than 9:16 (~1290x2796 ≈ 1:2.17), so we'd either
// crop (chops status bar / nav) or letterbox (black bars) when forcing
// 1080x1920. Play Store accepts any portrait screenshot 320–3840 px
// on each side, so we just normalize the width and keep the source
// aspect ratio. Result: full screen, no bars, no crop.
const TARGET_W = 1080
const FLATTEN_BG = '#ffffff'

if (!fs.existsSync(RAW)) {
  console.error('Missing source dir:', path.relative(ROOT, RAW))
  console.error('Drop your screenshots into public/screenshots-raw/ first.')
  process.exit(1)
}

fs.mkdirSync(OUT, { recursive: true })

// Pick up anything imageish — png/jpg/jpeg/webp — so WhatsApp drops
// (which arrive as .jpeg) and ChatGPT outputs (.png) both work.
const sources = fs.readdirSync(RAW)
  .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
  .sort() // alphanumeric so 01-* … 08-* land in store-listing order

if (sources.length === 0) {
  console.log('No source images in', path.relative(ROOT, RAW))
  process.exit(0)
}

let processed = 0

for (const name of sources) {
  const src = path.join(RAW, name)
  // Force .png extension on output regardless of source format —
  // Play Store + App Store both want PNG.
  const outName = name.replace(/\.(png|jpe?g|webp)$/i, '.png')
  const dst = path.join(OUT, outName)
  await sharp(src)
    .resize({ width: TARGET_W })
    .flatten({ background: FLATTEN_BG })
    .png({ compressionLevel: 9 })
    .toFile(dst)
  const meta = await sharp(dst).metadata()
  const { size } = fs.statSync(dst)
  console.log('wrote', path.relative(ROOT, dst), `${meta.width}x${meta.height}`, `${(size / 1024).toFixed(0)}KB`)
  processed++
}

console.log(`\nDone. ${processed} processed.`)
