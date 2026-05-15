'use client'

import { useState, useEffect } from 'react'
import { useLanguage } from '@/hooks/useLanguage'
import { FiPlus, FiX } from 'react-icons/fi'

/**
 * Opening hours picker for places.
 *
 * Two modes:
 *  1. Quick presets — one tap fills the common cases:
 *      - 24 ساعة طوال الأسبوع
 *      - 8 ص - 11 م يومياً
 *      - 9 ص - 10 م (السبت - الخميس)
 *      - 5 م - 11 م يومياً
 *      - "صباحاً ومساءً" preset for the common Saudi split-shift case
 *  2. Custom — expandable card. The user can have up to 3 SHIFTS
 *     per place (most common in KSA: morning + evening, with a
 *     siesta gap; a few places do 3 distinct shifts). Each shift
 *     has its own Open/Close pair. The 7-chip day picker is shared
 *     across all shifts — same days open in every shift.
 *
 * Output is a single human-readable Arabic string written back to
 * the parent via onChange. Schema-wise this is still PlaceListing.
 * openingHours (max 300 chars freeform) — the picker just produces
 * tidy strings instead of leaving the resident to format them.
 *
 * If the parent passes a `value` we can't parse back to one of our
 * structured shapes (a legacy place with arbitrary text), we show
 * the raw value with an "تعديل" override that drops to custom mode.
 */

interface Props {
  value: string
  onChange: (next: string) => void
}

interface DayMeta {
  /** Day index 0=Sat, 1=Sun, ..., 6=Fri  (Saudi week ordering) */
  index: number
  ar: string
  en: string
  ur: string
}

const DAYS: DayMeta[] = [
  { index: 0, ar: 'السبت',    en: 'Sat', ur: 'سنیچر' },
  { index: 1, ar: 'الأحد',    en: 'Sun', ur: 'اتوار' },
  { index: 2, ar: 'الإثنين',  en: 'Mon', ur: 'پیر' },
  { index: 3, ar: 'الثلاثاء', en: 'Tue', ur: 'منگل' },
  { index: 4, ar: 'الأربعاء', en: 'Wed', ur: 'بدھ' },
  { index: 5, ar: 'الخميس',  en: 'Thu', ur: 'جمعرات' },
  { index: 6, ar: 'الجمعة',  en: 'Fri', ur: 'جمعہ' },
]

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
const SAT_TO_THU = [0, 1, 2, 3, 4, 5]
const MAX_SHIFTS = 3

interface Shift {
  open: string
  close: string
}

export default function OpeningHoursPicker({ value, onChange }: Props) {
  const { lang } = useLanguage()
  const tr = (en: string, ar: string, ur: string) =>
    lang === 'en' ? en : lang === 'ur' ? ur : ar

  // Custom-mode state.
  const [mode, setMode] = useState<'preset' | 'custom' | 'closed'>('preset')
  // Multi-shift state. First shift defaults to a typical 9 AM - 10
  // PM range; the user adds a second shift (e.g. evening-only after
  // siesta) by tapping "+ إضافة فترة".
  const [shifts, setShifts] = useState<Shift[]>([{ open: '09:00', close: '22:00' }])
  const [days, setDays] = useState<number[]>(ALL_DAYS)

  // Echo the current value back to the parent whenever the
  // structured state changes. The preset path writes directly via
  // onChange so it doesn't depend on this effect.
  useEffect(() => {
    if (mode !== 'custom') return
    onChange(formatCustom(shifts, days, lang as 'ar' | 'en' | 'ur'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, shifts, days])

  function applyPreset(preset: string) {
    setMode('preset')
    onChange(preset)
  }

  function toggleDay(idx: number) {
    setDays((prev) =>
      prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx].sort((a, b) => a - b),
    )
  }

  function updateShift(i: number, patch: Partial<Shift>) {
    setShifts((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }

  function addShift() {
    if (shifts.length >= MAX_SHIFTS) return
    // Sensible default: start the new shift right after the
    // previous one ended, with a 4-hour duration. Better UX than
    // dropping the user into 09:00-22:00 again.
    const last = shifts[shifts.length - 1]
    const nextOpen = addHours(last.close, 1)
    const nextClose = addHours(nextOpen, 4)
    setShifts((prev) => [...prev, { open: nextOpen, close: nextClose }])
  }

  function removeShift(i: number) {
    if (shifts.length <= 1) return
    setShifts((prev) => prev.filter((_, idx) => idx !== i))
  }

  // Trilingual preset labels — computed once per language so the
  // preset card row stays a flat literal block in JSX.
  const presets = [
    {
      key: '247',
      label: tr('Open 24/7', '24 ساعة طوال الأسبوع', '24 گھنٹے ہفتے بھر'),
      emoji: '🕐',
    },
    {
      key: 'daily-8-11',
      label: tr('Daily 8 AM - 11 PM', 'يومياً 8 ص - 11 م', 'روزانہ 8 ص - 11 ش'),
      emoji: '🏪',
    },
    {
      key: 'workweek-9-10',
      label: tr('Sat-Thu 9 AM - 10 PM', 'السبت - الخميس 9 ص - 10 م', 'سنیچر تا جمعرات 9 ص - 10 ش'),
      emoji: '📅',
    },
    {
      key: 'evening-5-11',
      label: tr('Evenings 5 - 11 PM', 'يومياً 5 - 11 م', 'روزانہ 5 - 11 ش'),
      emoji: '🌙',
    },
    {
      key: 'split-9-1-5-11',
      label: tr(
        'Daily 9 AM - 1 PM, 5 - 11 PM',
        'يومياً 9 ص - 1 م، 5 - 11 م',
        'روزانہ 9 ص - 1 ش، 5 - 11 ش',
      ),
      emoji: '🌗',
    },
  ]

  return (
    <div className="space-y-2">
      {/* Quick-preset chip row. Tap = save instantly. */}
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => {
          const isActive = mode === 'preset' && value === p.label
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p.label)}
              className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-semibold border transition-colors ${
                isActive
                  ? 'bg-primary-600 border-primary-600 text-white'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              <span aria-hidden>{p.emoji}</span>
              <span>{p.label}</span>
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setMode('custom')}
          className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-semibold border transition-colors ${
            mode === 'custom'
              ? 'bg-primary-600 border-primary-600 text-white'
              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
          }`}
        >
          <span aria-hidden>⚙️</span>
          <span>{tr('Custom', 'مخصص', 'حسب ضرورت')}</span>
        </button>
      </div>

      {/* Custom mode — multi-shift time picker + day toggles. */}
      {mode === 'custom' && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 space-y-3">
          {/* Shifts list. Each shift = one open/close pair in its
              own small block. Multiple shifts cover the very common
              KSA pattern of morning + evening operations split by a
              siesta gap. */}
          <div className="space-y-2.5">
            {shifts.map((shift, i) => (
              <div
                key={i}
                className="relative rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-2.5"
              >
                {shifts.length > 1 && (
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">
                      {tr(`Shift ${i + 1}`, `الفترة ${i + 1}`, `شفٹ ${i + 1}`)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeShift(i)}
                      aria-label={tr('Remove shift', 'إزالة الفترة', 'شفٹ ہٹائیں')}
                      className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex items-center justify-center active:scale-95"
                    >
                      <FiX className="w-3 h-3" />
                    </button>
                  </div>
                )}
                {/* Two compact pill-style time inputs on ONE row,
                    each tagged with its caption inline so the
                    "يفتح / يغلق" label sits on the same line as
                    the chunk it controls. Inline labels eliminate
                    the vertical "label + input" stack that was
                    crowding the row before. Each input is the
                    minimum viable width (5rem) so the iOS native
                    HH:MM chunks have room to render without
                    touching the neighbour's edge. */}
                <div className="flex items-center gap-2 flex-wrap" dir="rtl">
                  <label className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400 flex-shrink-0">
                      {tr('Opens', 'يفتح', 'کھلتا ہے')}
                    </span>
                    <span dir="ltr" className="flex-1 min-w-0">
                      <input
                        type="time"
                        value={shift.open}
                        onChange={(e) => updateShift(i, { open: e.target.value })}
                        style={{ textAlign: 'center' }}
                        className="w-full min-w-0 px-1 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-[12px] focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </span>
                  </label>
                  <label className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400 flex-shrink-0">
                      {tr('Closes', 'يغلق', 'بند ہوتا ہے')}
                    </span>
                    <span dir="ltr" className="flex-1 min-w-0">
                      <input
                        type="time"
                        value={shift.close}
                        onChange={(e) => updateShift(i, { close: e.target.value })}
                        style={{ textAlign: 'center' }}
                        className="w-full min-w-0 px-1 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-[12px] focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </span>
                  </label>
                </div>
              </div>
            ))}

            {/* "Add another shift" — appears only while we're under
                the cap. Adds a new shift starting 1h after the last
                one closed, lasting 4h by default. */}
            {shifts.length < MAX_SHIFTS && (
              <button
                type="button"
                onClick={addShift}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-[12px] font-semibold text-gray-500 dark:text-gray-400 active:scale-[0.98] transition-transform"
              >
                <FiPlus className="w-3.5 h-3.5" />
                {tr('Add another shift', 'إضافة فترة', 'مزید شفٹ شامل کریں')}
              </button>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400">
                {tr('Days open', 'أيام العمل', 'کھلنے کے دن')}
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setDays(ALL_DAYS)}
                  className="text-[10px] font-semibold text-primary-600 dark:text-primary-400"
                >
                  {tr('All', 'الكل', 'تمام')}
                </button>
                <span className="text-[10px] text-gray-300">·</span>
                <button
                  type="button"
                  onClick={() => setDays(SAT_TO_THU)}
                  className="text-[10px] font-semibold text-primary-600 dark:text-primary-400"
                >
                  {tr('Sat-Thu', 'السبت - الخميس', 'سنیچر تا جمعرات')}
                </button>
              </div>
            </div>
            {/* Flex-wrap layout with full day names. */}
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d) => {
                const active = days.includes(d.index)
                const label = lang === 'en' ? d.en : lang === 'ur' ? d.ur : d.ar
                return (
                  <button
                    key={d.index}
                    type="button"
                    onClick={() => toggleDay(d.index)}
                    aria-label={label}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
                      active
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            {days.length === 0 && (
              <p className="text-[10px] text-rose-500 mt-1">
                {tr('Pick at least one day', 'اختر يوماً واحداً على الأقل', 'کم از کم ایک دن منتخب کریں')}
              </p>
            )}
          </div>

          {/* Live preview so the user sees what will be saved. */}
          {days.length > 0 && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 px-1 leading-snug">
              <span className="font-semibold">{tr('Preview:', 'معاينة:', 'پیش نظارہ:')}</span>{' '}
              {formatCustom(shifts, days, lang as 'ar' | 'en' | 'ur')}
            </p>
          )}
        </div>
      )}

      {/* Inert "I'll skip this" hint so users know it's optional. */}
      {!value && mode === 'preset' && (
        <p className="text-[11px] text-gray-400 px-1">
          {tr(
            'Optional — pick a preset or skip.',
            'اختياري — اختر قالباً جاهزاً أو تخطَّ هذه الخطوة.',
            'اختیاری — تیار شدہ منتخب کریں یا چھوڑ دیں۔',
          )}
        </p>
      )}
    </div>
  )
}

/** Add `hours` to an "HH:MM" string, wrapping around midnight. */
function addHours(time: string, hours: number): string {
  const [hStr, mStr] = (time || '00:00').split(':')
  const h = parseInt(hStr, 10) || 0
  const m = parseInt(mStr, 10) || 0
  const total = (h * 60 + m + hours * 60 + 24 * 60) % (24 * 60)
  const hh = Math.floor(total / 60).toString().padStart(2, '0')
  const mm = (total % 60).toString().padStart(2, '0')
  return `${hh}:${mm}`
}

/** Build the human-readable string saved to PlaceListing.openingHours.
 *
 *  Output shape:
 *   - One shift, 7 days: "يومياً 9:00 ص - 10:00 م"
 *   - One shift, Sat-Thu: "السبت - الخميس 9:00 ص - 10:00 م"
 *   - Two shifts: "يومياً 9 ص - 1 م، 5 - 11 م"  (Arabic comma
 *     between ranges; day prefix appears once at the front)
 */
function formatCustom(
  shifts: Shift[],
  days: number[],
  lang: 'ar' | 'en' | 'ur',
): string {
  if (days.length === 0 || shifts.length === 0) return ''
  const sorted = [...days].sort((a, b) => a - b)
  const dayPart = formatDays(sorted, lang)
  const shiftSeparator = lang === 'en' ? ', ' : '، '
  const shiftParts = shifts.map((s) => {
    const o = formatTime(s.open, lang)
    const c = formatTime(s.close, lang)
    return `${o} - ${c}`
  })
  return `${dayPart} ${shiftParts.join(shiftSeparator)}`
}

function formatTime(time: string, lang: 'ar' | 'en' | 'ur'): string {
  // time is HH:MM 24-hour from the <input type="time">. Render as
  // 12-hour with AM/PM (or AR equivalents) so the saved string
  // matches the preset labels' visual style.
  const [hStr, mStr] = (time || '00:00').split(':')
  const hour24 = Math.max(0, Math.min(23, parseInt(hStr, 10) || 0))
  const min = Math.max(0, Math.min(59, parseInt(mStr, 10) || 0))
  const isPM = hour24 >= 12
  const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24
  const mm = min === 0 ? '' : `:${min.toString().padStart(2, '0')}`
  const suffix =
    lang === 'en'
      ? isPM ? 'PM' : 'AM'
      : lang === 'ur'
        ? isPM ? 'ش' : 'ص'
        : isPM ? 'م' : 'ص'
  return `${hour12}${mm} ${suffix}`
}

function formatDays(sorted: number[], lang: 'ar' | 'en' | 'ur'): string {
  const tr = (en: string, ar: string, ur: string) =>
    lang === 'en' ? en : lang === 'ur' ? ur : ar
  if (sorted.length === 7) {
    return tr('Every day', 'يومياً', 'روزانہ')
  }
  // Check if it's a contiguous range.
  const isContig =
    sorted.length >= 2 &&
    sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1)
  if (isContig) {
    return `${dayLabel(sorted[0], lang)} - ${dayLabel(sorted[sorted.length - 1], lang)}`
  }
  // Sat-Thu special case (6 consecutive non-Friday days)
  if (
    sorted.length === 6 &&
    !sorted.includes(6)
  ) {
    return tr('Sat - Thu', 'السبت - الخميس', 'سنیچر تا جمعرات')
  }
  return sorted.map((d) => dayLabel(d, lang)).join('، ')
}

function dayLabel(idx: number, lang: 'ar' | 'en' | 'ur'): string {
  const d = DAYS[idx]
  return lang === 'en' ? d.en : lang === 'ur' ? d.ur : d.ar
}
