import type { GooglePeriodLike } from './openState'

/**
 * Turn Google's raw opening `periods` into compact, human-friendly
 * hours lines that GROUP consecutive days sharing the same schedule —
 * instead of a verbose one-line-per-day list.
 *
 *   السبت - الخميس: ٩ ص - ١١ م
 *   الجمعة: ٢ - ١١ م
 *
 * Handles multiple shifts/day ("٩ ص - ١ م، ٥ - ١١ م"), closed days,
 * and 24/7. Days are walked in Saudi week order (Sat → Fri), so
 * ranges never wrap across the Friday/Saturday boundary.
 */

type Lang = 'ar' | 'en' | 'ur'

const DAY_NAMES: Record<Lang, string[]> = {
  ar: ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'],
  en: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  ur: ['سنیچر', 'اتوار', 'پیر', 'منگل', 'بدھ', 'جمعرات', 'جمعہ'],
}

function lc(lang: string): Lang {
  return lang === 'en' ? 'en' : lang === 'ur' ? 'ur' : 'ar'
}

// Google day (0=Sun…6=Sat) → app day (0=Sat…6=Fri).
function gToApp(g: number): number {
  return ((g + 1) % 7 + 7) % 7
}

/** minutes-of-day → "9 ص" / "9:30 PM" matching the picker's style. */
function fmtTime(totalMin: number, lang: Lang): string {
  const h = Math.floor(totalMin / 60) % 24
  const m = totalMin % 60
  const isPM = h >= 12
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  const mm = m === 0 ? '' : `:${m.toString().padStart(2, '0')}`
  const suffix = lang === 'en' ? (isPM ? 'PM' : 'AM') : lang === 'ur' ? (isPM ? 'ش' : 'ص') : isPM ? 'م' : 'ص'
  return `${h12}${mm} ${suffix}`
}

const WEEK_MIN = 7 * 24 * 60 // 10080

export function formatGoogleHours(
  periods: GooglePeriodLike[] | null | undefined,
  lang: string,
): string[] {
  if (!periods || periods.length === 0) return []
  const L = lc(lang)
  const sep = L === 'en' ? ', ' : '، '
  const closed = L === 'en' ? 'Closed' : L === 'ur' ? 'بند' : 'مغلق'
  const all24 = L === 'en' ? 'Open 24 hours' : L === 'ur' ? '24 گھنٹے کھلا' : 'مفتوح ٢٤ ساعة'
  const day24 = L === 'en' ? '24 hours' : L === 'ur' ? '24 گھنٹے' : '٢٤ ساعة'

  // 24/7: a single open with no close.
  if (periods.length === 1 && periods[0].open && !periods[0].close) {
    return [all24]
  }

  // Paint a minute-of-week coverage map. A period may span several
  // days (a 24h-most-days place is one long period that wraps the
  // week), so we mark every covered minute and derive per-day hours
  // from that — instead of only crediting the period's open day,
  // which dropped the fully-covered middle days.
  const cov = new Uint8Array(WEEK_MIN)
  for (const p of periods) {
    if (!p.open || !p.close) continue
    const o = gToApp(p.open.day ?? 0) * 1440 + (p.open.hour ?? 0) * 60 + (p.open.minute ?? 0)
    const c = gToApp(p.close.day ?? 0) * 1440 + (p.close.hour ?? 0) * 60 + (p.close.minute ?? 0)
    let len = (((c - o) % WEEK_MIN) + WEEK_MIN) % WEEK_MIN
    if (len === 0) len = WEEK_MIN // open === close → full week
    for (let i = 0; i < len; i++) cov[(o + i) % WEEK_MIN] = 1
  }

  // Whole week covered → 24/7.
  let allOpen = true
  for (let i = 0; i < WEEK_MIN; i++) if (!cov[i]) { allOpen = false; break }
  if (allOpen) return [all24]

  // Per-day signature (Sat0 order):
  //   - fully covered → "24 hours"
  //   - else each run that STARTS in the day → "open - close" (close
  //     may be a next-day time; that's how Google attributes overnight
  //     spans). Pure morning tails of a previous day's run get no line
  //     of their own (shown as that day's "Closed" unless something
  //     else opens) — matching Google's per-day convention.
  const sig: string[] = []
  for (let d = 0; d < 7; d++) {
    const base = d * 1440
    let full = true
    for (let i = 0; i < 1440; i++) if (!cov[base + i]) { full = false; break }
    if (full) { sig[d] = day24; continue }

    const shifts: string[] = []
    for (let i = 0; i < 1440; i++) {
      const m = base + i
      const prev = (m - 1 + WEEK_MIN) % WEEK_MIN
      if (cov[m] && !cov[prev]) {
        let len = 0
        while (cov[(m + len) % WEEK_MIN] && len < WEEK_MIN) len++
        const endMin = (m + len) % 1440
        shifts.push(`${fmtTime(i, L)} - ${fmtTime(endMin, L)}`)
      }
    }
    sig[d] = shifts.length > 0 ? shifts.join(sep) : closed
  }

  // Group consecutive days with the same signature into ranges.
  const lines: string[] = []
  let start = 0
  for (let d = 1; d <= 7; d++) {
    if (d === 7 || sig[d] !== sig[start]) {
      const end = d - 1
      const days =
        start === end
          ? DAY_NAMES[L][start]
          : `${DAY_NAMES[L][start]} - ${DAY_NAMES[L][end]}`
      lines.push(`${days}: ${sig[start]}`)
      start = d
    }
  }
  return lines
}
