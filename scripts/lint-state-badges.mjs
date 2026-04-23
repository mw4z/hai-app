#!/usr/bin/env node
/**
 * lint-state-badges.mjs — static guardrail for Pass 10.
 *
 * Forbids direct rendering of `.hai-state-badge` and `.hai-state-dot`
 * anywhere in src/ except the one sanctioned renderer,
 * `src/lib/state-render.tsx`, and the token definitions in
 * `src/app/design-tokens.css`.
 *
 * Also forbids manual stacking of multiple state badges in a single
 * container without going through `resolveBadgePlan` — the signal
 * for that is any JSX file that contains 2+ consecutive string
 * literals `"hai-state-badge"` or `'hai-state-badge'`.
 *
 * Exit code 0 = clean. Non-zero = violation list on stdout.
 *
 * Run via: `npm run lint:state-badges`
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')

// Allow-list: the only places `.hai-state-badge` / `.hai-state-dot`
// may appear as an identifier.
const ALLOW = new Set([
  'src/lib/state-render.tsx',
  'src/lib/state-render.ts',
  'src/app/design-tokens.css',
  'src/app/globals.css',
  'src/lib/display-policy.ts',
  'src/lib/display-policy.test.ts',
])

const STATE_CLASS_RE = /\bhai-state-(badge|dot)\b/
// Flags JSX like className="hai-state-badge …"
const JSX_USE_RE = /className\s*=\s*(?:\{[^}]*?|["'`])[^"'`}]*\bhai-state-(badge|dot)\b/

const violations = []

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) {
      if (name === 'node_modules' || name.startsWith('.')) continue
      walk(p)
    } else if (/\.(tsx?|jsx?|css)$/.test(name)) {
      lintFile(p)
    }
  }
}

function lintFile(abs) {
  const rel = relative(ROOT, abs).split(sep).join('/')
  if (ALLOW.has(rel)) return
  const text = readFileSync(abs, 'utf8')
  // Only flag JSX-style direct usage; docstring mentions in non-allow
  // files would also fail, which we want.
  if (!STATE_CLASS_RE.test(text)) return

  const lines = text.split(/\r?\n/)
  lines.forEach((line, i) => {
    if (STATE_CLASS_RE.test(line)) {
      violations.push({ file: rel, line: i + 1, text: line.trim().slice(0, 180) })
    }
  })
}

walk(SRC)

if (violations.length === 0) {
  console.log('✓ state-badge guardrail clean — no direct .hai-state-badge / .hai-state-dot usage outside the sanctioned helper.')
  process.exit(0)
}

console.error('✗ state-badge guardrail FAILED — direct usage detected.\n')
console.error('Pass 10 policy: only src/lib/state-render.tsx may render')
console.error('  .hai-state-badge / .hai-state-dot. Route the site through')
console.error('  <StatePill/> / <StateDot/> — and derive its state from')
console.error('  resolveBadgePlan() whenever possible.\n')
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  ${v.text}`)
}
console.error(`\n${violations.length} violation(s).`)
process.exit(1)
