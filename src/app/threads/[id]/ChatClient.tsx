'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useLanguage } from '@/hooks/useLanguage'
import { useConfirm } from '@/components/ConfirmProvider'
import { FiArrowRight, FiArrowLeft, FiSend, FiMapPin, FiX, FiCamera, FiEdit2, FiTrash2, FiCheck, FiCopy, FiFlag, FiImage, FiUser } from 'react-icons/fi'
import { CHAT_WALLPAPERS, getWallpaper } from '@/lib/chatWallpapers'
import { hapticLight } from '@/lib/haptic'
import { uploadFiles } from '@/lib/upload'
import { pickImageOrFallback } from '@/lib/imagePicker'
import { useAttachContact } from '@/hooks/useAttachContact'
import { playSend } from '@/lib/sound'
import SmartText from '@/components/SmartText'

interface Msg {
  id: string
  type: string
  text: string | null
  lat: number | null
  lng: number | null
  imageUrl?: string | null
  senderId: string
  createdAt: string
  deliveredAt?: string | null
  readAt?: string | null
  edited?: boolean
  reactions?: { emoji: string; userId: string }[]
}

function WhatsAppCheck({ double, read }: { double: boolean; read: boolean }) {
  // Exact WhatsApp checkmark paths
  const color = read ? '#90F0FF' : 'rgba(255,255,255,0.45)'
  if (double) {
    return (
      <svg width="16" height="11" viewBox="0 0 16 11" className="ml-1 inline-block flex-shrink-0" style={{ marginBottom: -1 }}>
        {/* First check */}
        <path d="M11 .786l-4.764 7.07L4 5.394" fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Second check offset */}
        <path d="M15 .786l-4.764 7.07L8 5.394" fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" className="ml-1 inline-block flex-shrink-0" style={{ marginBottom: -1 }}>
      <path d="M9 .786L4.236 7.856 2 5.394" fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MsgStatus({ msg, isMe }: { msg: Msg; isMe: boolean }) {
  if (!isMe) return null
  if (msg.readAt) return <WhatsAppCheck double read />
  if (msg.deliveredAt) return <WhatsAppCheck double read={false} />
  return <WhatsAppCheck double={false} read={false} />
}

// Long press + double tap hook
function useLongPress(onLongPress: () => void, onDoubleTap: () => void, ms = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const lastTapRef = useRef(0)
  const longPressRef = useRef(onLongPress)
  const doubleTapRef = useRef(onDoubleTap)
  longPressRef.current = onLongPress
  doubleTapRef.current = onDoubleTap

  const start = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    timerRef.current = setTimeout(() => longPressRef.current(), ms)
  }, [ms])

  const cancel = useCallback(() => {
    clearTimeout(timerRef.current)
  }, [])

  const handleClick = useCallback((e: React.MouseEvent) => {
    const now = Date.now()
    if (now - lastTapRef.current < 350) {
      e.preventDefault()
      doubleTapRef.current()
      lastTapRef.current = 0
    } else {
      lastTapRef.current = now
    }
  }, [])

  return {
    onTouchStart: start,
    onTouchEnd: cancel,
    onTouchMove: cancel,
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); longPressRef.current() },
    onClick: handleClick,
  }
}

export default function ChatClient({
  threadId,
  currentUserId,
  other,
  initialMessages,
  isClosed = false,
  canRate = false,
}: {
  threadId: string
  currentUserId: string
  other: { id: string; name: string | null; avatarUrl: string | null }
  initialMessages: Msg[]
  isClosed?: boolean
  canRate?: boolean
}) {
  const { t, lang } = useLanguage()
  const confirmDialog = useConfirm()
  const attachContact = useAttachContact()
  const router = useRouter()
  const [messages, setMessages] = useState(initialMessages)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [kbOpen, setKbOpen] = useState(false)
  const composerRef = useRef<HTMLDivElement>(null)
  const textInputRef = useRef<HTMLInputElement>(null)

  // Smooth keyboard tracking for the composer bar.
  //
  // keyboardWillShow fires at animation START with the target height →
  // we CSS-transition the composer up to match the keyboard.
  // keyboardDidShow fires AFTER animation when Capacitor resizes the
  // viewport → we snap bottom to 0 (the viewport bottom is now above
  // the keyboard, so 0 is the correct position). No double-offset.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!(window as any).Capacitor?.isNativePlatform?.()) return

    let cleanup: (() => void) | null = null

    const safePad = 'calc(env(safe-area-inset-bottom, 0px) + 10px)'

    import('@capacitor/keyboard').then(({ Keyboard }) => {
      const el = () => composerRef.current

      // Use transform for the animation so bottom stays at 0 the
      // whole time. When Capacitor resizes the viewport, bottom-0
      // is already at the correct position — just clear the
      // transform. No frame where bottom + transform double-offset.
      let resizeRaf = 0
      const h1 = Keyboard.addListener('keyboardWillShow', (info) => {
        const c = el()
        if (!c) return
        // Animate up via transform (bottom stays 0)
        c.style.transition = 'transform 280ms cubic-bezier(0.4, 0, 0.2, 1), padding-bottom 280ms cubic-bezier(0.4, 0, 0.2, 1)'
        c.style.transform = `translateY(${-info.keyboardHeight}px)`
        c.style.paddingBottom = '10px'
        setKbOpen(true)

        // Poll every frame until viewport actually resizes, then
        // clear the transform in that SAME frame — no intermediate
        // painted frame with double offset.
        const startH = window.innerHeight
        cancelAnimationFrame(resizeRaf)
        const poll = () => {
          if (window.innerHeight !== startH) {
            const cc = el()
            if (cc) {
              cc.style.transition = 'none'
              cc.style.transform = 'none'
            }
            // Scroll to bottom so the last message stays visible
            // above the keyboard + composer
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
            return
          }
          resizeRaf = requestAnimationFrame(poll)
        }
        resizeRaf = requestAnimationFrame(poll)
      })
      // keyboardDidShow not needed — the rAF poll handles the handoff
      const h3 = Keyboard.addListener('keyboardWillHide', () => {
        const c = el()
        if (!c) return
        c.style.transition = 'transform 280ms cubic-bezier(0.4, 0, 0.2, 1), padding-bottom 280ms cubic-bezier(0.4, 0, 0.2, 1)'
        c.style.transform = 'none'
        c.style.paddingBottom = safePad
        setKbOpen(false)
      })
      const h4 = Keyboard.addListener('keyboardDidHide', () => {
        const c = el()
        if (!c) return
        c.style.transition = 'none'
        c.style.transform = 'none'
        c.style.paddingBottom = safePad
      })

      cleanup = () => {
        cancelAnimationFrame(resizeRaf)
        h1.then(h => h.remove())
        h3.then(h => h.remove())
        h4.then(h => h.remove())
      }
    }).catch(() => {})

    return () => { cleanup?.() }
  }, [])
  const [sendingLocation, setSendingLocation] = useState(false)
  const [closed, setClosed] = useState(isClosed)
  const [showRating, setShowRating] = useState(isClosed)
  const [rated, setRated] = useState(false)
  const [sendingImage, setSendingImage] = useState(false)
  const [editingMsg, setEditingMsg] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [selectedMsg, setSelectedMsg] = useState<string | null>(null)
  const [showLocationConfirm, setShowLocationConfirm] = useState(false)
  const [showWallpaperPicker, setShowWallpaperPicker] = useState(false)
  const [wallpaperId, setWallpaperId] = useState(() => {
    try { return localStorage.getItem('hai_chat_wallpaper') || 'default' } catch { return 'default' }
  })
  const wallpaper = getWallpaper(wallpaperId)
  const [isDark, setIsDark] = useState(() => typeof window !== 'undefined' && document.documentElement.classList.contains('dark'))
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'))
    const obs = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  const [showProfile, setShowProfile] = useState(false)
  const [profileData, setProfileData] = useState<any>(null)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const imgInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  // Find the first unread message from the other person on initial load
  const [unreadDividerId, setUnreadDividerId] = useState(() => {
    const firstUnread = initialMessages.find(m => m.senderId !== currentUserId && !m.readAt)
    return firstUnread?.id || null
  })

  // Clear unread divider after 3 seconds of viewing
  useEffect(() => {
    if (!unreadDividerId) return
    const timer = setTimeout(() => setUnreadDividerId(null), 3000)
    return () => clearTimeout(timer)
  }, [unreadDividerId])

  // Poll online status every 15s
  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch(`/api/users/${other.id}/status`)
        if (res.ok) {
          const data = await res.json()
          setStatusHidden(!!data.hidden)
          setOtherOnline(data.online)
          setOtherLastSeen(data.lastSeenAt)
          setStatusLoaded(true)
        }
      } catch { /* ignore */ }
    }
    checkStatus()
    const interval = setInterval(checkStatus, 15000)
    return () => clearInterval(interval)
  }, [other.id])

  useEffect(() => {
    // Scroll to unread divider if exists, otherwise to bottom
    if (unreadDividerId) {
      const el = document.getElementById('unread-divider')
      if (el) { el.scrollIntoView({ block: 'center' }); return }
    }
    bottomRef.current?.scrollIntoView()
  }, [messages.length])

  useEffect(() => {
    if (closed) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/threads/${threadId}/messages`)
        if (res.ok) {
          const data = await res.json()
          if (data.status === 'CLOSED') {
            setClosed(true)
            setShowRating(true)
            clearInterval(interval)
          } else {
            setMessages(data.messages || data)
          }
        }
      } catch { /* ignore */ }
    }, 3000)
    return () => clearInterval(interval)
  }, [threadId])

  useEffect(() => {
    if (editingMsg && editInputRef.current) editInputRef.current.focus()
  }, [editingMsg])

  function selectWallpaper(id: string) {
    setWallpaperId(id)
    try { localStorage.setItem('hai_chat_wallpaper', id) } catch {}
    setShowWallpaperPicker(false)
  }

  async function openProfile() {
    setShowProfile(true)
    if (profileData) return // already loaded
    setLoadingProfile(true)
    try {
      const res = await fetch(`/api/users/${other.id}/profile`)
      if (res.ok) setProfileData(await res.json())
    } catch { /* ignore */ }
    finally { setLoadingProfile(false) }
  }

  async function sendText(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || sending) return
    // Keep focus on the input BEFORE any async work — prevents iOS
    // from dismissing the keyboard when the form submits.
    textInputRef.current?.focus()
    hapticLight()
    const body = text.trim()
    setText('')
    setSending(true)
    try {
      const res = await fetch(`/api/threads/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'TEXT', text: body }),
      })
      if (res.ok) {
        const msg = await res.json()
        playSend()
        setMessages(prev => [...prev, msg])
      }
    } catch { toast.error(t('common_error')); setText(body) }
    finally { setSending(false) }
  }

  async function sendLocation() {
    if (sendingLocation) return
    if (!navigator.geolocation) { toast.error(t('thread_location_fail')); return }
    setSendingLocation(true)
    setShowLocationConfirm(false)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(`/api/threads/${threadId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'LOCATION', lat: pos.coords.latitude, lng: pos.coords.longitude }),
          })
          if (res.ok) { const msg = await res.json(); setMessages(prev => [...prev, msg]) }
        } catch { toast.error(t('common_error')) }
        finally { setSendingLocation(false) }
      },
      () => { toast.error(t('thread_location_fail')); setSendingLocation(false) },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 }
    )
  }

  async function sendImage(file: File) {
    if (sendingImage) return
    if (!file.type.startsWith('image/')) { toast.error(lang === 'en' ? 'Images only' : 'صور فقط'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error(lang === 'en' ? 'Max 5MB' : 'الحد الأقصى 5 ميقا'); return }
    setSendingImage(true)
    try {
      const urls = await uploadFiles([file])
      if (!urls[0]) return
      const res = await fetch(`/api/threads/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'IMAGE', imageUrl: urls[0] }),
      })
      if (res.ok) { const msg = await res.json(); setMessages(prev => [...prev, msg]) }
    } catch { toast.error(t('common_error')) }
    finally { setSendingImage(false); if (imgInputRef.current) imgInputRef.current.value = '' }
  }

  async function deleteMessage(msgId: string) {
    try {
      const res = await fetch(`/api/threads/${threadId}/messages/${msgId}`, { method: 'DELETE' })
      if (res.ok) {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, type: 'DELETED', text: null, imageUrl: null, lat: null, lng: null } : m))
        toast.success(lang === 'en' ? 'Deleted' : 'تم الحذف')
      } else { toast.error(lang === 'en' ? 'Failed to delete' : 'فشل الحذف') }
    } catch { toast.error(t('common_error')) }
    setSelectedMsg(null)
  }

  async function saveEdit(msgId: string) {
    if (!editText.trim()) return
    try {
      const res = await fetch(`/api/threads/${threadId}/messages/${msgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: editText.trim() }),
      })
      if (res.ok) {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, text: editText.trim(), edited: true } : m))
        toast.success(lang === 'en' ? 'Edited' : 'تم التعديل')
      }
    } catch { toast.error(t('common_error')) }
    setEditingMsg(null); setEditText('')
  }

  const QUICK_EMOJIS = ['❤️', '😂', '👍', '😮', '😢', '🤲']
  const MORE_EMOJIS = [
    '🔥', '💯', '🙏', '😍', '🥰', '😘', '🤣', '😅',
    '😭', '😡', '🤔', '🫡', '💪', '👏', '🎉', '❤️‍🔥',
    '💔', '🥺', '😳', '🤩', '😎', '🙄', '😤', '🤝',
    '👋', '✨', '⭐', '🌹', '☕', '🤷', '🫠', '💀',
  ]
  const [showMoreEmojis, setShowMoreEmojis] = useState(false)
  const [otherOnline, setOtherOnline] = useState(false)
  const [otherLastSeen, setOtherLastSeen] = useState<string | null>(null)
  const [statusHidden, setStatusHidden] = useState(true)
  const [statusLoaded, setStatusLoaded] = useState(false)

  async function reactToMessage(msgId: string, emoji: string) {
    try {
      const res = await fetch(`/api/threads/${threadId}/messages/${msgId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      })
      if (res.ok) {
        const { reactions } = await res.json()
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions } : m))
      }
    } catch { /* ignore */ }
    setSelectedMsg(null)
  }

  async function reportMessage(msgId: string) {
    try {
      const res = await fetch(`/api/threads/${threadId}/messages/${msgId}/report`, { method: 'POST' })
      if (res.ok) {
        toast.success(lang === 'en' ? 'Reported — we\'ll review it' : 'تم الإبلاغ — سنراجعها')
      } else {
        const d = await res.json()
        toast.error(d.error || (lang === 'en' ? 'Failed' : 'فشل'))
      }
    } catch { toast.error(t('common_error')) }
    setSelectedMsg(null)
  }

  function copyMessage(msg: Msg) {
    if (msg.text) {
      navigator.clipboard?.writeText(msg.text).then(() => {
        toast.success(lang === 'en' ? 'Copied' : 'تم النسخ')
      })
    }
    setSelectedMsg(null)
  }

  async function submitRating(rating: 'positive' | 'neutral' | 'negative') {
    try {
      const res = await fetch(`/api/threads/${threadId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating }),
      })
      if (res.ok) { setRated(true); toast.success(t('rate_thanks')) }
      else { const d = await res.json(); toast.error(typeof d.error === 'string' ? d.error : d.error?.message || 'Error') }
      setTimeout(() => { router.push('/threads'); router.refresh() }, 1500)
    } catch { router.push('/threads'); router.refresh() }
  }

  async function closeThread() {
    const ok = await confirmDialog({
      message: lang !== 'en' ? 'إنهاء هذه المحادثة؟' : 'End this conversation?',
      variant: 'danger',
      confirmText: lang !== 'en' ? 'إنهاء' : 'End',
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/threads/${threadId}/close`, { method: 'POST' })
      if (res.ok) { setClosed(true); setShowRating(true) }
    } catch { toast.error(t('common_error')) }
  }

  function timeStr(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString(lang !== 'en' ? 'ar-SA' : 'en', { hour: '2-digit', minute: '2-digit' })
  }

  function dateLabel(dateStr: string): string {
    const d = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
    if (d.toDateString() === today.toDateString()) return lang === 'en' ? 'Today' : 'اليوم'
    if (d.toDateString() === yesterday.toDateString()) return lang === 'en' ? 'Yesterday' : 'أمس'
    return d.toLocaleDateString(lang === 'en' ? 'en' : 'ar-SA', { month: 'short', day: 'numeric' })
  }

  function canModify(msg: Msg) {
    return msg.senderId === currentUserId && (Date.now() - new Date(msg.createdAt).getTime()) < 15 * 60_000
  }

  const selectedMsgData = selectedMsg ? messages.find(m => m.id === selectedMsg) : null

  let lastDate = ''

  return (
    <div className="flex flex-col bg-gray-100 dark:bg-gray-950" style={{ minHeight: 'calc(100vh - env(safe-area-inset-top, 0px))' }}>
      {/* Header */}
      <header className="glass px-4 py-2.5 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <Link href="/threads" className="text-gray-500 dark:text-gray-400 p-1">
          {lang !== 'en' ? <FiArrowRight className="w-5 h-5" /> : <FiArrowLeft className="w-5 h-5" />}
        </Link>
        <button onClick={openProfile} className="flex items-center gap-3 flex-1 min-w-0">
          {other.avatarUrl ? (
            <img src={other.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm">
              {other.name?.[0] || '؟'}
            </div>
          )}
          <div className="min-w-0 text-right">
            <h1 className="text-[15px] font-semibold text-gray-900 dark:text-white truncate">
              {other.name || (lang === 'en' ? 'Neighbor' : 'جار')}
            </h1>
            {!closed && statusLoaded && !statusHidden && (
              <p className={`text-[11px] font-medium ${otherOnline ? 'text-green-500' : 'text-gray-400'}`}>
                {otherOnline
                  ? (lang === 'en' ? 'Online' : 'متصل')
                  : otherLastSeen
                    ? (lang === 'en' ? 'Last seen ' : 'آخر ظهور ') + new Date(otherLastSeen).toLocaleTimeString(lang === 'en' ? 'en' : 'ar-SA', { hour: '2-digit', minute: '2-digit' })
                    : (lang === 'en' ? 'Offline' : 'غير متصل')}
              </p>
            )}
          </div>
        </button>
        <button onClick={() => setShowWallpaperPicker(true)}
          className="p-2 rounded-full hover:bg-white/10 transition-colors active:scale-90">
          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="#4ade80" strokeWidth="1.5" opacity="0.7" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="#4ade80" strokeWidth="1.5" opacity="0.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="#4ade80" strokeWidth="1.5" opacity="0.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="#4ade80" strokeWidth="1.5" opacity="0.3" />
          </svg>
        </button>
        {!closed && (
          <button data-tour="chat-close" onClick={closeThread}
            className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1 px-3 py-1.5 rounded-full bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors font-medium">
            <FiX className="w-3.5 h-3.5" />{t('thread_close')}
          </button>
        )}
      </header>

      {/* Messages */}
      <div className={`px-4 py-3 flex-1 ${kbOpen ? 'pb-16' : 'pb-28'}`} data-tour="chat-messages"
        style={{ background: isDark ? wallpaper.dark : wallpaper.light }}>
        {messages.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-white dark:bg-gray-800 shadow-sm mx-auto mb-3 flex items-center justify-center">
              <span className="text-2xl">👋</span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {lang === 'en' ? 'Say hello to start the conversation' : 'قل مرحباً لبدء المحادثة'}
            </p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isMe = msg.senderId === currentUserId
          const showDate = dateLabel(msg.createdAt) !== lastDate
          if (showDate) lastDate = dateLabel(msg.createdAt)
          const nextMsg = messages[idx + 1]
          const isLastInGroup = !nextMsg || nextMsg.senderId !== msg.senderId
          const prevMsg = idx > 0 ? messages[idx - 1] : null
          const isFirstInGroup = !prevMsg || prevMsg.senderId !== msg.senderId

          return (
            <MessageBubble
              key={msg.id}
              msg={msg}
              isMe={isMe}
              isLastInGroup={isLastInGroup}
              isFirstInGroup={isFirstInGroup}
              showDate={showDate}
              dateLabel={dateLabel(msg.createdAt)}
              timeStr={timeStr(msg.createdAt)}
              lang={lang}
              editingMsg={editingMsg}
              editText={editText}
              setEditText={setEditText}
              editInputRef={editInputRef}
              onSaveEdit={() => saveEdit(msg.id)}
              onCancelEdit={() => { setEditingMsg(null); setEditText('') }}
              onLongPress={() => setSelectedMsg(msg.id)}
              onDoubleTap={() => reactToMessage(msg.id, '❤️')}
              selectedMsg={selectedMsg}
              showUnreadDivider={msg.id === unreadDividerId}
              t={t}
            />
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Message action overlay — WhatsApp style */}
      {selectedMsg && selectedMsgData && (
        <div className="fixed inset-0 z-50" onClick={() => { setSelectedMsg(null); setShowMoreEmojis(false) }}>
          {/* Dark backdrop with blur */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Actions bar — positioned near the selected message */}
          {(() => {
            const msgEl = document.querySelector(`[data-msg-id="${selectedMsg}"]`)
            const rect = msgEl?.getBoundingClientRect()
            if (!rect) return null
            const isMe = selectedMsgData.senderId === currentUserId
            const spaceAbove = rect.top
            const showAbove = spaceAbove > 100
            const actionTop = showAbove ? rect.top - 65 : rect.bottom + 8
            // Keep within screen horizontally
            const actionLeft = Math.max(8, Math.min(
              isMe ? rect.right - 200 : rect.left,
              window.innerWidth - 208
            ))

            return (
              <div className="absolute z-[51] flex flex-col items-center" style={{
                bottom: Math.max(16, window.innerHeight - rect.top + 12),
                left: '50%',
                transform: 'translateX(-50%)',
              }} onClick={e => e.stopPropagation()}>
                {/* Emoji quick reactions */}
                <div className="bg-white dark:bg-gray-800 rounded-full shadow-2xl flex items-center gap-1 px-2 py-1.5 mb-2 w-fit">
                  {QUICK_EMOJIS.map(emoji => {
                    const myReaction = (selectedMsgData.reactions || []).find(r => r.userId === currentUserId)
                    return (
                      <button key={emoji} onClick={() => reactToMessage(selectedMsgData.id, emoji)}
                        className={`text-xl w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-125 transition-transform ${
                          myReaction?.emoji === emoji ? 'bg-primary-100 dark:bg-primary-900/30' : ''
                        }`}>
                        {emoji}
                      </button>
                    )
                  })}
                  <button onClick={() => setShowMoreEmojis(!showMoreEmojis)}
                    className={`text-lg w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-110 transition-transform ${
                      showMoreEmojis ? 'bg-gray-200 dark:bg-gray-600' : ''
                    }`}>
                    <span className="text-gray-400 font-bold">+</span>
                  </button>
                </div>
                {/* Expanded emoji grid */}
                {showMoreEmojis && (
                  <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-2 mb-2 w-fit max-w-[280px]">
                    <div className="grid grid-cols-8 gap-0.5">
                      {MORE_EMOJIS.map(emoji => {
                        const myReaction = (selectedMsgData.reactions || []).find(r => r.userId === currentUserId)
                        return (
                          <button key={emoji} onClick={() => { reactToMessage(selectedMsgData.id, emoji); setShowMoreEmojis(false) }}
                            className={`text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-125 transition-transform ${
                              myReaction?.emoji === emoji ? 'bg-primary-100 dark:bg-primary-900/30' : ''
                            }`}>
                            {emoji}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {/* Action buttons */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl flex items-center divide-x divide-gray-100 dark:divide-gray-700 overflow-hidden w-fit">
                  {selectedMsgData.type === 'TEXT' && selectedMsgData.text && (
                    <button onClick={() => copyMessage(selectedMsgData)}
                      className="flex flex-col items-center gap-1 px-5 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors active:scale-95">
                      <FiCopy className="w-4.5 h-4.5 text-gray-600 dark:text-gray-300" />
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">{lang === 'en' ? 'Copy' : 'نسخ'}</span>
                    </button>
                  )}
                  {canModify(selectedMsgData) && selectedMsgData.type === 'TEXT' && (
                    <button onClick={() => { setEditingMsg(selectedMsgData.id); setEditText(selectedMsgData.text || ''); setSelectedMsg(null) }}
                      className="flex flex-col items-center gap-1 px-5 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors active:scale-95">
                      <FiEdit2 className="w-4.5 h-4.5 text-blue-500" />
                      <span className="text-[10px] text-blue-500 font-medium">{lang === 'en' ? 'Edit' : 'تعديل'}</span>
                    </button>
                  )}
                  {canModify(selectedMsgData) && (
                    <button onClick={() => deleteMessage(selectedMsgData.id)}
                      className="flex flex-col items-center gap-1 px-5 py-2.5 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors active:scale-95">
                      <FiTrash2 className="w-4.5 h-4.5 text-red-500" />
                      <span className="text-[10px] text-red-500 font-medium">{lang === 'en' ? 'Delete' : 'حذف'}</span>
                    </button>
                  )}
                  {selectedMsgData.senderId !== currentUserId && (
                    <button onClick={() => reportMessage(selectedMsgData.id)}
                      className="flex flex-col items-center gap-1 px-5 py-2.5 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors active:scale-95">
                      <FiFlag className="w-4.5 h-4.5 text-orange-500" />
                      <span className="text-[10px] text-orange-500 font-medium">{lang === 'en' ? 'Report' : 'إبلاغ'}</span>
                    </button>
                  )}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Profile popup */}
      {showProfile && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={() => setShowProfile(false)} />
          <div className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto z-50 bg-white dark:bg-gray-800 rounded-t-3xl shadow-2xl" style={{ maxHeight: '70vh' }}>
            <div className="px-5 pt-3 pb-5">
              <div className="w-10 h-1 bg-gray-200 dark:bg-gray-600 rounded-full mx-auto mb-5" />

              {loadingProfile ? (
                <div className="flex flex-col items-center py-8 gap-3">
                  <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
                  <div className="w-24 h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  <div className="w-16 h-3 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
                </div>
              ) : profileData ? (
                <div className="flex flex-col items-center">
                  {/* Avatar */}
                  {profileData.avatarUrl ? (
                    <img src={profileData.avatarUrl} alt="" className="w-20 h-20 rounded-full object-cover mb-3 shadow-md" />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-bold text-3xl mb-3 shadow-md">
                      {profileData.name?.[0] || '؟'}
                    </div>
                  )}

                  {/* Name */}
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                    {profileData.name || (lang === 'en' ? 'Neighbor' : 'جار')}
                    {profileData.lastName ? ` ${profileData.lastName}` : ''}
                  </h2>

                  {/* Neighborhood */}
                  {profileData.neighborhood && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      📍 {lang === 'en' && profileData.neighborhood.nameEn ? profileData.neighborhood.nameEn : profileData.neighborhood.name}
                    </p>
                  )}

                  {/* Stats row */}
                  <div className="flex items-center gap-6 mt-4 mb-4">
                    <div className="text-center">
                      <p className="text-lg font-bold text-gray-900 dark:text-white">{profileData.reputation || 0}</p>
                      <p className="text-[11px] text-gray-400">{lang === 'en' ? 'Reputation' : 'السمعة'}</p>
                    </div>
                    <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
                    <div className="text-center">
                      <p className="text-lg font-bold text-gray-900 dark:text-white">{profileData.postCount || 0}</p>
                      <p className="text-[11px] text-gray-400">{lang === 'en' ? 'Posts' : 'منشورات'}</p>
                    </div>
                    <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
                    <div className="text-center">
                      <p className="text-lg font-bold text-gray-900 dark:text-white">
                        {profileData.createdAt ? new Date(profileData.createdAt).toLocaleDateString(lang === 'en' ? 'en' : 'ar-SA', { month: 'short', year: 'numeric' }) : '—'}
                      </p>
                      <p className="text-[11px] text-gray-400">{lang === 'en' ? 'Joined' : 'انضم'}</p>
                    </div>
                  </div>

                  {/* Bio */}
                  {profileData.bio && (
                    <p className="text-sm text-gray-600 dark:text-gray-300 text-center mb-4 px-4">{profileData.bio}</p>
                  )}

                  {/* Account type badge */}
                  {profileData.accountType === 'SERVICE_PROVIDER' && (
                    <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 px-3 py-1.5 rounded-full text-xs font-medium mb-4">
                      <span>🛠</span>
                      {lang === 'en' ? 'Service Provider' : 'مقدم خدمة'}
                    </div>
                  )}

                  <button onClick={() => setShowProfile(false)}
                    className="w-full py-2.5 rounded-xl text-sm font-medium text-gray-500 bg-gray-100 dark:bg-gray-700 dark:text-gray-300 mt-2">
                    {lang === 'en' ? 'Close' : 'إغلاق'}
                  </button>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  {lang === 'en' ? 'Could not load profile' : 'تعذر تحميل الملف الشخصي'}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Wallpaper picker */}
      {showWallpaperPicker && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={() => setShowWallpaperPicker(false)} />
          <div className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto z-50 bg-white dark:bg-gray-800 rounded-t-3xl shadow-2xl">
            <div className="px-5 pt-3 pb-6">
              <div className="w-10 h-1 bg-gray-200 dark:bg-gray-600 rounded-full mx-auto mb-4" />
              <h3 className="font-bold text-gray-900 dark:text-white text-center mb-4">
                {lang === 'en' ? 'Chat Wallpaper' : 'خلفية المحادثة'}
              </h3>
              <div className="grid grid-cols-4 gap-3">
                {CHAT_WALLPAPERS.map(wp => (
                  <button
                    key={wp.id}
                    onClick={() => selectWallpaper(wp.id)}
                    className={`relative rounded-2xl overflow-hidden h-24 border-2 transition-all active:scale-95 ${
                      wallpaperId === wp.id ? 'border-primary-500 shadow-lg shadow-primary-500/20' : 'border-gray-200 dark:border-gray-600'
                    }`}
                  >
                    <div className="absolute inset-0" style={{ background: isDark ? wp.dark : wp.light }} />
                    {/* Mini message preview */}
                    <div className="absolute inset-0 flex flex-col justify-center items-center gap-1 px-1">
                      <div className="w-10 h-2.5 bg-primary-500 rounded-full opacity-60" />
                      <div className="w-8 h-2.5 bg-white dark:bg-gray-600 rounded-full opacity-40 self-start ml-1" />
                    </div>
                    {wallpaperId === wp.id && (
                      <div className="absolute top-1 right-1 w-4 h-4 bg-primary-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-[8px] font-bold">✓</span>
                      </div>
                    )}
                    <p className="absolute bottom-1 left-0 right-0 text-[9px] text-center font-medium text-gray-600 dark:text-gray-300">
                      {lang === 'en' ? wp.nameEn : wp.nameAr}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Location confirmation dialog */}
      {showLocationConfirm && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowLocationConfirm(false)} />
          <div className="fixed bottom-24 left-4 right-4 max-w-[480px] mx-auto z-50 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center">
                <FiMapPin className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                  {lang === 'en' ? 'Share your location?' : 'مشاركة موقعك؟'}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {lang === 'en' ? 'Your current location will be sent' : 'سيتم إرسال موقعك الحالي'}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowLocationConfirm(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700">
                {lang === 'en' ? 'Cancel' : 'إلغاء'}
              </button>
              <button onClick={sendLocation}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white bg-primary-600 active:scale-95 transition-transform">
                {lang === 'en' ? 'Share' : 'مشاركة'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Rating / Closed / Input */}
      {closed ? (
        showRating && !rated && canRate ? (
          <div className="bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 px-5 py-5">
            <p className="text-sm font-semibold text-gray-800 dark:text-white text-center mb-4">{t('rate_title')}</p>
            <div className="flex gap-2 justify-center mb-3">
              <button onClick={() => submitRating('positive')} className="flex-1 flex flex-col items-center gap-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 py-3 rounded-2xl text-sm font-medium active:scale-95 transition-transform">
                <span className="text-xl">😊</span>{t('rate_positive')}
              </button>
              <button onClick={() => submitRating('neutral')} className="flex-1 flex flex-col items-center gap-1 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 py-3 rounded-2xl text-sm font-medium active:scale-95 transition-transform">
                <span className="text-xl">😐</span>{t('rate_neutral')}
              </button>
              <button onClick={() => submitRating('negative')} className="flex-1 flex flex-col items-center gap-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 py-3 rounded-2xl text-sm font-medium active:scale-95 transition-transform">
                <span className="text-xl">😞</span>{t('rate_negative')}
              </button>
            </div>
            <button onClick={() => { router.push('/threads'); router.refresh() }} className="w-full text-xs text-gray-400 mt-1">{t('rate_skip')}</button>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 px-4 py-4 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">{rated ? '✓ ' : ''}{rated ? t('rate_thanks') : t('thread_closed')}</p>
          </div>
        )
      ) : (
        <div ref={composerRef} className="glass-bottom px-3 py-2.5 fixed left-0 right-0 max-w-[480px] mx-auto z-20 overflow-hidden" style={{ bottom: 0, paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)' }}>
          <div className="flex items-center gap-2">
            <input ref={imgInputRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) sendImage(f) }} />
            <div className="flex items-center gap-1">
              <button onClick={async () => {
                  const f = await pickImageOrFallback(lang as 'ar' | 'en' | 'ur', imgInputRef)
                  if (f) sendImage(f)
                }} disabled={sendingImage}
                className="p-2.5 rounded-full text-gray-300 dark:text-gray-300 hover:text-primary-400 active:scale-90 transition-all disabled:opacity-50">
                <FiCamera className={`w-5 h-5 ${sendingImage ? 'animate-pulse' : ''}`} />
              </button>
              <button onClick={async () => {
                  hapticLight()
                  const snippet = await attachContact()
                  if (!snippet) return
                  setText((prev) => (prev ? `${prev.trimEnd()}\n${snippet}` : snippet))
                }}
                aria-label={t('attach_contact')}
                title={t('attach_contact')}
                className="p-2.5 rounded-full text-gray-300 dark:text-gray-300 hover:text-primary-400 active:scale-90 transition-all">
                <FiUser className="w-5 h-5" />
              </button>
              <button data-tour="chat-location" onClick={() => setShowLocationConfirm(true)} disabled={sendingLocation}
                className="p-2.5 rounded-full text-gray-300 dark:text-gray-300 hover:text-primary-400 active:scale-90 transition-all disabled:opacity-50">
                <FiMapPin className={`w-5 h-5 ${sendingLocation ? 'animate-pulse' : ''}`} />
              </button>
            </div>
            <form onSubmit={sendText} className="flex-1 flex items-center gap-2">
              <input ref={textInputRef} type="text" value={text} onChange={e => setText(e.target.value)}
                placeholder={t('thread_placeholder')}
                className="flex-1 bg-white/10 dark:bg-white/10 rounded-full px-4 py-2.5 text-[15px] text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-400 border border-white/10 focus:outline-none focus:ring-2 focus:ring-primary-400/40 focus:border-primary-400/30 transition-shadow"
                maxLength={1000} />
              <button type="submit" disabled={sending || !text.trim()}
                onTouchEnd={(e) => { e.preventDefault(); textInputRef.current?.focus(); (e.target as HTMLElement).closest('form')?.requestSubmit() }}
                className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center text-white disabled:opacity-30 flex-shrink-0 active:scale-90 transition-all shadow-sm hover:bg-primary-700 glow-primary">
                <FiSend className="w-4.5 h-4.5" style={lang !== 'en' ? { transform: 'scaleX(-1)' } : undefined} />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// Separate bubble component for long-press handling
function MessageBubble({ msg, isMe, isLastInGroup, isFirstInGroup, showDate, dateLabel, timeStr, lang, editingMsg, editText, setEditText, editInputRef, onSaveEdit, onCancelEdit, onLongPress, onDoubleTap, selectedMsg, showUnreadDivider, t }: {
  msg: Msg; isMe: boolean; isLastInGroup: boolean; isFirstInGroup: boolean; showDate: boolean; dateLabel: string; timeStr: string; lang: string
  editingMsg: string | null; editText: string; setEditText: (v: string) => void; editInputRef: React.RefObject<HTMLInputElement>
  onSaveEdit: () => void; onCancelEdit: () => void; onLongPress: () => void; onDoubleTap: () => void; selectedMsg: string | null; showUnreadDivider: boolean; t: (k: any) => string
}) {
  const longPress = useLongPress(onLongPress, onDoubleTap, 400)

  return (
    <div>
      {showUnreadDivider && (
        <div id="unread-divider" className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-primary-400/50" />
          <span className="text-[11px] text-primary-600 dark:text-primary-400 font-semibold px-2">
            {lang === 'en' ? 'New messages' : 'رسائل جديدة'}
          </span>
          <div className="flex-1 h-px bg-primary-400/50" />
        </div>
      )}
      {showDate && (
        <div className="flex items-center justify-center my-4">
          <span className="text-[11px] text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 px-3 py-1 rounded-full shadow-sm font-medium">
            {dateLabel}
          </span>
        </div>
      )}

      <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} ${isLastInGroup ? 'mb-2' : 'mb-[3px]'} ${isFirstInGroup && !showDate ? 'mt-3' : ''}`}>
        {msg.type === 'IMAGE' && msg.imageUrl ? (
          <div className={`max-w-[70%]`} data-msg-id={msg.id} {...longPress}>
            <a href={msg.imageUrl} target="_blank" rel="noopener noreferrer" className="block">
              <img src={msg.imageUrl} alt="" className={`rounded-2xl max-h-52 object-cover shadow-sm ${isLastInGroup ? (isMe ? 'ltr:rounded-br-sm rtl:rounded-bl-sm' : 'ltr:rounded-bl-sm rtl:rounded-br-sm') : ''}`} />
            </a>
            <p className={`text-[10px] mt-1 px-1 flex items-center gap-0.5 ${isMe ? 'text-gray-400 justify-start' : 'text-gray-400 justify-end'}`}>
              {timeStr}
              <MsgStatus msg={msg} isMe={isMe} />
            </p>
          </div>
        ) : msg.type === 'DELETED' ? (
          <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 ${
            isMe ? `bg-primary-600/30 ${isLastInGroup ? 'ltr:rounded-br-sm rtl:rounded-bl-sm' : ''}` : `bg-white/30 dark:bg-gray-800/30 ${isLastInGroup ? 'ltr:rounded-bl-sm rtl:rounded-br-sm' : ''}`
          } border border-dashed ${isMe ? 'border-primary-400/30' : 'border-gray-300/30 dark:border-gray-600/30'}`}>
            <p className={`text-[13px] italic ${isMe ? 'text-primary-200/70' : 'text-gray-400 dark:text-gray-500'}`}>
              🚫 {isMe
                ? (lang === 'en' ? 'You deleted this message' : 'حذفت هذه الرسالة')
                : (lang === 'en' ? 'This message was deleted' : 'تم حذف هذه الرسالة')}
            </p>
            <p className={`text-[10px] mt-1 ${isMe ? 'text-primary-200/50' : 'text-gray-400/50'}`}>{timeStr}</p>
          </div>
        ) : editingMsg === msg.id ? (
          <div className="max-w-[75%] w-full">
            <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-2xl px-3 py-2 shadow-sm border-2 border-primary-400">
              <input ref={editInputRef} type="text" value={editText} onChange={e => setEditText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') onSaveEdit(); if (e.key === 'Escape') onCancelEdit() }}
                className="flex-1 bg-transparent text-sm text-gray-800 dark:text-white focus:outline-none" maxLength={1000} />
              <button onClick={onSaveEdit} className="text-primary-600 p-1"><FiCheck className="w-4 h-4" /></button>
              <button onClick={onCancelEdit} className="text-gray-400 p-1"><FiX className="w-4 h-4" /></button>
            </div>
          </div>
        ) : (
          <div {...longPress} data-msg-id={msg.id} className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 shadow-sm select-none ${
            isMe ? `bg-primary-600 text-white ${isLastInGroup ? 'ltr:rounded-br-sm rtl:rounded-bl-sm' : ''}` : `bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 ${isLastInGroup ? 'ltr:rounded-bl-sm rtl:rounded-br-sm' : ''}`
          } ${selectedMsg === msg.id ? 'relative z-[52] ring-2 ring-white/50' : ''}`}>
            {msg.type === 'LOCATION' ? (
              <div>
                <div className={`flex items-center gap-1.5 mb-1 ${isMe ? 'text-primary-100' : 'text-primary-600 dark:text-primary-400'}`}>
                  <FiMapPin className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">{t('thread_my_location')}</span>
                </div>
                <a href={`https://maps.google.com/?q=${msg.lat},${msg.lng}`} target="_blank" rel="noopener noreferrer"
                  className={`block rounded-xl overflow-hidden mb-1 ${isMe ? 'bg-primary-700/50' : 'bg-gray-100 dark:bg-gray-700'} p-2.5 text-center`}>
                  <span className="text-2xl">📍</span>
                  <p className={`text-xs mt-1 font-medium ${isMe ? 'text-primary-100' : 'text-primary-600 dark:text-primary-400'}`}>
                    {t('thread_open_map')} ↗
                  </p>
                </a>
              </div>
            ) : (
              <p className="text-[15px] leading-relaxed selectable-text">
                <SmartText text={msg.text || ''} variant={isMe ? 'onGreen' : 'light'} />
                {msg.edited && (
                  <span className={`text-[10px] italic ml-1 ${isMe ? 'text-primary-200' : 'text-gray-400 dark:text-gray-500'}`}>
                    {lang === 'en' ? '(edited)' : '(معدّل)'}
                  </span>
                )}
              </p>
            )}
            <p className={`text-[10px] mt-1 flex items-center gap-0.5 ${isMe ? 'text-primary-200 justify-end' : 'text-gray-400 dark:text-gray-500'}`}>
              {timeStr}
              <MsgStatus msg={msg} isMe={isMe} />
            </p>
          </div>
        )}

        {/* Reactions display — overlaps bottom of bubble */}
        {msg.reactions && msg.reactions.length > 0 && msg.type !== 'DELETED' && (() => {
          const grouped = msg.reactions.reduce((acc: Record<string, number>, r: any) => {
            acc[r.emoji] = (acc[r.emoji] || 0) + 1; return acc
          }, {})
          return (
            <div className={`-mt-2 ${isMe ? 'mr-2' : 'ml-2'} mb-1`}>
              <div className="inline-flex items-center gap-0.5 bg-white dark:bg-gray-800 rounded-full shadow-md border-2 border-gray-200 dark:border-gray-600 px-2 py-1">
                {Object.entries(grouped).map(([emoji, count]) => (
                  <span key={emoji} className="text-[13px] leading-none">
                    {emoji}{(count as number) > 1 && <span className="text-[10px] text-gray-400 ml-0.5">{count as number}</span>}
                  </span>
                ))}
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
