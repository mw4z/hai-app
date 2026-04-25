#!/usr/bin/env node
// Render the Play Store feature graphic 1024x500 with embedded
// Cairo Arabic font (base64 inside the SVG via @font-face data URI),
// so sharp/librsvg renders Arabic correctly instead of falling back
// to a system font that mangles display-size letters.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// Two fonts:
//   Reem Kufi Bold — distinctive modern-kufic display, used for the
//                    "حي" wordmark so it has real character (Cairo at
//                    huge size felt Arial-flat).
//   Cairo Medium  — clean readable sans for the supporting copy.
const fontDisplay = fs.readFileSync(path.join(__dirname, 'fonts/reem-kufi-bold.ttf')).toString('base64')
const fontBody    = fs.readFileSync(path.join(__dirname, 'fonts/cairo-medium.ttf')).toString('base64')

// SVG with two @font-face definitions pointing at the embedded
// fonts via data: URIs. Sharp will resolve these and render the
// Arabic text properly.
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <defs>
    <style type="text/css">
      @font-face {
        font-family: "HaiDisplay";
        font-weight: 700;
        font-style: normal;
        src: url("data:font/ttf;base64,${fontDisplay}") format("truetype");
      }
      @font-face {
        font-family: "HaiBody";
        font-weight: 500;
        font-style: normal;
        src: url("data:font/ttf;base64,${fontBody}") format("truetype");
      }
    </style>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"   stop-color="#0a1518"/>
      <stop offset="55%"  stop-color="#0d2429"/>
      <stop offset="100%" stop-color="#06181c"/>
    </linearGradient>
    <radialGradient id="centerGlow" cx="50%" cy="36%" r="42%">
      <stop offset="0%"  stop-color="#00a884" stop-opacity="0.18"/>
      <stop offset="60%" stop-color="#00a884" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="#00a884" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="underline" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#00a884" stop-opacity="0"/>
      <stop offset="50%"  stop-color="#00a884" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#00a884" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="1024" height="500" fill="url(#bg)"/>
  <rect width="1024" height="500" fill="url(#centerGlow)"/>

  <g fill="#00a884" fill-opacity="0.05">
    <circle cx="80"  cy="80"  r="2"/>
    <circle cx="160" cy="120" r="2"/>
    <circle cx="60"  cy="200" r="2"/>
    <circle cx="200" cy="260" r="2"/>
    <circle cx="120" cy="380" r="2"/>
    <circle cx="40"  cy="440" r="2"/>
    <circle cx="900" cy="60"  r="2"/>
    <circle cx="970" cy="160" r="2"/>
    <circle cx="850" cy="220" r="2"/>
    <circle cx="980" cy="320" r="2"/>
    <circle cx="900" cy="430" r="2"/>
  </g>

  <text x="512" y="225" text-anchor="middle"
        font-family="HaiDisplay" font-size="190" font-weight="700"
        fill="#ffffff">حي</text>

  <rect x="380" y="248" width="264" height="4" fill="url(#underline)" rx="2"/>

  <text x="512" y="308" text-anchor="middle"
        font-family="HaiBody" font-size="38" font-weight="500"
        fill="#ffffff">منصة حيّك الذكية</text>

  <text x="512" y="352" text-anchor="middle"
        font-family="HaiBody" font-size="24" font-weight="500"
        fill="#ffffff" fill-opacity="0.6">جارك أقرب مما تتوقع</text>

  <text x="512" y="415" text-anchor="middle"
        font-family="HaiBody" font-size="22" font-weight="500"
        fill="#00a884" letter-spacing="1">تنبيهات  ·  دردشة  ·  خدمات  ·  سوق</text>

  <g fill="#ffffff" fill-opacity="0.40">
    <circle cx="488" cy="455" r="3"/>
    <circle cx="500" cy="455" r="3"/>
    <circle cx="512" cy="455" r="3.5" fill-opacity="0.85"/>
    <circle cx="524" cy="455" r="3"/>
    <circle cx="536" cy="455" r="3"/>
  </g>
</svg>
`

const out = path.join(ROOT, 'public/feature-graphic-1024x500.png')
await sharp(Buffer.from(svg))
  .resize(1024, 500)
  .flatten({ background: '#0a1518' })
  .png({ compressionLevel: 9 })
  .toFile(out)
console.log('wrote', path.relative(ROOT, out), '1024x500 (no-alpha, embedded Cairo)')
