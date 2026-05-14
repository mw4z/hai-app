'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useLanguage } from '@/hooks/useLanguage'
import { useNetworkStatus, isOfflineError } from '@/lib/network'
import { useConfirm } from '@/components/ConfirmProvider'
import { FiArrowRight, FiArrowLeft, FiSend, FiMapPin, FiX, FiCamera, FiEdit2, FiTrash2, FiCheck, FiCopy, FiFlag, FiImage, FiUser, FiPaperclip } from 'react-icons/fi'
import AttachmentMenu from '@/components/AttachmentMenu'
import { CHAT_WALLPAPERS, getWallpaper } from '@/lib/chatWallpapers'
import { hapticLight } from '@/lib/haptic'
import { uploadFiles, uploadPdf, uploadStageLabel, type UploadStage } from '@/lib/upload'
import PdfTile from '@/components/PdfTile'
import { pickImagesOrFallback, pickImageFromCamera } from '@/lib/imagePicker'
import { getCurrentPositionSafe } from '@/lib/location/getCurrentPositionSafe'
import { useDragToDismiss } from '@/hooks/useDragToDismiss'
import { useAttachContact } from '@/hooks/useAttachContact'
import { playSend } from '@/lib/sound'
import SmartText from '@/components/SmartText'
import ImageLightbox from '@/components/ImageLightbox'
import ReportUserSheet from '@/components/ReportUserSheet'
import { showApiError } from '@/lib/apiError'
import { fullName } from '@/lib/displayName'
// Chat-page contextual tour was removed after user report ("DM
// chats are broke after we added the tour"). Chats are time-
// sensitive — users open them to send a message right now, not
// to be tutored — and the overlay's full-screen wrapper was
// catching pointer events that the chat surface needs.
// Markers (data-guide="chat-input" / data-guide="chat-close")
// stay on the elements for forward compatibility; only the
// auto-mounted overlay is gone.

interface ReplyTo {
  id: string
  text: string | null
  senderId: string
  type: string
}

interface Msg {
  id: string
  type: string
  text: string | null
  lat: number | null
  lng: number | null
  imageUrl?: string | null
  pdfUrl?: string | null
  pdfName?: string | null
  senderId: string
  createdAt: string
  deliveredAt?: string | null
  readAt?: string | null
  edited?: boolean
  reactions?: { emoji: string; userId: string }[]
  replyToId?: string | null
  replyTo?: ReplyTo | null
  /** Stable client-side key. Set on optimistic inserts and PRESERVED
   *  when the server response swaps `id` to the real one — the React
   *  list keys by `tempId ?? id` so the same DOM node survives the
   *  swap, otherwise .chat-bubble-in replays and the bubble flashes. */
  tempId?: string
}

function WhatsAppCheck({ double, read }: { double: boolean; read: boolean }) {
  // Checkmark paths tuned for legibility on the green outgoing
  // bubble (#00a884):
  //   read     → #1E88E5 (deep saturated blue). Darker than the
  //              previous sky-blue so the 'seen' signal really
  //              pops against the green instead of blending.
  //   unread   → rgba(255,255,255,0.85) (solid white).
  const color = read ? '#1E88E5' : 'rgba(255,255,255,0.85)'
  if (double) {
    return (
      <svg width="16" height="11" viewBox="0 0 16 11" className="ml-1 inline-block flex-shrink-0" style={{ marginBottom: -1 }}>
        {/* First check */}
        <path d="M11 .786l-4.764 7.07L4 5.394" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        {/* Second check offset */}
        <path d="M15 .786l-4.764 7.07L8 5.394" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" className="ml-1 inline-block flex-shrink-0" style={{ marginBottom: -1 }}>
      <path d="M9 .786L4.236 7.856 2 5.394" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Small clock icon for messages that haven't reached the server yet.
 *  Same visual weight as WhatsAppCheck so the row alignment doesn't
 *  shift when the status flips from clock → ✓ on send confirmation. */
function PendingClock() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 11 11"
      className="ml-1 inline-block flex-shrink-0"
      style={{ marginBottom: -1 }}
      aria-label="sending"
    >
      {/* Outline */}
      <circle
        cx="5.5" cy="5.5" r="4.6"
        fill="none"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth="1"
      />
      {/* Hour hand (12 → 4 o'clock) */}
      <path
        d="M5.5 5.5 V2.5"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path
        d="M5.5 5.5 L7.5 5.5"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  )
}

function MsgStatus({ msg, isMe }: { msg: Msg; isMe: boolean }) {
  if (!isMe) return null

  // Pending: the optimistic placeholder hasn't been swapped for the
  // server response yet. tempId persists post-swap as a stable React
  // key, but msg.id flips from "pending-…" to the real cuid the
  // moment the POST resolves. Checking the id prefix is the cleanest
  // discriminator and covers every flow that uses optimistic insert:
  // sendText (text), sendImage / sendImages (images), sendPdf (PDF),
  // and any future type that builds its placeholder the same way.
  //
  // While pending we render a clock instead of a check — the
  // message hasn't been delivered yet, and if the connection is
  // down / hung the clock stays put so the user knows it didn't
  // ship. The previous behavior fell through to a single check
  // mark which falsely signaled "sent" the instant the bubble
  // appeared on screen.
  if (msg.id.startsWith('pending-')) return <PendingClock />

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
  currentUserNeighborhoodId,
  other,
  initialMessages,
  isClosed = false,
  canRate = false,
}: {
  threadId: string
  currentUserId: string
  currentUserNeighborhoodId: string | null
  other: { id: string; name: string | null; lastName?: string | null; avatarUrl: string | null; role?: string | null; neighborhoodId?: string | null }
  initialMessages: Msg[]
  isClosed?: boolean
  canRate?: boolean
}) {
  const { t, lang } = useLanguage()
  const confirmDialog = useConfirm()
  const attachContact = useAttachContact()
  const router = useRouter()
  const { isOffline } = useNetworkStatus()
  const offlineMsg = () => lang === 'en'
    ? 'No internet connection. Try again when reconnected.'
    : lang === 'ur'
      ? 'انٹرنیٹ کنکشن نہیں — دوبارہ کنیکٹ ہونے پر کوشش کریں'
      : 'لا يوجد اتصال — حاول مرة أخرى عند عودة الإنترنت'
  // Seed messages from a localStorage cache synchronously on first
  // render. If the cache has strictly MORE (newer) messages than the
  // server-rendered initialMessages — meaning the user just sent
  // something before bouncing out and back — we prefer the cache.
  // Otherwise we trust initialMessages (server is authoritative on a
  // cold navigation). Either way the imperative refreshOnce() below
  // reconciles with the server within a few hundred ms.
  const [messages, setMessages] = useState<Msg[]>(() => {
    if (typeof window === 'undefined') return initialMessages
    try {
      const raw = localStorage.getItem(`hai_chat_cache_${threadId}`)
      if (!raw) return initialMessages
      const cached: Msg[] = JSON.parse(raw)
      if (!Array.isArray(cached) || cached.length === 0) return initialMessages
      const cachedIds = new Set(cached.map((m: any) => m.id))
      const initialIds = new Set(initialMessages.map((m: any) => m.id))
      // Prefer cache when it's a strict superset of initial (has
      // recently-sent messages the server render hadn't captured yet).
      const cacheIsAheadOfInitial = cached.some((m: any) => !initialIds.has(m.id))
      const initialHasNew = initialMessages.some((m: any) => !cachedIds.has(m.id))
      if (cacheIsAheadOfInitial && !initialHasNew) return cached
      return initialMessages
    } catch { return initialMessages }
  })

  // Persist the current message list to localStorage so the next visit
  // can seed instantly. Debounced by React's batching — effects run
  // after every commit, but the work is cheap (stringify + set item).
  useEffect(() => {
    try {
      // Strip volatile/local-only fields that shouldn't outlive the session
      const serializable = messages.map((m: any) => {
        const { localPreview, pending, percent, stage, ...rest } = m
        return rest
      })
      localStorage.setItem(
        `hai_chat_cache_${threadId}`,
        JSON.stringify(serializable.slice(-100)), // cap at 100 msgs
      )
    } catch { /* quota / disabled storage — non-fatal */ }
  }, [messages, threadId])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  // Synchronous send-locks. The send button has BOTH a form `submit`
  // AND an onTouchEnd that calls requestSubmit() — needed so the iOS
  // keyboard doesn't dismiss between the touch and the click. On
  // Android that fires sendText/sendLocation/sendImages TWICE in the
  // same tick, and React state setters (`setSending(true)`) don't
  // flush synchronously, so both invocations pass the `if (sending)`
  // guard and each posts its own copy of the message. A useRef flag
  // updates synchronously and the second call returns immediately.
  const sendLockRef = useRef(false)
  const sendLocationLockRef = useRef(false)
  const sendImagesLockRef = useRef(false)
  // Cross-neighborhood detection. When the recipient is from a
  // different neighborhood we render the "خارج الحي" badge in the
  // header, and the first message attempt prompts a one-time
  // confirmation per thread (acknowledged in localStorage).
  const isOutsideNbhd = !!(
    currentUserNeighborhoodId &&
    other.neighborhoodId &&
    currentUserNeighborhoodId !== other.neighborhoodId
  )
  const outsideAckKey = `hai_outside_dm_ack:${threadId}`
  async function gateOutsideDm(): Promise<boolean> {
    if (!isOutsideNbhd) return true
    try {
      if (localStorage.getItem(outsideAckKey)) return true
    } catch {}
    const ok = await confirmDialog({
      message:
        lang === 'en'
          ? 'This user is outside your neighborhood. Do you want to continue?'
          : lang === 'ur'
            ? 'یہ صارف آپ کے محلے سے باہر ہے۔ کیا آپ جاری رکھنا چاہتے ہیں؟'
            : 'هذا المستخدم من خارج حيك. هل تريد المتابعة؟',
      confirmText:
        lang === 'en' ? 'Continue' : lang === 'ur' ? 'جاری رکھیں' : 'متابعة',
    })
    if (ok) {
      try { localStorage.setItem(outsideAckKey, '1') } catch {}
    }
    return ok
  }
  const [replyingTo, setReplyingTo] = useState<Msg | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const textInputRef = useRef<HTMLInputElement>(null)
  const blobUrlsRef = useRef<Set<string>>(new Set())

  // Revoke any blob URLs created for sent-photo previews when the chat
  // unmounts so they don't leak. Blob URLs are alive only while this
  // component is mounted; the remote imageUrl is the source of truth
  // for persistence.
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      blobUrlsRef.current.clear()
    }
  }, [])

  // Size the chat root to the visible viewport (keyboard-aware).
  //
  // On Capacitor native, Keyboard.willShow/willHide are the source of
  // truth — they fire at the start of the keyboard animation with the
  // exact keyboardHeight, so the composer snaps to its final position
  // the instant the keyboard starts rising.
  //
  // visualViewport is a fallback for web, and also covers orientation
  // changes on native. It's intentionally NOT used during a native
  // keyboard transition, because WKWebView's visualViewport.resize
  // fires at the end of the animation with a slightly different height
  // than info.keyboardHeight — the difference shows as the composer
  // nudging a couple pixels a beat after it had already settled.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const vv = window.visualViewport
    const root = rootRef.current
    if (!vv || !root) return

    const platform = (window as any).Capacitor?.getPlatform?.() || 'web'
    const isIos = platform === 'ios'
    const isAndroid = platform === 'android'

    const safePad = 'calc(env(safe-area-inset-bottom, 0px) + 10px)'
    const setComposerPad = (pad: string) => {
      if (composerRef.current) composerRef.current.style.paddingBottom = pad
    }

    const setHeight = (visibleHeight: number) => {
      root.style.height = `calc(${visibleHeight}px - env(safe-area-inset-top, 0px))`
      bottomRef.current?.scrollIntoView({ block: 'end' })
    }

    // Android (resize mode: body) — the WebView is resized for us when
    // the keyboard opens, so visualViewport is the single source of
    // truth. Keyboard events are noisy and fire after the resize
    // already happened, so we don't attach them on Android.
    // iOS (resize mode: native) — visualViewport DOESN'T fire when
    // the keyboard shows (WKWebView's frame doesn't change), so we
    // must derive the visible height from Keyboard.willShow's
    // keyboardHeight value.
    let keyboardOpen = false

    setHeight(vv.height)
    const onVV = () => {
      // Always trust visualViewport for the visible height. On iPad
      // specifically, Keyboard.willShow can fire late (or not until
      // the user actually types a key), which left the composer
      // hidden below the keyboard. visualViewport.resize fires the
      // moment the keyboard appears and gives us the correct
      // shrunken height — so we use it as the primary source on
      // every platform and let the Keyboard.willShow listener below
      // act as a redundant fast-path on iPhone only.
      setHeight(vv.height)
      // Crude-but-reliable: if the viewport is notably shorter than
      // the window, the keyboard is up. Tighten composer bottom
      // padding while keyboard is up, restore safe-area when hidden.
      const keyboardIsOpen = (window.innerHeight - vv.height) > 150
      keyboardOpen = keyboardIsOpen
      setComposerPad(keyboardIsOpen ? '10px' : safePad)
    }
    vv.addEventListener('resize', onVV)
    vv.addEventListener('scroll', onVV)

    let cleanupKb: (() => void) | null = null
    if (isIos) {
      import('@capacitor/keyboard').then(({ Keyboard }) => {
        const h1 = Keyboard.addListener('keyboardWillShow', (info) => {
          keyboardOpen = true
          setHeight(window.innerHeight - info.keyboardHeight)
          setComposerPad('10px')
        })
        const h2 = Keyboard.addListener('keyboardWillHide', () => {
          keyboardOpen = false
          setHeight(window.innerHeight)
          setComposerPad(safePad)
        })
        cleanupKb = () => {
          h1.then(x => x.remove())
          h2.then(x => x.remove())
        }
      }).catch(() => {})
    }

    return () => {
      vv.removeEventListener('resize', onVV)
      vv.removeEventListener('scroll', onVV)
      cleanupKb?.()
    }
  }, [])
  const [sendingLocation, setSendingLocation] = useState(false)
  const [reportingUser, setReportingUser] = useState(false)
  const [closed, setClosed] = useState(isClosed)

  const [showRating, setShowRating] = useState(isClosed)
  const [rated, setRated] = useState(false)
  const [sendingImage, setSendingImage] = useState(false)
  const [editingMsg, setEditingMsg] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [selectedMsg, setSelectedMsg] = useState<string | null>(null)
  const [showLocationConfirm, setShowLocationConfirm] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
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
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const [showImageSheet, setShowImageSheet] = useState(false)

  const profileSheetDrag = useDragToDismiss<HTMLDivElement, HTMLDivElement>({
    open: showProfile,
    onDismiss: () => setShowProfile(false),
  })
  const wallpaperSheetDrag = useDragToDismiss<HTMLDivElement, HTMLDivElement>({
    open: showWallpaperPicker,
    onDismiss: () => setShowWallpaperPicker(false),
  })

  // Find the first unread message from the other person on initial load
  const [unreadDividerId, setUnreadDividerId] = useState(() => {
    const firstUnread = initialMessages.find(m => m.senderId !== currentUserId && !m.readAt)
    return firstUnread?.id || null
  })

  // Unread divider persists until the user leaves the chat. Clearing
  // it after 3s made the marker disappear before users had a chance
  // to scroll up and see what was new — defeating the point. The
  // marker now lives for the lifetime of this component instance:
  // navigating to the threads list / another route unmounts the
  // ChatClient and the next visit starts fresh.

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
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  // Mount-only re-scroll pass. The single useEffect above lands on
  // whatever the bottom is at first paint, but several things keep
  // shifting it AFTER that paint:
  //
  //  - PdfTile bubbles render synchronously but the emoji + label
  //    glyphs settle on the next frame, so the bubble grows by a
  //    few px after first paint.
  //  - refreshOnce() merges server data into the (possibly cached)
  //    messages list. Same length → the length-dep useEffect above
  //    doesn't refire, but bubble content may have changed (e.g.,
  //    a pending PDF placeholder swapped for the real msg, gaining
  //    a real pdfUrl, etc.).
  //  - Font-face swap (Arabic + Latin) reflows text widths.
  //
  // The ResizeObserver further down catches some of this BUT only
  // when the user is already within 600 px of the bottom — on a
  // tall chat the initial scrollIntoView may not get us close
  // enough on its first run, leaving the user a screen above the
  // real bottom. This effect snaps directly to scrollHeight at a
  // few intervals so we definitely land on the latest message.
  useEffect(() => {
    if (unreadDividerId) return // don't override the unread-divider landing
    const snap = () => {
      const ms = messagesRef.current
      if (!ms) return
      ms.scrollTop = ms.scrollHeight
    }
    snap()
    const r = requestAnimationFrame(snap)
    const timers = [
      setTimeout(snap, 80),
      setTimeout(snap, 250),
      setTimeout(snap, 600),
      setTimeout(snap, 1200),
    ]
    return () => {
      cancelAnimationFrame(r)
      timers.forEach(clearTimeout)
    }
  // Run once on mount; we deliberately don't add deps so it doesn't
  // refire when a new message arrives (the length-dep useEffect
  // above plus the per-message onLoad handlers cover that path
  // with the user's scroll position respected).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Stick to bottom while content settles after first paint.
  //
  // The single scrollIntoView above lands on whatever the bottom is
  // at THAT moment, but for the first ~1.5 seconds the messages
  // container keeps growing as fonts swap, avatars decode, replied-
  // to previews paint, and (for chats with images) image bubbles
  // resolve their intrinsic dimensions. Without this, the user lands
  // above the eventual bottom and has to scroll manually — exactly
  // the symptom users reported on first chat open.
  //
  // ResizeObserver fires on every height change to the messages
  // container. We re-pin to the bottom for the first 1500 ms and
  // ONLY when the user is currently near the bottom (so scrolling up
  // mid-load to read history isn't fought by the observer). After
  // 1500 ms the observer disconnects — past that, content growth is
  // "new messages while reading" territory and the message-arrival
  // useEffect above handles it.
  useEffect(() => {
    if (unreadDividerId) return // user landed on the unread divider, leave them there
    const ms = messagesRef.current
    if (!ms) return
    const startedAt = Date.now()
    const obs = new ResizeObserver(() => {
      if (Date.now() - startedAt > 1500) { obs.disconnect(); return }
      const distanceFromBottom = ms.scrollHeight - ms.scrollTop - ms.clientHeight
      // 600 px ≈ ~3 image bubbles of slack — enough that the chain
      // of "image grows → re-pin → next image grows → re-pin" stays
      // sticky, but small enough that an active history scroll wins.
      if (distanceFromBottom < 600) {
        ms.scrollTop = ms.scrollHeight
      }
    })
    obs.observe(ms)
    return () => obs.disconnect()
  }, [unreadDividerId])

  // Tap on a reply quote → scroll the original into view and flash a
  // full-width horizontal highlight across its row that fades out.
  // Mirrors WhatsApp's behavior.
  //
  // Deferred a tick so any concurrent React render (e.g. the auto-
  // scroll-to-bottom effect on messages.length, or the touch-end tap
  // re-render) settles BEFORE the smooth scroll begins. Otherwise the
  // page does its own scroll work first and the row visibly jiggles
  // before our smooth scroll lands.
  function jumpToMessage(id: string) {
    const row = document.querySelector(`[data-msg-row="${id}"]`) as HTMLElement | null
    if (!row) return
    setTimeout(() => {
      row.scrollIntoView({ block: 'center', behavior: 'smooth' })
      row.classList.add('msg-jump-highlight')
      setTimeout(() => row.classList.remove('msg-jump-highlight'), 1600)
    }, 60)
  }

  // When replying to a message, make sure it stays visible after the
  // composer grows to show the reply preview. The messages container
  // is the scroll root now, so scrollIntoView works cleanly.
  useEffect(() => {
    if (!replyingTo) return
    const id = setTimeout(() => {
      const el = document.querySelector(`[data-msg-id="${replyingTo.id}"]`) as HTMLElement | null
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 60)
    return () => clearTimeout(id)
  }, [replyingTo])

  useEffect(() => {
    if (closed) return

    // Kick an immediate refresh as soon as the component mounts —
    // before the 3-second polling loop would otherwise first fire.
    // Covers the gap where a just-sent message wasn't in the
    // server-rendered initialMessages (browser cache, navigation
    // back/forward, native app resume) and would otherwise be
    // invisible for up to 3 seconds.
    const refreshOnce = async () => {
      try {
        const res = await fetch(`/api/threads/${threadId}/messages`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (data.status === 'CLOSED') {
          setClosed(true)
          setShowRating(true)
          return
        }
        const serverMsgs: any[] = data.messages || data || []
        const serverIds = new Set(serverMsgs.map((m: any) => m.id))
        setMessages((prev: any[]) => {
          const merged = serverMsgs.map((serverMsg: any) => {
            const existing = prev.find((m: any) => m.id === serverMsg.id)
            if (existing?.localPreview) return { ...serverMsg, localPreview: existing.localPreview }
            return serverMsg
          })
          const localOnly = prev.filter((m: any) => !serverIds.has(m.id) && m.pending)
          return [...merged, ...localOnly]
        })
      } catch { /* ignore — the poll below will catch up */ }
    }
    refreshOnce()

    // Realtime kick on push: PushRegistration dispatches
    // 'hai:new-message' on every foreground DM push. If the push
    // is for THIS thread, refetch immediately instead of waiting
    // up to 3s for the next poll tick — that's the source of the
    // "in-chat notifications are delayed" feel.
    const onPushMessage = (e: Event) => {
      const detail = (e as CustomEvent<{ threadId?: string }>).detail
      if (!detail?.threadId || detail.threadId === threadId) refreshOnce()
    }
    window.addEventListener('hai:new-message', onPushMessage)

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/threads/${threadId}/messages`, { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          if (data.status === 'CLOSED') {
            setClosed(true)
            setShowRating(true)
            clearInterval(interval)
          } else {
            // Merge server data with local state instead of replacing.
            // Preserves:
            //   - localPreview (blob URL) on messages we just sent this
            //     session, so the <img> doesn't flash to the remote URL
            //   - pending placeholders whose upload hasn't returned yet
            //     (their id is still the temp "pending-…")
            const serverMsgs: any[] = data.messages || data || []
            const serverIds = new Set(serverMsgs.map((m: any) => m.id))
            setMessages((prev: any[]) => {
              const merged = serverMsgs.map((serverMsg: any) => {
                const existing = prev.find((m: any) => m.id === serverMsg.id)
                if (existing?.localPreview) {
                  return { ...serverMsg, localPreview: existing.localPreview }
                }
                return serverMsg
              })
              const localOnly = prev.filter((m: any) => !serverIds.has(m.id) && m.pending)
              return [...merged, ...localOnly]
            })
          }
        }
      } catch { /* ignore */ }
    }, 3000)
    return () => {
      clearInterval(interval)
      window.removeEventListener('hai:new-message', onPushMessage)
    }
  }, [threadId, closed])

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
    if (!text.trim() || sendLockRef.current) return
    sendLockRef.current = true
    // Keep focus on the input BEFORE any async work — prevents iOS
    // from dismissing the keyboard when the form submits.
    textInputRef.current?.focus()
    hapticLight()
    const body = text.trim()
    const replyId = replyingTo?.id || null
    if (isOffline) { sendLockRef.current = false; toast.error(offlineMsg()); return }
    // Cross-nbhd confirmation — runs once per thread, then sticks.
    if (!(await gateOutsideDm())) { sendLockRef.current = false; return }
    setText('')
    setReplyingTo(null)
    setSending(true)

    // Optimistic insert — the bubble appears INSTANTLY, slides in via
    // .chat-bubble-in like any other message. The server round-trip
    // happens in the background; on response we replace by tempId.
    // Without this, users saw a ~1s gap between tapping send and the
    // bubble appearing on slow networks.
    const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const optimistic: Msg = {
      id: tempId,
      tempId,
      type: 'TEXT',
      text: body,
      lat: null,
      lng: null,
      imageUrl: null,
      senderId: currentUserId,
      createdAt: new Date().toISOString(),
      deliveredAt: null,
      readAt: null,
      replyToId: replyId,
      replyTo: replyingTo
        ? { id: replyingTo.id, senderId: replyingTo.senderId, type: replyingTo.type, text: replyingTo.text }
        : null,
    }
    setMessages(prev => [...prev, optimistic])
    playSend()

    try {
      const res = await fetch(`/api/threads/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'TEXT', text: body, replyToId: replyId }),
      })
      if (res.ok) {
        const msg = await res.json()
        // Swap the optimistic placeholder for the server row IN PLACE,
        // preserving tempId so the React key stays the same and the
        // bubble's DOM node (and entrance animation) doesn't replay.
        // If the 3s poll already inserted the real msg by id while we
        // were awaiting, just drop the placeholder.
        setMessages(prev => {
          const hasReal = prev.some(m => m.id === msg.id)
          if (hasReal) return prev.filter(m => m.tempId !== tempId)
          return prev.map(m => (m.tempId === tempId ? { ...msg, tempId } : m))
        })
      } else {
        await showApiError(res, lang as 'ar' | 'en' | 'ur')
        // Roll back the optimistic bubble + restore the input.
        setMessages(prev => prev.filter(m => m.id !== tempId))
        setText(body)
      }
    } catch (err) {
      toast.error(isOfflineError(err) || (err instanceof TypeError) ? offlineMsg() : t('common_error'))
      setMessages(prev => prev.filter(m => m.id !== tempId))
      setText(body)
    } finally { setSending(false); sendLockRef.current = false }
  }

  async function sendLocation() {
    if (sendLocationLockRef.current) return
    if (!(await gateOutsideDm())) return
    sendLocationLockRef.current = true
    setSendingLocation(true)
    setShowLocationConfirm(false)
    try {
      const pos = await getCurrentPositionSafe({
        enableHighAccuracy: false,
        timeout: 10_000,
        maximumAge: 60_000,
      })
      const res = await fetch(`/api/threads/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'LOCATION', lat: pos.coords.latitude, lng: pos.coords.longitude }),
      })
      if (res.ok) {
        const msg = await res.json()
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
      }
      else { await showApiError(res, lang as 'ar' | 'en' | 'ur') }
    } catch {
      toast.error(t('thread_location_fail'))
    } finally {
      setSendingLocation(false)
      sendLocationLockRef.current = false
    }
  }

  async function sendImage(file: File) {
    if (sendingImage) return
    if (!file.type.startsWith('image/')) { toast.error(lang === 'en' ? 'Images only' : 'صور فقط'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error(lang === 'en' ? 'Max 5MB' : 'الحد الأقصى 5 ميقا'); return }
    const replyId = replyingTo?.id || null
    setReplyingTo(null)
    setSendingImage(true)
    try {
      const urls = await uploadFiles([file])
      if (!urls[0]) return
      const res = await fetch(`/api/threads/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'IMAGE', imageUrl: urls[0], replyToId: replyId }),
      })
      if (res.ok) { const msg = await res.json(); setMessages(prev => [...prev, msg]) }
      else { await showApiError(res, lang as 'ar' | 'en' | 'ur') }
    } catch { toast.error(t('common_error')) }
    finally { setSendingImage(false); if (imgInputRef.current) imgInputRef.current.value = '' }
  }

  /**
   * PDF attachment in chat. Same shape as sendImages but uploads via
   * the client-direct path (Vercel Blob token + browser → blob),
   * which is necessary because messages allow up to 25MB documents
   * — well past the 4.5MB function body cap.
   *
   * Optimistic UX (matches the IMAGE flow): we insert a pending
   * placeholder bubble into the messages list the moment the user
   * picks the file, so the upload feels alive instead of silent.
   * The bubble carries `pending: true` plus the live `percent` so
   * the render path can show a progress overlay; when the upload
   * resolves we replace the placeholder with the real server msg.
   * On failure we drop the placeholder and toast the error.
   */
  async function sendPdf(file: File) {
    if (sendingImage) return // reuse the existing "uploading" lock
    if (file.type !== 'application/pdf') { toast.error(lang === 'en' ? 'PDF only' : 'PDF فقط'); return }
    if (file.size > 50 * 1024 * 1024) { toast.error(lang === 'en' ? 'Max 50MB' : 'الحد الأقصى 50 ميقا'); return }
    const replyId = replyingTo?.id || null
    setReplyingTo(null)
    setSendingImage(true)

    // Optimistic placeholder. Uses tempId so the React key stays the
    // same when we swap in the real server message (matches the
    // image-send pattern).
    const tempId = `pending-pdf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const placeholder: any = {
      id: tempId,
      tempId,
      type: 'PDF',
      text: null,
      lat: null,
      lng: null,
      imageUrl: null,
      pdfUrl: null,
      pdfName: file.name,
      senderId: currentUserId,
      createdAt: new Date().toISOString(),
      readAt: null,
      replyToId: replyId,
      replyTo: null,
      pending: true,
      // Carries the live upload percent so the render path's
      // overlay can tick — pulled out in the JSX via `(msg as any).percent`.
      percent: 0,
      // Initial stage. The pipeline flips it scanning → compressing
      // → uploading via onStage below so the bubble label reflects
      // what the upload is actually doing right now.
      stage: 'scanning' as UploadStage,
    }
    setMessages((prev) => [...prev, placeholder])
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: 'end' }))

    try {
      const result = await uploadPdf(file, {
        onProgress: (percent) => {
          // Update the placeholder's percent in place so the overlay
          // re-renders without disturbing scroll. Only touch the
          // pending placeholder — if the upload finished mid-tick
          // and the message has already been swapped, skip.
          setMessages((prev) =>
            prev.map((m: any) =>
              m.id === tempId && m.pending ? { ...m, percent } : m,
            ),
          )
        },
        onStage: (stage) => {
          setMessages((prev) =>
            prev.map((m: any) =>
              m.id === tempId && m.pending ? { ...m, stage } : m,
            ),
          )
        },
      })
      const res = await fetch(`/api/threads/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'PDF',
          pdfUrl: result.url,
          pdfName: result.name,
          replyToId: replyId,
        }),
      })
      if (res.ok) {
        const msg = await res.json()
        // Swap placeholder → real, dedup against any poll-race
        // duplicate the 3s poll might have inserted by id.
        setMessages((prev: any[]) => {
          return prev
            .map((m) => (m.id === tempId ? { ...msg, tempId } : m))
            .filter((m, idx, arr) =>
              m.id !== msg.id || arr.findIndex((x) => x.id === msg.id) === idx,
            )
        })
      } else {
        setMessages((prev) => prev.filter((m: any) => m.id !== tempId))
        await showApiError(res, lang as 'ar' | 'en' | 'ur')
      }
    } catch (err: any) {
      setMessages((prev) => prev.filter((m: any) => m.id !== tempId))
      toast.error(err?.message || t('common_error'))
    } finally {
      setSendingImage(false)
      if (pdfInputRef.current) pdfInputRef.current.value = ''
    }
  }

  // Send multiple images in order. Each one becomes its own IMAGE
  // message (matches how the thread model and reply/lightbox features
  // expect one imageUrl per message). The reply target, if any, is
  // attached only to the first image — subsequent ones are plain.
  async function sendImages(files: File[]) {
    if (sendImagesLockRef.current || files.length === 0) return
    if (!(await gateOutsideDm())) return
    sendImagesLockRef.current = true
    const valid = files.filter((f) => {
      if (!f.type.startsWith('image/')) return false
      if (f.size > 5 * 1024 * 1024) return false
      return true
    })
    const dropped = files.length - valid.length
    if (dropped > 0) {
      toast.error(lang === 'en'
        ? `${dropped} image${dropped > 1 ? 's' : ''} skipped (max 5MB / images only)`
        : `${dropped} صورة تم تجاهلها (الحد 5 ميقا / صور فقط)`)
    }
    if (valid.length === 0) return
    const replyId = replyingTo?.id || null
    setReplyingTo(null)
    setSendingImage(true)

    // Optimistic preview: insert a pending bubble per image immediately so
    // the user sees their photo uploading instead of a silent wait.
    const pendingPlaceholders = valid.map((file, i) => {
      const preview = URL.createObjectURL(file)
      blobUrlsRef.current.add(preview)
      return {
        id: `pending-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
        localPreview: preview,
        senderId: currentUserId,
        type: 'IMAGE' as const,
        imageUrl: null as string | null,
        text: null,
        createdAt: new Date().toISOString(),
        readAt: null,
        replyToId: i === 0 ? replyId : null,
        replyTo: null,
        pending: true as const,
      }
    })
    setMessages((prev) => [...prev, ...pendingPlaceholders as any])
    // Jump to the bottom right after inserting the pending bubbles.
    // The useEffect on messages.length handles most cases, but images may
    // have zero height until the blob URL loads — so we re-scroll below on
    // each <img> onLoad (see the bubble render) to stick to the bottom as
    // the photo's intrinsic dimensions resolve.
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: 'end' }))

    try {
      const urls = await uploadFiles(valid)
      for (let i = 0; i < urls.length; i++) {
        const imageUrl = urls[i]
        const tempId = pendingPlaceholders[i]?.id
        const localPreview = pendingPlaceholders[i]?.localPreview
        if (!imageUrl || !tempId) {
          // Upload failed for this slot — drop the pending placeholder
          if (tempId) setMessages((prev) => prev.filter((m: any) => m.id !== tempId))
          if (localPreview) URL.revokeObjectURL(localPreview)
          continue
        }
        const res = await fetch(`/api/threads/${threadId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'IMAGE',
            imageUrl,
            replyToId: i === 0 ? replyId : null,
          }),
        })
        if (res.ok) {
          const msg = await res.json()
          // Keep the blob URL as the rendered src for the lifetime of this
          // component — never swap it out. msg.imageUrl is still set for
          // persistence (replies/lightbox/other viewers/refresh), but the
          // visible <img> stays on the already-decoded local preview so
          // the bubble never flashes to blank. Blob URLs are cleaned up
          // on unmount (see the effect at the top of this component).
          // Same poll-race possibility as sendText: the 3s poll might
          // already have inserted the real msg by id while we were
          // awaiting the POST. Replace the pending placeholder with
          // the server msg, AND drop any duplicate that the poll
          // inserted (matched by the real id).
          setMessages((prev: any[]) => {
            const polledExists = prev.some((m) => m.id === msg.id)
            return prev
              .map((m) => (m.id === tempId ? { ...msg, localPreview } : m))
              .filter((m, idx, arr) =>
                // keep only the first occurrence of msg.id
                m.id !== msg.id || arr.findIndex((x) => x.id === msg.id) === idx,
              )
          })
        } else {
          // Drop pending placeholders for this and the rest of the batch
          setMessages((prev: any[]) => prev.filter((m) => !pendingPlaceholders.slice(i).some(p => p.id === m.id)))
          pendingPlaceholders.slice(i).forEach(p => p.localPreview && URL.revokeObjectURL(p.localPreview))
          await showApiError(res, lang as 'ar' | 'en' | 'ur')
          break
        }
      }
    } catch {
      // Drop all pending placeholders on catastrophic failure
      const ids = new Set(pendingPlaceholders.map(p => p.id))
      setMessages((prev: any[]) => prev.filter((m) => !ids.has(m.id)))
      pendingPlaceholders.forEach(p => p.localPreview && URL.revokeObjectURL(p.localPreview))
      toast.error(t('common_error'))
    }
    finally {
      setSendingImage(false)
      sendImagesLockRef.current = false
      if (imgInputRef.current) imgInputRef.current.value = ''
    }
  }

  /**
   * scope='me'  → hide for me only (always allowed). Drops the row
   *               from local state; server appends my id to hiddenBy.
   * scope='all' → tombstone for everyone (sender-only, ≤24h). Local
   *               state flips type=DELETED so other UI logic (no
   *               reactions, no edit) kicks in immediately.
   */
  async function deleteMessage(msgId: string, scope: 'me' | 'all') {
    try {
      const res = await fetch(
        `/api/threads/${threadId}/messages/${msgId}?scope=${scope}`,
        { method: 'DELETE' },
      )
      if (res.ok) {
        if (scope === 'me') {
          setMessages(prev => prev.filter(m => m.id !== msgId))
        } else {
          setMessages(prev => prev.map(m =>
            m.id === msgId
              ? { ...m, type: 'DELETED', text: null, imageUrl: null, lat: null, lng: null }
              : m,
          ))
        }
        // Tell PushRegistration to re-sweep the OS tray now — the
        // appStateChange listener won't fire if the user was already
        // in-app when they deleted, so without this nudge the banner
        // sits stale until next background/foreground cycle. Detail
        // tells the listener exactly which content to clear so it
        // can call UNUserNotificationCenter.removeDeliveredNotifications
        // immediately without waiting on the active-refs roundtrip.
        try {
          window.dispatchEvent(new CustomEvent('hai:content-deleted', {
            detail: { contentType: 'thread', contentId: threadId },
          }))
        } catch {}
        toast.success(lang === 'en' ? 'Deleted' : 'تم الحذف')
      } else {
        const d = await res.json().catch(() => ({}))
        toast.error(d?.error || (lang === 'en' ? 'Failed to delete' : 'فشل الحذف'))
      }
    } catch { toast.error(t('common_error')) }
    setSelectedMsg(null)
  }

  /** "Delete for everyone" eligibility — sender + ≤24h. */
  function canDeleteForAll(msg: Msg): boolean {
    if (msg.senderId !== currentUserId) return false
    return (Date.now() - new Date(msg.createdAt).getTime()) < 24 * 60 * 60_000
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
    <div
      ref={rootRef}
      className="flex flex-col bg-gray-100 dark:bg-gray-950"
      // Anchor the chat to the viewport via position:fixed (top below
      // the safe area, bottom = 0). Removes the chat screen from the
      // document scroll, so the iOS WKWebView's rubber-band bounce can
      // ONLY happen inside the messages list (which already has
      // overscroll-y-contain). Without this, pulling past the top or
      // bottom of the messages dragged the entire chat — header bar
      // and composer included — along with the document bounce.
      style={{
        position: 'fixed',
        top: 'env(safe-area-inset-top, 0px)',
        left: 0,
        right: 0,
        bottom: 0,
        overscrollBehavior: 'none',
        touchAction: 'pan-y',
      }}
    >
      {/* Header */}
      <header className="glass px-4 py-2.5 flex items-center gap-3 z-10 shadow-sm flex-shrink-0">
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
          <div className="min-w-0 text-start">
            <div className="flex items-center gap-1.5 min-w-0">
              <h1 className="text-[15px] font-semibold text-gray-900 dark:text-white truncate">
                {fullName(other) || (lang === 'en' ? 'Neighbor' : 'جار')}
              </h1>
              {isOutsideNbhd && (
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex-shrink-0"
                  title={lang === 'en' ? 'Outside your neighborhood' : 'من خارج الحي'}
                >
                  {lang === 'en' ? 'Outside' : 'خارج الحي'}
                </span>
              )}
            </div>
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
            <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="#00a884" strokeWidth="1.5" opacity="0.7" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="#00a884" strokeWidth="1.5" opacity="0.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="#00a884" strokeWidth="1.5" opacity="0.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="#00a884" strokeWidth="1.5" opacity="0.3" />
          </svg>
        </button>
        <button
          onClick={() => { setReportingUser(true); hapticLight() }}
          className="p-2 rounded-full hover:bg-white/10 transition-colors active:scale-90"
          title={lang === 'en' ? 'Report user' : lang === 'ur' ? 'صارف رپورٹ کریں' : 'الإبلاغ عن المستخدم'}
          aria-label="report user"
        >
          <FiFlag className="w-[18px] h-[18px] text-gray-500 dark:text-gray-400" />
        </button>
        {!closed && (
          <button data-tour="chat-close" data-guide="chat-close" onClick={closeThread}
            className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1 px-3 py-1.5 rounded-full bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors font-medium">
            <FiX className="w-3.5 h-3.5" />{t('thread_close')}
          </button>
        )}
      </header>

      {/* Messages */}
      <div
        ref={messagesRef}
        className={`px-4 py-3 flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain ${selectedMsg ? 'chat-focus-mode' : ''}`}
        data-selected-msg={selectedMsg ?? ''}
        data-tour="chat-messages"
        // touch-action: pan-y on the container itself, in addition to
        // the rule on [data-msg-row], so any touch that starts in the
        // padding/gutter between bubbles ALSO can't trigger native
        // horizontal pan. overflow-x: hidden clips any sub-pixel
        // horizontal layout drift the bubble's translateX could
        // otherwise expose at the edges.
        style={{
          background: isDark ? wallpaper.dark : wallpaper.light,
          touchAction: 'pan-y',
        }}
      >
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
              // Stable key across the optimistic-→-server-id swap so the
              // bubble's DOM node (and its .chat-bubble-in entrance) does
              // NOT replay when the response lands. Order of preference:
              //   1) tempId — set on text optimistic inserts
              //   2) localPreview — blob URL for image optimistic inserts
              //   3) msg.id — anything fetched from the server
              key={msg.tempId || (msg as any).localPreview || msg.id}
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
              onReply={() => { setReplyingTo(msg); textInputRef.current?.focus() }}
              onImageTap={(url) => setLightboxUrl(url)}
              onJumpToReply={jumpToMessage}
              selectedMsg={selectedMsg}
              showUnreadDivider={msg.id === unreadDividerId}
              t={t}
              currentUserId={currentUserId}
              otherName={fullName(other) || (lang === 'en' ? 'Neighbor' : 'جار')}
              onPendingImageLoad={() => {
                // Auto-stick to the bottom when an image finishes
                // loading IF the user is already near the bottom.
                // Without this, opening a chat with image messages
                // scrolled to the pre-load bottom (text height only),
                // then each image grew the container by up to 208 px
                // leaving the user above the actual current bottom.
                // Uses a 240 px threshold so the auto-stick survives
                // 1 unread image height; past that, the user is
                // intentionally scrolling history and we leave them.
                const ms = messagesRef.current
                if (!ms) return
                const nearBottom = ms.scrollHeight - ms.scrollTop - ms.clientHeight < 240
                if (nearBottom) bottomRef.current?.scrollIntoView({ block: 'end' })
              }}
            />
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Message action overlay — WhatsApp / iMessage style.
          The dim/blur of OTHER bubbles is handled per-row by the CSS
          rule .chat-focus-mode [data-msg-row]:not(.chat-bubble-focus)
          in globals.css, so the SELECTED bubble stays sharp and fully
          visible. We render NO backdrop tint here — any z-50 backdrop
          would sit ABOVE the bubble and dim it, defeating the focus
          effect. Tap-outside still works via this transparent fullscreen
          listener. */}
      {selectedMsg && selectedMsgData && (
        <div className="fixed inset-0 z-50" onClick={() => { setSelectedMsg(null); setShowMoreEmojis(false) }}>

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
                  {/* "Delete for me" — always available. Removes the
                      message from MY view; the other person still sees it. */}
                  <button onClick={() => deleteMessage(selectedMsgData.id, 'me')}
                    className="flex flex-col items-center gap-1 px-5 py-2.5 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors active:scale-95">
                    <FiTrash2 className="w-4.5 h-4.5 text-red-500" />
                    <span className="text-[10px] text-red-500 font-medium">
                      {lang === 'en' ? 'Delete for me' : 'احذف عندي'}
                    </span>
                  </button>
                  {/* "Delete for everyone" — sender, within 24h. Tombstones
                      the message globally (type=DELETED). */}
                  {canDeleteForAll(selectedMsgData) && (
                    <button onClick={() => deleteMessage(selectedMsgData.id, 'all')}
                      className="flex flex-col items-center gap-1 px-5 py-2.5 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors active:scale-95">
                      <FiTrash2 className="w-4.5 h-4.5 text-red-600" />
                      <span className="text-[10px] text-red-600 font-semibold">
                        {lang === 'en' ? 'Delete for all' : 'احذف للكل'}
                      </span>
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
          <div ref={profileSheetDrag.sheetRef} className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto z-50 bg-white dark:bg-gray-800 rounded-t-3xl shadow-2xl" style={{ maxHeight: '70vh' }}>
            <div ref={profileSheetDrag.handleRef} className="px-5 pt-3 pb-3 touch-none">
              <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto" />
            </div>
            <div className="px-5 pb-5">

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

                  {/* Account type badge — only for publicly visible providers */}
                  {profileData.accountType === 'SERVICE_PROVIDER' && (profileData.providerStatus === 'ACTIVE' || profileData.providerStatus === 'VERIFIED') && (
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
          <div ref={wallpaperSheetDrag.sheetRef} className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto z-50 bg-white dark:bg-gray-800 rounded-t-3xl shadow-2xl">
            <div ref={wallpaperSheetDrag.handleRef} className="px-5 pt-3 pb-3 touch-none">
              <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-2" />
              <h3 className="font-bold text-gray-900 dark:text-white text-center">
                {lang === 'en' ? 'Chat Wallpaper' : 'خلفية المحادثة'}
              </h3>
            </div>
            <div className="px-5 pb-6">
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
      <AttachmentMenu
        open={showAttachMenu}
        onClose={() => setShowAttachMenu(false)}
        onPickImage={() => setShowImageSheet(true)}
        onPickContact={async () => {
          const snippet = await attachContact()
          if (!snippet) return
          setText((prev) => (prev ? `${prev.trimEnd()}\n${snippet}` : snippet))
        }}
        onPickLocation={() => setShowLocationConfirm(true)}
        onPickDocument={() => pdfInputRef.current?.click()}
        variant="chat"
      />
      {/* Hidden PDF input — opened by the AttachmentMenu's
          "Document" row. onChange uploads + sends in one go via
          sendPdf, mirroring the existing image-attach flow. */}
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) sendPdf(file)
          // value reset is handled inside sendPdf's finally block
        }}
      />
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
                  {lang === 'en' ? 'Share location' : lang === 'ur' ? 'مقام شیئر کریں' : 'مشاركة موقع'}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {lang === 'en' ? 'Send your current location, or pick a point on the map' : lang === 'ur' ? 'اپنا موجودہ مقام بھیجیں یا نقشے سے منتخب کریں' : 'أرسل موقعك الحالي أو اختر نقطة على الخريطة'}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={sendLocation}
                className="w-full py-2.5 rounded-xl text-sm font-medium text-white bg-primary-600 active:scale-95 transition-transform">
                📍 {lang === 'en' ? 'Send my current location' : lang === 'ur' ? 'موجودہ مقام بھیجیں' : 'موقعي الحالي'}
              </button>
              <button
                onClick={async () => {
                  setShowLocationConfirm(false)
                  const { attachLocation } = await import('@/lib/locationPicker')
                  const snippet = await attachLocation({ lang })
                  if (!snippet) return
                  setText((prev) => (prev ? `${prev.trimEnd()}\n${snippet}` : snippet))
                  // Focus the input so the user can add a note before sending.
                  textInputRef.current?.focus()
                }}
                className="w-full py-2.5 rounded-xl text-sm font-medium text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800 active:scale-95 transition-transform">
                🗺️ {lang === 'en' ? 'Pick on map' : lang === 'ur' ? 'نقشے سے منتخب کریں' : 'اختر من الخريطة'}
              </button>
              <button onClick={() => setShowLocationConfirm(false)}
                className="w-full py-2 rounded-xl text-xs text-gray-500 dark:text-gray-400">
                {lang === 'en' ? 'Cancel' : lang === 'ur' ? 'منسوخ' : 'إلغاء'}
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
        <div ref={composerRef} className="glass-bottom px-4 w-full z-20 flex-shrink-0" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)' }}>
          {/* Reply preview bar */}
          {replyingTo && (
            <div className="flex items-center gap-2 px-1 pt-2 pb-1">
              <div className="flex-1 min-w-0 border-s-2 border-primary-500 ps-2.5 py-0.5">
                <p className="text-[10px] font-bold text-primary-600 dark:text-primary-400">
                  {replyingTo.senderId === currentUserId
                    ? (lang === 'en' ? 'You' : lang === 'ur' ? 'آپ' : 'أنت')
                    : (fullName(other) || (lang === 'en' ? 'Neighbor' : 'جار'))}
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                  {replyingTo.type === 'IMAGE' ? '📷' : replyingTo.type === 'PDF' ? '📄 PDF' : replyingTo.type === 'LOCATION' ? '📍' : (replyingTo.text || '').slice(0, 80)}
                </p>
              </div>
              <button onClick={() => setReplyingTo(null)} className="p-1 text-gray-400 active:scale-90">
                <FiX className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 py-2.5">
            <input ref={imgInputRef} type="file" accept="image/*" multiple className="hidden"
              onChange={e => {
                const files = Array.from(e.target.files || [])
                if (files.length > 0) sendImages(files)
              }} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => {
                const files = Array.from(e.target.files || [])
                if (files.length > 0) sendImages(files)
                if (cameraInputRef.current) cameraInputRef.current.value = ''
              }} />
            <button
              data-tour="chat-attach"
              onClick={() => { hapticLight(); setShowAttachMenu(true) }}
              disabled={sendingImage || sendingLocation}
              aria-label={lang === 'en' ? 'Attach' : lang === 'ur' ? 'منسلک کریں' : 'إرفاق'}
              className="p-2 rounded-full text-gray-300 dark:text-gray-300 hover:text-primary-400 active:scale-90 transition-all disabled:opacity-50 flex-shrink-0">
              <FiPaperclip className={`w-5 h-5 ${(sendingImage || sendingLocation) ? 'animate-pulse' : ''}`} />
            </button>
            <form onSubmit={sendText} className="flex-1 min-w-0 flex items-center gap-2">
              {/* min-w-0 on the input AND its parent form is required for the
                  flex-1 input to actually shrink below its content's min
                  intrinsic width. Without this, long placeholder/value would
                  push the send button off the visible edge of the screen on
                  some Android devices (Samsung curved screens reported it). */}
              <input ref={textInputRef} type="text" value={text} onChange={e => setText(e.target.value)}
                data-guide="chat-input"
                placeholder={t('thread_placeholder')}
                className="flex-1 min-w-0 bg-white/10 dark:bg-white/10 rounded-full px-4 py-2.5 text-[15px] text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-400 border border-white/10 focus:outline-none focus:ring-2 focus:ring-primary-400/40 focus:border-primary-400/30 transition-shadow"
                maxLength={1000} />
              <button type="submit" disabled={sending || !text.trim()}
                className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center text-white disabled:opacity-30 flex-shrink-0 active:scale-90 transition-all shadow-sm hover:bg-primary-700 glow-primary">
                {/* No more onTouchEnd → requestSubmit. The previous handler
                    fired the form's onSubmit AND the synthesized click
                    fired it again — duplicated messages on every Android
                    tap, and the synchronous send-lock only caught it
                    when both events landed in the same tick (it didn't,
                    consistently). The form's natural submit path now
                    runs exactly once per tap. sendText already calls
                    textInputRef.current?.focus() at the top so the iOS
                    keyboard refocus this previously guarded against
                    still works. */}
                <FiSend className="w-4.5 h-4.5" style={lang !== 'en' ? { transform: 'scaleX(-1)' } : undefined} />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* In-app image lightbox */}
      <ImageLightbox
        images={lightboxUrl ? [lightboxUrl] : []}
        initialIndex={0}
        open={lightboxUrl !== null}
        onClose={() => setLightboxUrl(null)}
      />

      {/* Camera/Gallery chooser sheet */}
      {showImageSheet && (
        <div
          className="fixed inset-0 z-[1000] bg-black/40 flex items-end justify-center"
          onClick={() => setShowImageSheet(false)}
        >
          <div
            className="w-full max-w-[480px] bg-white dark:bg-gray-800 rounded-t-3xl p-4 pb-6 space-y-2 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
          >
            <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-3" />
            <button
              onClick={async () => {
                setShowImageSheet(false)
                const isNative = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.()
                if (isNative) {
                  try {
                    const file = await pickImageFromCamera()
                    sendImages([file])
                  } catch (err: any) {
                    if (!err?.message?.toLowerCase?.().includes('cancel') && err?.message !== 'no_image') {
                      console.warn('[chat] camera failed', err)
                    }
                  }
                } else {
                  cameraInputRef.current?.click()
                }
              }}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-gray-50 dark:bg-gray-700 active:scale-[0.98] transition-transform"
            >
              <FiCamera className="w-5 h-5 text-primary-600" />
              <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                {lang === 'en' ? 'Take Photo' : lang === 'ur' ? 'تصویر لیں' : 'التقاط صورة'}
              </span>
            </button>
            <button
              onClick={async () => {
                setShowImageSheet(false)
                const files = await pickImagesOrFallback(10, imgInputRef)
                if (files.length > 0) sendImages(files)
              }}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-gray-50 dark:bg-gray-700 active:scale-[0.98] transition-transform"
            >
              <FiImage className="w-5 h-5 text-primary-600" />
              <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                {lang === 'en' ? 'From Gallery' : lang === 'ur' ? 'لائبریری سے' : 'من المعرض'}
              </span>
            </button>
            <button
              onClick={() => setShowImageSheet(false)}
              className="w-full py-3 mt-2 rounded-xl text-sm font-medium text-gray-500 dark:text-gray-400"
            >
              {t('profile_cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Account-level report sheet — opened from the flag icon in the
          chat header. Source is CHAT and conversationId is attached so
          moderators can jump straight to the thread. */}
      <ReportUserSheet
        open={reportingUser}
        onClose={() => setReportingUser(false)}
        targetUserId={other.id}
        targetName={fullName(other) || other.name}
        targetRole={other.role ?? null}
        source="CHAT"
        conversationId={threadId}
        onBlockRequested={async () => {
          try {
            const res = await fetch('/api/users/block', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: other.id }),
            })
            if (res.ok) {
              toast.success(lang === 'en' ? 'User blocked' : lang === 'ur' ? 'صارف بلاک ہو گیا' : 'تم حظر المستخدم')
            }
          } catch { /* non-fatal */ }
        }}
      />
    </div>
  )
}

// Separate bubble component for long-press handling
function MessageBubble({ msg, isMe, isLastInGroup, isFirstInGroup, showDate, dateLabel, timeStr, lang, editingMsg, editText, setEditText, editInputRef, onSaveEdit, onCancelEdit, onLongPress, onDoubleTap, onReply, onImageTap, onJumpToReply, selectedMsg, showUnreadDivider, t, currentUserId, otherName, onPendingImageLoad }: {
  msg: Msg; isMe: boolean; isLastInGroup: boolean; isFirstInGroup: boolean; showDate: boolean; dateLabel: string; timeStr: string; lang: string
  editingMsg: string | null; editText: string; setEditText: (v: string) => void; editInputRef: React.RefObject<HTMLInputElement>
  onSaveEdit: () => void; onCancelEdit: () => void; onLongPress: () => void; onDoubleTap: () => void; onReply: () => void; onImageTap: (url: string) => void; onJumpToReply: (id: string) => void; selectedMsg: string | null; showUnreadDivider: boolean; t: (k: any) => string
  currentUserId: string; otherName: string
  onPendingImageLoad?: () => void
}) {
  const longPress = useLongPress(onLongPress, onDoubleTap, 400)
  const rowRef = useRef<HTMLDivElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const swipeRef = useRef<{ startX: number; startY: number; dx: number; active: boolean; cancelled: boolean } | null>(null)
  // Sensitivity tuned for fewer accidental triggers:
  //   - 18px deadzone before we claim the gesture (was 8) — short
  //     drifts during a vertical scroll don't get hijacked.
  //   - 90px commit threshold (was 50) — user must clearly intend it.
  //   - 120px clamp ceiling (was 80) so the bubble can still travel
  //     past the threshold for haptic feedback.
  //   - Vertical-drift cancel: if |dy| exceeds |dx| while still in
  //     the deadzone, bail and let the page scroll.
  const REPLY_DEADZONE = 18
  const REPLY_THRESHOLD = 90
  const REPLY_CLAMP = 120

  // Swipe-to-reply gesture — the touch listener lives on the row so
  // the user can start the swipe from anywhere in the message area,
  // but the translate is applied to the BUBBLE wrapper only so the
  // date divider / unread divider / reactions stay rigid. Just the
  // bubble slides, matching WhatsApp-style swipe-to-reply.
  useEffect(() => {
    const row = rowRef.current
    if (!row || msg.type === 'DELETED') return

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return
      swipeRef.current = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        dx: 0,
        active: false,
        cancelled: false,
      }
    }
    function onTouchMove(e: TouchEvent) {
      const s = swipeRef.current
      if (!s || s.cancelled || e.touches.length !== 1) return
      const dx = e.touches[0].clientX - s.startX
      const dy = e.touches[0].clientY - s.startY
      const isRTL = document.documentElement.getAttribute('dir') === 'rtl'
      const progress = isRTL ? -dx : dx

      // Direction lock — decide on the FIRST few pixels whether this
      // is a horizontal swipe or a vertical scroll. Locking early
      // matters: without preventDefault, the messages container
      // scrolls vertically during the deadzone (the "all bubbles
      // nudge a bit" symptom). pan-y only blocks horizontal native
      // pan; vertical leakage during a horizontal gesture has to be
      // suppressed manually.
      if (!s.active && !s.cancelled) {
        const ax = Math.abs(dx)
        const ay = Math.abs(dy)
        if (ay > ax && ay > 6) {
          // Vertical-dominant — the page should scroll. Bail.
          s.cancelled = true
          return
        }
        if (progress > 4 && ax > ay) {
          // Horizontal-dominant — claim the gesture from this frame
          // onwards so vertical drift doesn't pan the container.
          e.preventDefault()
        }
      }

      if (progress < 0) { s.dx = 0; return }
      if (progress > REPLY_DEADZONE && !s.active) { s.active = true }
      if (!s.active) return
      e.preventDefault()
      const clamped = Math.min(progress, REPLY_CLAMP)
      s.dx = clamped
      const translate = isRTL ? -clamped : clamped
      const bubble = bubbleRef.current
      if (bubble) {
        bubble.style.transform = `translateX(${translate}px)`
        bubble.style.transition = 'none'
      }
    }
    function onTouchEnd() {
      const s = swipeRef.current
      if (!s) return
      const bubble = bubbleRef.current
      if (bubble) {
        bubble.style.transition = 'transform 200ms ease-out'
        bubble.style.transform = ''
      }
      if (s.dx >= REPLY_THRESHOLD) hapticLight()
      if (s.dx >= REPLY_THRESHOLD) {
        onReply()
      }
      swipeRef.current = null
    }

    row.addEventListener('touchstart', onTouchStart, { passive: true })
    row.addEventListener('touchmove', onTouchMove, { passive: false })
    row.addEventListener('touchend', onTouchEnd)
    row.addEventListener('touchcancel', onTouchEnd)
    return () => {
      row.removeEventListener('touchstart', onTouchStart)
      row.removeEventListener('touchmove', onTouchMove)
      row.removeEventListener('touchend', onTouchEnd)
      row.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [msg.type, onReply])

  // Render reply quote above the bubble. Tapping it jumps to the
  // original message and flashes a fading highlight (WhatsApp-style).
  const replyQuote = msg.replyTo ? (
    <button type="button"
      onClick={(e) => { e.stopPropagation(); if (msg.replyTo) onJumpToReply(msg.replyTo.id) }}
      className={`mb-1 w-full text-start px-2.5 py-1.5 rounded-lg border-s-2 active:opacity-70 transition-opacity ${
        isMe ? 'bg-primary-700/40 border-white/40' : 'bg-gray-100 dark:bg-white/10 border-primary-500'
      }`}>
      <p className={`text-[10px] font-bold ${isMe ? 'text-primary-100' : 'text-primary-600 dark:text-primary-400'}`}>
        {msg.replyTo.senderId === currentUserId
          ? (lang === 'en' ? 'You' : lang === 'ur' ? 'آپ' : 'أنت')
          : otherName}
      </p>
      <p className={`text-[11px] truncate ${isMe ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>
        {msg.replyTo.type === 'IMAGE' ? '📷' : msg.replyTo.type === 'PDF' ? '📄 PDF' : msg.replyTo.type === 'LOCATION' ? '📍' : (msg.replyTo.text || '').slice(0, 60)}
      </p>
    </button>
  ) : null

  return (
    <div ref={rowRef} data-msg-row={msg.id} className={`chat-bubble-in ${selectedMsg === msg.id ? 'chat-bubble-focus' : ''}`}>
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

      <div
        ref={bubbleRef}
        style={{ willChange: 'transform' }}
        // Force WhatsApp-style alignment: outgoing always on physical
        // right, incoming always on physical left, regardless of page
        // direction. In flex-col with dir=rtl, plain items-end flips to
        // LEFT — that was leaving outgoing bubbles hugging the left edge
        // with a wide empty wallpaper band on the right (the "black bar"
        // Android tablet users were reporting).
        className={`flex flex-col ${isMe ? 'ltr:items-end rtl:items-start' : 'ltr:items-start rtl:items-end'} ${isLastInGroup ? 'mb-2' : 'mb-[3px]'} ${isFirstInGroup && !showDate ? 'mt-3' : ''}`}
      >
        {msg.type === 'PDF' && (msg.pdfUrl || (msg as any).pending) ? (
          // PDF bubble — same width budget as image messages so it
          // doesn't visually balloon. While the upload is in flight
          // (pending=true, no pdfUrl yet), we render an "Uploading…"
          // overlay with the live percent on top of the placeholder
          // tile so the user can see something is happening — same
          // pattern as image bubbles, just adapted for the document
          // tile (no thumbnail to dim, so we use a translucent
          // overlay row beneath the tile).
          (() => {
            const pending = !!(msg as any).pending
            const percent = (msg as any).percent ?? 0
            // Placeholder URL is a no-op '#' so PdfTile renders the
            // same shape (icon + name + sublabel) without navigating
            // on tap during upload.
            const safeUrl = msg.pdfUrl || '#'
            return (
              <div className={`max-w-[85%]`} data-msg-id={msg.id} {...longPress}>
                {replyQuote && <div className="mb-1">{replyQuote}</div>}
                <div className={`relative rounded-2xl px-2.5 py-2 shadow-sm ${
                  isMe ? `bg-primary-600 ${isLastInGroup ? 'ltr:rounded-br-sm rtl:rounded-bl-sm' : ''}` : `bg-white dark:bg-[#242625] ${isLastInGroup ? 'ltr:rounded-bl-sm rtl:rounded-br-sm' : ''}`
                } ${pending ? 'opacity-90' : ''}`}>
                  <PdfTile
                    url={safeUrl}
                    name={msg.pdfName}
                    variant="message"
                    // isMe → green bubble bg → PdfTile must use
                    // white text + lighter sublabel; otherwise the
                    // filename and size badge get lost in the green.
                    tone={isMe ? 'onPrimary' : 'onSurface'}
                  />
                  {pending && (() => {
                    const stage: UploadStage = ((msg as any).stage as UploadStage) || 'scanning'
                    return (
                      <div className="mt-1.5 px-1 pb-0.5">
                        <div className="flex items-center justify-between mb-0.5 text-[10px] text-white/80">
                          <span
                            key={stage}
                            className="hai-typing-dots animate-fade-in"
                          >
                            {uploadStageLabel(stage, lang as 'ar' | 'en' | 'ur')}
                          </span>
                          <span className="font-medium tabular-nums">
                            {stage === 'uploading' ? `${percent}%` : ''}
                          </span>
                        </div>
                        <div className="h-0.5 w-full bg-white/20 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${stage === 'uploading' ? 'bg-white/80' : 'bg-white/60 animate-pulse'}`}
                            style={{
                              width: stage === 'uploading'
                                ? `${Math.max(2, Math.min(100, percent))}%`
                                : '30%',
                            }}
                          />
                        </div>
                      </div>
                    )
                  })()}
                </div>
                <p className={`text-[10px] mt-1 px-1 flex items-center gap-0.5 ${isMe ? 'text-gray-400 justify-start' : 'text-gray-400 justify-end'}`}>
                  {timeStr}
                  <MsgStatus msg={msg} isMe={isMe} />
                </p>
              </div>
            )
          })()
        ) : msg.type === 'IMAGE' && (msg.imageUrl || (msg as any).localPreview) ? (
          <div className={`max-w-[85%]`} data-msg-id={msg.id} {...longPress}>
            {replyQuote && <div className="mb-1">{replyQuote}</div>}
            <div onClick={() => msg.imageUrl && onImageTap(msg.imageUrl)} className={`relative ${msg.imageUrl ? 'cursor-pointer' : ''}`}>
              {/* Render the blob preview whenever we have one (sent in this
                  session). The remote imageUrl is only used for messages
                  fetched from the server (replies, refreshes, peers). */}
              <img
                src={(msg as any).localPreview || msg.imageUrl || ''}
                alt=""
                onLoad={() => {
                  // Fire on EVERY image load (server + pending). The
                  // parent handler decides whether to actually scroll
                  // (only when near bottom). Was previously gated to
                  // pending images only — that meant a chat with
                  // server image messages opened scrolled above the
                  // bottom because the initial scroll fired before
                  // images had loaded their final height.
                  onPendingImageLoad?.()
                }}
                className={`rounded-2xl max-h-52 object-cover shadow-sm ${(msg as any).pending ? 'opacity-60' : ''} ${isLastInGroup ? (isMe ? 'ltr:rounded-br-sm rtl:rounded-bl-sm' : 'ltr:rounded-bl-sm rtl:rounded-br-sm') : ''}`}
              />
              {(msg as any).pending && (
                <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/25">
                  <div className="flex items-center gap-2 bg-black/55 text-white text-[11px] font-medium px-3 py-1.5 rounded-full">
                    <span className="w-3.5 h-3.5 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                    {lang === 'en' ? 'Uploading…' : lang === 'ur' ? 'اپ لوڈ ہو رہا ہے…' : 'جاري الإرسال…'}
                  </div>
                </div>
              )}
            </div>
            <p className={`text-[10px] mt-1 px-1 flex items-center gap-0.5 ${isMe ? 'text-gray-400 justify-start' : 'text-gray-400 justify-end'}`}>
              {timeStr}
              <MsgStatus msg={msg} isMe={isMe} />
            </p>
          </div>
        ) : msg.type === 'DELETED' ? (
          <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
            isMe ? `bg-primary-600/30 ${isLastInGroup ? 'ltr:rounded-br-sm rtl:rounded-bl-sm' : ''}` : `bg-white/30 dark:bg-[#242625]/60 ${isLastInGroup ? 'ltr:rounded-bl-sm rtl:rounded-br-sm' : ''}`
          } border border-dashed ${isMe ? 'border-primary-400/40' : 'border-gray-300/40 dark:border-gray-600/30'}`}>
            <p className={`text-[13px] italic ${isMe ? 'text-primary-800/80 dark:text-primary-200/70' : 'text-gray-600 dark:text-gray-400'}`}>
              🚫 {isMe
                ? (lang === 'en' ? 'You deleted this message' : 'حذفت هذه الرسالة')
                : (lang === 'en' ? 'This message was deleted' : 'تم حذف هذه الرسالة')}
            </p>
            <p className={`text-[10px] mt-1 ${isMe ? 'text-primary-700/60 dark:text-primary-200/50' : 'text-gray-500/70 dark:text-gray-400/50'}`}>{timeStr}</p>
          </div>
        ) : editingMsg === msg.id ? (
          <div className="max-w-[85%] w-full">
            <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-2xl px-3 py-2 shadow-sm border-2 border-primary-400">
              <input ref={editInputRef} type="text" value={editText} onChange={e => setEditText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') onSaveEdit(); if (e.key === 'Escape') onCancelEdit() }}
                className="flex-1 bg-transparent text-sm text-gray-800 dark:text-white focus:outline-none" maxLength={1000} />
              <button onClick={onSaveEdit} className="text-primary-600 p-1"><FiCheck className="w-4 h-4" /></button>
              <button onClick={onCancelEdit} className="text-gray-400 p-1"><FiX className="w-4 h-4" /></button>
            </div>
          </div>
        ) : (
          <div {...longPress} data-msg-id={msg.id}
            style={!isMe ? { backgroundColor: 'var(--chat-incoming-bg, #fff)' } : undefined}
            className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-sm select-none ${
              isMe ? `bg-primary-600 text-white ${isLastInGroup ? 'ltr:rounded-br-sm rtl:rounded-bl-sm' : ''}` : `text-gray-800 dark:text-gray-100 ${isLastInGroup ? 'ltr:rounded-bl-sm rtl:rounded-br-sm' : ''}`
            } ${selectedMsg === msg.id ? 'relative z-[52] ring-2 ring-white/50' : ''}`}>
            {replyQuote}
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
