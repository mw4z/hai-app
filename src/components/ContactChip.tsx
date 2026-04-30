'use client'

import { useCallback } from 'react'
import toast from 'react-hot-toast'
import { FiPhone, FiCopy } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { hapticLight } from '@/lib/haptic'

// WhatsApp icon — inline SVG to avoid adding a dependency
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

interface Props {
  name: string
  phone: string
  variant?: 'light' | 'onGreen'
}

/**
 * Inline contact card rendered inside comments/chat messages when a
 * `📱 Name — +phone` snippet is detected. Shows the contact info with
 * three quick-action buttons: Call, Copy, WhatsApp.
 */
export default function ContactChip({ name, phone, variant = 'light' }: Props) {
  const { lang } = useLanguage()
  const onGreen = variant === 'onGreen'

  const cleanPhone = phone.replace(/[^\d+]/g, '')

  // Convert local Saudi numbers (05xxxxxxxx) to international format
  // for WhatsApp. tel: links work with either format on the device.
  function toInternational(num: string): string {
    const digits = num.replace(/[^\d]/g, '')
    // Saudi local mobile: 05xxxxxxxx (10 digits)
    if (digits.startsWith('05') && digits.length === 10) {
      return '966' + digits.slice(1)
    }
    // Already international with +
    if (num.startsWith('+')) return digits
    return digits
  }

  const handleCall = useCallback(() => {
    hapticLight()
    window.open(`tel:${cleanPhone}`, '_self')
  }, [cleanPhone])

  const handleCopy = useCallback(() => {
    hapticLight()
    navigator.clipboard?.writeText(cleanPhone).then(() => {
      toast.success(lang === 'en' ? 'Copied!' : lang === 'ur' ? 'کاپی ہو گیا!' : 'تم النسخ!')
    }).catch(() => {})
  }, [cleanPhone, lang])

  const handleWhatsApp = useCallback(() => {
    hapticLight()
    window.open(`https://wa.me/${toInternational(cleanPhone)}`, '_blank')
  }, [cleanPhone])

  return (
    <div
      className={`flex flex-col gap-2 rounded-2xl px-3 py-3 my-1.5 w-full overflow-hidden ${
        onGreen
          ? 'bg-white/15 border border-white/20'
          : 'bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
          onGreen ? 'bg-white/20' : 'bg-primary-100 dark:bg-primary-800/60'
        }`}>
          <span className="text-base">📱</span>
        </div>
        <div className="min-w-0 flex-1">
          {name && (
            <p className={`text-sm font-bold truncate ${onGreen ? 'text-white' : 'text-gray-900 dark:text-white'}`}>{name}</p>
          )}
          <p className={`text-xs font-semibold tabular-nums ${onGreen ? 'text-white/80' : 'text-primary-700 dark:text-primary-300'}`} dir="ltr">
            {phone}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <button
          onClick={handleCall}
          className={`flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-bold active:scale-[0.97] transition-transform whitespace-nowrap ${
            onGreen ? 'bg-white/25 text-white' : 'bg-primary-600 text-white'
          }`}
        >
          <FiPhone className="w-3.5 h-3.5 flex-shrink-0" />
          {lang === 'en' ? 'Call' : lang === 'ur' ? 'کال' : 'اتصال'}
        </button>
        <button
          onClick={handleCopy}
          className={`flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-bold active:scale-[0.97] transition-transform whitespace-nowrap ${
            onGreen ? 'bg-white/15 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
          }`}
        >
          <FiCopy className="w-3.5 h-3.5 flex-shrink-0" />
          {lang === 'en' ? 'Copy' : lang === 'ur' ? 'کاپی' : 'نسخ'}
        </button>
        <button
          onClick={handleWhatsApp}
          className="flex items-center justify-center gap-1 py-2 bg-[#25D366] text-white rounded-xl text-[11px] font-bold active:scale-[0.97] transition-transform whitespace-nowrap"
        >
          <WhatsAppIcon className="w-3.5 h-3.5 flex-shrink-0" />
          {lang === 'en' ? 'WA' : 'واتساب'}
        </button>
      </div>
    </div>
  )
}

/**
 * Tagged-union segment type for SmartText. Each segment is either
 * raw text or a recognised inline element (contact / location / link).
 *
 * Location segments may have lat/lng = null when the URL is a
 * resolvable short link (maps.app.goo.gl/abc, goo.gl/maps/abc) where
 * the actual coords live behind a redirect. The chip still renders
 * with an "Open in Maps" action — we just can't show coords inline.
 */
export type MessageSegment =
  | { kind: 'text'; text: string }
  | { kind: 'contact'; name: string; phone: string }
  | { kind: 'location'; name: string; lat: number | null; lng: number | null; url: string }
  | { kind: 'link'; url: string }

const CONTACT_RE = /📱\s*(?:(.+?)\s*[—–-]\s*)?(\+?\d[\d\s()-]{6,}\d)/g
// Location snippet: `📍 [Name\n]<map URL containing lat,lng>`. The
// URL must be one of the known maps schemes AND carry the coords
// we can parse out — Google Maps `?q=lat,lng`, the path form
// `/maps/@lat,lng,...`, or an Apple Maps `?ll=lat,lng`.
const LOCATION_RE = /📍\s*(?:(.+?)\s*\n)?(https?:\/\/(?:www\.)?(?:google\.com\/maps|maps\.google\.com|maps\.apple\.com|goo\.gl\/maps|maps\.app\.goo\.gl)[^\s]*?(?:[?&](?:q|ll|sll|destination)=|\/@)(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)[^\s]*)/g
// Plain URL — http(s) only, stops at whitespace and trailing punctuation
// that's almost never part of a real URL.
const URL_RE = /https?:\/\/[^\s)]+[^\s).,;!?]/g

// Bare phone numbers — recognises in priority order:
//   1. Saudi mobile international:  +9665XXXXXXXX  or  009665XXXXXXXX
//   2. Saudi mobile local:          05XXXXXXXX
//   3. Generic international:       +<cc> <8–14 digits>
// Each option is wrapped with non-word-char boundaries (lookbehind /
// lookahead) so we don't grab digits out of the middle of an order
// number, year, or coordinate.
const PHONE_RE = /(?<![\w+])(?:(?:\+|00)966[\s-]?5\d(?:[\s-]?\d){7}|0[\s-]?5\d(?:[\s-]?\d){7}|\+\d{1,3}(?:[\s-]?\d){7,12})(?!\w)/g

// Recognised maps domains. Includes the short-link redirector domains
// — even though they don't carry coords in the URL, the user still
// pasted a "maps link" and deserves a tappable location chip rather
// than a generic underlined URL.
const MAPS_DOMAIN_RE = /(?:google\.com\/maps|maps\.google\.com|maps\.apple\.com|maps\.app\.goo\.gl|goo\.gl\/maps)/i

/**
 * Is this URL any kind of map link (Google Maps, Apple Maps, or one
 * of their short-link redirectors)?
 */
export function isMapsUrl(url: string): boolean {
  return MAPS_DOMAIN_RE.test(url)
}

/**
 * Try to recognise a bare URL as a Google / Apple maps link with
 * extractable coordinates. Returns { lat, lng } when parseable, or
 * null when the URL is a short link (`maps.app.goo.gl/abc123`,
 * `goo.gl/maps/abc123`) where the coords live behind a redirect.
 *
 * Recognises:
 *   - Google Maps `?q=lat,lng`, `?ll=lat,lng`, `?destination=lat,lng`
 *   - Google Maps path form `/maps/@lat,lng,zoom`
 *   - Apple Maps `?ll=lat,lng`, `?sll=lat,lng`
 */
export function tryExtractMapsCoords(url: string): { lat: number; lng: number } | null {
  if (!isMapsUrl(url)) return null
  // ?q= / ?ll= / ?sll= / ?destination= followed by lat,lng
  const queryMatch = url.match(/[?&](?:q|ll|sll|destination)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  if (queryMatch) {
    return { lat: parseFloat(queryMatch[1]), lng: parseFloat(queryMatch[2]) }
  }
  // /maps/@lat,lng,...
  const pathMatch = url.match(/\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  if (pathMatch) {
    return { lat: parseFloat(pathMatch[1]), lng: parseFloat(pathMatch[2]) }
  }
  return null
}

function scan<T>(text: string, re: RegExp, build: (m: RegExpExecArray) => T): Array<string | T> {
  const out: Array<string | T> = []
  let last = 0
  let m: RegExpExecArray | null
  re.lastIndex = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(build(m))
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/**
 * Three-pass scanner: contacts first, then locations within
 * remaining text, then plain URLs in what's left over. Order matters
 * because the location URL is also a plain URL — we want it consumed
 * by the location pass first.
 */
export function parseMessageSegments(text: string): MessageSegment[] {
  type AnyParsed = Exclude<MessageSegment, { kind: 'text' }>
  const pass1: Array<string | AnyParsed> = scan(text, CONTACT_RE, (m) => ({
    kind: 'contact' as const,
    name: (m[1] || '').trim(),
    phone: (m[2] || '').trim(),
  }))
  const pass2: Array<string | AnyParsed> = pass1.flatMap((seg) =>
    typeof seg === 'string'
      ? scan(seg, LOCATION_RE, (m): AnyParsed => ({
          kind: 'location',
          name: (m[1] || '').trim(),
          url: m[2],
          lat: parseFloat(m[3]),
          lng: parseFloat(m[4]),
        }))
      : [seg],
  )
  // Pass 3: bare URLs. ANY recognised maps URL (including short
  // links like maps.app.goo.gl that don't carry coords) is upgraded
  // to a location chip — short links render with lat/lng = null and
  // the chip just shows an "Open in Maps" action instead of coords.
  const pass3: Array<string | AnyParsed> = pass2.flatMap((seg) =>
    typeof seg === 'string'
      ? scan(seg, URL_RE, (m): AnyParsed => {
          const url = m[0]
          if (isMapsUrl(url)) {
            const coords = tryExtractMapsCoords(url)
            return {
              kind: 'location',
              name: '',
              url,
              lat: coords?.lat ?? null,
              lng: coords?.lng ?? null,
            }
          }
          return { kind: 'link', url }
        })
      : [seg],
  )
  // Pass 4: bare phone numbers in remaining text. Emits the same
  // `contact` segment shape the 📱 snippet pass uses, with no name —
  // ContactChip renders a Call / Copy / WhatsApp card sized to fit
  // the number alone.
  const pass4: Array<string | AnyParsed> = pass3.flatMap((seg) =>
    typeof seg === 'string'
      ? scan(seg, PHONE_RE, (m): AnyParsed => ({
          kind: 'contact',
          name: '',
          phone: m[0].trim(),
        }))
      : [seg],
  )
  return pass4.map((seg): MessageSegment =>
    typeof seg === 'string' ? { kind: 'text', text: seg } : seg,
  )
}

/**
 * Backward-compat wrapper used by existing callers that only need
 * contact + text segments. New code should use parseMessageSegments.
 */
export type TextSegment = string | { name: string; phone: string }
export function parseContactSnippets(text: string): TextSegment[] {
  return parseMessageSegments(text).map((seg): TextSegment =>
    seg.kind === 'contact'
      ? { name: seg.name, phone: seg.phone }
      : seg.kind === 'text'
        ? seg.text
        // Render location/link as their underlying text in legacy callers.
        : seg.kind === 'location'
          ? `📍 ${seg.name ? seg.name + '\n' : ''}${seg.url}`
          : seg.url,
  )
}
