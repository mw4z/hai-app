import type { ServiceContactReportReason } from '@prisma/client'

// Adding contacts — rolling 24h cap per user (anti-spam).
export const SERVICE_CONTACT_MAX_PER_DAY = 5

// Distinct-report thresholds → auto-hide. Community/unverified contacts
// (lower trust) hide faster than owner-claimed/verified ones.
export function serviceContactHideThreshold(verification: string): number {
  return verification === 'VERIFIED' || verification === 'CLAIMED' ? 5 : 3
}

// The 4 service-contact report reasons (people/phone-oriented).
export const SERVICE_REPORT_REASONS: { value: ServiceContactReportReason; ar: string; en: string }[] = [
  { value: 'WRONG_PHONE',     ar: 'رقم غير صحيح',     en: 'Wrong number' },
  { value: 'NOT_THIS_PERSON', ar: 'لا يخص هذا الشخص', en: 'Not this person' },
  { value: 'FRAUD_OR_ABUSE',  ar: 'احتيال أو إزعاج',  en: 'Fraud or abuse' },
  { value: 'INAPPROPRIATE',   ar: 'محتوى غير مناسب',  en: 'Inappropriate content' },
]

export const SERVICE_REPORT_REASON_VALUES: readonly string[] = SERVICE_REPORT_REASONS.map((r) => r.value)

export function isValidServiceReportReason(v: unknown): v is ServiceContactReportReason {
  return typeof v === 'string' && SERVICE_REPORT_REASON_VALUES.includes(v)
}
