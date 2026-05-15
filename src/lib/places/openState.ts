/**
 * Place open-state computation.
 *
 * Pure, client-safe. Consumed by PlaceCard + DetailClient to
 * render the مفتوح / مغلق / "owner override" pill. NEVER reads
 * or writes the database — given a place and the current wall
 * clock, returns the pill to show.
 *
 * Priority order (matches the spec):
 *   1. manualStatusUntil in the past → ignore the override and
 *      fall through to step 3 as if manualStatus were null.
 *      (No DB write — readers stay pure. The owner's next PATCH
 *      or a future cleanup can wipe expired rows.)
 *   2. manualStatus set → show the override pill verbatim.
 *      Tone (amber vs. red) derived from the text in
 *      classifyManualStatus().
 *   3. openingHours parses → compute "is open NOW" in
 *      Asia/Riyadh (UTC+3, no DST):
 *         - inside any shift today        → "مفتوح"   (emerald)
 *         - ≤30 min before a shift starts → "يفتح قريبًا" (amber)
 *         - otherwise                     → "مغلق"   (gray)
 *   4. openingHours missing / unparsable → null (no pill).
 *
 * The parser is intentionally narrow — it handles the exact
 * string shapes OpeningHoursPicker emits today, plus a small
 * tolerance for whitespace and Arabic digit variants. Anything
 * else returns null and the caller hides the pill rather than
 * guessing wrong.
 */

export interface PlaceOpenStateInput {
  openingHours: string | null
  manualStatus: string | null
  manualStatusUntil: string | Date | null
}

export type PillTone = 'open' | 'soon' | 'closed' | 'manual-warn' | 'manual-danger'

export interface PlacePill {
  label: string
  tone: PillTone
}

/** Public entry point. Returns the pill to render, or null. */
export function computePlacePill(
  place: PlaceOpenStateInput,
  now: Date = new Date(),
): PlacePill | null {
  // 1. Honor manualStatusUntil — if past, drop the override.
  const overrideActive =
    !!place.manualStatus &&
    (!place.manualStatusUntil || new Date(place.manualStatusUntil) > now)

  // 2. Manual override path.
  if (overrideActive && place.manualStatus) {
    return {
      label: place.manualStatus,
      tone: classifyManualStatus(place.manualStatus),
    }
  }

  // 3. Auto path — parse openingHours and compute.
  const parsed = parseOpeningHours(place.openingHours || '')
  if (!parsed) return null
  return computeAutoPill(parsed, now)
}

/**
 * Decide whether a manual status string is a "permanent closure"
 * (red) vs. a temporary / informational state (amber).
 *
 * Saudi-permanent phrasings we treat as red:
 *   - "مغلق نهائيًا" / "مغلق نهائيا"  (closed permanently)
 *   - "permanently closed"
 *   - "closed for good"
 *   - "shut down"
 *
 * Everything else is amber — temporary outage, maintenance,
 * vacation, "busy now", custom text — all of which the user
 * should still feel free to walk in and check.
 */
export function classifyManualStatus(text: string): PillTone {
  const t = text.trim().toLowerCase()
  if (
    t.includes('مغلق نهائي') ||         // مغلق نهائيًا / نهائياً / نهائيا
    t.includes('permanently closed') ||
    t.includes('closed for good') ||
    t.includes('shut down')
  ) {
    return 'manual-danger'
  }
  return 'manual-warn'
}

// ── Parser ──────────────────────────────────────────────────────

/** Structured form of the picker's output. shifts are in 24h
 *  "HH:MM" form; days use 0=Sat … 6=Fri (Saudi week order). */
export interface ParsedHours {
  /** True if the place is open continuously (24/7). */
  alwaysOpen: boolean
  /** Days the schedule applies to. Sat=0 … Fri=6. */
  days: number[]
  /** One or more open-close ranges per active day. */
  shifts: { open: string; close: string }[]
}

/** Normalize Arabic-Indic digits → ASCII so the regex below
 *  can stay simple. Picker's formatter writes ASCII anyway, but
 *  legacy rows may carry "٩ ص - ١٠ م" style strings. */
function arabicDigitsToAscii(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 0x30))
}

const DAY_INDEX: Record<string, number> = {
  السبت: 0, السَّبت: 0, sat: 0, saturday: 0, سنیچر: 0,
  الأحد: 1, الاحد: 1, sun: 1, sunday: 1, اتوار: 1,
  الإثنين: 2, الاثنين: 2, mon: 2, monday: 2, پیر: 2,
  الثلاثاء: 3, tue: 3, tuesday: 3, منگل: 3,
  الأربعاء: 4, الاربعاء: 4, wed: 4, wednesday: 4, بدھ: 4,
  الخميس: 5, thu: 5, thursday: 5, جمعرات: 5,
  الجمعة: 6, fri: 6, friday: 6, جمعہ: 6,
}

function findDayIndex(token: string): number | null {
  const k = token.trim()
  if (k in DAY_INDEX) return DAY_INDEX[k]
  const low = k.toLowerCase()
  if (low in DAY_INDEX) return DAY_INDEX[low]
  return null
}

/** Parse a "9 ص" / "1:30 م" / "10 PM" token to 24h "HH:MM". */
function parseTimeToken(token: string): string | null {
  const cleaned = arabicDigitsToAscii(token).trim().toLowerCase()
  const m = cleaned.match(/^(\d{1,2})(?::(\d{1,2}))?\s*(ص|م|am|pm|ش)?$/i)
  if (!m) return null
  let h = parseInt(m[1], 10)
  const min = m[2] ? parseInt(m[2], 10) : 0
  if (!Number.isFinite(h) || h < 0 || h > 23 || min < 0 || min > 59) return null
  const suffix = (m[3] || '').toLowerCase()
  const isPM = suffix === 'م' || suffix === 'pm' || suffix === 'ش'
  const isAM = suffix === 'ص' || suffix === 'am'
  if (isPM && h < 12) h += 12
  else if (isAM && h === 12) h = 0
  return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`
}

/** Recognize the 24/7 preset in any of its observed phrasings. */
function isAlwaysOpenPhrase(text: string): boolean {
  const t = text.trim().toLowerCase()
  return (
    t.includes('24 ساعة') ||
    t.includes('24/7') ||
    t === 'open 24/7' ||
    t === '24 hours' ||
    t.includes('طوال الأسبوع')
  )
}

/** Parse one "9 ص - 1 م" range. Returns null if the dash isn't
 *  present or either side fails to parse. */
function parseRange(text: string): { open: string; close: string } | null {
  // The picker uses a regular ASCII "-" between times. Some legacy
  // strings or other input methods may use a unicode dash, so we
  // accept any.
  const parts = text.split(/[-–—]/)
  if (parts.length !== 2) return null
  const open = parseTimeToken(parts[0])
  const close = parseTimeToken(parts[1])
  if (!open || !close) return null
  return { open, close }
}

/** Pull the leading day-prefix out of the string. Returns the
 *  matched day list + the remaining text (the time portion).
 *  Recognizes:
 *    - "يومياً", "every day"   → all 7 days
 *    - "السبت - الخميس"          → range
 *    - "السبت، الأحد، …"         → comma list (rare)
 *  If no recognized prefix is found, returns null (the auto pill
 *  hides). */
function extractDays(text: string): { days: number[]; rest: string } | null {
  const trimmed = text.trim()
  // "يومياً", "every day", "روزانہ"
  for (const tok of ['يومياً', 'يوميا', 'every day', 'روزانہ', 'daily']) {
    if (trimmed.toLowerCase().startsWith(tok.toLowerCase())) {
      return { days: [0, 1, 2, 3, 4, 5, 6], rest: trimmed.slice(tok.length).trim() }
    }
  }
  // Day-range: "<day> - <day> <times>"
  const rangeMatch = trimmed.match(
    /^([^\s\-–—,،]+)\s*[-–—]\s*([^\s,،]+)\s+(.+)$/,
  )
  if (rangeMatch) {
    const a = findDayIndex(rangeMatch[1])
    const b = findDayIndex(rangeMatch[2])
    if (a !== null && b !== null) {
      const days: number[] = []
      if (a <= b) for (let i = a; i <= b; i++) days.push(i)
      else for (let i = a; i <= 6; i++) days.push(i), days.push(...[]) // (no wrap-around shops in practice)
      return { days, rest: rangeMatch[3].trim() }
    }
  }
  // Comma list of days at the front. Try to peel off as many days
  // as possible before the first time token appears.
  const commaParts = trimmed.split(/[،,]/).map((s) => s.trim())
  if (commaParts.length >= 2) {
    const collected: number[] = []
    let consumed = 0
    for (const part of commaParts) {
      const idx = findDayIndex(part)
      if (idx === null) break
      collected.push(idx)
      consumed++
    }
    if (collected.length >= 1 && consumed < commaParts.length) {
      const rest = commaParts.slice(consumed).join('، ').trim()
      // Last collected day token may also carry a trailing space-
      // separated time prefix, but the picker doesn't produce that
      // shape so we don't try to handle it here.
      return { days: collected.sort((a, b) => a - b), rest }
    }
  }
  return null
}

/** Top-level: turn the freeform string into a ParsedHours shape
 *  or null. */
export function parseOpeningHours(raw: string): ParsedHours | null {
  if (!raw) return null
  const text = arabicDigitsToAscii(raw).trim()
  if (!text) return null
  if (isAlwaysOpenPhrase(text)) {
    return {
      alwaysOpen: true,
      days: [0, 1, 2, 3, 4, 5, 6],
      shifts: [{ open: '00:00', close: '23:59' }],
    }
  }
  const dayPart = extractDays(text)
  if (!dayPart) return null
  // Remaining string is one or more comma-separated ranges.
  const rangeStrs = dayPart.rest.split(/[،,]/).map((s) => s.trim()).filter(Boolean)
  if (rangeStrs.length === 0) return null
  const shifts: { open: string; close: string }[] = []
  for (const rs of rangeStrs) {
    const r = parseRange(rs)
    if (!r) return null
    shifts.push(r)
  }
  return {
    alwaysOpen: false,
    days: dayPart.days,
    shifts,
  }
}

// ── Auto pill computation ─────────────────────────────────────

const SOON_WINDOW_MIN = 30

/** Convert a Date to Asia/Riyadh wall-clock components (no DST).
 *
 *  Riyadh is UTC+3 year-round. To read the Riyadh wall clock for
 *  a given moment, we shift the absolute timestamp by +3h and
 *  then read it with the getUTC* accessors — those bypass the
 *  device's local timezone entirely.
 *
 *  Why this matters: the earlier version of this function tried
 *  to "normalize via getTimezoneOffset()" first and ended up off
 *  by 3 hours on the most common case (a KSA device, offset =
 *  -180 min). At 3:38 AM KSA, the buggy math produced 0:38, which
 *  fell inside any overnight shift's close-window (e.g. a place
 *  open 10 AM → 2 AM showed "مفتوح" at 3:38 AM). Fix is to drop
 *  getTimezoneOffset entirely — the local timezone is irrelevant
 *  to the question "what time is it in Riyadh right now".
 */
function riyadhParts(now: Date): { dayOfWeekSat0: number; minutes: number } {
  const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000
  const shifted = new Date(now.getTime() + RIYADH_OFFSET_MS)
  // JS Date.getUTCDay(): 0=Sun … 6=Sat. Saudi week: 0=Sat … 6=Fri.
  const jsDay = shifted.getUTCDay()
  const dayOfWeekSat0 = jsDay === 6 ? 0 : jsDay + 1
  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
  return { dayOfWeekSat0, minutes }
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Resolve the pill for the parsed schedule + current time. */
function computeAutoPill(parsed: ParsedHours, now: Date): PlacePill {
  if (parsed.alwaysOpen) {
    return { label: 'مفتوح', tone: 'open' }
  }
  const { dayOfWeekSat0, minutes } = riyadhParts(now)
  const isActiveDay = parsed.days.includes(dayOfWeekSat0)
  if (isActiveDay) {
    // Open right now?
    for (const s of parsed.shifts) {
      const o = hhmmToMinutes(s.open)
      const c = hhmmToMinutes(s.close)
      // Standard same-day shift (open < close).
      if (o <= c && minutes >= o && minutes < c) {
        return { label: 'مفتوح', tone: 'open' }
      }
      // Overnight shift (close < open) — treat as "open" if we're
      // past the open OR before the close (e.g. 22:00 → 02:00).
      if (o > c && (minutes >= o || minutes < c)) {
        return { label: 'مفتوح', tone: 'open' }
      }
    }
    // Not open right now — within the "opens soon" window for any
    // upcoming shift today?
    for (const s of parsed.shifts) {
      const o = hhmmToMinutes(s.open)
      if (o > minutes && o - minutes <= SOON_WINDOW_MIN) {
        return { label: 'يفتح قريبًا', tone: 'soon' }
      }
    }
  }
  return { label: 'مغلق', tone: 'closed' }
}
