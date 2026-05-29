'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { FiX, FiMapPin, FiCalendar } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { useConfirm } from '@/components/ConfirmProvider'
import HaiLoader from '@/components/HaiLoader'
import { getRepLevel } from '@/lib/reputation-levels'
import { fullName } from '@/lib/displayName'
import UserBadgeDisplay, { TierLabel } from './UserBadge'
import MembershipPill from './MembershipPill'
import SocialChips from './SocialChips'
import ServiceCatalog from './ServiceCatalog'
import { consumeNextClick } from '@/hooks/useBodyScrollLock'

/**
 * The user profile sheet shown when tapping a name/avatar — extracted from
 * PostCard so the feed AND the admin dashboard render the EXACT same card.
 * Pass a pre-fetched `profile`, or a `profileUserId` to have it fetch
 * /api/users/[id]/profile itself. `extraActions` renders below the card
 * (used by admin for DM / WhatsApp buttons).
 */
export default function UserProfileSheet({
  profile: profileProp,
  profileUserId,
  currentUserId,
  onClose,
  onAvatarTap,
  onReport,
  showBlock = false,
  extraActions,
}: {
  profile?: any
  profileUserId?: string
  currentUserId?: string | null
  onClose: () => void
  onAvatarTap?: () => void
  onReport?: () => void
  showBlock?: boolean
  extraActions?: ReactNode
}) {
  const { t, lang } = useLanguage()
  const router = useRouter()
  const confirmDialog = useConfirm()
  const [fetched, setFetched] = useState<any | null>(profileProp ?? null)

  useEffect(() => {
    if (profileProp) { setFetched(profileProp); return }
    if (!profileUserId) return
    let aborted = false
    setFetched(null)
    fetch(`/api/users/${profileUserId}/profile`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => { if (!aborted) setFetched(p) })
      .catch(() => { if (!aborted) setFetched(null) })
    return () => { aborted = true }
  }, [profileProp, profileUserId])

  const u = fetched

  // Backdrop / X-button dismiss wrapper.
  //
  // Without consumeNextClick(), tapping the backdrop to dismiss the
  // sheet would fire a phantom "click" on whatever sits underneath
  // the touch point once the sheet unmounts — feels like a ghost
  // tap that fires the post / row / button you happened to be over.
  // The shared one-shot capture-phase listener in useBodyScrollLock
  // swallows that next click before it reaches any handler. Auto-
  // cleared after 600 ms so it never lingers.
  const safeClose = () => {
    consumeNextClick()
    onClose()
  }

  // Loading / unresolved → branded loader (never a half-empty card).
  if (!u) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={safeClose}
      >
        <div
          className="bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm mx-auto py-20 flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <HaiLoader size="md" />
        </div>
      </div>
    )
  }

  const rep = u.reputation
  const level = getRepLevel(rep)
  const ageDays = u.createdAt ? Math.floor((Date.now() - new Date(u.createdAt).getTime()) / 86400000) : 0
  const postCount = u._count?.posts ?? u.postCount ?? 0
  const isSelf = currentUserId != null && u.id === currentUserId

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return
        e.preventDefault()
        safeClose()
      }}
    >
      <div
        className="relative bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm mx-auto animate-slide-up max-h-[85vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(var(--hai-safe-bottom, 0px) + 2rem)' }}
      >
        {/* Cover header */}
        <div className="relative h-28 rounded-t-3xl sm:rounded-t-2xl"
          style={{ background: u.coverUrl || 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)' }}>
          {u.coverUrl?.startsWith('http') && (
            <img src={u.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover rounded-t-3xl sm:rounded-t-2xl" />
          )}
          <div className="absolute top-0 left-0 right-0 h-72 pointer-events-none"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.1) 30%, transparent 100%)' }} />
          <button onClick={safeClose} className="absolute top-3 left-3 bg-black/30 hover:bg-black/50 backdrop-blur-sm rounded-full p-1.5 z-10">
            <FiX className="w-4 h-4 text-white" />
          </button>
        </div>

        <div className="flex flex-col items-center text-center px-5 -mt-12 relative z-10">
          {/* Avatar */}
          <div
            onClick={() => u.avatarUrl && onAvatarTap?.()}
            className={`w-24 h-24 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-3xl overflow-hidden mb-3 border-4 border-white dark:border-gray-800 shadow-lg ${u.avatarUrl && onAvatarTap ? 'cursor-pointer active:scale-95 transition-transform' : ''}`}
          >
            {u.avatarUrl
              ? <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
              : (u.name?.[0] || '؟')}
          </div>

          {/* Name */}
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">{fullName(u) || t('post_neighbor')}</h3>

          {/* Identity badges */}
          <div className="flex items-center gap-1.5 mt-1">
            <UserBadgeDisplay accountType={u.accountType} providerStatus={u.providerStatus} reputation={rep} role={u.role} showLabel />
            <MembershipPill membership={u.membership as any} />
          </div>

          {/* Tier pill */}
          <div className="flex items-center gap-2 mt-2">
            <TierLabel reputation={rep} />
            <span className="text-[10px] text-gray-400">{rep} {lang !== 'en' ? 'نقطة' : 'pts'}</span>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3 mt-4 w-full">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-xl py-2.5 px-2">
              <div className="text-lg font-bold text-gray-900 dark:text-white">{postCount}</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">{lang !== 'en' ? 'منشور' : 'Posts'}</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-xl py-2.5 px-2">
              <div className="text-lg font-bold text-gray-900 dark:text-white">{rep}</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">{lang !== 'en' ? 'سمعة' : 'Rep'}</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-xl py-2.5 px-2">
              <div className="text-lg font-bold text-gray-900 dark:text-white">{ageDays}</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">{lang !== 'en' ? 'يوم' : 'Days'}</div>
            </div>
          </div>

          {/* Details */}
          <div className="mt-4 w-full space-y-2">
            {u.neighborhood && (
              <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-gray-700 rounded-xl">
                <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><FiMapPin className="w-3.5 h-3.5" /> {lang !== 'en' ? 'الحي' : 'Neighborhood'}</span>
                <span className="text-sm font-medium text-gray-800 dark:text-white">{lang === 'en' && u.neighborhood.nameEn ? u.neighborhood.nameEn : u.neighborhood.name}</span>
              </div>
            )}
            {u.gender && u.gender !== 'UNSPECIFIED' && (
              <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-gray-700 rounded-xl">
                <span className="text-xs text-gray-500 dark:text-gray-400">{lang !== 'en' ? 'الجنس' : 'Gender'}</span>
                <span className="text-sm font-medium text-gray-800 dark:text-white">
                  {u.gender === 'MALE' ? (lang !== 'en' ? '👨 ذكر' : '👨 Male') : (lang !== 'en' ? '👩 أنثى' : '👩 Female')}
                </span>
              </div>
            )}
            {u.accountType && u.accountType !== 'NORMAL' &&
              (u.providerStatus === 'ACTIVE' || u.providerStatus === 'VERIFIED') && (
              <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-gray-700 rounded-xl">
                <span className="text-xs text-gray-500 dark:text-gray-400">{lang !== 'en' ? 'نوع الحساب' : 'Account'}</span>
                <span className="text-sm font-medium text-gray-800 dark:text-white">
                  {u.accountType === 'VERIFIED_PROVIDER' ? (lang !== 'en' ? '🛡 مقدم خدمة موثّق' : '🛡 Verified Provider') : (lang !== 'en' ? '🛠 مقدم خدمة' : '🛠 Service Provider')}
                </span>
              </div>
            )}
            {u.createdAt && (
              <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-gray-700 rounded-xl">
                <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><FiCalendar className="w-3.5 h-3.5" /> {lang !== 'en' ? 'عضو منذ' : 'Joined'}</span>
                <span className="text-sm font-medium text-gray-800 dark:text-white">{new Date(u.createdAt).toLocaleDateString(lang !== 'en' ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
              </div>
            )}
          </div>

          {/* Bio + Service */}
          {(u.bio || (u.accountType && u.accountType !== 'NORMAL' && (u.providerStatus === 'ACTIVE' || u.providerStatus === 'VERIFIED') && (u.serviceDescription || u.serviceAddress || u.serviceLat))) && (
            <div className="mt-4 w-full rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-700">
              {u.bio && (
                <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/50">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{lang !== 'en' ? 'نبذة' : 'About'}</p>
                  <p className="text-[13px] text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">{u.bio}</p>
                </div>
              )}
              {u.accountType && u.accountType !== 'NORMAL' && (u.providerStatus === 'ACTIVE' || u.providerStatus === 'VERIFIED') && (u.serviceDescription || u.serviceAddress || u.serviceLat) && (
                <div className={`px-4 py-3 bg-green-50 dark:bg-green-900/20 ${u.bio ? 'border-t border-gray-100 dark:border-gray-700' : ''}`}>
                  <p className="text-[10px] font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide mb-1.5">
                    {lang !== 'en' ? 'الخدمة' : 'Service'}
                  </p>
                  {u.serviceDescription && (
                    <p className="text-[13px] text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">{u.serviceDescription}</p>
                  )}
                  {(u.serviceAddress || u.serviceLat) && (
                    <div className={`flex items-center gap-2 ${u.serviceDescription ? 'mt-2.5' : ''}`}>
                      <div className="flex-1 min-w-0">
                        {u.serviceAddress && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{u.serviceAddress}</p>
                        )}
                      </div>
                      {u.serviceLat && u.serviceLng && (
                        <a
                          href={`https://maps.google.com/?q=${u.serviceLat},${u.serviceLng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-primary-600 dark:text-primary-400 bg-primary-100 dark:bg-primary-900/30 px-2.5 py-1 rounded-lg flex items-center gap-1 flex-shrink-0"
                          onClick={e => e.stopPropagation()}
                        >
                          <FiMapPin className="w-3 h-3" />
                          {lang !== 'en' ? 'الخريطة' : 'Map'}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Social links (providers only) */}
          {u.socialLinks && Object.keys(u.socialLinks).length > 0 && (
            <div className="flex justify-center pt-1">
              <SocialChips links={u.socialLinks} />
            </div>
          )}

          {/* Service Catalog (providers only) */}
          {u.accountType && u.accountType !== 'NORMAL' && (
            <ServiceCatalog userId={u.id} lang={lang} />
          )}

          {/* Extra actions (e.g. admin DM / WhatsApp) */}
          {extraActions && <div className="mt-4 w-full">{extraActions}</div>}

          {/* Report + Block — only for other users */}
          {!isSelf && (onReport || showBlock) && (
            <div className="flex items-center justify-center gap-4 mt-1">
              {onReport && (
                <button onClick={onReport} className="text-xs text-red-400 py-2">
                  {lang === 'en' ? 'Report user' : lang === 'ur' ? 'صارف رپورٹ کریں' : 'الإبلاغ عن المستخدم'}
                </button>
              )}
              {onReport && showBlock && <span className="text-gray-300 dark:text-gray-600">·</span>}
              {showBlock && (
                <button
                  onClick={async () => {
                    const ok = await confirmDialog({
                      message: lang === 'en' ? "Block this user? You won't see their content." : 'حظر هذا المستخدم؟ لن ترى محتواه.',
                      variant: 'danger',
                      confirmText: lang === 'en' ? 'Block' : 'حظر',
                    })
                    if (!ok) return
                    try {
                      await fetch('/api/users/block', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: u.id }) })
                      toast.success(lang === 'en' ? 'User blocked' : 'تم الحظر')
                      onClose()
                      router.refresh()
                    } catch {}
                  }}
                  className="text-xs text-red-400 py-2"
                >
                  {lang !== 'en' ? 'حظر المستخدم' : 'Block User'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
