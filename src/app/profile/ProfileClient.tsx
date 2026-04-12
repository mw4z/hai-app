'use client'

import { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import BottomNav from '@/components/BottomNav'
import UserBadgeDisplay from '@/components/UserBadge'
import { useLanguage, LANGUAGE_CHANGE_EVENT } from '@/hooks/useLanguage'
import {
  FiMapPin, FiStar, FiFileText, FiLogOut, FiCamera,
  FiUser, FiPhone, FiMail, FiGlobe, FiSun, FiMoon,
  FiMonitor, FiCheck, FiChevronLeft, FiChevronDown, FiEdit2, FiBell,
  FiSettings, FiHelpCircle, FiAward, FiShield, FiBookmark, FiX, FiShare2, FiUpload,
  FiVolume2, FiVolumeX
} from 'react-icons/fi'
import { setSoundsEnabled, playTap } from '@/lib/sound'
import { setHapticsEnabled, hapticMedium } from '@/lib/haptic'
const ImageCropper = lazy(() => import('@/components/ImageCropper'))
import { DEFAULT_AVATARS, AVATAR_CATEGORIES } from '@/lib/defaultAvatars'
import { DEFAULT_COVERS } from '@/lib/defaultCovers'

type Theme = 'light' | 'dark' | 'system'
type Language = 'ar' | 'en' | 'ur'

interface Props {
  user: {
    id: string
    name: string | null
    lastName: string | null
    phone: string
    gender: string
    reputation: number
    role: string
    neighborhood?: string
    neighborhoodEn?: string
    city?: string
    cityEn?: string
    createdAt: string
    avatarUrl?: string | null
    coverUrl?: string | null
    email?: string | null
    emailVerified?: boolean
    notifyComments?: boolean
    notifyReactions?: boolean
    notifyReplies?: boolean
    notifyLookingFor?: boolean
    accountType?: string
    bio?: string | null
    serviceDescription?: string | null
    serviceLat?: number | null
    serviceLng?: number | null
    serviceAddress?: string | null
  }
  postCount: number
}


export default function ProfileClient({ user, postCount }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { t, lang } = useLanguage()
  const dn = (ar?: string, en?: string) => (lang === 'en' && en) ? en : (ar || '')

  // Local state
  const [avatar, setAvatar] = useState(user.avatarUrl || '')
  const [cover, setCover] = useState(user.coverUrl || '')
  const coverInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(user.name || '')
  const [lastName, setLastName] = useState(user.lastName || '')
  const [email, setEmail] = useState(user.email || '')
  const [emailVerified, setEmailVerified] = useState(user.emailVerified || false)
  const [theme, setTheme] = useState<Theme>('system')
  const [soundsOn, setSoundsOn] = useState(true)
  const [hapticsOn, setHapticsOn] = useState(true)
  const [language, setLanguage] = useState<Language>('ar')
  const [notifyComments, setNotifyComments] = useState(user.notifyComments !== false)
  const [notifyReactions, setNotifyReactions] = useState(user.notifyReactions !== false)
  const [notifyReplies, setNotifyReplies] = useState(user.notifyReplies !== false)
  const [notifyLookingFor, setNotifyLookingFor] = useState(user.notifyLookingFor !== false)
  const [notifyMessages, setNotifyMessages] = useState((user as any).notifyMessages !== false)
  const [notifyRides, setNotifyRides] = useState((user as any).notifyRides !== false)
  const [notifySystem, setNotifySystem] = useState((user as any).notifySystem !== false)

  // Editing panels
  const [editingName, setEditingName] = useState(false)
  const [editingEmail, setEditingEmail] = useState(false)
  const [editingPhone, setEditingPhone] = useState(false)
  const [phoneStep, setPhoneStep] = useState<'input' | 'verify'>('input')
  const [newPhone, setNewPhone] = useState('')
  const [phoneCode, setPhoneCode] = useState('')
  const [currentPhone, setCurrentPhone] = useState(user.phone)
  const [verifyingEmail, setVerifyingEmail] = useState(false)
  const [verifyCode, setVerifyCode] = useState('')
  const [openSection, setOpenSection] = useState<string | null>(null)
  const [modRequestStatus, setModRequestStatus] = useState<string | null>(null)
  const [modRequestLoading, setModRequestLoading] = useState(false)
  const [showModForm, setShowModForm] = useState(false)
  const [modReason, setModReason] = useState('')
  const [tempName, setTempName] = useState('')
  const [tempLastName, setTempLastName] = useState('')
  const [tempEmail, setTempEmail] = useState('')
  const [saving, setSaving] = useState(false)

  // Bio & service fields
  const [bio, setBio] = useState(user.bio || '')
  const [editingBio, setEditingBio] = useState(false)
  const [tempBio, setTempBio] = useState('')
  const [serviceDescription, setServiceDescription] = useState(user.serviceDescription || '')
  const [tempServiceDesc, setTempServiceDesc] = useState('')
  const [serviceAddress, setServiceAddress] = useState(user.serviceAddress || '')
  const [tempServiceAddress, setTempServiceAddress] = useState('')
  const [serviceLat, setServiceLat] = useState(user.serviceLat || null)
  const [serviceLng, setServiceLng] = useState(user.serviceLng || null)
  const isProvider = user.accountType === 'SERVICE_PROVIDER' || user.accountType === 'VERIFIED_PROVIDER'

  useEffect(() => {
    setTheme((localStorage.getItem('hai_theme') as Theme) || 'system')
    setLanguage((localStorage.getItem('hai_language') as Language) || 'ar')
    setSoundsOn(localStorage.getItem('hai_sounds') !== '0')
    setHapticsOn(localStorage.getItem('hai_haptics') !== '0')
    // Fetch mod request status for RESIDENT users
    if (user.role === 'RESIDENT') {
      fetch('/api/mod-request').then(r => r.json()).then(d => {
        if (d.request) setModRequestStatus(d.request.status)
      }).catch(() => {})
    }
  }, [])

  function applyTheme(t: Theme) {
    setTheme(t)
    localStorage.setItem('hai_theme', t)
    const isDark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', isDark)
  }

  function applyLanguage(l: Language) {
    setLanguage(l)
    localStorage.setItem('hai_language', l)
    document.cookie = `hai_language=${l}; path=/; max-age=31536000; SameSite=Lax`
    document.documentElement.setAttribute('lang', l)
    document.documentElement.setAttribute('dir', l === 'en' ? 'ltr' : 'rtl')
    window.dispatchEvent(new Event(LANGUAGE_CHANGE_EVENT))
  }

  async function toggleNotifPref(field: string, value: boolean) {
    await fetch('/api/notifications/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    try { localStorage.clear() } catch {}
    window.location.href = '/'
  }

  // Image cropper state
  const [cropImage, setCropImage] = useState<string | null>(null)
  const [cropType, setCropType] = useState<'avatar' | 'cover'>('avatar')

  // Avatar upload / picker
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)

  function handleAvatarClick() {
    setShowAvatarPicker(true)
  }

  async function selectBuiltInAvatar(url: string) {
    setAvatar(url)
    setShowAvatarPicker(false)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar: url }),
      })
      if (res.ok) toast.success(lang === 'en' ? 'Avatar updated' : 'تم تحديث الصورة')
      else toast.error(lang === 'en' ? 'Failed' : 'فشل رفع الصورة')
    } catch { toast.error(lang === 'en' ? 'Error' : 'خطأ') }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setShowAvatarPicker(false)
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast.error('الصورة أكبر من 5MB'); return }
    const reader = new FileReader()
    reader.onload = (ev) => {
      setCropType('avatar')
      setCropImage(ev.target?.result as string)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function handleCroppedAvatar(base64: string) {
    setCropImage(null)
    setAvatar(base64)
    fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatar: base64 }),
    }).then(r => {
      if (r.ok) toast.success('تم تحديث الصورة')
      else toast.error('فشل رفع الصورة')
    })
  }

  const [showCoverPicker, setShowCoverPicker] = useState(false)

  function handleCoverClick() {
    setShowCoverPicker(true)
  }

  async function selectBuiltInCover(css: string) {
    setCover(css)
    setShowCoverPicker(false)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cover: css }),
      })
      if (res.ok) toast.success(lang === 'en' ? 'Cover updated' : 'تم تحديث الغلاف')
      else toast.error(lang === 'en' ? 'Failed' : 'فشل')
    } catch { toast.error(lang === 'en' ? 'Error' : 'خطأ') }
  }

  function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    setShowCoverPicker(false)
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast.error('الصورة أكبر من 5MB'); return }
    const reader = new FileReader()
    reader.onload = (ev) => {
      setCropType('cover')
      setCropImage(ev.target?.result as string)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function handleCroppedCover(base64: string) {
    setCropImage(null)
    setCover(base64)
    fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cover: base64 }),
    }).then(r => {
      if (r.ok) toast.success(lang === 'en' ? 'Cover updated' : 'تم تحديث الغلاف')
      else toast.error(lang === 'en' ? 'Upload failed' : 'فشل رفع الصورة')
    })
  }

  // Save name
  async function saveName() {
    if (!tempName.trim()) { toast.error('أدخل اسمك الأول'); return }
    setSaving(true)
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: tempName.trim(), lastName: tempLastName.trim() }),
    })
    setSaving(false)
    if (res.ok) {
      setName(tempName.trim())
      setLastName(tempLastName.trim())
      setEditingName(false)
      toast.success('تم الحفظ')
    } else {
      toast.error('فشل الحفظ')
    }
  }

  // Send email verify code
  async function sendEmailCode() {
    if (!tempEmail.trim()) { toast.error('أدخل بريدك الإلكتروني'); return }
    setSaving(true)
    const res = await fetch('/api/profile/send-email-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: tempEmail.trim() }),
    })
    setSaving(false)
    if (res.ok) {
      setEmail(tempEmail.trim())
      setEditingEmail(false)
      setVerifyingEmail(true)
      toast.success('تم إرسال رمز التحقق إلى بريدك')
    } else {
      const d = await res.json()
      toast.error(d.error || 'فشل إرسال الرمز')
    }
  }

  // Verify email code
  async function verifyEmail() {
    if (verifyCode.length < 6) { toast.error('أدخل الرمز المكون من 6 أرقام'); return }
    setSaving(true)
    const res = await fetch('/api/profile/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: verifyCode }),
    })
    setSaving(false)
    if (res.ok) {
      setEmailVerified(true)
      setVerifyingEmail(false)
      setVerifyCode('')
      toast.success('تم التحقق من البريد الإلكتروني')
    } else {
      const d = await res.json()
      toast.error(d.error || 'رمز خاطئ أو منتهي الصلاحية')
    }
  }

  const joinYear = new Date(user.createdAt).getFullYear()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-28">
      {/* Image cropper modal */}
      {cropImage && (
        <Suspense fallback={null}>
          <ImageCropper
            image={cropImage}
            aspect={cropType === 'avatar' ? 1 : 800 / 300}
            outputWidth={cropType === 'avatar' ? 256 : 800}
            outputHeight={cropType === 'avatar' ? 256 : 300}
            onDone={cropType === 'avatar' ? handleCroppedAvatar : handleCroppedCover}
            onCancel={() => setCropImage(null)}
          />
        </Suspense>
      )}
      {/* Header with cover photo */}
      <div className="relative bg-primary-600 pt-10 pb-6 px-4 text-white text-center overflow-hidden">
        {/* Cover image */}
        {cover ? (
          cover.startsWith('http') || cover.startsWith('data:image/png') || cover.startsWith('data:image/jpeg') ? (
            <div className="absolute inset-0">
              <img src={cover} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/40 to-black/60" />
            </div>
          ) : (
            <div className="absolute inset-0" style={{ background: cover }}>
              <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-black/30" />
            </div>
          )
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-primary-700 to-primary-600" />
        )}
        <style>{`.profile-header-text { text-shadow: 0 1px 4px rgba(0,0,0,0.5); }`}</style>
        {/* Cover change button */}
        <button
          onClick={handleCoverClick}
          className="absolute top-3 right-3 z-10 bg-black/30 hover:bg-black/50 backdrop-blur-sm rounded-full p-2 transition-colors"
        >
          <FiCamera className="w-4 h-4 text-white" />
        </button>
        <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
        <div className="relative z-10 w-24 h-24 mx-auto mb-3">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="w-24 h-24 bg-white rounded-full overflow-hidden cursor-pointer shadow-lg border-2 border-white flex items-center justify-center"
          >
            {avatar
              ? <img src={avatar} alt="avatar" className="w-full h-full object-cover" />
              : <span className="text-primary-600 text-4xl font-bold">{name?.[0] || '؟'}</span>
            }
          </div>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-0 left-0 bg-primary-700 rounded-full p-1.5 cursor-pointer border-2 border-white"
          >
            <FiCamera className="w-3.5 h-3.5 text-white" />
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

        <h1 className="relative z-10 text-xl font-bold profile-header-text">{[name, lastName].filter(Boolean).join(' ') || 'مستخدم'}</h1>
        <div className="relative z-10 flex items-center justify-center gap-2 mt-1 profile-header-text">
          {/* Hide "ساكن" when user has a provider badge — avoids redundancy */}
          {!(user.role === 'RESIDENT' && isProvider) && (
            <p className="text-white/90 text-sm">{t(`role_${user.role}` as any) || t('role_RESIDENT')}</p>
          )}
          <UserBadgeDisplay accountType={user.accountType} reputation={user.reputation} role={user.role} showLabel lightText />
        </div>
        {user.neighborhood && (
          <p className="relative z-10 text-white/80 text-xs mt-1.5 flex items-center justify-center gap-1 profile-header-text">
            <FiMapPin className="w-3 h-3 flex-shrink-0" />
            <span>{dn(user.neighborhood, user.neighborhoodEn)} · {dn(user.city, user.cityEn)}</span>
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="mx-4 mt-4 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-2xl font-bold text-primary-600">{user.reputation}</div>
          <div className="text-xs text-gray-400 mt-0.5">{t('profile_reputation')}</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-gray-800">{postCount}</div>
          <div className="text-xs text-gray-400 mt-0.5">{t('profile_posts')}</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-gray-800">{joinYear}</div>
          <div className="text-xs text-gray-400 mt-0.5">{t('profile_joined')}</div>
        </div>
      </div>

      {/* ═══ Account ═══ */}
      <AccordionSection
        icon={<FiUser className="w-4 h-4" />}
        label={t('profile_account')}
        sectionKey="account"
        openSection={openSection}
        setOpenSection={setOpenSection}
      >
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-700 overflow-hidden">
        {/* Name */}
        {editingName ? (
          <div className="p-4 space-y-3">
            <label className="text-xs font-medium text-gray-500">{t('profile_name')}</label>
            <input
              autoFocus
              value={tempName}
              onChange={e => setTempName(e.target.value.replace(/[^a-zA-Z\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\s]/g, ''))}
              className="input-field text-sm"
              placeholder={t('profile_first_name')}
              maxLength={50}
            />
            <input
              value={tempLastName}
              onChange={e => setTempLastName(e.target.value.replace(/[^a-zA-Z\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\s]/g, ''))}
              className="input-field text-sm"
              placeholder={t('profile_last_name')}
              maxLength={50}
            />
            <div className="flex gap-2">
              <button onClick={saveName} disabled={saving} className="flex-1 bg-primary-600 text-white text-sm font-medium py-2 rounded-xl disabled:opacity-50">
                {saving ? t('profile_saving') : t('profile_save')}
              </button>
              <button onClick={() => setEditingName(false)} className="flex-1 border border-gray-200 text-gray-600 text-sm py-2 rounded-xl">
                {t('profile_cancel')}
              </button>
            </div>
          </div>
        ) : (
          <SettingRow
            icon={<FiUser />}
            label={t('profile_name')}
            value={[name, lastName].filter(Boolean).join(' ') || '—'}
            onTap={() => { setTempName(name); setTempLastName(lastName); setEditingName(true) }}
          />
        )}

        {/* Phone */}
        {editingPhone ? (
          <div className="p-4 space-y-3">
            {phoneStep === 'input' ? (
              <>
                <label className="text-xs font-medium text-gray-500">{t('phone_new')}</label>
                <div className="flex items-center border border-gray-200 rounded-xl bg-white focus-within:ring-2 focus-within:ring-primary-500">
                  <span className="px-3 text-gray-500 text-sm border-l border-gray-200 py-3">🇸🇦 +966</span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder="05xxxxxxxx"
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    className="flex-1 px-3 py-3 bg-transparent focus:outline-none text-base"
                    dir="ltr"
                    maxLength={10}
                    autoFocus
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      setSaving(true)
                      try {
                        const res = await fetch('/api/profile/change-phone', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ step: 'send', phone: newPhone }),
                        })
                        const data = await res.json()
                        if (!res.ok) { toast.error(typeof data.error === 'string' ? data.error : data.error?.message || 'خطأ'); return }
                        toast.success(t('auth_otp_sent'))
                        setPhoneStep('verify')
                      } catch { toast.error(t('common_error')) }
                      finally { setSaving(false) }
                    }}
                    disabled={saving || newPhone.length < 10}
                    className="flex-1 bg-primary-600 text-white text-sm font-medium py-2 rounded-xl disabled:opacity-50"
                  >
                    {saving ? '...' : t('phone_send_code')}
                  </button>
                  <button onClick={() => { setEditingPhone(false); setPhoneStep('input'); setNewPhone(''); setPhoneCode('') }} className="flex-1 border border-gray-200 text-gray-600 text-sm py-2 rounded-xl">
                    {t('profile_cancel')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="text-xs font-medium text-gray-500">{t('phone_enter_code')}</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="000000"
                  value={phoneCode}
                  onChange={e => setPhoneCode(e.target.value)}
                  className="input-field text-center text-lg tracking-widest"
                  maxLength={6}
                  dir="ltr"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      setSaving(true)
                      try {
                        const res = await fetch('/api/profile/change-phone', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ step: 'verify', phone: newPhone, code: phoneCode }),
                        })
                        const data = await res.json()
                        if (!res.ok) { toast.error(typeof data.error === 'string' ? data.error : data.error?.message || 'خطأ'); return }
                        toast.success(t('phone_changed'))
                        setCurrentPhone(newPhone.startsWith('+') ? newPhone : '+966' + newPhone.slice(1))
                        setEditingPhone(false)
                        setPhoneStep('input')
                        setNewPhone('')
                        setPhoneCode('')
                      } catch { toast.error(t('common_error')) }
                      finally { setSaving(false) }
                    }}
                    disabled={saving || phoneCode.length < 6}
                    className="flex-1 bg-primary-600 text-white text-sm font-medium py-2 rounded-xl disabled:opacity-50"
                  >
                    {saving ? '...' : t('phone_verify')}
                  </button>
                  <button onClick={() => { setPhoneStep('input'); setPhoneCode('') }} className="flex-1 border border-gray-200 text-gray-600 text-sm py-2 rounded-xl">
                    {t('common_back')}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <SettingRow icon={<FiPhone />} label={t('profile_phone')} value={currentPhone} onTap={() => setEditingPhone(true)} />
        )}

        {/* Email */}
        {verifyingEmail ? (
          <div className="p-4 space-y-3">
            <label className="text-xs font-medium text-gray-500">{t('profile_verify_code')}</label>
            <p className="text-xs text-gray-400">{t('profile_verify_hint')}</p>
            <input
              autoFocus
              value={verifyCode}
              onChange={e => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="input-field text-sm tracking-widest text-center"
              placeholder="000000"
              inputMode="numeric"
            />
            <div className="flex gap-2">
              <button onClick={verifyEmail} disabled={saving} className="flex-1 bg-primary-600 text-white text-sm font-medium py-2 rounded-xl disabled:opacity-50">
                {saving ? t('profile_saving') : t('profile_verify_btn')}
              </button>
              <button onClick={() => setVerifyingEmail(false)} className="flex-1 border border-gray-200 text-gray-600 text-sm py-2 rounded-xl">
                {t('profile_cancel')}
              </button>
            </div>
          </div>
        ) : editingEmail ? (
          <div className="p-4 space-y-3">
            <label className="text-xs font-medium text-gray-500">{t('profile_email')}</label>
            <input
              autoFocus
              type="email"
              value={tempEmail}
              onChange={e => setTempEmail(e.target.value)}
              className="input-field text-sm"
              placeholder="example@gmail.com"
            />
            <div className="flex gap-2">
              <button onClick={sendEmailCode} disabled={saving} className="flex-1 bg-primary-600 text-white text-sm font-medium py-2 rounded-xl disabled:opacity-50">
                {saving ? t('profile_saving') : t('profile_send_code')}
              </button>
              <button onClick={() => setEditingEmail(false)} className="flex-1 border border-gray-200 text-gray-600 text-sm py-2 rounded-xl">
                {t('profile_cancel')}
              </button>
            </div>
          </div>
        ) : (
          <SettingRow
            icon={<FiMail />}
            label={t('profile_email')}
            value={email || t('profile_email_add')}
            badge={email ? (emailVerified ? 'verified' : 'unverified') : undefined}
            verifiedLabel={t('profile_verified')}
            unverifiedLabel={t('profile_unverified')}
            onTap={() => { setTempEmail(email); setEditingEmail(true) }}
            valueMuted={!email}
          />
        )}
      </div>

      {/* Change Neighborhood */}
      <div className="mt-3">
        <button onClick={() => router.push('/profile/change-neighborhood')}
          className="w-full bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl py-3 px-4 flex items-center gap-3 active:bg-gray-50 dark:active:bg-gray-700 transition-colors">
          <FiMapPin className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 text-start">{t('nbhd_change_title')}</span>
          <FiChevronLeft className="w-4 h-4 text-gray-300" />
        </button>
      </div>
      </AccordionSection>

      {/* ═══ Bio / About ═══ */}
      <AccordionSection
        icon={<FiEdit2 className="w-4 h-4" />}
        label={t('profile_bio')}
        sectionKey="bio"
        openSection={openSection}
        setOpenSection={setOpenSection}
      >
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        {/* Bio field */}
        {editingBio ? (
          <div className="p-4 space-y-3">
            <label className="text-xs font-medium text-gray-500">{t('profile_bio')}</label>
            <textarea
              autoFocus
              value={tempBio}
              onChange={e => setTempBio(e.target.value)}
              className="input-field text-sm resize-none"
              placeholder={t('profile_bio_hint')}
              maxLength={300}
              rows={3}
            />
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-gray-400">{tempBio.length}/300</span>
            </div>

            {/* Service Description (providers only) */}
            {isProvider && (
              <>
                <div className="border-t border-gray-100 dark:border-gray-700 pt-3 mt-2">
                  <label className="text-xs font-medium text-primary-600">{t('profile_service_desc')}</label>
                  <textarea
                    value={tempServiceDesc}
                    onChange={e => setTempServiceDesc(e.target.value)}
                    className="input-field text-sm resize-none mt-1"
                    placeholder={t('profile_service_hint')}
                    maxLength={500}
                    rows={3}
                  />
                  <span className="text-[10px] text-gray-400">{tempServiceDesc.length}/500</span>
                </div>

                <div className="border-t border-gray-100 dark:border-gray-700 pt-3 mt-2">
                  <label className="text-xs font-medium text-primary-600">{t('profile_service_loc')}</label>
                  <p className="text-[10px] text-gray-400 mb-2">{t('profile_service_loc_hint')}</p>
                  <input
                    type="text"
                    value={tempServiceAddress}
                    onChange={e => setTempServiceAddress(e.target.value)}
                    className="input-field text-sm"
                    placeholder={lang === 'en' ? 'e.g. Al-Malaz, Riyadh' : 'مثال: الملز، الرياض'}
                    maxLength={200}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!navigator.geolocation) { toast.error(lang === 'en' ? 'Location not supported' : 'الموقع غير مدعوم'); return }
                      navigator.geolocation.getCurrentPosition(
                        (pos) => {
                          setServiceLat(pos.coords.latitude)
                          setServiceLng(pos.coords.longitude)
                          toast.success(lang === 'en' ? 'Location captured' : 'تم تحديد الموقع')
                        },
                        () => toast.error(lang === 'en' ? 'Could not get location' : 'تعذر تحديد الموقع'),
                        { enableHighAccuracy: true }
                      )
                    }}
                    className="mt-2 w-full flex items-center justify-center gap-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl py-2.5 text-xs font-medium text-gray-600 dark:text-gray-300 active:scale-95 transition-transform"
                  >
                    <FiMapPin className="w-3.5 h-3.5" />
                    {serviceLat ? (lang === 'en' ? 'Update Location' : 'تحديث الموقع') : (lang === 'en' ? 'Use My Location' : 'استخدم موقعي')}
                  </button>
                  {serviceLat && serviceLng && (
                    <p className="text-[10px] text-green-600 mt-1">
                      {lang === 'en' ? 'Location set' : 'تم تحديد الموقع'} ({Number(serviceLat).toFixed(4)}, {Number(serviceLng).toFixed(4)})
                    </p>
                  )}
                </div>
              </>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditingBio(false)}
                className="flex-1 py-2 rounded-xl text-sm font-medium text-gray-500 bg-gray-50 dark:bg-gray-700">{t('profile_cancel')}</button>
              <button
                disabled={saving}
                onClick={async () => {
                  setSaving(true)
                  try {
                    const payload: Record<string, any> = { bio: tempBio }
                    if (isProvider) {
                      payload.serviceDescription = tempServiceDesc
                      payload.serviceAddress = tempServiceAddress
                      if (serviceLat && serviceLng) {
                        payload.serviceLat = serviceLat
                        payload.serviceLng = serviceLng
                      }
                    }
                    const res = await fetch('/api/profile', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload),
                    })
                    if (res.ok) {
                      setBio(tempBio)
                      setServiceDescription(tempServiceDesc)
                      setServiceAddress(tempServiceAddress)
                      setEditingBio(false)
                      toast.success(t('profile_save'))
                    } else {
                      const d = await res.json()
                      toast.error(d.error || 'Error')
                    }
                  } catch { toast.error('Error') }
                  finally { setSaving(false) }
                }}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-primary-600 disabled:opacity-50"
              >
                {saving ? t('profile_saving') : t('profile_save')}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setTempBio(bio); setTempServiceDesc(serviceDescription); setTempServiceAddress(serviceAddress); setEditingBio(true) }}
            className="w-full p-4 text-right"
          >
            {bio ? (
              <div>
                <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">{bio}</p>
                {isProvider && serviceDescription && (
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                    <p className="text-[10px] font-semibold text-primary-600 mb-1">{t('profile_service_desc')}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap">{serviceDescription}</p>
                  </div>
                )}
                {isProvider && serviceAddress && (
                  <div className="mt-2">
                    <p className="text-[10px] text-gray-400 flex items-center gap-1">
                      <FiMapPin className="w-3 h-3" /> {serviceAddress}
                    </p>
                  </div>
                )}
                <p className="text-[10px] text-primary-500 mt-2">{lang === 'en' ? 'Tap to edit' : 'اضغط للتعديل'}</p>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-gray-400">{t('profile_no_bio')}</p>
                <p className="text-xs text-primary-500 mt-1">{lang === 'en' ? 'Tap to add' : 'اضغط للإضافة'}</p>
              </div>
            )}
          </button>
        )}
      </div>
      </AccordionSection>

      {/* ═══ Service Catalog (providers only) ═══ */}
      {isProvider && (
        <div className="mx-4 mt-4">
          <Link href="/profile/catalog"
            className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 active:bg-gray-50 dark:active:bg-gray-700 transition-colors"
          >
            <span className="text-primary-600 dark:text-primary-400"><FiFileText className="w-4 h-4" /></span>
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex-1 text-start">{lang === 'en' ? 'My Catalog' : lang === 'ur' ? 'میرا کیٹلاگ' : 'الكتالوج'}</span>
            {lang === 'en' ? <FiChevronLeft className="w-4 h-4 text-gray-400 rotate-180" /> : <FiChevronLeft className="w-4 h-4 text-gray-400" />}
          </Link>
        </div>
      )}

      {/* ═══ Reputation ═══ */}
      <AccordionSection
        icon={<FiAward className="w-4 h-4" />}
        label={t('rep_title')}
        sectionKey="reputation"
        openSection={openSection}
        setOpenSection={setOpenSection}
      >
        <RepSection userId={user.id} reputation={user.reputation} lang={lang} t={t} />
      </AccordionSection>

      {/* ═══ Bookmarks ═══ */}
      <div data-tour="profile-bookmarks">
      <AccordionSection
        icon={<FiBookmark className="w-4 h-4" />}
        label={lang === 'en' ? 'Saved Posts' : 'المحفوظات'}
        sectionKey="bookmarks"
        openSection={openSection}
        setOpenSection={setOpenSection}
      >
        <BookmarkedPosts lang={lang} currentUserId={user.id} />
      </AccordionSection>
      </div>

      {/* ═══ Notifications ═══ */}
      <AccordionSection
        icon={<FiBell className="w-4 h-4" />}
        label={lang === 'en' ? 'Notifications' : lang === 'ur' ? 'اطلاعات' : 'الإشعارات'}
        sectionKey="notifications"
        openSection={openSection}
        setOpenSection={setOpenSection}
      >
      <div className="space-y-3">
        {/* ── Posts & Interactions ── */}
        <NotifGroup
          title={lang === 'en' ? 'Posts & Interactions' : lang === 'ur' ? 'پوسٹس اور ردعمل' : 'المنشورات والتفاعل'}
          items={[
            { key: 'notifyComments',   label: t('notif_comments_toggle'),  value: notifyComments,   set: setNotifyComments,   icon: '💬', desc: lang === 'en' ? 'When someone comments on your post' : lang === 'ur' ? 'جب کوئی تبصرہ کرے' : 'لما أحد يعلّق على منشورك' },
            { key: 'notifyReactions',  label: t('notif_reactions_toggle'), value: notifyReactions,  set: setNotifyReactions,  icon: '😊', desc: lang === 'en' ? 'When someone reacts to your post' : lang === 'ur' ? 'جب کوئی ردعمل دے' : 'لما أحد يتفاعل مع منشورك' },
            { key: 'notifyReplies',    label: t('notif_replies_toggle'),   value: notifyReplies,    set: setNotifyReplies,    icon: '↩️', desc: lang === 'en' ? 'When someone replies to your comment' : lang === 'ur' ? 'جب کوئی جواب دے' : 'لما أحد يرد على تعليقك' },
          ]}
          lang={lang}
          onToggle={toggleNotifPref}
        />

        {/* ── Messages & Chat ── */}
        <NotifGroup
          title={lang === 'en' ? 'Messages & Chat' : lang === 'ur' ? 'پیغامات اور چیٹ' : 'الرسائل والمحادثات'}
          items={[
            { key: 'notifyMessages', label: t('notif_messages_toggle'), value: notifyMessages, set: setNotifyMessages, icon: '✉️', desc: lang === 'en' ? 'Private messages from neighbors' : lang === 'ur' ? 'پڑوسیوں کے نجی پیغامات' : 'الرسائل الخاصة من الجيران' },
          ]}
          lang={lang}
          onToggle={toggleNotifPref}
        />

        {/* ── Rides ── */}
        <NotifGroup
          title={lang === 'en' ? 'Rides' : lang === 'ur' ? 'سواریاں' : 'المشاوير'}
          items={[
            { key: 'notifyRides', label: t('notif_rides_toggle'), value: notifyRides, set: setNotifyRides, icon: '🚗', desc: lang === 'en' ? 'Offers, status changes, arrivals' : lang === 'ur' ? 'پیشکشیں، حالت، آمد' : 'العروض، تحديثات الحالة، الوصول' },
          ]}
          lang={lang}
          onToggle={toggleNotifPref}
        />

        {/* ── Neighborhood & System ── */}
        <NotifGroup
          title={lang === 'en' ? 'Neighborhood & System' : lang === 'ur' ? 'محلہ اور سسٹم' : 'الحي والنظام'}
          items={[
            { key: 'notifyLookingFor', label: t('notif_looking_toggle'),  value: notifyLookingFor, set: setNotifyLookingFor, icon: '🔎', desc: lang === 'en' ? 'When someone needs help nearby' : lang === 'ur' ? 'جب قریب مدد مانگی جائے' : 'لما أحد يطلب مساعدة في حيّك' },
            { key: 'notifySystem',     label: t('notif_system_toggle'),   value: notifySystem,     set: setNotifySystem,     icon: '🔔', desc: lang === 'en' ? 'Important updates and announcements' : lang === 'ur' ? 'اہم اپ ڈیٹس اور اعلانات' : 'تحديثات وإعلانات مهمة' },
          ]}
          lang={lang}
          onToggle={toggleNotifPref}
        />
      </div>

      </AccordionSection>

      {/* ═══ Settings ═══ */}
      <AccordionSection
        icon={<FiSettings className="w-4 h-4" />}
        label={t('profile_settings')}
        sectionKey="settings"
        openSection={openSection}
        setOpenSection={setOpenSection}
      >
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-700 overflow-hidden">
        {/* Language */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-gray-400"><FiGlobe /></span>
            <span className="text-gray-700 text-sm font-medium flex-1">{t('profile_language')}</span>
          </div>
          <div className="flex gap-2">
            {([
              { key: 'ar' as Language, label: 'العربية' },
              { key: 'en' as Language, label: 'English' },
              { key: 'ur' as Language, label: 'اردو' },
            ]).map(l => (
              <button
                key={l.key}
                onClick={() => applyLanguage(l.key)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${
                  language === l.key
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {/* Theme */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-gray-400"><FiSun /></span>
            <span className="text-gray-700 text-sm font-medium flex-1">{t('profile_appearance')}</span>
          </div>
          <div className="flex gap-2">
            {([
              { value: 'light',  label: t('profile_light'),  icon: <FiSun className="w-3.5 h-3.5" /> },
              { value: 'dark',   label: t('profile_dark'),   icon: <FiMoon className="w-3.5 h-3.5" /> },
              { value: 'system', label: t('profile_system'), icon: <FiMonitor className="w-3.5 h-3.5" /> },
            ] as { value: Theme; label: string; icon: React.ReactNode }[]).map(opt => (
              <button
                key={opt.value}
                onClick={() => applyTheme(opt.value)}
                className={`flex-1 py-2 rounded-xl text-xs font-medium border flex items-center justify-center gap-1 transition-all ${
                  theme === opt.value
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'border-gray-200 text-gray-600'
                }`}
              >
                {opt.icon}{opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sounds toggle */}
        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center gap-3">
          <span className="text-gray-400">{soundsOn ? <FiVolume2 /> : <FiVolumeX />}</span>
          <span className="text-gray-700 dark:text-gray-300 text-sm font-medium flex-1">{t('profile_sounds')}</span>
          <button
            onClick={() => {
              const next = !soundsOn
              setSoundsOn(next)
              setSoundsEnabled(next)
              if (next) playTap()
            }}
            role="switch"
            aria-checked={soundsOn}
            className={`w-11 h-6 rounded-full relative transition-colors ${soundsOn ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${soundsOn ? 'left-5' : 'left-0.5'}`} />
          </button>
        </div>

        {/* Vibration toggle */}
        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center gap-3">
          <span className="text-gray-400">📳</span>
          <span className="text-gray-700 dark:text-gray-300 text-sm font-medium flex-1">{t('profile_vibration')}</span>
          <button
            onClick={() => {
              const next = !hapticsOn
              setHapticsOn(next)
              setHapticsEnabled(next)
              if (next) hapticMedium()
            }}
            role="switch"
            aria-checked={hapticsOn}
            className={`w-11 h-6 rounded-full relative transition-colors ${hapticsOn ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${hapticsOn ? 'left-5' : 'left-0.5'}`} />
          </button>
        </div>
      </div>

      </AccordionSection>

      {/* ═══ Privacy ═══ */}
      <div data-tour="profile-privacy">
      <AccordionSection
        icon={<FiShield className="w-4 h-4" />}
        label={lang === 'en' ? 'Privacy' : lang === 'ur' ? 'رازداری' : 'الخصوصية'}
        sectionKey="privacy"
        openSection={openSection}
        setOpenSection={setOpenSection}
      >
        <PrivacySettings lang={lang} />
      </AccordionSection>
      </div>

      {/* ═══ Invite / Share App ═══ */}
      <div data-tour="profile-invite">
      <AccordionSection
        icon={<FiShare2 className="w-4 h-4" />}
        label={lang === 'en' ? 'Invite Neighbors' : 'ادعُ جيرانك'}
        sectionKey="invite"
        openSection={openSection}
        setOpenSection={setOpenSection}
      >
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 text-center">
          <div className="w-14 h-14 bg-primary-50 dark:bg-primary-900/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <FiShare2 className="w-6 h-6 text-primary-600" />
          </div>
          <p className="text-sm font-semibold text-gray-800 dark:text-white mb-1">
            {lang === 'en' ? 'Share Hai with your neighbors' : 'شارك حي مع أهل حيّك'}
          </p>
          <p className="text-xs text-gray-400 mb-4">hai-app.net</p>
          <button
            onClick={async () => {
              const url = 'https://hai-app.net'
              const text = lang === 'en'
                ? '🏘️ Join Hai — connect with your neighbors! Find services, share alerts, and build your community.'
                : '🏘️ انضم لتطبيق حي — تواصل مع جيرانك! خدمات، تنبيهات، سوق، ومشاوير في حيّك.'
              if (navigator.share) {
                try { await navigator.share({ title: 'حي | Hai', text, url }) } catch { /* cancelled */ }
              } else {
                await navigator.clipboard?.writeText(`${text}\n${url}`)
                toast.success(lang === 'en' ? 'Link copied!' : 'تم نسخ الرابط!')
              }
            }}
            className="w-full py-3 bg-primary-600 text-white font-semibold text-sm rounded-xl active:scale-95 transition-transform glow-primary"
          >
            {lang === 'en' ? 'Share App Link' : 'مشاركة رابط التطبيق'}
          </button>
        </div>
      </AccordionSection>
      </div>

      {/* ═══ Help & More ═══ */}
      <AccordionSection
        icon={<FiHelpCircle className="w-4 h-4" />}
        label={lang === 'en' ? 'Help & More' : lang === 'ur' ? 'مدد اور مزید' : 'المساعدة والمزيد'}
        sectionKey="help"
        openSection={openSection}
        setOpenSection={setOpenSection}
      >
      <div className="space-y-2">
      {/* Mod request — only for eligible RESIDENT users */}
      {user.role === 'RESIDENT' && user.neighborhood && user.reputation >= 20 && Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86400000) >= 7 && (
        <div>
          {modRequestStatus === 'pending' ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl py-3 px-4 flex items-center gap-2">
              <span className="text-amber-500">⏳</span>
              <span className="text-sm text-amber-700 font-medium">{t('mod_request_pending')}</span>
            </div>
          ) : modRequestStatus === 'approved' ? (
            <div className="bg-green-50 border border-green-200 rounded-xl py-3 px-4 flex items-center gap-2">
              <span className="text-green-500">✅</span>
              <span className="text-sm text-green-700 font-medium">{t('mod_request_approved')}</span>
            </div>
          ) : modRequestStatus === 'rejected' ? (
            <div className="space-y-2">
              <div className="bg-red-50 border border-red-200 rounded-xl py-3 px-4 flex items-center gap-2">
                <span className="text-red-500">❌</span>
                <span className="text-sm text-red-700 font-medium">{t('mod_request_rejected')}</span>
              </div>
              <button
                onClick={() => { setModRequestStatus(null); setShowModForm(false) }}
                className="text-xs text-primary-600 font-medium px-4"
              >{t('mod_request_btn')}</button>
            </div>
          ) : showModForm ? (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{t('mod_request_title')}</p>
              <div className="text-xs text-gray-500 space-y-1">
                <p>• {t('mod_request_req_days')}</p>
                <p>• {t('mod_request_req_rep')}</p>
              </div>
              <textarea
                value={modReason}
                onChange={e => setModReason(e.target.value)}
                placeholder={t('mod_request_reason')}
                className="w-full border border-gray-200 dark:border-gray-600 rounded-xl p-3 text-sm bg-transparent text-gray-900 dark:text-white resize-none"
                rows={3}
                maxLength={500}
              />
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    setModRequestLoading(true)
                    try {
                      const res = await fetch('/api/mod-request', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ reason: modReason }),
                      })
                      const data = await res.json()
                      if (res.ok) {
                        setModRequestStatus('pending')
                        toast.success(t('mod_request_pending'))
                        setShowModForm(false)
                      } else {
                        toast.error(data.error)
                      }
                    } catch { toast.error('Error') }
                    finally { setModRequestLoading(false) }
                  }}
                  disabled={modRequestLoading || modReason.trim().length < 10}
                  className="flex-1 bg-primary-600 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50"
                >{modRequestLoading ? '...' : t('mod_request_submit')}</button>
                <button
                  onClick={() => setShowModForm(false)}
                  className="px-4 py-2.5 text-sm text-gray-500 font-medium"
                >{t('mod_request_cancel')}</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowModForm(true)}
              className="w-full bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 rounded-xl py-3 px-4 flex items-center gap-2 active:bg-blue-100 dark:active:bg-blue-900/50 transition-colors"
            >
              <FiStar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm text-blue-700 dark:text-blue-300 font-medium flex-1 text-start">{t('mod_request_desc')}</span>
              <FiChevronLeft className="w-4 h-4 text-blue-300 dark:text-blue-500" />
            </button>
          )}
        </div>
      )}

      {/* Terms & Privacy */}
      <div className="flex gap-2">
        <button onClick={() => router.push('/terms')}
          className="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl py-3 px-3 text-center active:bg-gray-100 dark:active:bg-gray-700 transition-colors">
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
            {lang === 'en' ? 'Terms of Use' : lang === 'ur' ? 'استعمال کی شرائط' : 'شروط الاستخدام'}
          </span>
        </button>
        <button onClick={() => router.push('/privacy')}
          className="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl py-3 px-3 text-center active:bg-gray-100 dark:active:bg-gray-700 transition-colors">
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
            {lang === 'en' ? 'Privacy Policy' : lang === 'ur' ? 'رازداری کی پالیسی' : 'سياسة الخصوصية'}
          </span>
        </button>
      </div>

      {/* How to use */}
      <div>
        <button
          onClick={() => window.location.href = '/tutorial'}
          className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl py-3 px-4 flex items-center gap-2 active:bg-gray-100 dark:active:bg-gray-700 transition-colors"
        >
          <span className="text-lg">📖</span>
          <span className="text-sm text-gray-600 dark:text-gray-300 font-medium flex-1 text-start">
            {lang === 'en' ? 'How to use the app' : lang === 'ur' ? 'ایپ کیسے استعمال کریں' : 'كيف تستخدم التطبيق'}
          </span>
        </button>
      </div>

      {/* Contact & Support */}
      <div className="space-y-2">
        {/* Neighborhood reports — only for regular residents */}
        {user.role === 'RESIDENT' && (
          <button
            onClick={() => router.push('/neighborhood-reports')}
            className="w-full bg-green-50 dark:bg-green-900/30 border border-green-100 dark:border-green-800 rounded-xl py-3 px-4 flex items-center gap-3 active:bg-green-100 dark:active:bg-green-900/50 transition-colors"
          >
            <span className="text-lg">📋</span>
            <div className="flex-1 text-start">
              <span className="text-sm text-green-700 dark:text-green-300 font-medium block">{t('contact_admin')}</span>
              <span className="text-[10px] text-green-500 dark:text-green-400">{lang === 'en' ? 'Report or suggestion to admin' : lang === 'ur' ? 'منتظم کو رپورٹ یا تجویز' : 'بلاغ أو اقتراح لمشرف الحي'}</span>
            </div>
            <FiChevronLeft className="w-4 h-4 text-green-300 dark:text-green-500" />
          </button>
        )}

        {/* App support — for everyone except super admin */}
        {user.role !== 'SUPER_ADMIN' && (
          <button
            onClick={() => router.push('/support')}
            className="w-full bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 rounded-xl py-3 px-4 flex items-center gap-3 active:bg-blue-100 dark:active:bg-blue-900/50 transition-colors"
          >
            <span className="text-lg">🛟</span>
            <div className="flex-1 text-start">
              <span className="text-sm text-blue-700 dark:text-blue-300 font-medium block">{t('support_title')}</span>
              <span className="text-[10px] text-blue-500 dark:text-blue-400">{lang === 'en' ? 'Technical issue or app suggestion' : lang === 'ur' ? 'تکنیکی مسئلہ یا ایپ کی تجویز' : 'مشكلة تقنية أو اقتراح للتطبيق'}</span>
            </div>
            <FiChevronLeft className="w-4 h-4 text-blue-300 dark:text-blue-500" />
          </button>
        )}
      </div>
      </div>
      </AccordionSection>

      {/* ═══ Mod Dashboard Link ═══ */}
      {['NEIGHBORHOOD_MOD', 'PLATFORM_MOD', 'SUPER_ADMIN'].includes(user.role) && (
        <Link href="/mod"
          className="flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl mx-4 mt-4 px-4 py-3.5 active:bg-amber-100 transition-colors"
        >
          <span className="text-xl">🏅</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{lang === 'en' ? 'Mod Dashboard' : lang === 'ur' ? 'ناظم ڈیش بورڈ' : 'لوحة المشرف'}</p>
            <p className="text-[11px] text-amber-600 dark:text-amber-400 truncate">{lang === 'en' ? 'Reports, hidden posts, bans' : lang === 'ur' ? 'رپورٹس، پوشیدہ پوسٹس، پابندیاں' : 'البلاغات، المنشورات المخفية، الحظر'}</p>
          </div>
          {lang === 'en' ? <FiChevronLeft className="w-4 h-4 text-amber-400 rotate-180 flex-shrink-0" /> : <FiChevronLeft className="w-4 h-4 text-amber-400 flex-shrink-0" />}
        </Link>
      )}

      {/* Admin panel link — only for admin roles */}
      {['SUPER_ADMIN', 'PLATFORM_MOD', 'NEIGHBORHOOD_MOD'].includes(user.role) && (
        <div className="mx-4 mt-4">
          <button
            onClick={() => router.push('/admin')}
            className="w-full bg-primary-50 dark:bg-primary-900/30 border border-primary-100 dark:border-primary-800 rounded-xl py-3 px-4 flex items-center gap-2 active:bg-primary-100 dark:active:bg-primary-900/50 transition-colors"
          >
            <FiShield className="w-4 h-4 text-primary-600 dark:text-primary-400" />
            <span className="text-sm text-primary-700 dark:text-primary-300 font-medium flex-1 text-start">{t('admin_title')}</span>
            <FiChevronLeft className="w-4 h-4 text-primary-300 dark:text-primary-500" />
          </button>
        </div>
      )}

      {/* Logout */}
      <div className="mx-4 mt-4">
        <button
          onClick={handleLogout}
          className="w-full bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 rounded-xl py-3 px-4 text-right font-medium text-red-600 dark:text-red-400 flex items-center gap-2"
        >
          <FiLogOut className="w-4 h-4" />
          <span>{t('profile_logout')}</span>
        </button>
      </div>

      {/* Delete Account */}
      <div className="mx-4 mt-3 mb-8" id="delete-account">
        <button
          onClick={async () => {
            const msg = lang === 'en'
              ? 'Are you sure you want to delete your account? This cannot be undone.'
              : 'هل أنت متأكد من حذف حسابك؟ لا يمكن التراجع عن هذا الإجراء.'
            if (!confirm(msg)) return
            const msg2 = lang === 'en' ? 'Type DELETE to confirm' : 'اكتب حذف للتأكيد'
            const input = prompt(msg2)
            if (input === null) return // user cancelled
            if (input !== 'DELETE' && input !== 'حذف') {
              toast.error(lang === 'en' ? 'Incorrect confirmation text. Type DELETE or حذف' : 'نص التأكيد غير صحيح. اكتب حذف أو DELETE')
              return
            }
            try {
              const res = await fetch('/api/account/delete', { method: 'DELETE' })
              if (res.ok) {
                await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
                try { localStorage.clear() } catch {}
                try { sessionStorage.clear() } catch {}
                window.location.href = '/'
              } else {
                const d = await res.json()
                toast.error(d.error || 'Error')
              }
            } catch { toast.error('Error') }
          }}
          className="w-full text-center text-xs text-red-400 py-2"
        >
          {lang === 'en' ? 'Delete Account' : lang === 'ur' ? 'اکاؤنٹ حذف کریں' : 'حذف الحساب'}
        </button>
      </div>

      {/* Cover Picker Modal */}
      {showCoverPicker && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={() => setShowCoverPicker(false)} />
          <div className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto z-50 bg-white dark:bg-gray-800 rounded-t-3xl shadow-2xl" style={{ maxHeight: '65vh' }}>
            <div className="px-5 pt-3 pb-6">
              <div className="w-10 h-1 bg-gray-200 dark:bg-gray-600 rounded-full mx-auto mb-4" />
              <h3 className="font-bold text-gray-900 dark:text-white text-center mb-4">
                {lang === 'en' ? 'Choose Cover' : 'اختر غلاف'}
              </h3>

              {/* Upload option */}
              <button
                onClick={() => coverInputRef.current?.click()}
                className="w-full flex items-center gap-3 bg-gray-50 dark:bg-gray-700 rounded-2xl p-4 mb-4 active:scale-[0.98] transition-transform border border-gray-200 dark:border-gray-600"
              >
                <div className="w-10 h-10 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <FiUpload className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                </div>
                <div className="text-right flex-1">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {lang === 'en' ? 'Upload Image' : 'ارفع صورة'}
                  </p>
                  <p className="text-xs text-gray-400">{lang === 'en' ? 'Custom cover photo' : 'صورة غلاف مخصصة'}</p>
                </div>
              </button>

              {/* Built-in gradients */}
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
                {lang === 'en' ? 'Gradients' : 'تدرجات'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {DEFAULT_COVERS.map(c => (
                  <button
                    key={c.id}
                    onClick={() => selectBuiltInCover(c.css)}
                    className={`h-16 rounded-xl overflow-hidden border-2 transition-all active:scale-95 relative ${
                      cover === c.css ? 'border-primary-500 shadow-lg' : 'border-gray-200 dark:border-gray-600'
                    }`}
                    style={{ background: c.css }}
                  >
                    <span className="absolute bottom-1 right-2 text-[10px] font-medium text-white/80 drop-shadow">
                      {lang === 'en' ? c.nameEn : c.nameAr}
                    </span>
                    {cover === c.css && (
                      <div className="absolute top-1 left-1 w-4 h-4 bg-primary-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-[8px] font-bold">✓</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Avatar Picker Modal */}
      {showAvatarPicker && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={() => setShowAvatarPicker(false)} />
          <div className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto z-50 bg-white dark:bg-gray-800 rounded-t-3xl shadow-2xl" style={{ maxHeight: '75vh' }}>
            <div className="px-5 pt-3 pb-6">
              <div className="w-10 h-1 bg-gray-200 dark:bg-gray-600 rounded-full mx-auto mb-4" />
              <h3 className="font-bold text-gray-900 dark:text-white text-center mb-4">
                {lang === 'en' ? 'Choose Avatar' : 'اختر صورة'}
              </h3>

              {/* Upload option */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center gap-3 bg-primary-50 dark:bg-primary-900/20 rounded-2xl p-4 mb-4 active:scale-[0.98] transition-transform border border-primary-100 dark:border-primary-800"
              >
                <div className="w-12 h-12 bg-primary-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <FiUpload className="w-5 h-5 text-white" />
                </div>
                <div className="text-right flex-1">
                  <p className="text-sm font-semibold text-primary-800 dark:text-primary-300">
                    {lang === 'en' ? 'Upload Photo' : 'ارفع صورة'}
                  </p>
                  <p className="text-xs text-primary-600/60 dark:text-primary-400/60">
                    {lang === 'en' ? 'From your gallery or camera' : 'من المعرض أو الكاميرا'}
                  </p>
                </div>
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                <span className="text-xs text-gray-400">{lang === 'en' ? 'or choose' : 'أو اختر'}</span>
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
              </div>

              {/* Built-in avatars */}
              <div className="overflow-y-auto" style={{ maxHeight: '40vh' }}>
                {AVATAR_CATEGORIES.map(cat => (
                  <div key={cat.key} className="mb-4">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
                      {lang === 'en' ? cat.labelEn : cat.labelAr}
                    </p>
                    <div className="grid grid-cols-4 gap-3">
                      {DEFAULT_AVATARS.filter(a => a.category === cat.key).map(av => (
                        <button
                          key={av.id}
                          onClick={() => selectBuiltInAvatar(av.url)}
                          className={`w-full aspect-square rounded-full overflow-hidden border-2 transition-all active:scale-90 ${
                            avatar === av.url ? 'border-primary-500 shadow-lg shadow-primary-500/20' : 'border-transparent'
                          }`}
                        >
                          <img src={av.url} alt="" className="w-full h-full object-cover bg-gray-100 dark:bg-gray-700" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      <BottomNav active="profile" />
    </div>
  )
}

function BookmarkedPosts({ lang, currentUserId }: { lang: string; currentUserId: string }) {
  const [posts, setPosts] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'newest' | 'popular'>('newest')
  const [showAll, setShowAll] = useState(false)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/bookmarks')
      .then(r => r.json())
      .then(d => { setPosts(Array.isArray(d) ? d : []); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [])

  async function removeBookmark(postId: string) {
    try {
      const res = await fetch(`/api/posts/${postId}/bookmark`, { method: 'POST' })
      if (res.ok) setPosts(prev => prev.filter(p => p.id !== postId))
    } catch { /* ignore */ }
  }

  if (!loaded) return <div className="py-4 text-center text-gray-400 text-sm">...</div>

  if (posts.length === 0) {
    return (
      <div className="text-center py-8">
        <FiBookmark className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
        <p className="text-sm text-gray-400">{lang === 'en' ? 'No saved posts yet' : 'لا توجد منشورات محفوظة'}</p>
      </div>
    )
  }

  // Filter + sort
  const filtered = posts
    .filter(p => !search || p.title?.includes(search) || p.body?.includes(search) || p.author?.name?.includes(search))
    .sort((a, b) => {
      if (sortBy === 'popular') {
        const scoreA = (a._count?.reactions || 0) + (a._count?.comments || 0) * 2
        const scoreB = (b._count?.reactions || 0) + (b._count?.comments || 0) * 2
        return scoreB - scoreA
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

  const preview = filtered.slice(0, 3)

  function BookmarkCard({ post }: { post: any }) {
    return (
      <div className="bg-white dark:bg-gray-800/60 rounded-xl p-3 border border-gray-100 dark:border-white/[0.06]">
        <div className="flex items-start gap-2.5">
          {post.author?.avatarUrl ? (
            <img src={post.author.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {post.author?.name?.[0] || '؟'}
            </div>
          )}
          <button onClick={() => router.push('/feed')} className="flex-1 min-w-0 text-right">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-200">{post.author?.name}</span>
              <span className="text-[10px] text-gray-400">
                {new Date(post.createdAt).toLocaleDateString(lang === 'en' ? 'en' : 'ar-SA', { month: 'short', day: 'numeric' })}
              </span>
              {post.isArchived && (
                <span className="text-[9px] bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-300 px-1.5 py-0.5 rounded-full">
                  {lang === 'en' ? 'Archived' : 'مؤرشف'}
                </span>
              )}
            </div>
            <p className={`text-[13px] font-medium line-clamp-1 ${post.isArchived ? 'text-gray-400' : 'text-gray-900 dark:text-white'}`}>{post.title}</p>
            <p className="text-[12px] text-gray-500 dark:text-gray-400 line-clamp-1 leading-relaxed">{post.body}</p>
            <div className="flex items-center gap-3 mt-1">
              {post._count?.reactions > 0 && <span className="text-[11px] text-gray-400">❤️ {post._count.reactions}</span>}
              {post._count?.comments > 0 && <span className="text-[11px] text-gray-400">💬 {post._count.comments}</span>}
            </div>
          </button>
          <button onClick={() => removeBookmark(post.id)}
            className="p-2 rounded-lg text-primary-600 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-colors flex-shrink-0">
            <FiBookmark className="w-4 h-4 fill-current" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Preview — max 3 posts */}
      <div className="space-y-2">
        {preview.map((post: any) => <BookmarkCard key={post.id} post={post} />)}
        {posts.length > 3 && (
          <button onClick={() => setShowAll(true)}
            className="w-full py-2.5 text-center text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/10 rounded-xl transition-colors">
            {lang === 'en' ? `View all (${posts.length})` : `عرض الكل (${posts.length})`}
          </button>
        )}
      </div>

      {/* Full-screen sheet */}
      {showAll && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={() => setShowAll(false)} />
          <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col max-w-[480px] mx-auto">
            {/* Header */}
            <div className="glass px-4 py-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {lang === 'en' ? 'Saved Posts' : 'المحفوظات'}
                <span className="text-sm text-gray-400 font-normal mr-2"> ({posts.length})</span>
              </h2>
              <button onClick={() => setShowAll(false)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10">
                <FiX className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Search + Sort */}
            <div className="flex items-center gap-2 px-4 py-3">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={lang === 'en' ? 'Search saved...' : 'ابحث في المحفوظات...'}
                className="flex-1 bg-gray-100 dark:bg-white/10 border border-gray-200 dark:border-white/15 rounded-xl px-3 py-2 text-sm text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400/50"
              />
              <button
                onClick={() => setSortBy(s => s === 'newest' ? 'popular' : 'newest')}
                className={`px-3 py-2 rounded-xl text-xs font-medium border whitespace-nowrap transition-colors ${
                  sortBy === 'popular'
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-gray-100 dark:bg-white/10 text-gray-500 border-gray-200 dark:border-white/15'
                }`}
              >
                {sortBy === 'newest' ? (lang === 'en' ? 'Newest' : 'الأحدث') : (lang === 'en' ? 'Popular' : 'الأكثر تفاعلاً')}
              </button>
            </div>

            {/* Posts list */}
            <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-2">
              {filtered.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">{lang === 'en' ? 'No results' : 'لا توجد نتائج'}</p>
              ) : (
                filtered.map((post: any) => <BookmarkCard key={post.id} post={post} />)
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}

function PrivacySettings({ lang }: { lang: string }) {
  const [showLastSeen, setShowLastSeen] = useState(true)
  const [showReadReceipts, setShowReadReceipts] = useState(true)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/users/privacy')
      .then(r => r.json())
      .then(d => {
        setShowLastSeen(d.showLastSeen ?? true)
        setShowReadReceipts(d.showReadReceipts ?? true)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  async function toggle(key: 'showLastSeen' | 'showReadReceipts', value: boolean) {
    if (key === 'showLastSeen') setShowLastSeen(value)
    else setShowReadReceipts(value)
    await fetch('/api/users/privacy', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    })
  }

  if (!loaded) return <div className="py-4 text-center text-gray-400 text-sm">...</div>

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-700 overflow-hidden">
      {/* Last Seen */}
      <div className="px-4 py-3.5 flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-800 dark:text-white">
            {lang === 'en' ? 'Last Seen & Online' : 'آخر ظهور ومتصل'}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {lang === 'en'
              ? 'If off, you can\'t see others\' status either'
              : 'إذا أوقفته، لن تتمكن من رؤية حالة الآخرين أيضاً'}
          </p>
        </div>
        <button
          onClick={() => toggle('showLastSeen', !showLastSeen)}
          className={`w-11 h-6 rounded-full transition-colors relative ${showLastSeen ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
        >
          <div className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-all ${showLastSeen ? 'right-0.5' : 'left-0.5'}`} />
        </button>
      </div>

      {/* Read Receipts */}
      <div className="px-4 py-3.5 flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-800 dark:text-white">
            {lang === 'en' ? 'Read Receipts' : 'إيصالات القراءة'}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {lang === 'en'
              ? 'If off, you can\'t see blue checks on your messages either'
              : 'إذا أوقفته، لن ترى العلامات الزرقاء على رسائلك أيضاً'}
          </p>
        </div>
        <button
          onClick={() => toggle('showReadReceipts', !showReadReceipts)}
          className={`w-11 h-6 rounded-full transition-colors relative ${showReadReceipts ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
        >
          <div className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-all ${showReadReceipts ? 'right-0.5' : 'left-0.5'}`} />
        </button>
      </div>
    </div>
  )
}

function AccordionSection({
  icon, label, sectionKey, openSection, setOpenSection, children
}: {
  icon: React.ReactNode
  label: string
  sectionKey: string
  openSection: string | null
  setOpenSection: (s: string | null) => void
  children: React.ReactNode
}) {
  const isOpen = openSection === sectionKey
  return (
    <div className="mx-4 mt-4">
      <button
        onClick={() => setOpenSection(isOpen ? null : sectionKey)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 active:bg-gray-50 dark:active:bg-gray-700 transition-colors"
      >
        <span className="text-primary-600 dark:text-primary-400">{icon}</span>
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex-1 text-start">{label}</span>
        <FiChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="mt-2 animate-fade-in-up">
          {children}
        </div>
      )}
    </div>
  )
}

function SettingRow({
  icon, label, value, onTap, badge, valueMuted, verifiedLabel, unverifiedLabel
}: {
  icon: React.ReactNode
  label: string
  value: string
  onTap?: () => void
  badge?: 'verified' | 'unverified'
  valueMuted?: boolean
  verifiedLabel?: string
  unverifiedLabel?: string
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3.5 ${onTap ? 'cursor-pointer active:bg-gray-50' : ''}`}
      onClick={onTap}
    >
      <span className="text-gray-400 w-4 flex-shrink-0">{icon}</span>
      <span className="text-gray-500 text-sm flex-shrink-0">{label}</span>
      <span className="flex-1" />
      <div className="flex items-center gap-1.5">
        {badge === 'verified' && (
          <span className="bg-green-100 text-green-600 text-[10px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
            <FiCheck className="w-2.5 h-2.5" />{verifiedLabel ?? 'محقق'}
          </span>
        )}
        {badge === 'unverified' && (
          <span className="bg-amber-100 text-amber-600 text-[10px] font-medium px-1.5 py-0.5 rounded-full">
            {unverifiedLabel ?? 'غير محقق'}
          </span>
        )}
        <span className={`text-sm font-medium ${valueMuted ? 'text-gray-400' : 'text-gray-800'}`}>
          {value}
        </span>
      </div>
      {onTap && <FiChevronLeft className="text-gray-300 dark:text-slate-600 w-4 h-4 flex-shrink-0" />}
    </div>
  )
}

// ── Reputation Section ──────────────────────────────────────────────────────

import { getRepLevel } from '@/lib/reputation-levels'
import type { TranslationKey } from '@/lib/i18n'

// Action labels with singular/plural Arabic support
const ACTION_LABELS: Record<string, { ar: string; arPlural: string; en: string; enPlural: string; ur: string; urPlural: string }> = {
  ride_completed:         { ar: 'أتممت مشوار',              arPlural: 'أتممت {n} مشاوير',            en: 'Completed a ride',      enPlural: 'Completed {n} rides',     ur: 'سواری مکمل کی',           urPlural: '{n} سواریاں مکمل کیں' },
  ride_rated:             { ar: 'حصلت على تقييم مشوار',     arPlural: 'حصلت على {n} تقييمات مشاوير', en: 'Ride rating received',  enPlural: '{n} ride ratings',        ur: 'سواری کی درجہ بندی ملی',  urPlural: '{n} سواری درجہ بندیاں' },
  ride_cancel:            { ar: 'إلغاء مشوار',              arPlural: '{n} إلغاءات مشاوير',          en: 'Ride cancelled',        enPlural: '{n} ride cancellations',  ur: 'سواری منسوخ',             urPlural: '{n} سواری منسوخیاں' },
  ride_noshow:            { ar: 'عدم حضور',                 arPlural: '{n} حالات عدم حضور',          en: 'No-show',               enPlural: '{n} no-shows',            ur: 'غیر حاضری',              urPlural: '{n} غیر حاضریاں' },
  ride_requested:         { ar: 'طلب مشوار مكتمل',          arPlural: '{n} مشاوير مكتملة',           en: 'Ride request completed', enPlural: '{n} rides completed',    ur: 'سواری درخواست مکمل',      urPlural: '{n} سواریاں مکمل' },
  cancel_after_agreement: { ar: 'إلغاء بعد الاتفاق',       arPlural: '{n} إلغاءات بعد الاتفاق',     en: 'Cancelled after agreement', enPlural: '{n} cancellations',  ur: 'معاہدے کے بعد منسوخی',    urPlural: '{n} منسوخیاں' },
  service_completed:      { ar: 'أتممت خدمة',               arPlural: 'أتممت {n} خدمات',             en: 'Completed a service',   enPlural: 'Completed {n} services',  ur: 'خدمت مکمل کی',           urPlural: '{n} خدمات مکمل' },
  positive_rating:        { ar: 'حصلت على تقييم ممتاز',     arPlural: 'حصلت على {n} تقييمات',        en: 'Great rating received', enPlural: '{n} great ratings',       ur: 'بہترین درجہ بندی ملی',    urPlural: '{n} بہترین درجہ بندیاں' },
  negative_rating:        { ar: 'حصلت على تقييم سلبي',      arPlural: 'حصلت على {n} تقييمات سلبية',  en: 'Negative rating',       enPlural: '{n} negative ratings',    ur: 'منفی درجہ بندی',          urPlural: '{n} منفی درجہ بندیاں' },
  reaction_received:      { ar: 'أعجب أحدهم بمنشورك',       arPlural: 'أعجب {n} بمنشوراتك',          en: 'Post liked',            enPlural: '{n} post likes',          ur: 'پوسٹ پسند کی گئی',       urPlural: '{n} پوسٹ پسندیدگیاں' },
  comment_engaged:        { ar: 'أعجب أحدهم بتعليقك',       arPlural: '{n} إعجابات بتعليقاتك',       en: 'Comment liked',         enPlural: '{n} comment likes',       ur: 'تبصرہ پسند کیا گیا',     urPlural: '{n} تبصرہ پسندیدگیاں' },
  report_confirmed:       { ar: 'تم تأكيد بلاغ',            arPlural: 'تم تأكيد {n} بلاغات',         en: 'Report confirmed',      enPlural: '{n} reports confirmed',   ur: 'رپورٹ تصدیق شدہ',        urPlural: '{n} رپورٹیں تصدیق شدہ' },
}

const LEVELS = [
  { key: 'new',     min: 0,   next: 50,  emoji: '●', dotColor: 'text-gray-300',  ar: 'جديد',      en: 'New',              ur: 'نیا' },
  { key: 'active',  min: 50,  next: 150, emoji: '●', dotColor: 'text-blue-500',  ar: 'نشط',      en: 'Active',           ur: 'سرگرم' },
  { key: 'trusted', min: 150, next: 400, emoji: '●', dotColor: 'text-green-500', ar: 'موثوق',     en: 'Trusted',          ur: 'قابل اعتماد' },
  { key: 'top',     min: 400, next: null, emoji: '●', dotColor: 'text-amber-500', ar: 'عضو مميز', en: 'Distinguished', ur: 'ممتاز رکن' },
]

function groupRecent(items: { action: string; points: number }[]): { action: string; totalPoints: number; count: number }[] {
  const map = new Map<string, { totalPoints: number; count: number }>()
  for (const item of items) {
    const existing = map.get(item.action)
    if (existing) {
      existing.totalPoints += item.points
      existing.count++
    } else {
      map.set(item.action, { totalPoints: item.points, count: 1 })
    }
  }
  return Array.from(map.entries()).map(([action, v]) => ({ action, ...v })).slice(0, 3)
}

/** Arabic pluralization: 1=singular, 2=dual, 3+=plural */
function arPlural(n: number, one: string, two: string, many: string): string {
  if (n === 1) return one
  if (n === 2) return two
  return many.replace('{n}', String(n))
}

function NotifGroup({ title, items, lang, onToggle }: {
  title: string
  items: { key: string; label: string; value: boolean; set: (v: boolean) => void; icon: string; desc: string }[]
  lang: string
  onToggle: (key: string, value: boolean) => void
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="px-4 pt-3 pb-1">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{title}</p>
      </div>
      {items.map((item, i) => (
        <div key={item.key} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-gray-50 dark:border-gray-700' : ''}`}>
          <span className="text-base w-6 text-center flex-shrink-0">{item.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{item.label}</p>
            <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{item.desc}</p>
          </div>
          <button
            onClick={() => { const next = !item.value; item.set(next); onToggle(item.key, next) }}
            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
              item.value ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              item.value
                ? (lang === 'ar' ? 'right-[22px]' : 'left-[22px]')
                : (lang === 'ar' ? 'right-0.5' : 'left-0.5')
            }`} />
          </button>
        </div>
      ))}
    </div>
  )
}

function RepSection({ userId, reputation, lang, t }: { userId: string; reputation: number; lang: string; t: (k: TranslationKey) => string }) {
  const [recent, setRecent] = useState<{ action: string; points: number; createdAt: string }[]>([])
  const [loaded, setLoaded] = useState(false)
  const isAr = lang !== 'en'

  useEffect(() => {
    fetch('/api/profile/reputation').then(r => r.json()).then(d => {
      setRecent(d.recent || [])
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [])

  const currentLevel = LEVELS.find(l => reputation >= l.min && (l.next === null || reputation < l.next)) || LEVELS[0]
  const nextLevel = LEVELS.find(l => l.min > reputation)
  const tierBarColor: Record<string, string> = {
    new: 'bg-gray-400', active: 'bg-blue-500', trusted: 'bg-green-500', top: 'bg-amber-500',
  }
  const pointsToNext = nextLevel ? nextLevel.min - reputation : 0
  const rangeStart = currentLevel.min
  const rangeEnd = nextLevel ? nextLevel.min : currentLevel.min + 100
  const progress = ((reputation - rangeStart) / (rangeEnd - rangeStart)) * 100

  const grouped = groupRecent(recent)

  function formatAction(action: string, count: number): string {
    const lb = ACTION_LABELS[action]
    if (!lb) return action
    if (lang === 'en') return count === 1 ? lb.en : lb.enPlural.replace('{n}', String(count))
    if (lang === 'ur') return count === 1 ? lb.ur : lb.urPlural.replace('{n}', String(count))
    return count === 1 ? lb.ar : lb.arPlural.replace('{n}', String(count))
  }

  function ptsWord(n: number): string {
    if (lang === 'en') return 'pts'
    if (lang === 'ur') return 'پوائنٹس'
    if (n <= 2) return 'نقطة'
    if (n <= 10) return 'نقاط'
    return 'نقطة'
  }

  return (
    <div className="mx-4 bg-white rounded-2xl border border-gray-100 overflow-hidden p-4">

      {/* ── Score + Level ── */}
      <div className="flex items-center gap-3 mb-4">
        <span className={`text-3xl ${(currentLevel as any).dotColor || 'text-gray-300'}`}>{currentLevel.emoji}</span>
        <div>
          <p className="text-lg font-bold text-gray-900 dark:text-white">
            {lang === 'en' ? currentLevel.en : lang === 'ur' ? (currentLevel as any).ur : currentLevel.ar} <span className="text-sm font-normal text-gray-400">• {reputation} {ptsWord(reputation)}</span>
          </p>
        </div>
      </div>

      {/* ── Progress to next level ── */}
      {nextLevel && (
        <div className="mb-5">
          {/* RTL-correct: in Arabic, current is on RIGHT, next is on LEFT */}
          {/* The flex container with dir handles this automatically */}
          <div className="flex items-center justify-between mb-1.5">
            <span className={`text-[11px] font-semibold ${(currentLevel as any).dotColor || 'text-gray-400'}`}>
              <span className={(currentLevel as any).dotColor}>{currentLevel.emoji}</span> {lang === 'en' ? currentLevel.en : lang === 'ur' ? (currentLevel as any).ur : currentLevel.ar}
            </span>
            <span className={`text-[11px] ${(nextLevel as any).dotColor || 'text-gray-400'}`}>
              <span className={(nextLevel as any).dotColor}>{nextLevel.emoji}</span> {lang === 'en' ? nextLevel.en : lang === 'ur' ? (nextLevel as any).ur : nextLevel.ar}
            </span>
          </div>

          {/* Bar */}
          <div className="w-full h-3 bg-gray-200/60 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${tierBarColor[currentLevel.key] || 'bg-primary-500'}`}
              style={{ width: `${Math.max(3, Math.min(100, progress))}%` }}
            />
          </div>

          {/* Numbers below bar */}
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] font-semibold text-primary-600" dir="ltr">{reputation} / {nextLevel.min}</span>
            <span className="text-[10px] text-gray-400">
              {lang === 'en'
                ? `${pointsToNext} pts to reach ${nextLevel.en}`
                : lang === 'ur'
                ? `${(nextLevel as any).ur} تک ${pointsToNext} ${ptsWord(pointsToNext)} باقی`
                : `باقي ${pointsToNext} ${ptsWord(pointsToNext)} للوصول إلى ${nextLevel.ar}`}
            </span>
          </div>
        </div>
      )}

      {/* ── Max level ── */}
      {!nextLevel && (
        <p className="text-sm text-primary-600 font-medium mb-4">
          {lang === 'en' ? '🎉 You reached the top level!' : lang === 'ur' ? '🎉 آپ اعلیٰ درجے پر پہنچ گئے!' : '🎉 وصلت لأعلى مستوى!'}
        </p>
      )}

      {/* ── Recent activity (grouped) ── */}
      <p className="text-xs font-semibold text-gray-400 mb-2">
        {lang === 'en' ? 'Your recent activity' : lang === 'ur' ? 'آپ کی حالیہ سرگرمی' : 'آخر نشاطك'}
      </p>
      {!loaded ? (
        <p className="text-xs text-gray-300">{t('common_loading')}</p>
      ) : grouped.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">{lang === 'en' ? 'No activity yet' : lang === 'ur' ? 'ابھی کوئی سرگرمی نہیں' : 'لا يوجد نشاط بعد'}</p>
      ) : (
        <div className="space-y-1.5 mb-4">
          {grouped.map((g, i) => (
            <div key={i} className="flex items-center gap-2.5 bg-gray-50 rounded-xl px-3 py-2">
              <span className={`text-sm font-bold min-w-[40px] ${g.totalPoints > 0 ? 'text-green-600' : 'text-red-500'}`}>
                {g.totalPoints > 0 ? '+' : ''}{g.totalPoints}
              </span>
              <span className="text-xs text-gray-600 flex-1">{formatAction(g.action, g.count)}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Tips ── */}
      <div className="border-t border-gray-100 pt-3">
        <p className="text-xs font-semibold text-gray-400 mb-2">
          {lang === 'en' ? 'How to earn points?' : lang === 'ur' ? 'پوائنٹس کیسے بڑھائیں؟' : 'كيف تزيد نقاطك؟'}
        </p>
        <div className="space-y-1.5">
          <p className="text-xs text-gray-500">🚗 {lang === 'en' ? 'Complete a ride or service' : lang === 'ur' ? 'سواری یا خدمت مکمل کریں' : 'أكمل مشوار أو خدمة'}</p>
          <p className="text-xs text-gray-500">⭐ {lang === 'en' ? 'Get a positive rating' : lang === 'ur' ? 'مثبت درجہ بندی حاصل کریں' : 'احصل على تقييم إيجابي'}</p>
          <p className="text-xs text-gray-500">💬 {lang === 'en' ? 'Help with useful comments' : lang === 'ur' ? 'مفید تبصروں سے پڑوسیوں کی مدد کریں' : 'ساعد جيرانك بتعليقات مفيدة'}</p>
        </div>
      </div>
    </div>
  )
}
