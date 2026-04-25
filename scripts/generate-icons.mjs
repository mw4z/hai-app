#!/usr/bin/env node
// Re-render every app-icon PNG from public/icon-512.svg using sharp.
//
//   node scripts/generate-icons.mjs
//
// Outputs:
//  - public/icon-{192,512,1024}.png   (PWA + manifest + apple-touch)
//  - android/app/src/main/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/
//      ic_launcher.png + _round.png + _foreground.png
//  - ios/.../AppIcon.appiconset/AppIcon-512@2x.png   (1024x1024)
//
// The SVG is the single source of truth — change colors there and
// re-run this to roll a new color across every platform asset.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SVG_PATH = path.join(ROOT, 'public/icon-512.svg')
const FOREGROUND_SVG_PATH = path.join(ROOT, 'public/icon-foreground-512.svg')

if (!fs.existsSync(SVG_PATH)) {
  console.error('Missing', SVG_PATH)
  process.exit(1)
}
const svgBuf = fs.readFileSync(SVG_PATH)
const fgBuf = fs.existsSync(FOREGROUND_SVG_PATH) ? fs.readFileSync(FOREGROUND_SVG_PATH) : null

async function render(buf, size, out) {
  fs.mkdirSync(path.dirname(out), { recursive: true })
  await sharp(buf).resize(size, size).png({ compressionLevel: 9 }).toFile(out)
  console.log('wrote', path.relative(ROOT, out), `${size}x${size}`)
}

const ANDROID_SIZES = {
  'mipmap-mdpi':    48,
  'mipmap-hdpi':    72,
  'mipmap-xhdpi':   96,
  'mipmap-xxhdpi':  144,
  'mipmap-xxxhdpi': 192,
}

async function run() {
  // Public PNGs (PWA, apple-touch, og-image fallback)
  await render(svgBuf, 192,  path.join(ROOT, 'public/icon-192.png'))
  await render(svgBuf, 512,  path.join(ROOT, 'public/icon-512.png'))
  await render(svgBuf, 1024, path.join(ROOT, 'public/icon-1024.png'))

  // Android launcher (square + round share the same square — Android
  // applies the round mask itself when the device wants a circle).
  for (const [dir, size] of Object.entries(ANDROID_SIZES)) {
    const baseDir = path.join(ROOT, 'android/app/src/main/res', dir)
    await render(svgBuf, size, path.join(baseDir, 'ic_launcher.png'))
    await render(svgBuf, size, path.join(baseDir, 'ic_launcher_round.png'))
    // Adaptive-icon foreground — uses the full-bleed branded SVG when
    // a separate foreground asset isn't provided. Adaptive icons
    // overlay the foreground onto the bg defined in
    // mipmap-anydpi-v26/ic_launcher.xml.
    await render(fgBuf || svgBuf, size, path.join(baseDir, 'ic_launcher_foreground.png'))
  }

  // iOS — single 1024 asset; Xcode generates the rest at build time
  // using app-icon variants in the asset catalog.
  await render(svgBuf, 1024,
    path.join(ROOT, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'))

  console.log('Done.')
}

run().catch((err) => { console.error(err); process.exit(1) })
