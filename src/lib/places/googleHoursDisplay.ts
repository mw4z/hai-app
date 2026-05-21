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

export function formatGoogleHours(
  periods: GooglePeriodLike[] | null | undefined,
  lang: string,
): string[] {
  if (!periods || periods.length === 0) return []
  const L = lc(lang)
  const sep = L === 'en' ? ', ' : '، '
  const closed = L === 'en' ? 'Closed' : L === 'ur' ? 'بند' : 'مغلق'

  // 24/7: a single open with no close.
  if (periods.length === 1 && periods[0].open && !periods[0].close) {
    return [L === 'en' ? 'Open 24 hours' : L === 'ur' ? '24 گھنٹے کھلا' : 'مفتوح ٢٤ ساعة']
  }

  // Shifts per app-day.
  const shiftsByDay: Record<number, { o: number; c: number }[]> = {}
  for (const p of periods) {
    if (!p.open || !p.close) continue
    const day = gToApp(p.open.day ?? 0)
    const o = (p.open.hour ?? 0) * 60 + (p.open.minute ?? 0)
    const c = (p.close.hour ?? 0) * 60 + (p.close.minute ?? 0)
    ;(shiftsByDay[day] ??= []).push({ o, c })
  }

  // One signature string per day (Sat0 order); closed when no shifts.
  const sig: string[] = []
  for (let d = 0; d < 7; d++) {
    const sh = (shiftsByDay[d] ?? []).slice().sort((a, b) => a.o - b.o)
    sig[d] = sh.length
      ? sh.map((s) => `${fmtTime(s.o, L)} - ${fmtTime(s.c, L)}`).join(sep)
      : closed
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
