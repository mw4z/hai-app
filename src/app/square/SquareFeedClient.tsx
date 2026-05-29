'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  FiArrowLeft,
  FiArrowRight,
  FiImage,
  FiLock,
  FiUnlock,
  FiBell,
  FiCopy,
  FiCornerUpLeft,
  FiCornerUpRight,
  FiEdit3,
  FiEyeOff,
  FiFlag,
  FiTrash2,
  FiX,
} from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { useConfirm } from '@/components/ConfirmProvider'
import { useDragToDismiss } from '@/hooks/useDragToDismiss'
import { hapticLight } from '@/lib/haptic'
import SquareBubble from '@/components/square/SquareBubble'
import SquareComposer from '@/components/square/SquareComposer'
import ReportUserSheet from '@/components/ReportUserSheet'
import UserProfileSheet from '@/components/UserProfileSheet'
import ChatWallpaperPicker, { useChatWallpaper } from '@/components/ChatWallpaperPicker'
import { buildConvertToPostHref } from '@/lib/square/convertToPost'
import type {
  PublicSquareMessage,
  PublicSquareReplyTo,
} from '@/lib/square/serializeMessage'

const QUICK_EMOJIS = ['❤️', '👍', '👎', '😂', '😮', '🤲']
/** Same-sender messages within this many ms count as one group (no
 *  repeated sender label, no repeated timestamp). Mirrors the
 *  ~5-minute convention used by WhatsApp / iMessage. */
const GROUP_TIME_GAP_MS = 5 * 60 * 1000

interface InitialLock {
  isLocked: boolean
  isScheduled: boolean
  lockedAt: string | null
  lockedUntil: string | null
  lockedById: string | null
}

interface Props {
  /** First page of messages, oldest→newest (server returns ascending). */
  initialMessages: PublicSquareMessage[]
  /** True if older messages exist beyond the first SSR page. */
  hasMoreOlder: boolean
  neighborhoodName: string
  currentUserId: string
  /** Caller's role — used to gate the destructive "wipe all messages"
   *  button on the header. SUPER_ADMIN only. */
  currentUserRole: string
  /** SSR-resolved lock state — used for first paint. Client refreshes
   *  via /api/square/lock-status whenever the admin acts. */
  initialLock: InitialLock
}

const LAST_SEEN_KEY_PREFIX = 'square-last-seen-'

/**
 * Square — one shared neighborhood message space. Adopts the DM
 * ChatClient layout patterns (bubble alignment, group rhythm, date
 * dividers, long-press → action menu, sticky composer, keyboard
 * handling) while staying scoped to a single shared room with no
 * threads, no DMs, no media.
 */
export default function SquareFeedClient({
  initialMessages,
  hasMoreOlder: initialHasMore,
  neighborhoodName,
  currentUserId,
  currentUserRole,
  initialLock,
}: Props) {
  const isSuperAdmin = currentUserRole === 'SUPER_ADMIN'
  const isMod = currentUserRole === 'NEIGHBORHOOD_MOD'
    || currentUserRole === 'PLATFORM_MOD'
    || currentUserRole === 'SUPER_ADMIN'
  const [wipeBusy, setWipeBusy] = useState(false)
  // Square lock state — SSR-seeded, refreshed from the server after
  // any admin action.
  const [lock, setLock] = useState<InitialLock>(initialLock)
  const [showLockSheet, setShowLockSheet] = useState(false)

  // Composer-jump fix: when the keyboard rises on iOS, WKWebView
  // does NOT resize the WebView's frame (server.url-hosted app on
  // a native shell), so the bottom-anchored composer would sit
  // covered under the keyboard for a couple hundred ms until our
  // visualViewport handler caught up. Same fix DM uses (see
  // ChatClient ~line 418): listen to Capacitor Keyboard's
  // keyboardWillShow — it fires BEFORE the keyboard animates in
  // and carries the exact final height, so we can snap the root
  // to its target size immediately.
  const rootRef = useRef<HTMLDivElement | null>(null)
  // Keyboard-open flag drives the composer's bottom safe-area
  // padding. When the keyboard is up, the home-indicator inset
  // becomes a visible gap between the composer and the keyboard
  // — drop it to a tight 10px to close the gap. The composer
  // CSS-transitions the change so it doesn't pop.
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  // Live "who's typing" list. Polled every 2s while the page is
  // visible; rendered as a small ellipsis row above the composer.
  const [typingUsers, setTypingUsers] = useState<Array<{ id: string; name: string | null; lastName: string | null }>>([])
  // Wallpaper — shared preference with DM via localStorage. Picking
  // here syncs to /threads and any other open Square tab via the
  // 'storage' event the hook listens for.
  const { id: wallpaperId, wallpaper, isDark: wpIsDark, setWallpaperId } = useChatWallpaper()
  const [showWallpaperPicker, setShowWallpaperPicker] = useState(false)
  const { t, lang } = useLanguage()
  const confirm = useConfirm()
  const router = useRouter()

  const [messages, setMessages] = useState<PublicSquareMessage[]>(initialMessages)
  const [hasMoreOlder, setHasMoreOlder] = useState(initialHasMore)
  const [loadingOlder, setLoadingOlder] = useState(false)

  /** Long-press selection — the bubble being acted on. Drives both
   *  the chat-bubble-focus dim treatment and the action sheet. */
  const [selectedMsg, setSelectedMsg] = useState<PublicSquareMessage | null>(null)
  /** Staged reply target — non-null while the composer shows the
   *  reply preview bar and the next send will carry replyToMessageId. */
  const [replyingTo, setReplyingTo] = useState<PublicSquareReplyTo | null>(null)
  /** When the user picks "Report" from the action menu, target the
   *  message author for the report sheet. */
  const [reportTargetUserId, setReportTargetUserId] = useState<string | null>(null)
  /** When the user taps an avatar or sender name, open the shared
   *  UserProfileSheet for that user. */
  const [profileUserId, setProfileUserId] = useState<string | null>(null)

  const listRef = useRef<HTMLDivElement | null>(null)
  const endAnchorRef = useRef<HTMLDivElement | null>(null)
  /** Per-user "last seen" boundary captured ONCE on mount — SYNC
   *  during the ref's lazy initializer, BEFORE first render, so the
   *  unread divider is correct on the very first paint. (Previously
   *  this was assigned inside a useEffect, which only ran AFTER the
   *  initial render — the divider then appeared a tick late.)
   *  Any message whose createdAt is strictly newer than this is
   *  below the "رسائل جديدة" / "New messages" divider. */
  const lastSeenBoundaryRef = useRef<number | null>((() => {
    if (typeof window === 'undefined') return null
    try {
      const key = LAST_SEEN_KEY_PREFIX + (window.location.pathname || '')
      const raw = localStorage.getItem(key)
      const prev = raw ? parseInt(raw, 10) : null
      // IMPORTANT: write the NEW boundary AFTER capturing the prev,
      // so re-renders during this same session don't keep moving
      // the divider out from under the user.
      localStorage.setItem(key, String(Date.now()))
      return prev && Number.isFinite(prev) ? prev : null
    } catch { return null }
  })())
  /** Captured before a "load older" prepend so we can restore scrollTop
   *  to keep the user's anchor row in view after the DOM grows upward. */
  const preserveScrollFromHeight = useRef<number | null>(null)
  /** "Is the viewport near the bottom right now?" Drives whether
   *  incoming messages auto-scroll or just sit silently. */
  const nearBottomRef = useRef<boolean>(true)

  // First paint: snap to the bottom so the newest message is in
  // view. The "last seen" boundary is captured synchronously above
  // in the ref initializer, so the unread divider renders on the
  // very first paint — no useEffect-delay tick needed here.
  useEffect(() => {
    endAnchorRef.current?.scrollIntoView({ block: 'end', behavior: 'auto' })
  }, [])

  // After prepending older messages, restore the scroll position so
  // the user's view stays anchored on the row they were reading.
  useEffect(() => {
    const fromHeight = preserveScrollFromHeight.current
    if (fromHeight == null) return
    const el = listRef.current
    if (!el) return
    const delta = el.scrollHeight - fromHeight
    el.scrollTop = (el.scrollTop || 0) + delta
    preserveScrollFromHeight.current = null
  }, [messages.length])

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMoreOlder || messages.length === 0) return
    setLoadingOlder(true)
    const oldestIso = messages[0].createdAt
    preserveScrollFromHeight.current = listRef.current?.scrollHeight ?? null
    try {
      const res = await fetch(
        `/api/square/messages?before=${encodeURIComponent(oldestIso)}`,
        { cache: 'no-store' },
      )
      const data = await res.json().catch(() => ({}))
      const older: PublicSquareMessage[] = Array.isArray(data?.messages)
        ? data.messages
        : []
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id))
        return [...older.filter((m) => !seen.has(m.id)), ...prev]
      })
      setHasMoreOlder(!!data.hasMore)
    } catch {
      preserveScrollFromHeight.current = null
    } finally {
      setLoadingOlder(false)
    }
  }, [loadingOlder, hasMoreOlder, messages])

  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    // Near-bottom: viewport is within 60px of the bottom edge. Drives
    // whether a brand-new incoming message scrolls into view or just
    // appends quietly.
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    nearBottomRef.current = distanceFromBottom < 60
    // Near-top: kick off older-page load.
    if (el.scrollTop < 80 && hasMoreOlder && !loadingOlder) {
      loadOlder()
    }
  }, [hasMoreOlder, loadingOlder, loadOlder])

  function handleSent(msg: PublicSquareMessage) {
    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
    // Defer scroll-to-bottom one tick so the row mounts first.
    setTimeout(
      () => endAnchorRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }),
      0,
    )
  }

  /** Insert an optimistic pending message with a 'pending-' id prefix.
   *  Bubble renders a clock for own messages whose id starts with
   *  that prefix; when the real id swaps in (via handleSwapPending),
   *  the clock flips to the sent check. */
  function handleAddPending(msg: PublicSquareMessage) {
    setMessages((prev) => [...prev, msg])
    setTimeout(
      () => endAnchorRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }),
      0,
    )
  }
  /** Replace a pending placeholder with the server-confirmed message
   *  in place — preserves order and avoids the bubble re-mounting
   *  (which would replay the slide-in animation). */
  function handleSwapPending(tempId: string, real: PublicSquareMessage) {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === tempId)
      if (idx === -1) {
        // Pending row already gone (rare — refresh fired between
        // insert and swap). Just add the real one if missing.
        if (prev.some((m) => m.id === real.id)) return prev
        return [...prev, real]
      }
      const next = prev.slice()
      next[idx] = real
      return next
    })
  }
  function handleDropPending(tempId: string) {
    setMessages((prev) => prev.filter((m) => m.id !== tempId))
  }

  function handleJumpToReply(targetId: string) {
    const el = document.querySelector<HTMLElement>(`[data-msg-row="${CSS.escape(targetId)}"]`)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    // Brief glow so the user sees exactly which message we landed on.
    // chat-bubble-highlight (in globals.css) pulses a sky-blue
    // background tint for ~1.4s. We retrigger the class even if the
    // user spam-taps the quote by removing-then-readding it.
    el.classList.remove('chat-bubble-highlight')
    // Force a reflow so the animation restarts.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    el.offsetWidth
    el.classList.add('chat-bubble-highlight')
    setTimeout(() => el.classList.remove('chat-bubble-highlight'), 1500)
  }

  // Push-deeplink scroll-and-glow: when /square is opened from a
  // tapped square_notify / square_reply / square_reaction push,
  // the deeplink includes ?msg=<id>. Reuse the jump-to-reply
  // helper to scroll to that bubble and pulse-glow it. Retries
  // briefly to cover the case where the bubble hasn't mounted yet
  // (initial page paint or the message-sync poll fetching it).
  const searchParams = useSearchParams()
  const targetMsgId = searchParams?.get('msg') || null
  useEffect(() => {
    if (!targetMsgId) return
    let cancelled = false
    let tries = 0
    const tick = () => {
      if (cancelled) return
      const el = document.querySelector<HTMLElement>(`[data-msg-row="${CSS.escape(targetMsgId)}"]`)
      if (el) {
        handleJumpToReply(targetMsgId)
        return
      }
      // Bubble not painted yet — retry up to ~3s while the SSR
      // hydrates / the message-sync poll catches an out-of-page
      // target. Bail after that so we don't loop forever for a
      // genuinely missing message (hidden / deleted).
      if (++tries > 20) return
      setTimeout(tick, 150)
    }
    // First attempt deferred a tick so the messages list mounts.
    setTimeout(tick, 50)
    return () => { cancelled = true }
  }, [targetMsgId])

  // ── Long-press action handlers ─────────────────────────────────────
  function handleReply() {
    if (!selectedMsg) return
    setReplyingTo({
      id: selectedMsg.id,
      authorId: selectedMsg.author.id,
      authorName: selectedMsg.author.name,
      authorLastName: selectedMsg.author.lastName,
      body: selectedMsg.body,
      type: selectedMsg.type,
      status: selectedMsg.status,
    })
    setSelectedMsg(null)
  }

  // SUPER_ADMIN-only: wipe every Square message in this neighborhood.
  // Confirmation dialog uses the browser's native confirm so we don't
  // pull in extra component scaffolding for a one-off destructive op.
  async function handleWipeNeighborhood() {
    if (!isSuperAdmin) return
    if (wipeBusy) return
    const ok = window.confirm(
      lang === 'en'
        ? 'Delete EVERY Square message in this neighborhood? This cannot be undone.'
        : 'حذف كل رسائل الساحة في هذا الحي؟ لا يمكن التراجع.',
    )
    if (!ok) return
    setWipeBusy(true)
    try {
      const res = await fetch('/api/admin/square/wipe-my-neighborhood', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        alert((lang === 'en' ? 'Wipe failed: ' : 'فشل الحذف: ') + (errText || res.status))
        return
      }
      const data = await res.json() as { deleted?: number }
      // Clear the local message list so the user sees the empty state
      // immediately — no need to refetch since the server is now empty.
      setMessages([])
      alert(
        lang === 'en'
          ? `Deleted ${data.deleted ?? 0} message(s).`
          : `تم حذف ${data.deleted ?? 0} رسالة.`,
      )
    } catch (err) {
      alert((lang === 'en' ? 'Wipe failed: ' : 'فشل الحذف: ') + (err as Error)?.message)
    } finally {
      setWipeBusy(false)
    }
  }

  // ── Square lock handlers ──────────────────────────────────────────
  async function refreshLockStatus() {
    try {
      const res = await fetch('/api/square/lock-status', { credentials: 'include' })
      if (!res.ok) return
      const data = await res.json() as InitialLock
      setLock(data)
    } catch {}
  }

  async function applyLock(payload: { from?: string | null; until?: string | null; clear?: boolean }) {
    if (!isMod) return
    try {
      const res = await fetch('/api/square/lock', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(lang === 'en' ? `Lock failed: ${data?.error || res.status}` : `فشل القفل: ${data?.error || res.status}`)
        return
      }
      await refreshLockStatus()
      setShowLockSheet(false)
    } catch (err) {
      alert((lang === 'en' ? 'Lock failed: ' : 'فشل القفل: ') + (err as Error)?.message)
    }
  }

  // ── Live lock-status sync ────────────────────────────────────────
  // Keep every connected client honest about the current lock state
  // — if a mod locks the chat, residents see the banner appear
  // within ~15s without reloading. And on tab focus / app foreground
  // we refresh immediately so coming back to the app is always
  // current. Also clock-aware: if the lock has a scheduled start
  // or auto-unlock, the page picks up the transition as the server
  // resolves it (the API computes isLocked from the columns + now).
  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      if (cancelled) return
      // Skip the network round-trip when the page isn't on screen.
      if (typeof document !== 'undefined' && document.hidden) return
      try {
        const res = await fetch('/api/square/lock-status', {
          credentials: 'include',
          cache: 'no-store',
        })
        if (!res.ok || cancelled) return
        const data = await res.json() as InitialLock
        // Object identity is fine here — setLock just triggers a
        // re-render; React bails if the values match.
        setLock((prev) => {
          if (
            prev.isLocked === data.isLocked
            && prev.isScheduled === data.isScheduled
            && prev.lockedAt === data.lockedAt
            && prev.lockedUntil === data.lockedUntil
            && prev.lockedById === data.lockedById
          ) return prev
          return data
        })
      } catch {/* ignore — next tick will catch up */}
    }
    const intervalId = setInterval(tick, 15_000)
    const onVisibility = () => { if (!document.hidden) void tick() }
    const onFocus = () => void tick()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    // Capacitor App resume — the WebView's `focus` event doesn't
    // fire on iOS when the app comes back from background, so we
    // listen for the platform's own appStateChange too.
    let appHandle: { remove: () => void } | null = null
    ;(async () => {
      try {
        const { App } = await import('@capacitor/app')
        appHandle = await App.addListener('appStateChange', ({ isActive }: { isActive: boolean }) => {
          if (isActive) void tick()
        })
      } catch { /* not native — fine */ }
    })()
    return () => {
      cancelled = true
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
      try { appHandle?.remove() } catch {}
    }
  }, [])

  // ── Keyboard-aware viewport sizing ───────────────────────────────
  // Mirrors the DM ChatClient handler. Three signal sources, in
  // priority order:
  //   1. Capacitor Keyboard willShow/Hide (iOS) — fires BEFORE the
  //      animation, carries exact final keyboardHeight. Resizes the
  //      root in the same frame, so the composer snaps to its
  //      final spot without the visible "jump after keyboard rises"
  //      lag the user reported.
  //   2. visualViewport.resize — Android (resize mode: body) and
  //      web fallback. Fires when the browser shrinks the visual
  //      viewport for the keyboard.
  //   3. Initial value from visualViewport.height.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const vv = window.visualViewport
    const root = rootRef.current
    if (!vv || !root) return

    const platform = (window as any).Capacitor?.getPlatform?.() || 'web'
    const isIos = platform === 'ios'
    const isAndroid = platform === 'android'
    const isNative = isIos || isAndroid

    const setHeight = (visibleHeight: number) => {
      root.style.height = `calc(${visibleHeight}px - env(safe-area-inset-top, 0px))`
    }
    // Pull the bottom of the message list back into view whenever the
    // keyboard opens — otherwise the freshly-revealed input covers
    // the last message and the user can't see what they were
    // replying to. Anchors at the end div so scroll lands on the
    // last bubble even mid-keyboard-animation.
    const scrollToBottom = () => {
      // Wait a frame so the new root height has applied before we
      // measure scrollHeight; otherwise scrollIntoView lands on the
      // pre-shrink position and undershoots.
      requestAnimationFrame(() => {
        endAnchorRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
      })
    }

    setHeight(vv.height)
    let prevKeyboardOpen = false
    const onVV = () => {
      setHeight(vv.height)
      // Heuristic fallback for WEB only. On Android (resize:body)
      // both window.innerHeight AND vv.height shrink together
      // when the keyboard opens, so their difference stays ~0 —
      // we can't detect the keyboard from visualViewport alone.
      // The Capacitor Keyboard listeners below are the only
      // reliable source on Android.
      if (!isNative) {
        const open = (window.innerHeight - vv.height) > 150
        setKeyboardOpen(open)
        if (open && !prevKeyboardOpen) scrollToBottom()
        prevKeyboardOpen = open
      }
    }
    vv.addEventListener('resize', onVV)
    vv.addEventListener('scroll', onVV)

    // Capacitor Keyboard listeners on BOTH iOS and Android.
    //   - iOS: drives setHeight too (visualViewport doesn't fire
    //     when WKWebView's frame stays fixed).
    //   - Android: ONLY drives the keyboardOpen flag, not
    //     setHeight (visualViewport already shrinks the root
    //     correctly when resize:body fires).
    //   - BOTH platforms call scrollToBottom so the last message
    //     stays visible above the rising keyboard.
    let cleanupKb: (() => void) | null = null
    if (isNative) {
      import('@capacitor/keyboard').then(({ Keyboard }) => {
        const h1 = Keyboard.addListener('keyboardWillShow', (info) => {
          if (isIos) setHeight(window.innerHeight - info.keyboardHeight)
          setKeyboardOpen(true)
          scrollToBottom()
        })
        const h2 = Keyboard.addListener('keyboardWillHide', () => {
          if (isIos) setHeight(window.innerHeight)
          setKeyboardOpen(false)
        })
        cleanupKb = () => {
          h1.then((x) => x.remove())
          h2.then((x) => x.remove())
        }
      }).catch(() => {})
    }

    return () => {
      vv.removeEventListener('resize', onVV)
      vv.removeEventListener('scroll', onVV)
      cleanupKb?.()
    }
  }, [])

  // ── Live message sync ────────────────────────────────────────────
  // Polls the latest page of messages every 5s while the page is
  // visible and re-fetches on tab return / window focus / app
  // resume. New messages get prepended/appended in time order,
  // and existing messages get updated in place when their server-
  // side fields change (reactions, viewCount, notificationFiredAt,
  // type=DELETED tombstones, body / imageUrl edits).
  //
  // Older messages already loaded via "load older" pagination are
  // PRESERVED — the merge only touches ids the server returned in
  // this latest page. So scrolling up to load 100s of historical
  // messages then leaving the page open doesn't lose them.
  //
  // Same skip-when-hidden / Capacitor appStateChange triggers as
  // the lock-status effect above, so a single coherent refresh
  // happens on every focus event.
  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      if (cancelled) return
      if (typeof document !== 'undefined' && document.hidden) return
      try {
        const res = await fetch('/api/square/messages', {
          credentials: 'include',
          cache: 'no-store',
        })
        if (!res.ok || cancelled) return
        const data = await res.json() as {
          messages: PublicSquareMessage[]
          hasMore: boolean
        }
        const serverMessages = data.messages || []
        if (cancelled || serverMessages.length === 0) return
        setMessages((prev) => {
          const byId = new Map(prev.map((m) => [m.id, m] as const))
          let changed = false
          for (const srv of serverMessages) {
            const existing = byId.get(srv.id)
            if (!existing) {
              byId.set(srv.id, srv)
              changed = true
              continue
            }
            // Field-by-field equality on everything that can change
            // server-side without the local user's action. Reactions
            // are an array of {emoji,userId}; cheapest correct test
            // is a length check then a JSON compare.
            const reactionsSame =
              existing.reactions.length === srv.reactions.length
              && JSON.stringify(existing.reactions) === JSON.stringify(srv.reactions)
            if (
              existing.type === srv.type
              && existing.status === srv.status
              && existing.body === srv.body
              && existing.imageUrl === srv.imageUrl
              && existing.viewCount === srv.viewCount
              && existing.notificationFiredAt === srv.notificationFiredAt
              && existing.isPinned === srv.isPinned
              && existing.pinnedAt === srv.pinnedAt
              && reactionsSame
            ) continue
            byId.set(srv.id, srv)
            changed = true
          }
          if (!changed) return prev
          return Array.from(byId.values()).sort((a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          )
        })
      } catch { /* next tick will catch up */ }
    }
    const intervalId = setInterval(tick, 5_000)
    const onVisibility = () => { if (!document.hidden) void tick() }
    const onFocus = () => void tick()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    let appHandle: { remove: () => void } | null = null
    ;(async () => {
      try {
        const { App } = await import('@capacitor/app')
        appHandle = await App.addListener('appStateChange', ({ isActive }: { isActive: boolean }) => {
          if (isActive) void tick()
        })
      } catch { /* not native — fine */ }
    })()
    // Push-triggered nudge: PushRegistration dispatches these custom
    // events when a foreground push arrives for Square activity.
    // Refreshing immediately means the user sees the reply / reaction
    // / broadcast without waiting up to 5s for the next poll.
    const onSquarePush = () => void tick()
    window.addEventListener('hai:square-activity', onSquarePush)
    return () => {
      cancelled = true
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('hai:square-activity', onSquarePush)
      try { appHandle?.remove() } catch {}
    }
  }, [])

  // ── Live typing indicator ───────────────────────────────────────
  // Poll /api/square/typing every 2s for the list of OTHER users
  // currently typing in this neighborhood. Server-side TTL handles
  // expiry — we just render whatever the server says is fresh.
  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      if (cancelled) return
      if (typeof document !== 'undefined' && document.hidden) return
      try {
        const res = await fetch('/api/square/typing', {
          credentials: 'include',
          cache: 'no-store',
        })
        if (!res.ok || cancelled) return
        const data = await res.json() as { users: Array<{ id: string; name: string | null; lastName: string | null }> }
        setTypingUsers(data.users || [])
      } catch { /* next tick will catch up */ }
    }
    const intervalId = setInterval(tick, 2_000)
    const onVisibility = () => { if (!document.hidden) void tick() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // Quick-reply variant: triggered by the small reply arrow on the
  // bubble itself, so we DON'T have a long-press-selected message to
  // pull from — the bubble passes the target directly.
  function handleQuickReply(msg: PublicSquareMessage) {
    setReplyingTo({
      id: msg.id,
      authorId: msg.author.id,
      authorName: msg.author.name,
      authorLastName: msg.author.lastName,
      body: msg.body,
      type: msg.type,
      status: msg.status,
    })
  }
  async function handleCopy() {
    if (!selectedMsg) return
    try {
      await navigator.clipboard.writeText(selectedMsg.body || '')
      toast.success(lang === 'en' ? 'Copied' : 'تم النسخ')
    } catch {
      toast.error(lang === 'en' ? 'Copy failed' : 'فشل النسخ')
    }
    setSelectedMsg(null)
  }
  function handleReport() {
    if (!selectedMsg) return
    setReportTargetUserId(selectedMsg.author.id)
    setSelectedMsg(null)
  }
  function handleConvertToPost() {
    if (!selectedMsg) return
    router.push(buildConvertToPostHref({ body: selectedMsg.body }))
    setSelectedMsg(null)
  }
  async function handleToggleReaction(messageId: string, emoji: string) {
    // Optimistically flip the reaction so the chip lights up
    // instantly; the server response is the truth and replaces our
    // optimistic shape.
    const me = currentUserId
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m
        const mine = m.reactions.find((r) => r.userId === me)
        let next = m.reactions
        if (mine && mine.emoji === emoji) {
          next = m.reactions.filter((r) => r.userId !== me)
        } else if (mine) {
          next = m.reactions.map((r) => (r.userId === me ? { emoji, userId: me } : r))
        } else {
          next = [...m.reactions, { emoji, userId: me }]
        }
        return { ...m, reactions: next }
      }),
    )
    try {
      const res = await fetch(`/api/square/messages/${messageId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      })
      if (!res.ok) {
        toast.error(lang === 'en' ? 'Reaction failed' : 'تعذر إرسال التفاعل')
        return
      }
      const data = await res.json().catch(() => ({}))
      if (Array.isArray(data?.reactions)) {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, reactions: data.reactions } : m)),
        )
      }
    } catch {
      // Optimistic flip already happened; on transient errors the
      // next list refresh will reconcile. No toast spam.
    }
  }
  function handleAvatarTap(userId: string) {
    // Now allows OWN avatar taps too — opens the same UserProfileSheet
    // for self, which renders the same public profile every other
    // viewer sees (useful sanity check + entry to /profile editor).
    if (userId) setProfileUserId(userId)
  }
  async function handleDeleteForMe() {
    if (!selectedMsg) return
    const target = selectedMsg
    setSelectedMsg(null)
    // Optimistic — remove from local list immediately.
    setMessages((prev) => prev.filter((m) => m.id !== target.id))
    try {
      const res = await fetch(`/api/square/messages/${target.id}?scope=me`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        toast.error(lang === 'en' ? 'Could not hide' : 'تعذر إخفاء الرسالة')
        // Put it back on failure.
        setMessages((prev) => [...prev, target].sort((a, b) =>
          Date.parse(a.createdAt) - Date.parse(b.createdAt),
        ))
      }
    } catch {
      setMessages((prev) => [...prev, target].sort((a, b) =>
        Date.parse(a.createdAt) - Date.parse(b.createdAt),
      ))
    }
  }
  async function handleDeleteForAll() {
    if (!selectedMsg) return
    const target = selectedMsg
    setSelectedMsg(null)
    try {
      const res = await fetch(`/api/square/messages/${target.id}?scope=all`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(
          typeof data.error === 'string'
            ? data.error
            : data.error?.message || (lang === 'en' ? 'Could not delete' : 'تعذر الحذف'),
        )
        return
      }
      // Tombstone locally — flip the rendered message to DELETED so
      // the bubble shows "🚫 حذفت هذه الرسالة" immediately. The next
      // refresh from the server agrees.
      setMessages((prev) =>
        prev.map((m) =>
          m.id === target.id
            ? {
                ...m,
                type: 'DELETED',
                body: null,
                lat: null,
                lng: null,
                pdfUrl: null,
                pdfName: null,
                audioUrl: null,
                audioDurationMs: null,
                audioMimeType: null,
                imageUrl: null,
                reactions: [],
              }
            : m,
        ),
      )
    } catch {
      toast.error(lang === 'en' ? 'Could not delete' : 'تعذر الحذف')
    }
  }
  /** Shared "notify neighbors" handler. Used by both the long-press
   *  sheet (operates on selectedMsg) and the inline bubble chip
   *  (operates on the bubble's own message), so the API call,
   *  optimistic update, and toasts live in one place.
   *
   *  Asks for explicit native-style confirmation FIRST — a tap on
   *  the broadcast pill pushes a notification to everyone in the
   *  neighborhood, which is destructive-ish (can't unsend), so we
   *  surface a confirm dialog the same way DM ChatClient does for
   *  end-conversation / report-user actions. */
  async function notifyMessage(target: PublicSquareMessage) {
    // Always block on hidden/deleted messages — there's nothing
    // to broadcast about. But ONLY block on "already fired" for
    // non-mods; mods can re-broadcast a message (server allows
    // it), and the early return here was silently swallowing
    // their tap so the confirm dialog never appeared.
    if (target.status !== 'ACTIVE') return
    if (!isMod && target.notificationFiredAt) return
    const alreadyFired = !!target.notificationFiredAt
    const ok = await confirm({
      title: lang === 'en' ? 'Notify everyone?' : 'تنبيه كل سكان الحي؟',
      message: lang === 'en'
        ? (alreadyFired
            ? 'A push notification was already sent for this message. Sending again will notify every neighbor a second time.'
            : 'A push notification will be sent to every neighbor about this message. You can only do this once per message.')
        : (alreadyFired
            ? 'تم تنبيه الجيران على هذه الرسالة من قبل. إعادة الإرسال ستنبّههم مرة أخرى.'
            : 'سيتم إرسال إشعار لكل سكان الحي بهذه الرسالة. يمكنك تنبيه الجيران مرة واحدة فقط لكل رسالة.'),
      confirmText: lang === 'en' ? (alreadyFired ? 'Send again' : 'Notify') : (alreadyFired ? 'إعادة الإرسال' : 'تنبيه'),
      cancelText: lang === 'en' ? 'Cancel' : 'إلغاء',
      variant: alreadyFired ? 'danger' : 'default',
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/square/messages/${target.id}/notify`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(
          typeof data.error === 'string'
            ? data.error
            : data.error?.message || (lang === 'en' ? 'Could not notify' : 'تعذر إرسال التنبيه'),
        )
        return
      }
      const firedAt = (data.notificationFiredAt as string) || new Date().toISOString()
      setMessages((prev) =>
        prev.map((m) =>
          m.id === target.id ? { ...m, notificationFiredAt: firedAt } : m,
        ),
      )
      toast.success(lang === 'en' ? 'Neighbors notified' : 'تم تنبيه الجيران')
    } catch {
      toast.error(lang === 'en' ? 'Could not notify' : 'تعذر إرسال التنبيه')
    }
  }
  function handleNotifyNeighbors() {
    if (!selectedMsg) return
    const target = selectedMsg
    setSelectedMsg(null)
    notifyMessage(target)
  }
  /** Inline-chip version used by SquareBubble. Same handler, no
   *  selection state to clear. */
  function handleMakePostForMessage(message: PublicSquareMessage) {
    router.push(buildConvertToPostHref({ body: message.body }))
  }
  function handleNotifyForMessage(message: PublicSquareMessage) {
    notifyMessage(message)
  }

  const empty = messages.length === 0

  // Pre-compute the per-message "is first / last in same-sender group"
  // + "show day-divider" flags. Group break happens when EITHER the
  // sender changes OR the time gap from the previous message exceeds
  // GROUP_TIME_GAP_MS — so a sender's quick run stays one group and
  // their later message (hours apart) starts a new one with its own
  // sender label + timestamp + avatar.
  const decorated = useMemo(() => {
    const boundary = lastSeenBoundaryRef.current
    // First message strictly newer than the captured boundary AND
    // NOT authored by the viewer (the user shouldn't see "new
    // messages" pointing at their own sent ones). Only one bubble
    // gets the divider — the first unread row.
    let firstUnreadId: string | null = null
    if (boundary != null) {
      for (const m of messages) {
        if (Date.parse(m.createdAt) > boundary && m.author.id !== currentUserId) {
          firstUnreadId = m.id
          break
        }
      }
    }
    let lastDay = ''
    return messages.map((msg, idx) => {
      const day = dayKey(msg.createdAt)
      const showDate = day !== lastDay
      if (showDate) lastDay = day
      const prev = messages[idx - 1]
      const next = messages[idx + 1]
      const sameSenderAsPrev =
        prev && prev.author.id === msg.author.id
      const sameSenderAsNext =
        next && next.author.id === msg.author.id
      const closeToPrev =
        prev && (Date.parse(msg.createdAt) - Date.parse(prev.createdAt)) < GROUP_TIME_GAP_MS
      const closeToNext =
        next && (Date.parse(next.createdAt) - Date.parse(msg.createdAt)) < GROUP_TIME_GAP_MS
      const isFirstInGroup = showDate || !sameSenderAsPrev || !closeToPrev
      const isLastInGroup = !sameSenderAsNext || !closeToNext
      const showUnreadDivider = msg.id === firstUnreadId
      return { msg, isFirstInGroup, isLastInGroup, showDate, showUnreadDivider, dateLabel: dateLabelFor(msg.createdAt, lang) }
    })
  }, [messages, lang, currentUserId])

  return (
    <div
      ref={rootRef}
      className="flex flex-col bg-gray-100 dark:bg-gray-950"
      // EXACT DM container pattern (see ChatClient.tsx ~line 1424). The
      // chat is anchored to the viewport via position:fixed (top sits
      // BELOW the iOS safe-area so html::before still paints the notch
      // with the same colour as .glass; bottom = 0). Removes the page
      // from the document scroll → iOS WKWebView's rubber-band bounce
      // can only fire INSIDE the messages list (which has its own
      // overscroll-y-contain), not on the header/composer chrome.
      //
      // The inline `height` is owned by the keyboard-aware effect
      // above (setHeight). Don't add a height value here — it would
      // win and the composer would lag behind keyboardWillShow.
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
      {/* Header — `.glass` is the same class the DM chat header uses,
          which paints the same background as html::before's safe-area
          cover → no colour seam between notch and title strip. */}
      <header className="glass px-4 py-2.5 flex items-center gap-3 z-10 shadow-sm flex-shrink-0">
        <Link href="/feed" className="text-gray-500 dark:text-gray-400 p-1" aria-label={lang === 'en' ? 'Back' : 'رجوع'}>
          {lang !== 'en' ? <FiArrowRight className="w-5 h-5" /> : <FiArrowLeft className="w-5 h-5" />}
        </Link>
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-base flex-shrink-0 shadow-sm" aria-hidden>
          🏘️
        </div>
        <div className="min-w-0 text-start flex-1">
          <h1 className="text-[15px] font-semibold text-gray-900 dark:text-white truncate">
            {t('square_page_title')}
          </h1>
          {neighborhoodName && (
            <p className="text-[11px] font-medium text-gray-400 truncate">
              {lang === 'en' ? `In ${neighborhoodName}` : `حي ${neighborhoodName}`}
            </p>
          )}
        </div>
        {/* Lock / unlock — moderators only. Tap to open the schedule
            sheet (which also offers "lock now indefinitely" + "unlock
            now"). Visible only when the user can actually use it. */}
        {isMod && (
          <button
            type="button"
            onClick={() => setShowLockSheet(true)}
            className={`flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full border active:scale-95 transition-all ${
              lock.isLocked
                ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800/60'
                : 'text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700'
            }`}
            aria-label={lang === 'en' ? 'Lock chat' : 'قفل الساحة'}
            title={
              lock.isLocked
                ? (lang === 'en' ? 'Square is locked (mods only)' : 'الساحة مغلقة — اضغط لإدارة القفل')
                : (lang === 'en' ? 'Lock the Square chat' : 'قفل الساحة (اضغط للجدولة)')
            }
          >
            {lock.isLocked ? <FiLock className="w-4 h-4" /> : <FiUnlock className="w-4 h-4" />}
          </button>
        )}
        {/* Wallpaper picker — opens the shared bottom-sheet from
            ChatWallpaperPicker. Available to everyone (it's a
            personal preference, stored in localStorage). Same key
            DM uses, so picking here affects both surfaces. */}
        <button
          type="button"
          onClick={() => setShowWallpaperPicker(true)}
          className="flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800/60 hover:bg-primary-100 dark:hover:bg-primary-900/50 active:scale-95 transition-all"
          aria-label={lang === 'en' ? 'Chat wallpaper' : 'خلفية المحادثة'}
          title={lang === 'en' ? 'Chat wallpaper' : 'خلفية المحادثة'}
        >
          <FiImage className="w-4 h-4" />
        </button>
        {/* SUPER_ADMIN-only destructive wipe button. Hidden for
            everyone else. Native confirm() before firing so a stray
            tap can't nuke the chat. */}
        {isSuperAdmin && (
          <button
            type="button"
            onClick={handleWipeNeighborhood}
            disabled={wipeBusy}
            className="flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800/60 hover:bg-rose-100 dark:hover:bg-rose-900/50 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-default"
            aria-label={lang === 'en' ? 'Wipe all messages' : 'حذف كل الرسائل'}
            title={lang === 'en' ? 'Wipe all Square messages (SUPER_ADMIN)' : 'حذف كل رسائل الساحة (مشرف عام)'}
          >
            <FiTrash2 className="w-4 h-4" />
          </button>
        )}
      </header>

      {/* Message list — flex-1, the ONLY scroll surface in the chat
          shell. overscroll-contain so iOS rubber-band stops here and
          doesn't drag the whole chat. */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overscroll-y-contain"
        style={{
          WebkitOverflowScrolling: 'touch',
          background: wpIsDark ? wallpaper.dark : wallpaper.light,
        }}
      >
        <div className="max-w-[640px] mx-auto px-3 pt-4">
          {hasMoreOlder && (
            <div className="text-center py-2">
              <button
                type="button"
                onClick={loadOlder}
                disabled={loadingOlder}
                className="text-[12px] font-semibold text-primary-600 dark:text-primary-300 active:scale-95 transition-transform disabled:opacity-50"
              >
                {loadingOlder ? '…' : (lang === 'en' ? 'Load older' : 'تحميل الأقدم')}
              </button>
            </div>
          )}

          {empty ? (
            <div className="text-center py-20">
              <p className="text-5xl mb-3" aria-hidden>🤫</p>
              <p className="text-gray-700 dark:text-gray-200 font-bold text-lg mb-1.5">
                {t('square_empty_quiet_title')}
              </p>
              <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed max-w-xs mx-auto">
                {t('square_empty_quiet_body')}
              </p>
            </div>
          ) : (
            decorated.map(({ msg, isFirstInGroup, isLastInGroup, showDate, showUnreadDivider, dateLabel }) => (
              <SquareBubble
                key={msg.id}
                message={msg}
                currentUserId={currentUserId}
                isFirstInGroup={isFirstInGroup}
                isLastInGroup={isLastInGroup}
                showDate={showDate}
                showUnreadDivider={showUnreadDivider}
                dateLabel={dateLabel}
                selected={selectedMsg?.id === msg.id}
                onLongPress={() => { hapticLight(); setSelectedMsg(msg) }}
                onJumpToReply={handleJumpToReply}
                onAvatarTap={handleAvatarTap}
                onToggleReaction={handleToggleReaction}
                onMakePost={handleMakePostForMessage}
                onNotify={handleNotifyForMessage}
                onQuickReply={handleQuickReply}
                isMod={isMod}
              />
            ))
          )}

          <div ref={endAnchorRef} />
        </div>
      </div>

      {/* Typing indicator — names + smooth-pulsing dots. Renders
          above the composer (or above the lock banner if both are
          showing) so it never gets covered by the keyboard. Hidden
          when nobody is typing. */}
      {typingUsers.length > 0 && (
        <div className="flex-shrink-0 px-4 py-2 text-[12px] text-gray-500 dark:text-gray-400 flex items-center gap-2 animate-fade-in">
          <span className="inline-flex items-center gap-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-typing-dot" style={{ animationDelay: '0s' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-typing-dot" style={{ animationDelay: '0.15s' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-typing-dot" style={{ animationDelay: '0.3s' }} />
          </span>
          <span className="truncate">
            {(() => {
              const names = typingUsers.map((u) => (u.name || (lang === 'en' ? 'Neighbor' : 'جار')).trim())
              if (names.length === 1) {
                return lang === 'en'
                  ? `${names[0]} is typing…`
                  : `${names[0]} يكتب الآن…`
              }
              if (names.length === 2) {
                return lang === 'en'
                  ? `${names[0]} and ${names[1]} are typing…`
                  : `${names[0]} و${names[1]} يكتبون…`
              }
              return lang === 'en'
                ? `${names[0]} and ${names.length - 1} others are typing…`
                : `${names[0]} و${names.length - 1} آخرون يكتبون…`
            })()}
          </span>
        </div>
      )}

      {/* Lock banner — only shows for non-mods when the chat is
          actively locked. Mods see this state via the lock icon
          in the header; their composer stays enabled so they can
          still post during the lock window. */}
      {lock.isLocked && !isMod && (
        <div className="flex-shrink-0 px-4 py-3 bg-amber-50 dark:bg-amber-900/30 border-t border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-[13px] text-center">
          <FiLock className="inline w-3.5 h-3.5 ltr:mr-1 rtl:ml-1 -mt-0.5" />
          {lang === 'en' ? 'Square is currently in admin-only mode' : 'الساحة الآن في وضع المشرفين فقط — لا يمكن الإرسال'}
          {lock.lockedUntil && (
            <span className="block text-[11px] opacity-80 mt-0.5">
              {lang === 'en' ? 'Until ' : 'حتى '}
              {new Date(lock.lockedUntil).toLocaleString(lang === 'en' ? 'en-US' : 'ar-SA', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </span>
          )}
        </div>
      )}

      <SquareComposer
        currentUserId={currentUserId}
        onSent={handleSent}
        onAddPending={handleAddPending}
        onSwapPending={handleSwapPending}
        onDropPending={handleDropPending}
        replyingTo={replyingTo}
        setReplyingTo={setReplyingTo}
        disabled={lock.isLocked && !isMod}
        keyboardOpen={keyboardOpen}
      />

      {/* Long-press action sheet — Reply / Copy / Report. Same three
          actions DM exposes, minus the destructive / author-only ones
          (edit / delete) that don't make sense for an admin broadcast
          space in MVP. */}
      {selectedMsg && (
        <SquareActionSheet
          isOwn={selectedMsg.author.id === currentUserId}
          isTombstone={selectedMsg.type === 'DELETED'}
          /** Show "Delete for everyone" when EITHER:
           *    - mod/super_admin on any active message, OR
           *    - author within the 60-min cutoff.
           *  Server re-checks; this is just UI hiding. */
          canDeleteForAll={(() => {
            if (selectedMsg.type === 'DELETED') return false
            if (isMod) return true
            if (selectedMsg.author.id !== currentUserId) return false
            const age = Date.now() - Date.parse(selectedMsg.createdAt)
            return age < 60 * 60 * 1000
          })()}
          myReactionEmoji={
            selectedMsg.reactions.find((r) => r.userId === currentUserId)?.emoji ?? null
          }
          /** Only TEXT messages with non-empty body can be repurposed
           *  into a post. Stickers/voice/PDF/location don't map to a
           *  post body cleanly. */
          canConvertToPost={
            selectedMsg.author.id === currentUserId &&
            selectedMsg.type === 'TEXT' &&
            !!(selectedMsg.body && selectedMsg.body.trim())
          }
          /** "Notify neighbors" is own-message only, and only once per
           *  message (the server also enforces a 24h-per-user rate
           *  limit — we don't surface that here so the user gets a
           *  meaningful toast on the off chance the timer hasn't
           *  elapsed). */
          canNotifyNeighbors={
            selectedMsg.author.id === currentUserId &&
            !selectedMsg.notificationFiredAt &&
            selectedMsg.status === 'ACTIVE'
          }
          onReact={(emoji) => {
            const id = selectedMsg.id
            setSelectedMsg(null)
            handleToggleReaction(id, emoji)
          }}
          onReply={handleReply}
          onCopy={handleCopy}
          onConvertToPost={handleConvertToPost}
          onNotifyNeighbors={handleNotifyNeighbors}
          onReport={handleReport}
          onDeleteForMe={handleDeleteForMe}
          onDeleteForAll={handleDeleteForAll}
          onClose={() => setSelectedMsg(null)}
        />
      )}

      {/* Report sheet — pre-targeted at the selected message's author. */}
      <ReportUserSheet
        open={!!reportTargetUserId}
        onClose={() => setReportTargetUserId(null)}
        targetUserId={reportTargetUserId ?? ''}
      />

      {/* Profile sheet — opens when the user taps an other-user's
          avatar or sender name. The shared sheet handles its own
          fetch + render. */}
      {profileUserId && (
        <UserProfileSheet
          profileUserId={profileUserId}
          currentUserId={currentUserId}
          onClose={() => setProfileUserId(null)}
        />
      )}

      {/* Wallpaper picker bottom sheet — shared component, same one
          we'll swap into DM next. Renders nothing when closed. */}
      <ChatWallpaperPicker
        open={showWallpaperPicker}
        onClose={() => setShowWallpaperPicker(false)}
        currentId={wallpaperId}
        onSelect={setWallpaperId}
      />

      {/* Lock management sheet — mods only (we gate the trigger too,
          this is belt-and-braces against a stale isMod). */}
      {isMod && showLockSheet && (
        <SquareLockSheet
          lock={lock}
          onClose={() => setShowLockSheet(false)}
          onApply={applyLock}
          lang={lang}
          isSuperAdmin={isSuperAdmin}
        />
      )}
    </div>
  )
}

// ── Lock management bottom sheet ────────────────────────────────────
function SquareLockSheet({
  lock, onClose, onApply, lang, isSuperAdmin,
}: {
  lock: InitialLock
  onClose: () => void
  onApply: (p: { from?: string | null; until?: string | null; clear?: boolean }) => Promise<void>
  lang: string
  isSuperAdmin: boolean
}) {
  const [fromStr, setFromStr] = useState('')
  const [untilStr, setUntilStr] = useState('')
  const [migrationBusy, setMigrationBusy] = useState(false)
  const en = lang === 'en'

  // Apply any pending Square DB migrations — SUPER_ADMIN-only
  // maintenance action. Posts to the existing /admin/square/
  // run-migrations endpoint and reports per-step results in
  // a single alert so the user can verify each step landed.
  // Idempotent — safe to tap multiple times.
  async function runPendingMigrations() {
    if (migrationBusy) return
    setMigrationBusy(true)
    try {
      const res = await fetch('/api/admin/square/run-migrations', {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.ok === false) {
        const failed = (data?.results || []).find((r: any) => !r.ok)
        alert(
          en
            ? `Migration failed: ${failed?.name || 'unknown'} — ${failed?.error || res.status}`
            : `فشل التطبيق: ${failed?.name || 'غير معروف'} — ${failed?.error || res.status}`,
        )
        return
      }
      const okCount = (data?.results || []).filter((r: any) => r.ok).length
      alert(
        en
          ? `Migrations applied · ${okCount}/${(data?.results || []).length} steps OK`
          : `تم تطبيق التعديلات · ${okCount} من ${(data?.results || []).length}`,
      )
    } catch (err) {
      alert((en ? 'Migration failed: ' : 'فشل التطبيق: ') + (err as Error)?.message)
    } finally {
      setMigrationBusy(false)
    }
  }
  // Swipe-down-to-dismiss, same hook the wallpaper picker uses. The
  // sheetRef gets the touch listener; the handleRef is the "grab"
  // strip at the top so swiping from there is what triggers the
  // dismiss (not a stray touch on the form fields below).
  const drag = useDragToDismiss<HTMLDivElement, HTMLDivElement>({ open: true, onDismiss: onClose })

  const lockNowFor = (hours: number) => {
    const until = new Date(Date.now() + hours * 3600_000).toISOString()
    void onApply({ until })
  }
  const lockNowIndefinite = () => void onApply({})
  const schedule = () => {
    void onApply({
      from: fromStr ? new Date(fromStr).toISOString() : null,
      until: untilStr ? new Date(untilStr).toISOString() : null,
    })
  }
  const clear = () => void onApply({ clear: true })

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />
      <div ref={drag.sheetRef} className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto z-50 bg-white dark:bg-gray-800 rounded-t-3xl shadow-2xl">
        <div ref={drag.handleRef} className="px-5 pt-3 pb-3 touch-none">
          <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-2" />
          <h3 className="font-bold text-gray-900 dark:text-white text-center">
            {en ? 'Square moderation' : 'إدارة الساحة'}
          </h3>
          <p className="text-[12px] text-gray-500 dark:text-gray-400 text-center mt-1">
            {en
              ? 'Lock the chat so only moderators can post — now or on a schedule.'
              : 'أوقف الكتابة لغير المشرفين الآن أو على موعد محدد.'}
          </p>
        </div>
        <div className="px-5 pb-6 space-y-4" style={{ paddingBottom: 'calc(var(--hai-safe-bottom, 0px) + 1.5rem)' }}>

          {/* Current state */}
          <div className="rounded-2xl bg-gray-50 dark:bg-gray-900/50 p-3 text-[13px]">
            <div className="font-bold text-gray-900 dark:text-white mb-1">
              {en ? 'Current state' : 'الحالة الحالية'}
            </div>
            {lock.isLocked ? (
              <div className="text-amber-700 dark:text-amber-300">
                {en ? '🔒 Admin-only mode' : '🔒 وضع المشرفين فقط'}
                {lock.lockedUntil && (
                  <div className="text-[12px] opacity-80 mt-0.5">
                    {en ? 'until ' : 'حتى '}
                    {new Date(lock.lockedUntil).toLocaleString(en ? 'en-US' : 'ar-SA')}
                  </div>
                )}
              </div>
            ) : lock.isScheduled ? (
              <div className="text-blue-700 dark:text-blue-300">
                {en ? '⏱ Scheduled lock' : '⏱ قفل مجدول'}
                <div className="text-[12px] opacity-80 mt-0.5">
                  {en ? 'starts ' : 'يبدأ '}
                  {lock.lockedAt && new Date(lock.lockedAt).toLocaleString(en ? 'en-US' : 'ar-SA')}
                  {lock.lockedUntil && (en ? ' · ends ' : ' · ينتهي ')}
                  {lock.lockedUntil && new Date(lock.lockedUntil).toLocaleString(en ? 'en-US' : 'ar-SA')}
                </div>
              </div>
            ) : (
              <div className="text-emerald-700 dark:text-emerald-300">
                {en ? '🟢 Open — anyone can post' : '🟢 مفتوحة — الجميع يستطيع الكتابة'}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
              {en ? 'Quick lock' : 'قفل سريع'}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { h: 1, label: en ? '1 hour' : 'ساعة' },
                { h: 8, label: en ? '8 hours' : '٨ ساعات' },
                { h: 24, label: en ? '24 hours' : '٢٤ ساعة' },
              ].map(({ h, label }) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => lockNowFor(h)}
                  className="rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200 text-[13px] font-bold py-2.5 transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={lockNowIndefinite}
              className="mt-2 w-full rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/30 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200 text-[13px] font-bold py-2.5 transition-colors"
            >
              {en ? '🔒 Lock indefinitely' : '🔒 قفل بدون موعد'}
            </button>
          </div>

          {/* Schedule */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
              {en ? 'Schedule' : 'جدولة'}
            </div>
            <div className="grid grid-cols-1 gap-2">
              <label className="block">
                <span className="block text-[11px] text-gray-600 dark:text-gray-300 mb-1">
                  {en ? 'Start' : 'يبدأ'}
                </span>
                <input
                  type="datetime-local"
                  value={fromStr}
                  onChange={(e) => setFromStr(e.target.value)}
                  className="hai-input w-full"
                />
              </label>
              <label className="block">
                <span className="block text-[11px] text-gray-600 dark:text-gray-300 mb-1">
                  {en ? 'End (optional)' : 'ينتهي (اختياري)'}
                </span>
                <input
                  type="datetime-local"
                  value={untilStr}
                  onChange={(e) => setUntilStr(e.target.value)}
                  className="hai-input w-full"
                />
              </label>
              <button
                type="button"
                onClick={schedule}
                disabled={!fromStr && !untilStr}
                className="mt-1 w-full rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-default text-white text-[13px] font-bold py-2.5 transition-colors"
              >
                {en ? 'Save schedule' : 'حفظ الجدولة'}
              </button>
            </div>
          </div>

          {/* Unlock */}
          {(lock.isLocked || lock.isScheduled) && (
            <button
              type="button"
              onClick={clear}
              className="w-full rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200 text-[13px] font-bold py-2.5 transition-colors"
            >
              {en ? '🟢 Unlock now' : '🟢 فتح الساحة الآن'}
            </button>
          )}

          {/* SUPER_ADMIN-only DB maintenance. Idempotent — applies
              any pending Square migrations (view-count, lock,
              typing) on prod. Replaces the manual fetch-from-
              browser-console step. */}
          {isSuperAdmin && (
            <div className="mt-1">
              <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                {en ? 'Database' : 'قاعدة البيانات'}
              </div>
              <button
                type="button"
                onClick={runPendingMigrations}
                disabled={migrationBusy}
                className="w-full rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800/60 text-indigo-800 dark:text-indigo-200 text-[13px] font-bold py-2.5 transition-colors disabled:opacity-50 disabled:cursor-default"
              >
                {migrationBusy
                  ? (en ? 'Applying…' : 'جاري التطبيق…')
                  : (en ? '🛠️ Run pending DB migrations' : '🛠️ تطبيق تحديثات قاعدة البيانات')}
              </button>
              <p className="text-[10.5px] text-gray-500 dark:text-gray-400 mt-1.5">
                {en
                  ? 'Idempotent. Tap if Square errors mention a missing table.'
                  : 'آمن للتكرار. اضغط إذا ظهرت أخطاء "جدول غير موجود".'}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

interface ActionSheetProps {
  isOwn: boolean
  isTombstone: boolean
  canConvertToPost: boolean
  canNotifyNeighbors: boolean
  canDeleteForAll: boolean
  myReactionEmoji: string | null
  onReact: (emoji: string) => void
  onReply: () => void
  onCopy: () => void
  onConvertToPost: () => void
  onNotifyNeighbors: () => void
  onReport: () => void
  onDeleteForMe: () => void
  onDeleteForAll: () => void
  onClose: () => void
}

/**
 * Bottom action sheet shown when the user long-presses a bubble.
 * Quick-emoji row at the top (matches DM), then Reply / Copy /
 * [Convert to post] / [Notify neighbors] / Report.
 */
function SquareActionSheet({
  isOwn,
  isTombstone,
  myReactionEmoji,
  canConvertToPost,
  canNotifyNeighbors,
  canDeleteForAll,
  onReact,
  onReply,
  onCopy,
  onConvertToPost,
  onNotifyNeighbors,
  onReport,
  onDeleteForMe,
  onDeleteForAll,
  onClose,
}: ActionSheetProps) {
  const { lang } = useLanguage()
  return (
    <div
      className="fixed inset-0 z-[1100] bg-black/60 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl pb-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)' }}
      >
        <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto my-2.5" />
        {/* Quick reactions — tap to add / replace / toggle off the
            current user's reaction (server enforces one per user).
            Hidden on tombstones — you can't react to a deleted msg. */}
        {!isTombstone && (
          <>
            <div className="px-4 pt-1 pb-2 flex items-center justify-around">
              {QUICK_EMOJIS.map((emoji) => {
                const mine = myReactionEmoji === emoji
                return (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onReact(emoji)}
                    className={`text-[24px] leading-none w-10 h-10 rounded-full flex items-center justify-center transition-transform active:scale-90 ${
                      mine ? 'bg-primary-100 dark:bg-primary-900/40' : ''
                    }`}
                    aria-label={emoji}
                  >
                    {emoji}
                  </button>
                )
              })}
            </div>
            <div className="h-px bg-gray-100 dark:bg-gray-800 mx-4 mb-1" />
          </>
        )}
        {!isTombstone && (
          <button
            type="button"
            onClick={onReply}
            className="w-full flex items-center gap-3 px-5 py-3.5 active:bg-gray-50 dark:active:bg-gray-800/60 text-start"
          >
            {lang === 'en' ? (
              <FiCornerUpLeft className="w-5 h-5 text-primary-600" />
            ) : (
              <FiCornerUpRight className="w-5 h-5 text-primary-600" />
            )}
            <span className="text-[15px] font-semibold text-gray-900 dark:text-white">
              {lang === 'en' ? 'Reply' : 'رد'}
            </span>
          </button>
        )}
        {!isTombstone && (
          <button
            type="button"
            onClick={onCopy}
            className="w-full flex items-center gap-3 px-5 py-3.5 active:bg-gray-50 dark:active:bg-gray-800/60 text-start"
          >
            <FiCopy className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            <span className="text-[15px] font-semibold text-gray-900 dark:text-white">
              {lang === 'en' ? 'Copy text' : 'نسخ النص'}
            </span>
          </button>
        )}
        {/* Promoted action pills — convert-to-post + notify-neighbors
            sit at the top of the row stack as prominent primary /
            amber tiles, NOT regular menu rows. Matches the "post"
            and "broadcast" affordance language elsewhere in the
            app so the eye lands on them immediately. */}
        {!isTombstone && (canConvertToPost || canNotifyNeighbors) && (
          <div className="px-4 pt-2 pb-1 flex gap-2">
            {canConvertToPost && (
              <button
                type="button"
                onClick={onConvertToPost}
                className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-3 rounded-2xl bg-primary-600 text-white text-[13.5px] font-bold shadow-sm active:scale-[0.98] transition-transform"
              >
                <FiEdit3 className="w-4 h-4" />
                <span>{lang === 'en' ? 'Make a post' : 'حوّلها لمنشور'}</span>
              </button>
            )}
            {canNotifyNeighbors && (
              <button
                type="button"
                onClick={onNotifyNeighbors}
                className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-3 rounded-2xl bg-amber-500 text-white text-[13.5px] font-bold shadow-sm active:scale-[0.98] transition-transform"
              >
                <FiBell className="w-4 h-4" />
                <span>{lang === 'en' ? 'Broadcast' : 'نبّه الحي'}</span>
              </button>
            )}
          </div>
        )}
        {canNotifyNeighbors && (
          <p className="px-5 -mt-0.5 pb-1.5 text-[10.5px] text-gray-400 dark:text-gray-500 leading-relaxed">
            {lang === 'en'
              ? 'Broadcast: one per message · one per 24 hours'
              : 'التنبيه: مرة لكل رسالة · مرة كل 24 ساعة'}
          </p>
        )}
        {!isOwn && !isTombstone && (
          <button
            type="button"
            onClick={onReport}
            className="w-full flex items-center gap-3 px-5 py-3.5 active:bg-gray-50 dark:active:bg-gray-800/60 text-start"
          >
            <FiFlag className="w-5 h-5 text-rose-600" />
            <span className="text-[15px] font-semibold text-rose-600">
              {lang === 'en' ? 'Report' : 'إبلاغ'}
            </span>
          </button>
        )}
        {/* Delete-for-me — always available, hides from MY view only.
            Idempotent on the server; works on tombstones too (the
            row disappears from my list). */}
        <button
          type="button"
          onClick={onDeleteForMe}
          className="w-full flex items-center gap-3 px-5 py-3.5 active:bg-gray-50 dark:active:bg-gray-800/60 text-start border-t border-gray-100 dark:border-gray-800"
        >
          <FiEyeOff className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          <span className="flex-1">
            <span className="block text-[15px] font-semibold text-gray-900 dark:text-white">
              {lang === 'en' ? 'Delete for me' : 'حذف من عندي'}
            </span>
            <span className="block text-[11.5px] text-gray-500 dark:text-gray-400 mt-0.5">
              {lang === 'en' ? 'Only you stop seeing this message' : 'تختفي عندك فقط'}
            </span>
          </span>
        </button>
        {/* Delete-for-everyone — destructive; sets tombstone
            server-side. Red label so the consequence is obvious.
            Hint copy is context-aware: the author sees the 1-hour
            cutoff reminder, a mod removing someone else's message
            sees the moderation-action explanation. */}
        {canDeleteForAll && (
          <button
            type="button"
            onClick={onDeleteForAll}
            className="w-full flex items-center gap-3 px-5 py-3.5 active:bg-rose-50 dark:active:bg-rose-900/20 text-start"
          >
            <FiTrash2 className="w-5 h-5 text-rose-600" />
            <span className="flex-1">
              <span className="block text-[15px] font-semibold text-rose-600">
                {isOwn
                  ? (lang === 'en' ? 'Delete for everyone' : 'حذف للجميع')
                  : (lang === 'en' ? 'Remove (mod action)' : 'إزالة (إجراء إشرافي)')}
              </span>
              <span className="block text-[11.5px] text-gray-500 dark:text-gray-400 mt-0.5">
                {isOwn
                  ? (lang === 'en'
                      ? 'Available for ~1 hour after sending'
                      : 'متاح لمدة ساعة بعد الإرسال')
                  : (lang === 'en'
                      ? 'Removes the message from everyone\'s view'
                      : 'تختفي الرسالة من جميع المستخدمين')}
              </span>
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="w-full flex items-center justify-center gap-2 px-5 py-3.5 mt-1 text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-800"
        >
          <FiX className="w-4 h-4" />
          <span className="text-[14px] font-medium">
            {lang === 'en' ? 'Cancel' : 'إلغاء'}
          </span>
        </button>
      </div>
    </div>
  )
}

function dayKey(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function dateLabelFor(iso: string, lang: string): string {
  const then = new Date(iso)
  if (!Number.isFinite(then.getTime())) return ''
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  if (sameDay(then, today)) return lang === 'en' ? 'Today' : 'اليوم'
  if (sameDay(then, yesterday)) return lang === 'en' ? 'Yesterday' : 'أمس'
  try {
    return then.toLocaleDateString(lang === 'en' ? 'en-US' : 'ar-SA', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
  } catch {
    return ''
  }
}
