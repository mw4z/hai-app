'use client'

import { useEffect, useState } from 'react'
import {
  FiX,
  FiMessageCircle,
  FiMapPin,
  FiStar,
  FiFileText,
  FiCalendar,
  FiPhone,
} from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import MembershipPill from '@/components/MembershipPill'
import { HaiSpinner } from '@/components/HaiLoader'
import { buildWhatsAppHref } from '@/lib/phone'

/**
 * Admin-only bottom sheet showing a single user's profile + quick contact
 * actions (in-app DM, WhatsApp). Fetches /api/users/[id]/profile. Membership
 * status is always shown here (admin context) via MembershipPill showVerified.
 */
export default function AdminUserSheet({
  userId,
  fallbackName,
  phone,
  onClose,
  onChat,
}: {
  userId: string
  fallbackName?: string
  phone?: string | null
  onClose: () => void
  onChat: (userId: string) => void
}) {
  const { lang } = useLanguage()
  const dn = (ar: string, en?: string) => (lang === 'en' && en ? en : ar)
  const [profile, setProfile] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/users/${userId}/profile`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return
        setProfile(d)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const wa = buildWhatsAppHref(phone)
  const name =
    (profile && [profile.name, profile.lastName].filter(Boolean).join(' ')) ||
    fallbackName ||
    dn('بدون اسم', 'No name')
  const joined = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'ar-SA', {
        year: 'numeric',
        month: 'short',
      })
    : null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-2xl max-h-[85vh] overflow-y-auto shadow-xl"
        style={{ paddingBottom: 'calc(1rem + var(--hai-safe-bottom, 0px))' }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <span className="text-sm font-bold text-gray-900 dark:text-white">
            {dn('ملف المستخدم', 'User profile')}
          </span>
          <button onClick={onClose} className="text-gray-400 p-1 active:scale-90">
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <HaiSpinner />
          </div>
        ) : (
          <div className="px-4 py-4">
            {/* Avatar + name + status */}
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-700 dark:text-primary-300 font-bold text-2xl overflow-hidden flex-shrink-0">
                {profile?.avatarUrl ? (
                  <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  name?.[0] || '؟'
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-gray-900 dark:text-white truncate">{name}</p>
                <div className="flex items-center gap-1.5 flex-wrap mt-1">
                  <MembershipPill membership={profile?.membership} showVerified />
                  {profile?.role && profile.role !== 'RESIDENT' && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                      {profile.role}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Quick facts */}
            <div className="mt-4 space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
              {phone && (
                <p className="flex items-center gap-2">
                  <FiPhone className="w-3.5 h-3.5 text-gray-400" /> {phone}
                </p>
              )}
              {profile?.neighborhood?.name && (
                <p className="flex items-center gap-2">
                  <FiMapPin className="w-3.5 h-3.5 text-gray-400" />
                  {dn(profile.neighborhood.name, profile.neighborhood.nameEn)}
                </p>
              )}
              <p className="flex items-center gap-2">
                <FiStar className="w-3.5 h-3.5 text-gray-400" /> {profile?.reputation ?? 0}{' '}
                {dn('نقطة', 'pts')}
              </p>
              <p className="flex items-center gap-2">
                <FiFileText className="w-3.5 h-3.5 text-gray-400" /> {profile?.postCount ?? 0}{' '}
                {dn('منشور', 'posts')}
              </p>
              {joined && (
                <p className="flex items-center gap-2">
                  <FiCalendar className="w-3.5 h-3.5 text-gray-400" /> {dn('انضم', 'Joined')} {joined}
                </p>
              )}
            </div>

            {/* Bio / service description */}
            {(profile?.bio || profile?.serviceDescription) && (
              <div className="mt-3 bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                {profile.bio || profile.serviceDescription}
              </div>
            )}

            {/* Contact actions */}
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={() => onChat(userId)}
                className="flex-1 flex items-center justify-center gap-2 bg-primary-600 text-white rounded-xl py-2.5 text-sm font-semibold active:scale-95 transition-transform"
              >
                <FiMessageCircle className="w-4 h-4" />
                {dn('محادثة', 'Message')}
              </button>
              {wa && (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 bg-[#25D366] text-white rounded-xl py-2.5 text-sm font-semibold active:scale-95 transition-transform"
                >
                  <FiPhone className="w-4 h-4" />
                  {dn('واتساب', 'WhatsApp')}
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
