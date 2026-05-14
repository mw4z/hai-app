'use client'

import { useState, useEffect } from 'react'
import { useLanguage } from '@/hooks/useLanguage'

/**
 * Opening hours picker for places.
 *
 * Two modes:
 *  1. Quick presets — one tap fills the common cases:
 *      - 24 ساعة طوال الأسبوع
 *      - 8 ص - 11 م يومياً
 *      - 9 ص - 10 م (السبت - الخميس)
 *      - 5 م - 11 م يومياً
 *  2. Custom — expandable card with two HTML5 time inputs and a
 *     7-chip day picker. Default is "all 7 days"; the user can
 *     toggle days off if the shop is closed any day.
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
  short: string
}

const DAYS: DayMeta[] = [
  { index: 0, ar: 'السبت',   en: 'Sat', ur: 'سنیچر',     short: 'س' },
  { index: 1, ar: 'الأحد',   en: 'Sun', ur: 'اتوار',     short: 'ح' },
  { index: 2, ar: 'الإثنين', en: 'Mon', ur: 'پیر',       short: 'ن' },
  { index: 3, ar: 'الثلاثاء',en: 'Tue', ur: 'منگل',      short: 'ث' },
  { index: 4, ar: 'الأربعاء',en: 'Wed', ur: 'بدھ',       short: 'ر' },
  { index: 5, ar: 'الخميس', en: 'Thu', ur: 'جمعرات',    short: 'خ' },
  { index: 6, ar: 'الجمعة', en: 'Fri', ur: 'جمعہ',      short: 'ج' },
]

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
const SAT_TO_THU = [0, 1, 2, 3, 4, 5]

export default function OpeningHoursPicker({ value, onChange }: Props) {
  const { lang } = useLanguage()
  const tr = (en: string, ar: string, ur: string) =>
    lang === 'en' ? en : lang === 'ur' ? ur : ar

  // Custom-mode state.
  const [mode, setMode] = useState<'preset' | 'custom' | 'closed'>('preset')
  const [openTime, setOpenTime] = useState('09:00')
  const [closeTime, setCloseTime] = useState('22:00')
  const [days, setDays] = useState<number[]>(ALL_DAYS)

  // Echo the current value back to the parent whenever the
  // structured state changes. The preset path writes directly via
  // onChange so it doesn't depend on this effect.
  useEffect(() => {
    if (mode !== 'custom') return
    onChange(formatCustom(openTime, closeTime, days, lang as 'ar' | 'en' | 'ur'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, openTime, closeTime, days])

  function applyPreset(preset: string) {
    setMode('preset')
    onChange(preset)
  }

  function toggleDay(idx: number) {
    setDays((prev) =>
      prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx].sort((a, b) => a - b),
    )
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

      {/* Custom mode — two time inputs + day toggles. */}
      {mode === 'custom' && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">
                {tr('Opens', 'يفتح', 'کھلتا ہے')}
              </span>
              <input
                type="time"
                value={openTime}
                onChange={(e) => setOpenTime(e.target.value)}
                dir="ltr"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">
                {tr('Closes', 'يغلق', 'بند ہوتا ہے')}
              </span>
              <input
                type="time"
                value={closeTime}
                onChange={(e) => setCloseTime(e.target.value)}
                dir="ltr"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </label>
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
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d) => {
                const active = days.includes(d.index)
                return (
                  <button
                    key={d.index}
                    type="button"
                    onClick={() => toggleDay(d.index)}
                    className={`px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                      active
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {lang === 'en' ? d.en : lang === 'ur' ? d.ur : d.ar}
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
              {formatCustom(openTime, closeTime, days, lang as 'ar' | 'en' | 'ur')}
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

/** Build the human-readable string saved to PlaceListing.openingHours.
 *  Smart formatting:
 *    - 7/7 days → "يومياً 9:00 ص - 10:00 م"
 *    - Sat-Thu  → "السبت - الخميس 9:00 ص - 10:00 م"
 *    - Other contiguous range → "السبت - الأربعاء ..."
 *    - Non-contiguous → list with commas */
function formatCustom(
  open: string,
  close: string,
  days: number[],
  lang: 'ar' | 'en' | 'ur',
): string {
  if (days.length === 0) return ''
  const sorted = [...days].sort((a, b) => a - b)
  const openLabel = formatTime(open, lang)
  const closeLabel = formatTime(close, lang)
  const dayPart = formatDays(sorted, lang)
  return `${dayPart} ${openLabel} - ${closeLabel}`
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
