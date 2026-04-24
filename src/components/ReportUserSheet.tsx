'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { FiX, FiFlag, FiSlash } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { showApiError } from '@/lib/apiError'
import { HaiSpinner } from './HaiLoader'

/**
 * Account-level report sheet. Reused across every surface where a
 * user can report another account (post overflow, profile popup,
 * chat thread, marketplace/provider). Separate from post reporting
 * (/api/posts/report) and from blocking — after a successful
 * report we OFFER to block but never do it automatically.
 */

type Reason =
  | 'IMPERSONATION'
  | 'SCAM_FRAUD'
  | 'HARASSMENT'
  | 'ABUSIVE_LANGUAGE'
  | 'SPAM'
  | 'INAPPROPRIATE_PROFILE'
  | 'OTHER'

type Source = 'PROFILE' | 'POST' | 'CHAT' | 'MARKETPLACE' | 'PROVIDER'

interface ReasonLabel {
  ar: string
  en: string
  ur: string
}

const REASONS: { key: Reason; label: ReasonLabel }[] = [
  { key: 'IMPERSONATION',         label: { ar: 'حساب مزيف / انتحال شخصية',  en: 'Fake account / impersonation', ur: 'جعلی اکاؤنٹ / دوسرے کا روپ' } },
  { key: 'SCAM_FRAUD',            label: { ar: 'احتيال أو نصب',              en: 'Scam or fraud',                ur: 'دھوکہ یا فراڈ' } },
  { key: 'HARASSMENT',            label: { ar: 'تحرش أو تواصل غير مرغوب',    en: 'Harassment or unwanted contact', ur: 'ہراسانی یا غیر ضروری رابطہ' } },
  { key: 'ABUSIVE_LANGUAGE',      label: { ar: 'إساءة لفظية أو تهديد',        en: 'Abusive language or threats',   ur: 'گالم گلوچ یا دھمکی' } },
  { key: 'SPAM',                  label: { ar: 'سبام أو إعلانات مزعجة',       en: 'Spam or unwanted advertising',  ur: 'اسپیم یا ناپسندیدہ اشتہارات' } },
  { key: 'INAPPROPRIATE_PROFILE', label: { ar: 'محتوى ملف شخصي غير لائق',     en: 'Inappropriate profile content', ur: 'نامناسب پروفائل مواد' } },
  { key: 'OTHER',                 label: { ar: 'سبب آخر',                     en: 'Other',                         ur: 'کوئی اور وجہ' } },
]

export interface ReportUserSheetProps {
  open: boolean
  onClose: () => void
  /** The account being reported. */
  targetUserId: string
  /** Display name shown in the sheet header; falls back to a generic label. */
  targetName?: string | null
  /** Where the report was filed from — drives moderator routing. */
  source?: Source
  /** Optional context IDs so a mod can jump to the evidence surface. */
  postId?: string
  conversationId?: string
  listingId?: string
  /** Fires when the user taps "Block too" in the success confirmation. */
  onBlockRequested?: () => void
}

export default function ReportUserSheet({
  open,
  onClose,
  targetUserId,
  targetName,
  source = 'PROFILE',
  postId,
  conversationId,
  listingId,
  onBlockRequested,
}: ReportUserSheetProps) {
  const { lang } = useLanguage()
  const [reason, setReason] = useState<Reason | null>(null)
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  if (!open) return null

  const dir = lang === 'en' ? 'ltr' : 'rtl'

  function reset() {
    setReason(null)
    setDetails('')
    setDone(false)
    setSubmitting(false)
  }

  async function submit() {
    if (!reason || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(targetUserId)}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason,
          details: details.trim() || undefined,
          source,
          postId,
          conversationId,
          listingId,
        }),
      })
      if (!res.ok) {
        await showApiError(res, lang as 'ar' | 'en' | 'ur')
        setSubmitting(false)
        return
      }
      setDone(true)
    } catch {
      toast.error(lang === 'en' ? 'Could not send report' : lang === 'ur' ? 'رپورٹ نہیں بھیجی جا سکی' : 'تعذر إرسال البلاغ')
      setSubmitting(false)
    }
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleBlock() {
    onBlockRequested?.()
    reset()
    onClose()
  }

  const header = lang === 'en' ? 'Report user' : lang === 'ur' ? 'صارف رپورٹ کریں' : 'الإبلاغ عن المستخدم'
  const subline = targetName
    ? lang === 'en'
      ? `Reporting ${targetName}`
      : lang === 'ur'
        ? `${targetName} کی رپورٹ`
        : `الإبلاغ عن ${targetName}`
    : null

  return (
    <div
      data-overlay="true"
      className="hai-sheet-overlay"
      onClick={handleClose}
      dir={dir}
    >
      <div
        className="hai-sheet animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hai-sheet__handle" />

        <div className="hai-sheet__header">
          <h3 className="hai-sheet__header-title">{header}</h3>
          <button
            type="button"
            onClick={handleClose}
            className="hai-sheet__close"
            aria-label="Close"
          >
            <FiX className="hai-icon-lg" />
          </button>
        </div>

        <div className="hai-sheet__body hai-stack-3">
          {done ? (
            <div className="hai-stack-3">
              <p className="hai-body-strong">
                {lang === 'en'
                  ? 'Report submitted. Our moderators will review it.'
                  : lang === 'ur'
                    ? 'رپورٹ موصول ہو گئی۔ منتظم جلد جائزہ لیں گے۔'
                    : 'تم استلام البلاغ. سيراجعه المشرفون قريباً.'}
              </p>
              <p className="hai-caption">
                {lang === 'en'
                  ? 'You can also block this user so you stop seeing their content. Blocking is separate from reporting.'
                  : lang === 'ur'
                    ? 'آپ اس صارف کو بلاک بھی کر سکتے ہیں۔ بلاک کرنا رپورٹ سے علیحدہ ہے۔'
                    : 'يمكنك حظر هذا المستخدم إذا أردت. الحظر منفصل عن البلاغ.'}
              </p>

              <div className="hai-row-2">
                {onBlockRequested && (
                  <button
                    type="button"
                    className="hai-btn-primary hai-flex-1"
                    onClick={handleBlock}
                  >
                    <FiSlash className="hai-icon-sm" />
                    <span>
                      {lang === 'en' ? 'Block this user too' : lang === 'ur' ? 'اس کو بلاک بھی کریں' : 'حظره أيضاً'}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  className="hai-btn-ghost hai-flex-1"
                  onClick={handleClose}
                >
                  {lang === 'en' ? 'Done' : lang === 'ur' ? 'ہو گیا' : 'تم'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {subline && <p className="hai-caption">{subline}</p>}

              <div className="hai-stack-2">
                <p className="hai-body-strong">
                  {lang === 'en' ? 'Why are you reporting this account?' : lang === 'ur' ? 'آپ اس اکاؤنٹ کو کیوں رپورٹ کر رہے ہیں؟' : 'لماذا تبلّغ عن هذا الحساب؟'}
                </p>
                <div className="hai-stack-1">
                  {REASONS.map((r) => {
                    const selected = reason === r.key
                    return (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => setReason(r.key)}
                        className="hai-menu-item"
                        data-selected={selected ? 'true' : 'false'}
                        style={{
                          borderRadius: 'var(--hai-radius-md)',
                          border: selected
                            ? '1px solid var(--hai-primary-500)'
                            : '1px solid var(--hai-border)',
                          background: selected
                            ? 'var(--hai-primary-50)'
                            : 'transparent',
                        }}
                      >
                        <FiFlag className="hai-icon-sm hai-menu-item__icon" />
                        <span className="hai-menu-item__label">
                          {r.label[lang as 'ar' | 'en' | 'ur'] || r.label.ar}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="hai-stack-1">
                <label className="hai-caption">
                  {lang === 'en'
                    ? 'Additional details (optional)'
                    : lang === 'ur'
                      ? 'اضافی تفصیلات (اختیاری)'
                      : 'تفاصيل إضافية (اختياري)'}
                </label>
                <textarea
                  className="hai-input"
                  rows={3}
                  maxLength={1000}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder={
                    lang === 'en'
                      ? 'Anything specific moderators should know'
                      : lang === 'ur'
                        ? 'کوئی خاص بات جو منتظمین کو بتانی ہو'
                        : 'أي تفاصيل تساعد المشرفين'
                  }
                />
              </div>

              <div className="hai-row-2">
                <button
                  type="button"
                  className="hai-btn-primary hai-flex-1"
                  disabled={!reason || submitting}
                  onClick={submit}
                >
                  {submitting
                    ? <HaiSpinner />
                    : (lang === 'en' ? 'Submit report' : lang === 'ur' ? 'رپورٹ بھیجیں' : 'إرسال البلاغ')}
                </button>
                <button
                  type="button"
                  className="hai-btn-ghost"
                  onClick={handleClose}
                  disabled={submitting}
                >
                  {lang === 'en' ? 'Cancel' : lang === 'ur' ? 'منسوخ' : 'إلغاء'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
