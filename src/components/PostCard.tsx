'use client'

import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { FiFlag, FiMoreVertical, FiMessageCircle, FiSend, FiCornerDownRight, FiMail, FiHeart, FiShare2, FiMapPin, FiX, FiCalendar, FiEdit2, FiTrash2, FiBookmark, FiBell, FiBellOff, FiImage, FiUser, FiPaperclip, FiEye, FiSmile } from 'react-icons/fi'
import AttachmentMenu from './AttachmentMenu'
import PlacePickerSheet from './places/PlacePickerSheet'
import { canAttachDirectoryPlace } from '@/lib/places/canAttachPlace'
import SubtypeChip from './posts/SubtypeChip'
import { uploadFiles, uploadPdf, uploadStageLabel, type UploadStage } from '@/lib/upload'
import { playSend, playReaction, playDelete } from '@/lib/sound'
import { hapticLight, hapticMedium } from '@/lib/haptic'
import EmojiPicker from './EmojiPickerWrapper'
import { useLanguage } from '@/hooks/useLanguage'
import { useNetworkStatus, isOfflineError, OfflineError } from '@/lib/network'
import { useConfirm } from './ConfirmProvider'
import { pickImageOrFallback, pickImageFromCamera } from '@/lib/imagePicker'
import ImageSourceSheet from '@/components/ImageSourceSheet'
import PdfTile from '@/components/PdfTile'
import { buildDisplayTitle } from '@/lib/posts/displayTitle'
import { useAttachContact } from '@/hooks/useAttachContact'
import ImageLightbox from './ImageLightbox'
import Sticker from './Sticker'
import StickerPicker from './StickerPicker'
import MembershipPill from './MembershipPill'
import { parseStickerRef, toStickerRef } from '@/lib/stickers/catalog'
import SmartText from './SmartText'
import SmartTextWithPlacePreviews from './SmartTextWithPlacePreviews'
import { parseMessageSegments } from './ContactChip'
import { extractPlaceLinks } from '@/lib/places/extractPlaceLinks'
import ReportUserSheet from './ReportUserSheet'
import SocialChips from './SocialChips'
import { showApiError } from '@/lib/apiError'
import { detectLang } from '@/lib/detectLang'
import HaiLoader, { HaiSpinner } from './HaiLoader'
import { useDragToDismiss } from '@/hooks/useDragToDismiss'
import { useBodyScrollLock, consumeNextClick } from '@/hooks/useBodyScrollLock'
import { pushBackHandler } from '@/lib/backHandler'
import type { TranslationKey } from '@/lib/i18n'
import { canStartPrivateThread } from '@/lib/thread-rules'
import { getRepLevel } from '@/lib/reputation-levels'
import RiyalIcon from './RiyalIcon'
import UserBadgeDisplay, { TierLabel } from './UserBadge'
import { StatePill } from '@/lib/state-render'
import { fullName } from '@/lib/displayName'
import { directoryUIVisible } from '@/lib/places/featureFlag'
import { extractServiceContact } from '@/lib/services/extractContact'
import { formatContactSnippet } from '@/lib/contactPicker'
import PinDurationSheet from '@/components/PinDurationSheet'

/**
 * v2 category → semantic label + icon.
 *
 * Appearance (light + dark colors) lives in design-tokens.css as
 * --hai-category-{ENUM}-{bg|fg} keyed by `data-category`. This map is
 * pure business metadata (translation key + icon glyph) for the v2
 * (PostCategory) values.
 */
const V2_CATEGORY_STYLES: Record<string, { tKey: TranslationKey; icon: string }> = {
  HOME_BUSINESSES:      { tKey: 'post_v2_HOME_BUSINESSES',      icon: '🍱' },
  MARKETPLACE:          { tKey: 'post_v2_MARKETPLACE',          icon: '🛒' },
  SERVICES:             { tKey: 'post_v2_SERVICES',             icon: '🔧' },
  RIDES:                { tKey: 'post_v2_RIDES',                icon: '🚗' },
  REAL_ESTATE:          { tKey: 'post_v2_REAL_ESTATE',          icon: '🏠' },
  LOST_FOUND:           { tKey: 'post_v2_LOST_FOUND',           icon: '🔍' },
  NEIGHBORHOOD_REPORTS: { tKey: 'post_v2_NEIGHBORHOOD_REPORTS', icon: '⚠️' },
  EVENTS:               { tKey: 'post_v2_EVENTS',               icon: '🎉' },
  COMPETITIONS:         { tKey: 'post_v2_COMPETITIONS',         icon: '🏆' },
  GENERAL:              { tKey: 'cat_GENERAL',                  icon: '💬' },
}


interface Reply {
  id: string
  body: string
  imageUrl?: string | null
  createdAt: string
  author: { id: string; name: string | null; lastName?: string | null; reputation: number; accountType?: string; providerStatus?: string | null }
  likeCount?: number
  isLiked?: boolean
}

interface Comment {
  id: string
  body: string
  imageUrl?: string | null
  createdAt: string
  pinnedAt?: string | null
  author: { id: string; name: string | null; lastName?: string | null; reputation: number; accountType?: string; providerStatus?: string | null }
  likeCount?: number
  isLiked?: boolean
  replies: Reply[]
}

// Per-session dedup of view-record calls. The server is the source
// of truth for the distinct-viewer count (unique postId+userId), but
// this avoids re-POSTing for a post we already reported this session
// as the user scrolls it in and out of view.
const reportedViews = new Set<string>()

interface Post {
  id: string
  title: string
  body: string
  category: string
  /** Marketplace listing subtype. Only meaningful when category=MARKETPLACE.
   *  Optional for back-compat with older API responses. */
  marketplaceType?: 'SELL' | 'BUY' | 'JOB' | null
  intent?: 'OFFER' | 'REQUEST' | 'NORMAL' | null
  // Phase 1 inferred subtypes — all optional, all server-filled,
  // all null on older posts. Each field is only meaningful when its
  // category matches; SubtypeChip enforces the cross-field rule.
  realEstateType?: 'APARTMENT_RENT' | 'APARTMENT_SALE' | 'VILLA_RENT' | 'VILLA_SALE' | 'LAND_SALE' | 'COMMERCIAL_SHOP' | 'WAREHOUSE' | 'WANTED' | null
  civicType?: 'TRAFFIC_SAFETY' | 'INFRASTRUCTURE' | 'PUBLIC_SERVICES' | 'ENVIRONMENT' | 'PROPOSAL' | 'COMPLAINT' | null
  eventStartAt?: string | null     // ISO from JSON
  eventEndAt?: string | null
  eventLocation?: string | null
  /** Moderator pin into Neighborhood Highlights. ISO string when pinned,
   *  null/undefined otherwise. Drives the mod menu's Pin/Unpin label. */
  highlightPinnedAt?: string | null
  isPaid: boolean
  isFeatured: boolean
  isPinned: boolean
  price: number | null
  // Offers ("عروض"): isOffer is the user-marked deal flag; originalPrice
  // is the optional "was" price rendered struck-through next to price.
  isOffer?: boolean
  originalPrice?: number | null
  // OUTSIDE_REQUEST when the author wasn't a resident of this hood at
  // post time → renders a subtle "من خارج الحي" badge.
  originScope?: 'RESIDENT' | 'OUTSIDE_REQUEST'
  origin?: 'APP' | 'WHATSAPP_BRIDGE'
  imageUrls: string[]
  pdfUrl?: string | null
  pdfName?: string | null
  locationLat?: number | null
  locationLng?: number | null
  locationName?: string | null
  createdAt: string
  editedAt?: string | null
  /** Distinct-viewer count (denormalized). Optional for back-compat. */
  viewCount?: number
  author: {
    id: string
    name: string | null
    lastName?: string | null
    reputation: number
    accountType?: string
    providerStatus?: string | null
    membership?: string | null
    role?: string
    avatarUrl?: string | null
    coverUrl?: string | null
    gender?: string
    createdAt?: string
    bio?: string | null
    serviceDescription?: string | null
    serviceAddress?: string | null
    serviceLat?: number | null
    serviceLng?: number | null
    socialLinks?: Record<string, string> | null
    neighborhood?: { name: string; nameEn?: string } | null
    _count?: { posts: number }
  }
  reactions?: { emoji: string; userId: string }[]
  coordinationMode?: string
  activeThreadId?: string | null
  status?: string
  _count?: { comments: number; reactions: number }
  /** Top-liked root comment(s) shipped with the feed payload so the
   *  preview row can render on first paint. Full thread still lazy-
   *  loads on sheet open. */
  previewComments?: Array<{
    id: string
    body: string
    imageUrl?: string | null
    createdAt: string
    author: {
      id: string
      name: string | null
      reputation: number
      accountType?: string
      providerStatus?: string | null
      avatarUrl?: string | null
    }
    likeCount?: number
    replies?: Reply[]
  }>
}

export default function PostCard({
  post,
  currentUserId,
  currentUserPhone,
  currentUserRole,
  isBookmarked: initialBookmarked = false,
  isFollowing: initialFollowing = false,
  onDelete,
}: {
  post: Post
  currentUserId: string
  currentUserPhone?: string
  currentUserRole?: string
  isBookmarked?: boolean
  isFollowing?: boolean
  onDelete?: (postId: string) => void
}) {
  const { t, lang } = useLanguage()
  const router = useRouter()
  const confirmDialog = useConfirm()
  const attachContact = useAttachContact()
  const { isOffline } = useNetworkStatus()

  // Centralised guard so action handlers fail loudly + cleanly when the
  // device is offline. Prevents dead taps and stuck spinners.
  const offlineMessage = () => lang === 'en'
    ? 'No internet connection. Try again when reconnected.'
    : lang === 'ur'
      ? 'انٹرنیٹ کنکشن نہیں — دوبارہ کنیکٹ ہونے پر کوشش کریں'
      : 'لا يوجد اتصال — حاول مرة أخرى عند عودة الإنترنت'
  const blockIfOffline = (): boolean => {
    if (isOffline) { toast.error(offlineMessage()); return true }
    return false
  }

  // Safety guard — if post or author is missing, render nothing
  if (!post || !post.author) return null

  const isAdmin = ['SUPER_ADMIN', 'PLATFORM_MOD', 'NEIGHBORHOOD_MOD'].includes(currentUserRole || '')
  const [reported, setReported] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [pinSheetOpen, setPinSheetOpen] = useState(false)
  const [pinBusy, setPinBusy] = useState(false)

  // Pin this post to the neighborhood's "المثبتات" (Pinned items) — NOT
  // the stars/highlights. The server resolves the neighborhood + auto-fills
  // title/summary; the mod only picks a duration.
  async function pinAsReference(duration: string) {
    if (pinBusy) return
    setPinBusy(true)
    try {
      const res = await fetch('/api/mod/pinned-items/pin-post', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id, duration }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) toast.success(lang === 'en' ? 'Pinned to references' : 'تم التثبيت في المثبتات')
      else toast.error(d.error || (lang === 'en' ? 'Failed' : 'فشل'))
    } catch { toast.error(lang === 'en' ? 'Connection error' : 'خطأ بالاتصال') }
    finally { setPinBusy(false); setPinSheetOpen(false) }
  }
  const [reportingUser, setReportingUser] = useState(false)
  // Long-body expand toggle. Default collapsed (clamped). The
  // "overflow" flag is computed in a layout effect by comparing
  // scrollHeight to clientHeight on the clamped paragraph; without
  // this, every short post would show a useless "See more" button.
  const [bodyExpanded, setBodyExpanded] = useState(false)
  const [bodyOverflows, setBodyOverflows] = useState(false)
  const bodyRef = useRef<HTMLParagraphElement | null>(null)
  const [showEditCategory, setShowEditCategory] = useState(false)
  const [editCatBusy, setEditCatBusy] = useState(false)
  const [editCatCategory, setEditCatCategory] = useState<string>(post.category)
  const [editCatIntent, setEditCatIntent] = useState<string>(post.intent || 'NORMAL')
  const [editCatMarketplaceType, setEditCatMarketplaceType] = useState<string>(
    post.marketplaceType || 'SELL',
  )
  // Reporting a comment or reply author: opens the same sheet with a
  // different target. Kept separate from `reportingUser` (post author)
  // so one doesn't clobber the other.
  const [commentReportTarget, setCommentReportTarget] = useState<{ id: string; name: string | null; commentId: string; role?: string | null } | null>(null)
  // Per-comment translation state keyed by comment id. Lets each row
  // toggle independently and caches the translated body after the
  // first fetch so re-toggling doesn't re-hit the API.
  const [commentTx, setCommentTx] = useState<Record<string, { body: string; show: boolean; loading: boolean }>>({})
  async function toggleCommentTranslate(commentId: string, originalBody: string) {
    const existing = commentTx[commentId]
    if (existing?.show) {
      setCommentTx((prev) => ({ ...prev, [commentId]: { ...existing, show: false } }))
      return
    }
    if (existing?.body) {
      setCommentTx((prev) => ({ ...prev, [commentId]: { ...existing, show: true } }))
      return
    }
    setCommentTx((prev) => ({ ...prev, [commentId]: { body: '', show: false, loading: true } }))
    try {
      const r = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: originalBody, target: lang }),
      }).then((res) => res.json())
      const translatedBody = typeof r?.translated === 'string' ? r.translated : originalBody
      setCommentTx((prev) => ({ ...prev, [commentId]: { body: translatedBody, show: true, loading: false } }))
    } catch {
      setCommentTx((prev) => ({ ...prev, [commentId]: { body: originalBody, show: false, loading: false } }))
      toast.error(lang === 'en' ? 'Translation failed' : lang === 'ur' ? 'ترجمہ ناکام' : 'فشل الترجمة')
    }
  }
  const menuRef = useRef<HTMLDivElement>(null)

  // Initialize reactions from server data
  const [myReaction, setMyReaction] = useState<string | null>(() => {
    const mine = post.reactions?.find(r => r.userId === currentUserId)
    return mine?.emoji ?? null
  })
  // Distinct-viewer count. Seeded from the server; bumped to the
  // server's authoritative value after we record this user's view.
  const [viewCount, setViewCount] = useState<number>(post.viewCount ?? 0)
  const [cardVisible, setCardVisible] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  // Track on-screen state. Records this user's view ONCE the first
  // time the card is ≥50% visible (reportedViews dedups per session;
  // server dedups across sessions). Keeps observing afterwards so the
  // poll below knows when the card is on screen.
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        const isVis = entries.some((e) => e.isIntersecting)
        setCardVisible(isVis)
        if (isVis && !reportedViews.has(post.id)) {
          reportedViews.add(post.id)
          fetch(`/api/posts/${post.id}/view`, { method: 'POST' })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
              if (d && typeof d.viewCount === 'number') setViewCount(d.viewCount)
            })
            .catch(() => {})
        }
      },
      { threshold: 0.5 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [post.id])

  // Live-ish view count: while the card is on screen (and the tab is
  // visible), re-fetch the count every 25s so it climbs as others
  // view. Paused entirely when scrolled away or the tab is hidden, so
  // it costs nothing in the background.
  useEffect(() => {
    if (!cardVisible) return
    let cancelled = false
    const poll = () => {
      if (typeof document !== 'undefined' && document.hidden) return
      fetch(`/api/posts/${post.id}/view`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled && d && typeof d.viewCount === 'number') setViewCount(d.viewCount)
        })
        .catch(() => {})
    }
    const id = setInterval(poll, 25_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [cardVisible, post.id])
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>(() => {
    const counts: Record<string, number> = {}
    for (const r of post.reactions || []) {
      counts[r.emoji] = (counts[r.emoji] || 0) + 1
    }
    return counts
  })
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const [bouncingReaction, setBouncingReaction] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [commentLightbox, setCommentLightbox] = useState<string | null>(null)
  // Persist the "is this post's profile popup open?" flag in
  // sessionStorage so it survives a WebView reload after the user
  // returns from an external app (Instagram etc.). Capacitor with
  // server.url sometimes reloads the WebView on visibilitychange;
  // without this, React state was being thrown out and the popup
  // looked like it vanished after tapping a social chip.
  const popupKey = `hai_popup_${post.id}`
  const [showUserPopup, _setShowUserPopup] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try { return sessionStorage.getItem(popupKey) === '1' } catch { return false }
  })
  const setShowUserPopup = (v: boolean | ((prev: boolean) => boolean)) => {
    _setShowUserPopup(prev => {
      const next = typeof v === 'function' ? (v as (p: boolean) => boolean)(prev) : v
      try {
        if (next) sessionStorage.setItem(popupKey, '1')
        else sessionStorage.removeItem(popupKey)
      } catch { /* ignore */ }
      return next
    })
  }
  const [showFullAvatar, setShowFullAvatar] = useState(false)
  // The user shown in the profile popup: null = the post author; otherwise
  // a comment author (so tapping a commenter opens THEIR profile).
  const [popupUser, setPopupUser] = useState<any | null>(null)
  // Full profile for the popup, fetched on open so bio/service/stats are
  // complete (the feed slims the author payload). Null = still loading →
  // the popup shows a loader instead of a half-empty card.
  const [popupProfile, setPopupProfile] = useState<any | null>(null)
  useEffect(() => {
    if (!showUserPopup) { setPopupProfile(null); return }
    const id = popupUser?.id || post.author?.id
    if (!id) return
    setPopupProfile(null)
    let aborted = false
    fetch(`/api/users/${id}/profile`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => { if (!aborted) setPopupProfile(p || popupUser || post.author) })
      .catch(() => { if (!aborted) setPopupProfile(popupUser || post.author) })
    return () => { aborted = true }
  }, [showUserPopup, popupUser])
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(post.title)
  const [editBody, setEditBody] = useState(post.body)
  // Separate edit-mode image list so the user can add/remove/reorder
  // without touching the original post.imageUrls until they hit Save.
  const [editImages, setEditImages] = useState<string[]>(post.imageUrls || [])
  const [editImageUploading, setEditImageUploading] = useState(false)
  const editImageInputRef = useRef<HTMLInputElement>(null)
  const editCameraInputRef = useRef<HTMLInputElement>(null)
  const [showEditImageSheet, setShowEditImageSheet] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [postData, setPostData] = useState({ title: post.title, body: post.body, editedAt: post.editedAt, imageUrls: post.imageUrls || [] as string[] })
  // Auto-translation. Detected language comes from the raw title+body;
  // the translate button only surfaces if it differs from the user's
  // UI language. Cached per-card in state so toggling off/on is free.
  const postSourceLang = detectLang(`${postData.title} ${postData.body}`)
  const canTranslate = postSourceLang !== lang
  const [translated, setTranslated] = useState<{ title: string; body: string } | null>(null)
  const [translating, setTranslating] = useState(false)
  const [showTranslated, setShowTranslated] = useState(false)
  async function toggleTranslate() {
    if (showTranslated) {
      // Toggle off — revert to original without refetching
      setShowTranslated(false)
      return
    }
    if (translated) {
      setShowTranslated(true)
      return
    }
    setTranslating(true)
    try {
      const [tRes, bRes] = await Promise.all([
        fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: postData.title, target: lang }),
        }).then((r) => r.json()),
        fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: postData.body, target: lang }),
        }).then((r) => r.json()),
      ])
      const title = typeof tRes?.translated === 'string' ? tRes.translated : postData.title
      const body = typeof bRes?.translated === 'string' ? bRes.translated : postData.body
      setTranslated({ title, body })
      setShowTranslated(true)
    } catch {
      toast.error(lang === 'en' ? 'Translation failed' : lang === 'ur' ? 'ترجمہ ناکام' : 'فشل الترجمة')
    } finally {
      setTranslating(false)
    }
  }
  // Author-provided title takes precedence; translation overrides it
  // when active. For posts without a real title (lightweight neighborhood
  // posts), this falls back to a body-excerpt headline via
  // buildDisplayTitle so the share sheet / OS notification still has
  // a meaningful subject row. The heading itself only renders when
  // the AUTHOR explicitly provided a title — see the {hasAuthorTitle
  // && <h3>...} gate below.
  const hasAuthorTitle = postData.title.trim().length > 0
  // Some posts (older "ask" submissions, or any flow that synthesized a
  // headline from the first line of the body) stored a title that is just
  // a prefix of the body — rendering it as both the <h3> headline AND the
  // body paragraph shows the same text twice. Detect that and drop the
  // redundant headline; the body alone carries the message.
  const normalizeForCompare = (s: string) => s.replace(/\s+/g, ' ').trim()
  const titleDuplicatesBody =
    hasAuthorTitle &&
    normalizeForCompare(postData.body).startsWith(normalizeForCompare(postData.title))
  const showTitleHeadline = hasAuthorTitle && !titleDuplicatesBody
  const displayTitle = showTranslated && translated
    ? translated.title
    : (hasAuthorTitle
        ? postData.title
        : buildDisplayTitle({ title: '', body: postData.body, category: post.category as any }, lang as 'ar' | 'en' | 'ur'))
  const displayBody  = showTranslated && translated ? translated.body  : postData.body
  // A body with a contact card or directory preview must NOT be line-clamped
  // — clamping cuts the card mid-way and shows "عرض المزيد" over it. When a
  // rich embed is present we render the body in full and skip the clamp.
  const hasRichEmbed =
    parseMessageSegments(displayBody).some((s) => s.kind === 'contact') ||
    extractPlaceLinks(displayBody).length > 0

  // Detect whether the clamped body actually overflows, so we only
  // show "See more / عرض المزيد" when there's more content to reveal.
  // Re-measures whenever the rendered body text changes (edit, translate).
  // useLayoutEffect runs synchronously before paint so the button
  // doesn't flicker into place after first paint on iOS WebView.
  useLayoutEffect(() => {
    if (bodyExpanded) return
    const el = bodyRef.current
    if (!el) return
    // +1 px tolerance for sub-pixel rounding on hi-DPI screens.
    const overflows = el.scrollHeight > el.clientHeight + 1
    if (overflows !== bodyOverflows) setBodyOverflows(overflows)
  }, [displayBody, bodyExpanded])
  const pickerRef = useRef<HTMLDivElement>(null)
  const reactionTriggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!showReactionPicker) return
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowReactionPicker(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [showReactionPicker])
  useEffect(() => {
    if (!showMenu) return
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [showMenu])
  const [showComments, setShowComments] = useState(false)
  // Drag-to-dismiss on the comments sheet. Only touches that start on
  // the handleRef (grab bar + header) trigger the drag — inner scroll
  // lists stay interactive.
  const { sheetRef: commentsSheetRef, handleRef: commentsHandleRef, bodyRef: commentsBodyRef } =
    useDragToDismiss<HTMLDivElement, HTMLDivElement, HTMLDivElement>({
      open: showComments,
      onDismiss: () => setShowComments(false),
    })
  // Seed from SSR preview so the comment row paints with the post card
  // instead of popping in ~1s later. `commentsLoaded` stays false so the
  // full thread is still lazy-fetched when the user opens the sheet.
  const [comments, setComments] = useState<Comment[]>(() =>
    (post.previewComments || []).map((c) => ({
      id: c.id,
      body: c.body,
      imageUrl: c.imageUrl ?? null,
      createdAt: c.createdAt,
      author: c.author,
      likeCount: c.likeCount ?? 0,
      isLiked: false,
      replies: [],
    }))
  )
  const [commentText, setCommentText] = useState('')
  const [commentImage, setCommentImage] = useState<File | null>(null)
  const [commentImagePreview, setCommentImagePreview] = useState<string | null>(null)
  const [replyImage, setReplyImage] = useState<File | null>(null)
  const [replyImagePreview, setReplyImagePreview] = useState<string | null>(null)
  // PDF attachment on the top-level comment composer + the reply
  // composer. Same shape as the post composer's `pdf` state —
  // upload kicks off the moment the file is picked so submit is
  // instant. While the upload is in flight, `uploading` is true
  // and `percent` ticks toward 100; on completion `url` is set.
  // On failure, `error` is set so the tile can show a retry hint.
  type PdfState = {
    url: string | null
    name: string
    size: number
    uploading: boolean
    percent: number
    stage: UploadStage
    error?: string
  }
  const [commentPdf, setCommentPdf] = useState<PdfState | null>(null)
  const [replyPdf, setReplyPdf] = useState<PdfState | null>(null)
  const commentPdfInputRef = useRef<HTMLInputElement>(null)
  const replyPdfInputRef = useRef<HTMLInputElement>(null)
  const commentImgRef = useRef<HTMLInputElement>(null)
  const replyImgRef = useRef<HTMLInputElement>(null)
  const [commentsLoaded, setCommentsLoaded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null)
  // Which composer (if any) is currently showing the AttachmentMenu.
  // null when closed; 'comment' or 'reply' identifies the target so
  // the menu's image / contact / location handlers know where to
  // route the picked content.
  const [showAttachMenu, setShowAttachMenu] = useState<null | 'comment' | 'reply'>(null)
  // Place picker — tracks which composer (comment vs reply) asked
  // to attach so the link goes into the right text state.
  const [placePickerFor, setPlacePickerFor] = useState<null | 'comment' | 'reply'>(null)
  const canAttachPlace = canAttachDirectoryPlace(currentUserRole)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editCommentBody, setEditCommentBody] = useState('')
  const [bookmarked, setBookmarked] = useState(initialBookmarked)
  const [following, setFollowing] = useState(initialFollowing)
  const [replyText, setReplyText] = useState('')
  const [submittingReply, setSubmittingReply] = useState(false)
  // Sticker picker target: 'comment' (top-level composer) or 'reply'.
  const [stickerTarget, setStickerTarget] = useState<'comment' | 'reply' | null>(null)
  const v2Category = post.category
  const style = V2_CATEGORY_STYLES[v2Category] || V2_CATEGORY_STYLES.GENERAL
  // REQUEST intent gets a small secondary marker on the card.
  const isRequest = post.intent === 'REQUEST'
  const totalReactions = Object.values(reactionCounts).reduce((a, b) => a + b, 0)
  const serverCommentCount = post._count?.comments || 0
  // Before the full thread is loaded, the SSR `_count` is the truth —
  // using it avoids the card saying "1 comment" (the preview) when the
  // post actually has 12.
  const totalComments = commentsLoaded
    ? comments.reduce((acc, c) => acc + 1 + c.replies.length, 0)
    : serverCommentCount

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return t('post_ago_just')
    if (mins < 60) {
      return lang === 'ar'
        ? `${t('post_ago_prefix')} ${mins} ${t('post_ago_min')}`
        : `${mins}${t('post_ago_min')} ${t('post_ago_suffix')}`
    }
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) {
      return lang === 'ar'
        ? `${t('post_ago_prefix')} ${hrs} ${t('post_ago_hour')}`
        : `${hrs}${t('post_ago_hour')} ${t('post_ago_suffix')}`
    }
    const days = Math.floor(hrs / 24)
    return lang === 'ar'
      ? `${t('post_ago_prefix')} ${days} ${t('post_ago_day')}`
      : `${days}${t('post_ago_day')} ${t('post_ago_suffix')}`
  }

  async function handleReact(emoji: string) {
    hapticLight()
    playReaction()
    setBouncingReaction(emoji)
    setTimeout(() => setBouncingReaction(null), 400)
    try {
      const res = await fetch(`/api/posts/${post.id}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || t('common_error'))
        return
      }
      const data = await res.json()

      setReactionCounts(prev => {
        const next = { ...prev }
        if (data.action === 'removed') {
          next[emoji] = Math.max(0, (next[emoji] || 0) - 1)
          if (next[emoji] === 0) delete next[emoji]
          setMyReaction(null)
        } else if (data.action === 'updated') {
          if (myReaction) {
            next[myReaction] = Math.max(0, (next[myReaction] || 0) - 1)
            if (next[myReaction] === 0) delete next[myReaction]
          }
          next[emoji] = (next[emoji] || 0) + 1
          setMyReaction(emoji)
        } else {
          next[emoji] = (next[emoji] || 0) + 1
          setMyReaction(emoji)
        }
        return next
      })
    } catch {
      toast.error(t('common_error'))
    }
  }

  async function fetchComments() {
    try {
      const res = await fetch(`/api/posts/${post.id}/comments`)
      const data = await res.json()
      setComments(data)
      setCommentsLoaded(true)
      // Pre-warm image cache the instant the comment list arrives. The
      // browser starts decoding/downloading each URL into its image
      // cache RIGHT NOW (before React paints the comment row), so by
      // the time the <img> tags mount with these src URLs, the bytes
      // are already in memory and the comment images appear with no
      // pop-in delay. Without this, users saw the comments sheet open
      // instantly but the inline images load one-by-one over a second.
      try {
        const urls: string[] = []
        for (const c of data as any[]) {
          if (c?.imageUrl) urls.push(c.imageUrl)
          for (const r of (c?.replies || []) as any[]) {
            if (r?.imageUrl) urls.push(r.imageUrl)
          }
        }
        for (const u of urls) {
          const img = new Image()
          img.decoding = 'async'
          img.src = u
        }
      } catch { /* preload is best-effort */ }
    } catch {
      toast.error(t('common_error'))
    }
  }

  // NOTE: we deliberately do NOT auto-fetch comments on mount. The feed
  // ships the top-liked preview comment inline via `post.previewComments`,
  // so the preview row renders on first paint. The full thread is
  // lazy-loaded inside `toggleComments()` when the user opens the sheet.

  async function toggleComments() {
    if (!showComments) {
      // Open the sheet RIGHT AWAY, then fetch in the background.
      // Previously we awaited fetchComments() before opening the sheet,
      // so the user saw a 200-400ms freeze on tap before the sheet
      // animated in. Now: tap → sheet opens with whatever's already
      // in `comments` state (preview comments seeded from SSR), and
      // the full thread + images stream in beneath it.
      setShowComments(true)
      void fetchComments()
      return
    }
    setShowComments(false)
  }

  // Lock the feed behind the comments sheet + close on Escape.
  // overflow:hidden alone doesn't stop iOS WKWebView / Android
  // WebView from scrolling the page underneath — the touchmove
  // events still pan the document. Using position:fixed + a saved
  // scrollY + width:100% is the bulletproof cross-platform lock;
  // we restore scrollY on close so the feed doesn't jump to the
  // top when the sheet dismisses.
  //
  // Shared iOS-safe scroll lock — see useBodyScrollLock. Same hook is
  // used by every other sheet/modal in the app, so opening (e.g.) a
  // comments sheet on top of the user popup doesn't fight over body
  // styles or jump-restore scrollY mid-stack.
  useBodyScrollLock(showComments || showUserPopup)

  // Back-press isolation. Android hardware back / iOS swipe-back now
  // close the comments sheet (or user popup) instead of navigating
  // away from the post page. Stack is LIFO — opening the user popup
  // on top of the comments sheet pushes a second handler, so back
  // closes the popup first, then a second back closes the comments.
  // Each effect handles its own state so the priority works out.
  useEffect(() => {
    if (!showComments) return
    return pushBackHandler(() => setShowComments(false))
  }, [showComments])
  useEffect(() => {
    if (!showUserPopup) return
    return pushBackHandler(() => setShowUserPopup(false))
  }, [showUserPopup])

  useEffect(() => {
    if (!showComments && !showUserPopup) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showUserPopup) setShowUserPopup(false)
        else if (showComments) setShowComments(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showComments, showUserPopup])

  async function handleComment(e: React.FormEvent) {
    e.preventDefault()
    if (!commentText.trim() && !commentImage && !commentPdf) return
    if (blockIfOffline()) return
    setSubmitting(true)
    try {
      let imageUrl: string | null = null
      if (commentImage) {
        const urls = await uploadFiles([commentImage])
        if (!urls[0]) { toast.error(t('common_error')); return }
        imageUrl = urls[0]
      }
      // PDF was uploaded the moment the user picked it; we only need
      // to read the cached URL here. Two edge cases mirror the post
      // composer's submit guards:
      //   - Still uploading → ask user to wait (don't await — that's
      //     what made the publish flow feel hung).
      //   - Errored → ask user to remove or retry.
      if (commentPdf?.uploading) {
        toast.error(
          lang === 'en' ? 'PDF still uploading — give it a moment' :
          lang === 'ur' ? 'PDF اپ لوڈ ہو رہی ہے — ذرا انتظار' :
          'يرجى الانتظار حتى ينتهي رفع الملف',
        )
        return
      }
      if (commentPdf?.error) {
        toast.error(
          lang === 'en' ? 'PDF upload failed — remove it or pick again' :
          'فشل رفع الملف — احذف الإرفاق وأعد المحاولة',
        )
        return
      }
      const pdfUrl: string | null = commentPdf?.url ?? null
      const pdfName: string | null = commentPdf?.name ?? null
      const res = await fetch(`/api/posts/${post.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: commentText, imageUrl, pdfUrl, pdfName }),
      })
      if (!res.ok) { await showApiError(res, lang); return }
      const comment = await res.json()
      playSend()
      setComments(prev => [...prev, { ...comment, replies: comment.replies || [] }])
      setCommentText('')
      setCommentImage(null)
      setCommentImagePreview(null)
      setCommentPdf(null)
    } catch (err) {
      toast.error(isOfflineError(err) || (err instanceof TypeError) ? offlineMessage() : t('common_error'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault()
    if ((!replyText.trim() && !replyImage && !replyPdf) || !replyingTo) return
    if (blockIfOffline()) return
    setSubmittingReply(true)
    try {
      let imageUrl: string | null = null
      if (replyImage) {
        const urls = await uploadFiles([replyImage])
        if (!urls[0]) { toast.error(t('common_error')); return }
        imageUrl = urls[0]
      }
      // PDF on a reply — uploaded on pick, mirror the guards above.
      if (replyPdf?.uploading) {
        toast.error(
          lang === 'en' ? 'PDF still uploading — give it a moment' :
          'يرجى الانتظار حتى ينتهي رفع الملف',
        )
        return
      }
      if (replyPdf?.error) {
        toast.error(
          lang === 'en' ? 'PDF upload failed — remove it or pick again' :
          'فشل رفع الملف — احذف الإرفاق وأعد المحاولة',
        )
        return
      }
      const pdfUrl: string | null = replyPdf?.url ?? null
      const pdfName: string | null = replyPdf?.name ?? null
      const res = await fetch(`/api/posts/${post.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: replyText, parentId: replyingTo.id, imageUrl, pdfUrl, pdfName }),
      })
      if (!res.ok) { await showApiError(res, lang); return }
      const reply = await res.json()
      playSend()
      setComments(prev =>
        prev.map(c =>
          c.id === replyingTo.id
            ? { ...c, replies: [...c.replies, reply] }
            : c
        )
      )
      setReplyText('')
      setReplyImage(null)
      setReplyImagePreview(null)
      setReplyPdf(null)
      setReplyingTo(null)
    } catch (err) {
      toast.error(isOfflineError(err) || (err instanceof TypeError) ? offlineMessage() : t('common_error'))
    } finally {
      setSubmittingReply(false)
    }
  }

  // Send a sticker as a comment or reply. A sticker is a comment whose
  // imageUrl is the `sticker:<id>` sentinel (no text body).
  async function sendSticker(stickerId: string) {
    const target = stickerTarget
    if (!target) return
    if (blockIfOffline()) return
    const ref = toStickerRef(stickerId)
    try {
      if (target === 'reply') {
        if (!replyingTo) return
        setSubmittingReply(true)
        const res = await fetch(`/api/posts/${post.id}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: ref, parentId: replyingTo.id }),
        })
        if (!res.ok) { await showApiError(res, lang); return }
        const reply = await res.json()
        playSend()
        setComments(prev => prev.map(c => c.id === replyingTo.id ? { ...c, replies: [...c.replies, reply] } : c))
        setReplyingTo(null)
      } else {
        setSubmitting(true)
        const res = await fetch(`/api/posts/${post.id}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: ref }),
        })
        if (!res.ok) { await showApiError(res, lang); return }
        const comment = await res.json()
        playSend()
        setComments(prev => [...prev, { ...comment, replies: comment.replies || [] }])
      }
    } catch (err) {
      toast.error(isOfflineError(err) || (err instanceof TypeError) ? offlineMessage() : t('common_error'))
    } finally {
      setSubmitting(false)
      setSubmittingReply(false)
    }
  }

  function applyPickedImage(file: File, target: 'comment' | 'reply') {
    if (!file.type.startsWith('image/')) { toast.error(lang === 'en' ? 'Images only' : 'صور فقط'); return }
    if (file.size > 10 * 1024 * 1024) { toast.error(lang === 'en' ? 'Max 10MB' : 'الحد الأقصى 10 ميقا'); return }
    const preview = URL.createObjectURL(file)
    if (target === 'comment') {
      if (commentImagePreview) URL.revokeObjectURL(commentImagePreview)
      setCommentImage(file)
      setCommentImagePreview(preview)
    } else {
      if (replyImagePreview) URL.revokeObjectURL(replyImagePreview)
      setReplyImage(file)
      setReplyImagePreview(preview)
    }
  }

  function handleCommentImageSelect(e: React.ChangeEvent<HTMLInputElement>, target: 'comment' | 'reply') {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    applyPickedImage(file, target)
  }

  async function openImagePicker(target: 'comment' | 'reply') {
    const ref = target === 'comment' ? commentImgRef : replyImgRef
    const file = await pickImageOrFallback(lang, ref)
    if (file) applyPickedImage(file, target)
  }

  async function attachContactToComposer(target: 'comment' | 'reply') {
    hapticLight()
    const snippet = await attachContact()
    if (!snippet) return
    if (target === 'comment') {
      setCommentText((prev) => (prev ? `${prev.trimEnd()}\n${snippet}` : snippet))
    } else {
      setReplyText((prev) => (prev ? `${prev.trimEnd()}\n${snippet}` : snippet))
    }
  }

  async function attachLocationToComposer(target: 'comment' | 'reply') {
    hapticLight()
    const { attachLocation } = await import('@/lib/locationPicker')
    // Default the map center to the post's attached location if there
    // is one — most relevant point for a comment on that post.
    const defaultCenter =
      typeof (post as any).locationLat === 'number' && typeof (post as any).locationLng === 'number'
        ? { lat: (post as any).locationLat as number, lng: (post as any).locationLng as number }
        : undefined
    const snippet = await attachLocation({ lang, defaultCenter })
    if (!snippet) return
    if (target === 'comment') {
      setCommentText((prev) => (prev ? `${prev.trimEnd()}\n${snippet}` : snippet))
    } else {
      setReplyText((prev) => (prev ? `${prev.trimEnd()}\n${snippet}` : snippet))
    }
  }

  async function handleAdminAction(action: string) {
    try {
      const res = await fetch('/api/admin/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, targetId: post.id }),
      })
      if (res.ok) {
        toast.success('تم')
        if (action === 'hide_post' || action === 'remove_post') {
          playDelete()
          if (onDelete) onDelete(post.id)
          else router.refresh()
        } else {
          router.refresh()
        }
      } else {
        const d = await res.json()
        toast.error(d.error || 'خطأ')
      }
    } catch { toast.error('خطأ') }
  }

  async function toggleBookmark() {
    if (blockIfOffline()) return
    try {
      const res = await fetch(`/api/posts/${post.id}/bookmark`, { method: 'POST' })
      if (res.ok) {
        const { bookmarked: b } = await res.json()
        setBookmarked(b)
        toast.success(b ? (lang === 'en' ? 'Saved' : 'تم الحفظ') : (lang === 'en' ? 'Removed' : 'تم الإزالة'))
      }
    } catch { /* ignore */ }
  }

  // Follow/unfollow toggle — optimistic; reverts on API failure. Shared
  // by the action-bar button (visible next to Bookmark) so the feature
  // is discoverable without opening the overflow menu.
  async function toggleFollow() {
    if (post.author.id === currentUserId) return // author auto-follows
    if (blockIfOffline()) return
    const next = !following
    setFollowing(next)
    try {
      const res = await fetch(`/api/posts/${post.id}/subscribe`, {
        method: next ? 'POST' : 'DELETE',
      })
      if (!res.ok) {
        setFollowing(!next)
        toast.error(lang === 'en' ? 'Could not update' : lang === 'ur' ? 'اپ ڈیٹ نہیں ہو سکا' : 'تعذر التحديث')
        return
      }
      toast.success(
        next
          ? (lang === 'en' ? 'Following this post' : lang === 'ur' ? 'اب آپ اس پوسٹ کو فالو کر رہے ہیں' : 'أنت تتابع هذا المنشور')
          : (lang === 'en' ? 'Unfollowed' : lang === 'ur' ? 'فالو ختم' : 'تم إلغاء المتابعة'),
      )
    } catch {
      setFollowing(!next)
    }
  }

  async function deleteComment(commentId: string, postId: string) {
    const ok = await confirmDialog({
      message: lang === 'en' ? 'Delete this comment?' : 'حذف هذا التعليق؟',
      variant: 'danger',
      confirmText: lang === 'en' ? 'Delete' : 'حذف',
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/posts/${postId}/comments/${commentId}`, { method: 'DELETE' })
      if (res.ok) {
        playDelete()
        try {
          window.dispatchEvent(new CustomEvent('hai:content-deleted', {
            detail: { contentType: 'comment', contentId: commentId },
          }))
        } catch {}
        // Remove from top-level list OR from any parent's replies array
        setComments(prev =>
          prev
            .filter((c: any) => c.id !== commentId)
            .map((c: any) =>
              c.replies && c.replies.length > 0
                ? { ...c, replies: c.replies.filter((r: any) => r.id !== commentId) }
                : c,
            ),
        )
        toast.success(lang === 'en' ? 'Deleted' : 'تم الحذف')
      } else {
        const d = await res.json()
        toast.error(d.error || 'Error')
      }
    } catch { toast.error(t('common_error')) }
  }

  // Pin / unpin a top-level comment (post author or mod). Refetch after
  // so the server re-applies the pinned→creator→time ordering.
  async function pinComment(commentId: string) {
    try {
      const res = await fetch(`/api/posts/${post.id}/comments/${commentId}/pin`, { method: 'POST' })
      if (res.ok) {
        const d = await res.json()
        toast.success(d.pinned
          ? (lang === 'en' ? 'Pinned to top' : 'تم التثبيت في الأعلى')
          : (lang === 'en' ? 'Unpinned' : 'تم إلغاء التثبيت'))
        fetchComments()
      } else {
        const d = await res.json().catch(() => ({}))
        toast.error(d.error || t('common_error'))
      }
    } catch { toast.error(t('common_error')) }
  }

  async function saveCommentEdit(commentId: string, postId: string) {
    if (!editCommentBody.trim()) return
    try {
      const res = await fetch(`/api/posts/${postId}/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: editCommentBody.trim() }),
      })
      if (res.ok) {
        const updated = await res.json()
        setComments(prev => prev.map((c: any) => c.id === commentId ? { ...c, body: updated.body, editedAt: updated.editedAt } : c))
        toast.success(lang === 'en' ? 'Edited' : 'تم التعديل')
      } else {
        const d = await res.json()
        toast.error(d.error || 'Error')
      }
    } catch { toast.error(t('common_error')) }
    setEditingCommentId(null)
  }

  async function handleCommentLike(commentId: string) {
    try {
      const res = await fetch(`/api/comments/${commentId}/like`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        const liked = data.action === 'liked'
        setComments(prev => prev.map(c => {
          if (c.id === commentId) return { ...c, isLiked: liked, likeCount: (c.likeCount || 0) + (liked ? 1 : -1) }
          return { ...c, replies: c.replies.map(r => r.id === commentId ? { ...r, isLiked: liked, likeCount: (r.likeCount || 0) + (liked ? 1 : -1) } : r) }
        }))
      }
    } catch { /* ignore */ }
  }

  async function handleReport() {
    if (reported) return
    try {
      const res = await fetch('/api/posts/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id, reason: 'OTHER' }),
      })
      if (res.ok) { setReported(true); toast.success(t('post_reported')) }
    } catch { toast.error(t('common_error')) }
    setShowMenu(false)
  }

  // Visual styling for "looking for" cards is now driven by intent —
  // covers both legacy LOOKING_FOR posts (mapped to intent=REQUEST in
  // Phase 2) and the new Ask flow.
  const isLookingFor = isRequest

  return (
    <div ref={cardRef} id={`post-${post.id}`} data-post-id={post.id} className={`hai-card relative animate-fade-in-up glow-card ${post.isPinned ? 'hai-post--pinned' : ''} ${isLookingFor ? 'hai-post--looking-for' : ''}`}>
      {post.isPinned && (
        <StatePill state="pinned" label={t('post_pinned')} className="hai-mb-1" />
      )}

      {/* Header */}
      <div className="hai-row-2 hai-justify-between hai-items-start hai-mb-2">
        <div className="hai-row-2 hai-cursor-pointer" onClick={() => { setPopupUser(null); setShowUserPopup(true) }}>
          <div className="hai-avatar hai-avatar--sm">
            {post.author.avatarUrl
              ? <img src={post.author.avatarUrl} alt="" />
              : (post.author.name?.[0] || '؟')
            }
          </div>
          <div>
            <div className="hai-row-1">
              {post.origin === 'WHATSAPP_BRIDGE' ? (
                // Bridge posts: never expose the WhatsApp sender. Show a
                // neutral resident label + the origin chip.
                <span className="hai-body-strong">{lang === 'en' ? 'A neighbor' : 'أحد سكان الحي'}</span>
              ) : (
                <>
                  <span className="hai-body-strong">{fullName(post.author) || t('post_neighbor')}</span>
                  <UserBadgeDisplay accountType={post.author.accountType} providerStatus={post.author.providerStatus} reputation={post.author.reputation} role={post.author.role} />
                  <MembershipPill membership={post.author.membership as any} />
                </>
              )}
            </div>
            <div className="hai-row-1">
              <span className="hai-meta">{timeAgo(post.createdAt)}</span>
              {post.origin === 'WHATSAPP_BRIDGE' && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                  {lang === 'en' ? 'via WhatsApp' : 'نُشر عبر واتساب'}
                </span>
              )}
              <TierLabel reputation={post.author.reputation} compact />
              {post.isFeatured && (
                <StatePill state="featured" label={lang !== 'en' ? 'بارز' : 'Featured'} />
              )}
              {post.originScope === 'OUTSIDE_REQUEST' && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[10px] font-semibold px-1.5 py-0.5 leading-none">
                  📍 {t('post_outside_badge')}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="hai-row-2">
          <span className="hai-category-badge" data-category={v2Category}>{style.icon} {t(style.tKey)}</span>
          {/* Marketplace JOB subtype — distinct amber badge so a job
              listing reads differently from a regular sell post inside
              the same category. SELL renders no extra badge (default).
              BUY shows a small "buying" tag. */}
          {post.category === 'MARKETPLACE' && post.marketplaceType === 'JOB' && (
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
            >
              💼 {lang === 'en' ? 'Job' : 'فرصة عمل'}
            </span>
          )}
          {post.category === 'MARKETPLACE' && post.marketplaceType === 'BUY' && (
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
            >
              📥 {lang === 'en' ? 'Buying' : 'شراء'}
            </span>
          )}
          {isRequest && (
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
              aria-label={t('post_intent_request')}
            >
              {t('post_intent_request')}
            </span>
          )}
          {/* Phase 1 inferred-subtype chip. Self-gated by
              NEXT_PUBLIC_STRUCTURED_POST_METADATA — when the flag is
              off, returns null and renders nothing. Stays read-only;
              Phase 1.5 may add a tap-to-change picker. */}
          <SubtypeChip
            category={post.category}
            realEstateType={post.realEstateType ?? null}
            civicType={post.civicType ?? null}
            eventStartAt={post.eventStartAt ?? null}
            eventLocation={post.eventLocation ?? null}
          />

          <div className="hai-menu-anchor" ref={menuRef}>
            <button
              onClick={() => { setShowMenu(!showMenu); hapticLight() }}
              className="hai-btn-icon hai-btn-icon--sm"
            >
              <FiMoreVertical className="hai-icon-md" />
            </button>
            {showMenu && (
              <div className="hai-menu hai-menu--anchored hai-menu--anchored-end">
                {/* Owner: edit + delete */}
                {post.author.id === currentUserId && (
                  <>
                    <button
                      onClick={() => { setEditing(true); setShowMenu(false) }}
                      className="hai-menu-item is-brand"
                    >
                      <FiEdit2 className="hai-icon-sm hai-menu-item__icon" />
                      <span className="hai-menu-item__label">{lang === 'en' ? 'Edit' : lang === 'ur' ? 'ترمیم' : 'تعديل'}</span>
                    </button>
                    <button
                      onClick={async () => {
                        const ok = await confirmDialog({
                          message: lang === 'en' ? 'Delete this post?' : lang === 'ur' ? 'پوسٹ حذف کریں؟' : 'حذف هذا المنشور؟',
                          variant: 'danger',
                          confirmText: lang === 'en' ? 'Delete' : lang === 'ur' ? 'حذف' : 'حذف',
                        })
                        if (!ok) return
                        const res = await fetch(`/api/posts/${post.id}`, { method: 'DELETE' })
                        if (res.ok) {
                          playDelete()
                          try {
                            window.dispatchEvent(new CustomEvent('hai:content-deleted', {
                              detail: { contentType: 'post', contentId: post.id },
                            }))
                          } catch {}
                          toast.success(lang === 'en' ? 'Deleted' : lang === 'ur' ? 'حذف ہو گیا' : 'تم الحذف')
                          onDelete ? onDelete(post.id) : router.refresh()
                        } else {
                          toast.error(lang === 'en' ? 'Delete failed' : lang === 'ur' ? 'حذف ناکام' : 'فشل الحذف')
                        }
                        setShowMenu(false)
                      }}
                      className="hai-menu-item is-danger"
                    >
                      <FiTrash2 className="hai-icon-sm hai-menu-item__icon" />
                      <span className="hai-menu-item__label">{lang !== 'en' ? 'حذف' : 'Delete'}</span>
                    </button>
                  </>
                )}
                {/* Admin actions */}
                {isAdmin && post.status !== 'HIDDEN' && (
                  <button
                    onClick={() => { handleAdminAction('hide_post'); setShowMenu(false) }}
                    className="hai-menu-item is-warning"
                  >
                    <FiFlag className="hai-icon-sm hai-menu-item__icon" />
                    <span className="hai-menu-item__label">{lang !== 'en' ? 'إخفاء' : 'Hide'}</span>
                  </button>
                )}
                {currentUserRole === 'SUPER_ADMIN' && (
                  <button
                    onClick={() => { handleAdminAction('remove_post'); setShowMenu(false) }}
                    className="hai-menu-item is-danger"
                  >
                    <FiFlag className="hai-icon-sm hai-menu-item__icon" />
                    <span className="hai-menu-item__label">{lang !== 'en' ? 'حذف نهائي' : 'Remove'}</span>
                  </button>
                )}
                {isAdmin && post.status === 'HIDDEN' && (
                  <button
                    onClick={() => { handleAdminAction('restore_post'); setShowMenu(false) }}
                    className="hai-menu-item is-brand"
                  >
                    <FiFlag className="hai-icon-sm hai-menu-item__icon" />
                    <span className="hai-menu-item__label">{lang !== 'en' ? 'استعادة' : 'Restore'}</span>
                  </button>
                )}
                {/* Pin as reference — admins only. Goes to the
                    neighborhood "المثبتات" (Pinned items), NOT the stars/
                    highlights; opens a small duration sheet. */}
                {isAdmin && post.status !== 'HIDDEN' && (
                  <button
                    onClick={() => { setShowMenu(false); setPinSheetOpen(true) }}
                    className="hai-menu-item"
                  >
                    <span className="hai-icon-sm hai-menu-item__icon" aria-hidden>📌</span>
                    <span className="hai-menu-item__label">
                      {lang === 'en' ? 'Pin as reference' : 'تثبيت كمرجع'}
                    </span>
                  </button>
                )}
                {/* Mod / admin manual category override. Opens the
                    EditCategorySheet which calls PATCH /api/posts/:id/category.
                    Available on every post regardless of category. */}
                {isAdmin && post.status !== 'HIDDEN' && (
                  <button
                    onClick={() => { setShowEditCategory(true); setShowMenu(false) }}
                    className="hai-menu-item"
                  >
                    <FiFlag className="hai-icon-sm hai-menu-item__icon" />
                    <span className="hai-menu-item__label">
                      {lang === 'en' ? 'Edit category' : 'تعديل التصنيف'}
                    </span>
                  </button>
                )}
                {/* Add an extracted phone to the directory (خدمات وأرقام).
                    Shown only when the directory is enabled and the post
                    text holds a Saudi number — the user reviews + confirms
                    on the next screen, and the server resolves-or-creates
                    (links to an existing provider/contact, never auto-
                    exposes a normal user). */}
                {directoryUIVisible() && (() => {
                  const found = extractServiceContact(post.body || '')
                  if (found.phones.length === 0) return null
                  const first = found.phones[0]
                  const params = new URLSearchParams({ phone: first.raw, sourcePostId: post.id })
                  if (found.suggestedName) params.set('name', found.suggestedName)
                  if (found.suggestedCategory) params.set('category', found.suggestedCategory)
                  return (
                    <button
                      onClick={() => { setShowMenu(false); router.push(`/directory/services/new?${params.toString()}`) }}
                      className="hai-menu-item"
                    >
                      <span className="hai-icon-sm hai-menu-item__icon" aria-hidden>📇</span>
                      <span className="hai-menu-item__label">
                        {lang === 'en' ? 'Add number to directory' : lang === 'ur' ? 'نمبر ڈائریکٹری میں شامل کریں' : 'إضافة الرقم للدليل'}
                      </span>
                    </button>
                  )
                })()}
                {/* Report post */}
                {post.author.id !== currentUserId && (
                  <button
                    onClick={handleReport}
                    disabled={reported}
                    className="hai-menu-item is-danger"
                  >
                    <FiFlag className="hai-icon-sm hai-menu-item__icon" />
                    <span className="hai-menu-item__label">{reported ? t('post_reported') : t('post_report')}</span>
                  </button>
                )}
                {/* Report user — account-level complaint, distinct from
                    reporting the post itself. Opens the ReportUserSheet. */}
                {post.author.id !== currentUserId && (
                  <button
                    onClick={() => { setReportingUser(true); setShowMenu(false) }}
                    className="hai-menu-item is-danger"
                  >
                    <FiFlag className="hai-icon-sm hai-menu-item__icon" />
                    <span className="hai-menu-item__label">
                      {lang === 'en' ? 'Report user' : lang === 'ur' ? 'صارف رپورٹ کریں' : 'الإبلاغ عن المستخدم'}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content — editable or display */}
      {editing ? (
        <div className="hai-stack-2 hai-mb-2">
          <input
            type="text"
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            className="hai-input"
          />
          <textarea
            value={editBody}
            onChange={e => setEditBody(e.target.value)}
            className="hai-input"
            rows={3}
          />

          {/* Image editor — thumbnail strip of current photos + add
              button. Tapping the X on a thumbnail drops it from the
              draft list; tapping + opens the image picker. Changes
              only persist after Save. */}
          <div>
            <input
              ref={editImageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hai-hidden"
              onChange={async (e) => {
                const files = Array.from(e.target.files || [])
                if (!files.length) return
                setEditImageUploading(true)
                try {
                  const urls = await uploadFiles(files)
                  setEditImages((prev) => [...prev, ...urls].slice(0, 5))
                } catch {
                  toast.error(lang === 'en' ? 'Upload failed' : lang === 'ur' ? 'اپ لوڈ ناکام' : 'فشل رفع الصورة')
                } finally {
                  setEditImageUploading(false)
                  if (editImageInputRef.current) editImageInputRef.current.value = ''
                }
              }}
            />
            <input
              ref={editCameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hai-hidden"
              onChange={async (e) => {
                const files = Array.from(e.target.files || [])
                if (!files.length) return
                setEditImageUploading(true)
                try {
                  const urls = await uploadFiles(files)
                  setEditImages((prev) => [...prev, ...urls].slice(0, 5))
                } catch {
                  toast.error(lang === 'en' ? 'Upload failed' : lang === 'ur' ? 'اپ لوڈ ناکام' : 'فشل رفع الصورة')
                } finally {
                  setEditImageUploading(false)
                  if (editCameraInputRef.current) editCameraInputRef.current.value = ''
                }
              }}
            />
            <div className="hai-row-2" style={{ flexWrap: 'wrap', gap: 8 }}>
              {editImages.map((url, i) => (
                <div key={url + i} style={{ position: 'relative' }}>
                  <img
                    src={url}
                    alt=""
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 8,
                      objectFit: 'cover',
                      border: '1px solid var(--hai-border)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setEditImages((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label="remove"
                    style={{
                      position: 'absolute',
                      top: -6,
                      insetInlineEnd: -6,
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      background: 'rgba(0,0,0,0.75)',
                      color: '#fff',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <FiX className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {editImages.length < 5 && (
                <button
                  type="button"
                  disabled={editImageUploading}
                  onClick={() => setShowEditImageSheet(true)}
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 8,
                    border: '1px dashed var(--hai-border)',
                    background: 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--hai-text-muted)',
                    cursor: 'pointer',
                  }}
                  aria-label="add photo"
                >
                  {editImageUploading ? <HaiSpinner /> : <FiImage className="w-5 h-5" />}
                </button>
              )}
            </div>
            <p className="hai-meta hai-mt-1">
              {lang === 'en'
                ? `${editImages.length}/5 photos`
                : lang === 'ur'
                  ? `${editImages.length}/5 تصاویر`
                  : `${editImages.length}/5 صور`}
            </p>
          </div>

          <div className="hai-row-2">
            <button
              disabled={editLoading || editImageUploading}
              onClick={async () => {
                setEditLoading(true)
                const res = await fetch(`/api/posts/${post.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    title: editTitle.trim(),
                    body: editBody.trim(),
                    imageUrls: editImages,
                  }),
                })
                if (res.ok) {
                  const d = await res.json()
                  setPostData({
                    title: d.title,
                    body: d.body,
                    editedAt: d.editedAt,
                    imageUrls: Array.isArray(d.imageUrls) ? d.imageUrls : editImages,
                  })
                  setEditing(false)
                  toast.success(lang === 'en' ? 'Updated' : lang === 'ur' ? 'ترمیم شدہ' : 'تم التعديل')
                } else {
                  const err = await res.json()
                  toast.error(err.error || 'Error')
                }
                setEditLoading(false)
              }}
              className="hai-btn-primary hai-btn-sm hai-flex-1"
            >
              {editLoading ? <HaiSpinner /> : (lang === 'en' ? 'Save' : lang === 'ur' ? 'محفوظ' : 'حفظ')}
            </button>
            <button
              onClick={() => {
                setEditing(false)
                setEditTitle(postData.title)
                setEditBody(postData.body)
                setEditImages(postData.imageUrls || [])
              }}
              className="hai-btn-ghost hai-btn-sm"
            >
              {lang === 'en' ? 'Cancel' : lang === 'ur' ? 'منسوخ' : 'إلغاء'}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Title heading only renders when the author actually wrote
              one. Lightweight posts (GENERAL / REPORTS / LOST_FOUND /
              REQUEST-side services) ship body-only and let the body
              text carry the message — no synthesized "headline" in
              the card. displayTitle (with body-excerpt fallback) is
              still used for share / clipboard / push subject paths. */}
          {showTitleHeadline && (
            <h3 className="hai-body-strong hai-mb-1 selectable-text">{displayTitle}</h3>
          )}
          {/* Body — clamped to 5 lines by default. The toggle reveals
              the full text inline (no navigation). dir="auto" keeps
              Arabic / English / mixed text rendering correctly per
              paragraph. whitespace-pre-wrap preserves user-entered
              line breaks once expanded. SmartText turns bare URLs,
              map links, and contact snippets into clickable
              chips/anchors — same renderer the comments thread uses. */}
          <p
            ref={bodyRef}
            dir="auto"
            className={`hai-body hai-tc-sub selectable-text whitespace-pre-wrap ${
              bodyExpanded || hasRichEmbed ? '' : 'line-clamp-5'
            }`}
          >
            <SmartTextWithPlacePreviews text={displayBody} />
          </p>
          {bodyOverflows && !hasRichEmbed && (
            <button
              type="button"
              onClick={() => setBodyExpanded((v) => !v)}
              className="hai-meta hai-mt-1 text-primary-600 dark:text-primary-400"
              style={{ cursor: 'pointer' }}
              aria-expanded={bodyExpanded}
            >
              {bodyExpanded
                ? (lang === 'en' ? 'See less' : lang === 'ur' ? 'کم دکھائیں' : 'عرض أقل')
                : (lang === 'en' ? 'See more' : lang === 'ur' ? 'مزید دیکھیں' : 'عرض المزيد')}
            </button>
          )}
          {canTranslate && (
            <button
              type="button"
              onClick={toggleTranslate}
              disabled={translating}
              className="hai-meta hai-mt-1 text-primary-600 dark:text-primary-400 disabled:opacity-60"
              style={{ cursor: 'pointer' }}
            >
              {translating
                ? <HaiSpinner />
                : showTranslated
                  ? (lang === 'en' ? 'Show original' : lang === 'ur' ? 'اصل متن دکھائیں' : 'إظهار الأصلي')
                  : (lang === 'en' ? 'Translate' : lang === 'ur' ? 'ترجمہ کریں' : 'ترجمة')}
            </button>
          )}
          {postData.editedAt && (
            <p className="hai-meta hai-mt-1">
              {lang === 'en' ? 'Edited' : lang === 'ur' ? 'ترمیم شدہ' : 'تم التعديل'} {new Date(postData.editedAt).toLocaleDateString(lang !== 'en' ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </>
      )}

      {(post.price || (post.isOffer && post.originalPrice)) && (
        <div className="hai-mt-2 flex items-center flex-wrap gap-2">
          {post.isOffer && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 text-[11px] font-bold px-2 py-0.5">
              🏷️ {lang === 'en' ? 'Offer' : lang === 'ur' ? 'آفر' : 'عرض'}
            </span>
          )}
          {post.price != null && (
            <span className="hai-price">{post.price.toLocaleString('ar-SA')} <RiyalIcon /></span>
          )}
          {/* "Was" price struck-through + discount %, only a genuine drop */}
          {post.isOffer && post.originalPrice != null && post.originalPrice > (post.price ?? 0) && (
            <>
              <span className="text-sm text-gray-400 line-through decoration-rose-400">
                {post.originalPrice.toLocaleString('ar-SA')} <RiyalIcon />
              </span>
              {post.price != null && post.price > 0 && (
                <span className="rounded-md bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 text-[11px] font-bold px-1.5 py-0.5 tabular-nums">
                  -{Math.round((1 - post.price / post.originalPrice) * 100)}%
                </span>
              )}
            </>
          )}
        </div>
      )}

      {post.locationLat && post.locationLng && (
        <a
          href={`https://www.google.com/maps?q=${post.locationLat},${post.locationLng}`}
          target="_blank" rel="noopener noreferrer"
          className="hai-callout hai-callout--info hai-row-2 hai-mt-2"
        >
          <FiMapPin className="hai-icon-md hai-shrink-0" />
          <span className="hai-truncate hai-flex-1">
            {post.locationName || `${post.locationLat.toFixed(4)}, ${post.locationLng.toFixed(4)}`}
          </span>
          <span className="hai-meta hai-shrink-0">{lang === 'en' ? 'Open map' : lang === 'ur' ? 'نقشہ کھولیں' : 'فتح الخريطة'}</span>
        </a>
      )}

      {/* PDF attachment — rendered between location and the civic
          disclaimer footer so it sits with the post's other meta
          attachments. Tap opens the document in a new tab (or the
          native PDF viewer on iOS/Android via the OS file handler). */}
      {post.pdfUrl && (
        <div className="hai-mt-2">
          <PdfTile url={post.pdfUrl} name={post.pdfName} variant="card" />
        </div>
      )}

      {/* Civic disclaimer — NEIGHBORHOOD_REPORTS posts are user-authored
          observations / suggestions, not official statements. The
          footer lowers complaint surface and signals to readers that
          unverified claims belong here, not in operational responses.
          Stored as plain Arabic — RTL/CSS handles direction; never
          manually reversed. */}
      {post.category === 'NEIGHBORHOOD_REPORTS' && (
        <p className="hai-mt-2 text-[11px] leading-snug text-gray-500 dark:text-gray-400 italic">
          {lang === 'en'
            ? '⚠️ A neighbor suggestion/observation — not an official statement.'
            : lang === 'ur'
              ? '⚠️ پڑوسی کی تجویز/مشاہدہ — کسی سرکاری ادارے کا بیان نہیں۔'
              : '⚠️ اقتراح/ملاحظة مجتمعية لا تمثل جهة رسمية'}
        </p>
      )}

      {/* Render from postData.imageUrls (not post.imageUrls) so the
          grid + lightbox update immediately after a successful edit. */}
      {postData.imageUrls.length > 0 && (
        <>
          <div className="hai-media-grid" data-count={Math.min(postData.imageUrls.length, 4)}>
            {postData.imageUrls.slice(0, 3).map((url, i) => {
              const extra = postData.imageUrls.length - 3
              const showOverlay = i === 2 && extra > 0
              return (
                <div key={i} className="hai-media-grid__item" onClick={() => setLightboxIndex(i)}>
                  <img src={url} alt="" />
                  {showOverlay && (
                    <div className="hai-media-grid__overlay">
                      <span>+{extra}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Fullscreen lightbox with pinch/swipe/double-tap gestures */}
          <ImageLightbox
            images={postData.imageUrls}
            initialIndex={lightboxIndex ?? 0}
            open={lightboxIndex !== null}
            onClose={() => setLightboxIndex(null)}
          />
        </>
      )}

      {/* Comment/reply image lightbox — single image, same component */}
      <ImageLightbox
        images={commentLightbox ? [commentLightbox] : []}
        initialIndex={0}
        open={commentLightbox !== null}
        onClose={() => setCommentLightbox(null)}
      />

      {/* Reaction + Comment bar */}
      <div className="hai-action-bar hai-justify-between">
        {/* Reactions — full emoji picker */}
        <div className="hai-menu-anchor hai-row-2">

          {/* Emoji picker — portaled to <body> so it escapes any
              transformed/will-change ancestor (.glass, .glass-bottom,
              .hai-page-enter route-transition wrapper). Position is
              computed from the trigger's getBoundingClientRect() so
              the picker sits right above the post's reaction button,
              with horizontal clamp so it never escapes the viewport. */}
          {showReactionPicker && typeof document !== 'undefined' && createPortal(
            <div
              ref={pickerRef}
              className="hai-reaction-popover reaction-picker-enter"
              style={(() => {
                const rect = reactionTriggerRef.current?.getBoundingClientRect()
                if (!rect) return undefined
                const pickerW = 320 // matches EmojiPickerWrapper w-72 + a little slack
                const margin = 12
                const vw = window.innerWidth
                const triggerCenter = rect.left + rect.width / 2
                let left = triggerCenter - pickerW / 2
                if (left < margin) left = margin
                if (left + pickerW > vw - margin) left = vw - pickerW - margin
                return {
                  left: `${left}px`,
                  top: `${rect.top - 8}px`,
                  transform: 'translateY(-100%)',
                }
              })()}
            >
              <EmojiPicker onSelect={(emoji) => { handleReact(emoji); setShowReactionPicker(false) }} />
            </div>,
            document.body,
          )}

          {/* Single reaction control: your reaction (or a colorless smile)
              + the total count inline. Tapping opens the picker — pick to
              react/change, or tap your current emoji again to remove. Replaces
              the old trigger + separate "+" + duplicate emoji-stack summary. */}
          <button
            ref={reactionTriggerRef}
            onClick={() => setShowReactionPicker(v => !v)}
            className="hai-reaction-item"
            data-selected={myReaction ? 'true' : 'false'}
            aria-label={lang === 'en' ? 'React' : 'تفاعل'}
          >
            <span className={`hai-reaction-item__icon ${myReaction ? 'hai-reaction-emoji-lg' : ''} ${bouncingReaction && myReaction ? 'reaction-bounce' : ''}`}>
              {myReaction ?? <FiSmile className="hai-icon-lg" />}
            </span>
            {totalReactions > 0 && <span className="hai-reaction-item__count">{totalReactions}</span>}
          </button>
        </div>

        <div className="hai-row-1">
          {/* Contact / DM button */}
          {post.author.id !== currentUserId && canStartPrivateThread(v2Category) && (
            post.coordinationMode === 'EXCLUSIVE' && post.activeThreadId ? (
              <span className="hai-action-btn is-warning hai-action-btn--static">
                <FiMail className="hai-icon-md hai-action-btn__icon" />
                <span className="hai-action-btn__label">{t('thread_in_progress')}</span>
              </span>
            ) : (
              <button
                onClick={async () => {
                  try {
                    const res = await fetch('/api/threads', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ userId: post.author.id, postId: post.id }),
                    })
                    if (res.ok) {
                      const { threadId } = await res.json()
                      router.push(`/threads/${threadId}`)
                    } else if (res.status === 409) {
                      toast.error(t('thread_claimed'))
                    }
                  } catch { /* ignore */ }
                }}
                className="hai-action-btn"
              >
                <FiMail className="hai-icon-md hai-action-btn__icon" />
                <span className="hai-action-btn__label">{t('thread_contact')}</span>
              </button>
            )
          )}

          {/* Share */}
          <button
            onClick={async () => {
              // Share the PUBLIC preview page (rich link preview + app CTA),
              // not /feed — browser visitors are bounced off /feed by the
              // middleware. Native-app users get redirected to the post.
              const url = `${window.location.origin}/s/post/${post.id}`
              // For titleless posts use the body-excerpt headline so
              // the share sheet / clipboard preview isn't blank.
              const shareTitle = buildDisplayTitle(
                { title: post.title, body: post.body, category: post.category as any },
                lang as 'ar' | 'en' | 'ur',
              )
              const text = `${shareTitle}\n${post.body.slice(0, 100)}${post.body.length > 100 ? '...' : ''}`
              if (navigator.share) {
                try { await navigator.share({ title: shareTitle, text, url }) } catch { /* cancelled */ }
              } else {
                await navigator.clipboard.writeText(`${shareTitle}\n${url}`)
                toast.success(lang !== 'en' ? 'تم نسخ الرابط' : 'Link copied')
              }
            }}
            className="hai-action-btn"
          >
            <FiShare2 className="hai-icon-md hai-action-btn__icon" />
          </button>

          {/* Bookmark */}
          <button
            onClick={toggleBookmark}
            data-selected={bookmarked ? 'true' : 'false'}
            className="hai-action-btn"
          >
            <FiBookmark className={`hai-icon-md hai-action-btn__icon ${bookmarked ? 'hai-fill-current' : ''}`} />
          </button>

          {/* Follow post — visible in the action bar so users discover
              the feature without opening the overflow menu. Hidden for
              the author (they implicitly follow their own post). Uses
              the same hai-action-btn primitive as Bookmark/Share. */}
          {post.author.id !== currentUserId && (
            <button
              onClick={toggleFollow}
              data-selected={following ? 'true' : 'false'}
              aria-label={following
                ? (lang === 'en' ? 'Unfollow post' : 'إلغاء المتابعة')
                : (lang === 'en' ? 'Follow post' : 'متابعة المنشور')}
              className="hai-action-btn"
            >
              {following
                ? <FiBell className="hai-icon-md hai-action-btn__icon hai-fill-current" />
                : <FiBellOff className="hai-icon-md hai-action-btn__icon" />}
            </button>
          )}

          {/* Comment toggle */}
          {isLookingFor ? (
            <button
              onClick={() => { toggleComments(); hapticLight() }}
              data-active={showComments ? 'true' : 'false'}
              className="hai-help-pill"
            >
              <span>🤝</span>
              <span>{showComments ? (totalComments > 0 ? `${totalComments} ${t('post_helped')}` : t('post_help_btn')) : (lang !== 'en' ? 'ساعده' : 'Help')}</span>
            </button>
          ) : (
            <button
              onClick={toggleComments}
              className="hai-action-btn"
            >
              <FiMessageCircle className="hai-icon-md hai-action-btn__icon" />
              <span className="hai-action-btn__count">{totalComments > 0 ? totalComments : t('post_comment')}</span>
            </button>
          )}

          {/* Distinct-viewer count — non-interactive stat (icon +
              number only, no viewer list). */}
          <span
            className="hai-action-btn"
            style={{ cursor: 'default', opacity: 0.75 }}
            title={lang === 'en' ? `${viewCount} views` : `${viewCount} مشاهدة`}
            aria-label={lang === 'en' ? `${viewCount} views` : `${viewCount} مشاهدة`}
          >
            <FiEye className="hai-icon-md hai-action-btn__icon" />
            <span className="hai-action-btn__count">{viewCount}</span>
          </span>
        </div>
      </div>

      {/* Top comment preview. The outer block is rendered whenever the
          post has at least one comment, so the card's height is stable
          from first paint. If real preview data is available (SSR or
          after full-thread fetch), we show it. If somehow missing, we
          render a same-height skeleton so the card doesn't jump when
          data arrives. */}
      {!showComments && serverCommentCount > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100/50 dark:border-white/[0.04]">
          {comments.length > 0 ? (() => {
            const top: any = [...comments].sort((a: any, b: any) => (b.likeCount || 0) - (a.likeCount || 0))[0]
            if (!top) return null
            return (
              <button onClick={toggleComments} className="w-full text-start">
                <div className="flex items-start gap-2">
                  {top.author.avatarUrl ? (
                    <img src={top.author.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0 mt-0.5" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-600 dark:to-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-600 dark:text-gray-300 flex-shrink-0 mt-0.5">
                      {top.author.name?.[0] || '؟'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">{fullName(top.author) || top.author.name}</span>
                    {parseStickerRef(top.imageUrl) ? (
                      <div className="mt-0.5"><Sticker id={parseStickerRef(top.imageUrl)!} size={46} /></div>
                    ) : top.body ? (
                      <p className="text-[12px] text-gray-500 dark:text-gray-400 leading-snug line-clamp-2">{top.body}</p>
                    ) : top.imageUrl ? (
                      <p className="text-[12px] text-gray-500 dark:text-gray-400 leading-snug">📷 {lang === 'en' ? 'Photo' : 'صورة'}</p>
                    ) : null}
                  </div>
                  {(top.likeCount || 0) > 0 && (
                    <span className="text-[10px] text-gray-400 flex items-center gap-0.5 flex-shrink-0 mt-1">
                      <FiHeart className="w-3 h-3" />{top.likeCount}
                    </span>
                  )}
                </div>
                {totalComments > 1 && (
                  <p className="text-[11px] text-primary-600 dark:text-primary-400 font-medium mt-1.5">
                    {lang === 'en' ? `View all ${totalComments} comments` : `عرض جميع التعليقات (${totalComments})`}
                  </p>
                )}
              </button>
            )
          })() : (
            <div aria-hidden className="flex items-start gap-2 opacity-60">
              <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-white/5 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="h-2.5 w-24 rounded bg-gray-200 dark:bg-white/5" />
                <div className="h-2 w-full rounded bg-gray-200 dark:bg-white/5" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Comments — Instagram-style bottom sheet.
          Opens in a fixed-position overlay so long threads never push
          the feed around. Scrollable body + pinned input at the bottom. */}
      <AttachmentMenu
        open={showAttachMenu !== null}
        onClose={() => setShowAttachMenu(null)}
        onPickImage={() => {
          if (showAttachMenu) openImagePicker(showAttachMenu)
        }}
        onPickContact={() => {
          if (showAttachMenu) attachContactToComposer(showAttachMenu)
        }}
        onPickLocation={() => {
          if (showAttachMenu) attachLocationToComposer(showAttachMenu)
        }}
        onPickDocument={() => {
          // Open the hidden file input for whichever composer is
          // currently showing the menu — the input's onChange seeds
          // commentPdf / replyPdf with the picked File. Upload itself
          // is deferred until submit (same pattern as commentImage).
          if (showAttachMenu === 'comment') commentPdfInputRef.current?.click()
          else if (showAttachMenu === 'reply') replyPdfInputRef.current?.click()
        }}
        onPickPlace={
          canAttachPlace
            ? () => {
                // Remember which composer asked, then open the
                // picker. The menu auto-closes (wrap() inside
                // AttachmentMenu) so we just stash the target.
                if (showAttachMenu) setPlacePickerFor(showAttachMenu)
              }
            : undefined
        }
        variant="comment"
      />
      <PinDurationSheet open={pinSheetOpen} busy={pinBusy} onClose={() => setPinSheetOpen(false)} onSelect={pinAsReference} />
      {canAttachPlace && (
        <PlacePickerSheet
          open={placePickerFor !== null}
          onClose={() => setPlacePickerFor(null)}
          onSelect={(item) => {
            // Places insert a /directory/<id> link (place preview card);
            // service contacts insert a callable "📱 name — phone" snippet.
            const text = item.kind === 'service'
              ? formatContactSnippet({ name: item.name, phone: item.phone })
              : `/directory/${item.id}`
            if (!text) return
            const target = placePickerFor
            if (target === 'comment') {
              setCommentText((prev) => {
                if (!prev) return text
                if (prev.includes(text)) return prev
                return `${prev.trimEnd()}\n${text}`
              })
            } else if (target === 'reply') {
              setReplyText((prev) => {
                if (!prev) return text
                if (prev.includes(text)) return prev
                return `${prev.trimEnd()}\n${text}`
              })
            }
          }}
        />
      )}
      {/* Hidden file inputs that back the AttachmentMenu "Document"
          row. Two separate inputs because the top-level comment
          composer and the reply composer hold independent state. */}
      <input
        ref={commentPdfInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.currentTarget.value = ''
          if (!file) return
          if (file.type !== 'application/pdf') { toast.error(lang === 'en' ? 'Only PDF files' : 'فقط ملفات PDF'); return }
          if (file.size > 50 * 1024 * 1024) { toast.error(lang === 'en' ? 'PDF too large (max 50MB)' : 'حجم الملف كبير'); return }
          // Upload on pick — comment submit reads the cached URL.
          setCommentPdf({ url: null, name: file.name, size: file.size, uploading: true, percent: 0, stage: 'scanning' })
          try {
            const result = await uploadPdf(file, {
              onProgress: (percent) =>
                setCommentPdf((prev) => (prev && prev.uploading ? { ...prev, percent } : prev)),
              onStage: (stage) =>
                setCommentPdf((prev) => (prev && prev.uploading ? { ...prev, stage } : prev)),
            })
            setCommentPdf({ url: result.url, name: result.name, size: result.size, uploading: false, percent: 100, stage: 'uploading' })
          } catch (err: any) {
            const message = err?.message || (lang === 'en' ? 'PDF upload failed' : 'فشل رفع الملف')
            toast.error(message)
            setCommentPdf({ url: null, name: file.name, size: file.size, uploading: false, percent: 0, stage: 'uploading', error: message })
          }
        }}
      />
      <input
        ref={replyPdfInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.currentTarget.value = ''
          if (!file) return
          if (file.type !== 'application/pdf') { toast.error(lang === 'en' ? 'Only PDF files' : 'فقط ملفات PDF'); return }
          if (file.size > 50 * 1024 * 1024) { toast.error(lang === 'en' ? 'PDF too large (max 50MB)' : 'حجم الملف كبير'); return }
          setReplyPdf({ url: null, name: file.name, size: file.size, uploading: true, percent: 0, stage: 'scanning' })
          try {
            const result = await uploadPdf(file, {
              onProgress: (percent) =>
                setReplyPdf((prev) => (prev && prev.uploading ? { ...prev, percent } : prev)),
              onStage: (stage) =>
                setReplyPdf((prev) => (prev && prev.uploading ? { ...prev, stage } : prev)),
            })
            setReplyPdf({ url: result.url, name: result.name, size: result.size, uploading: false, percent: 100, stage: 'uploading' })
          } catch (err: any) {
            const message = err?.message || (lang === 'en' ? 'PDF upload failed' : 'فشل رفع الملف')
            toast.error(message)
            setReplyPdf({ url: null, name: file.name, size: file.size, uploading: false, percent: 0, stage: 'uploading', error: message })
          }
        }}
      />
      {showComments && (
        <div
          data-overlay="true"
          className="hai-sheet-overlay"
          onPointerDown={(e) => {
            if (e.target !== e.currentTarget) return
            e.preventDefault()
            consumeNextClick()
            setShowComments(false)
          }}
        >
          <div
            ref={commentsSheetRef}
            className="hai-sheet animate-slide-up"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Drag handle — grab bar + header, everything the finger
                needs to catch to drag-dismiss the sheet. Touches that
                land inside the scrollable body below are unaffected
                because the hook only listens on this ref. */}
            <div ref={commentsHandleRef} style={{ touchAction: 'none' }}>
              <div className="hai-sheet__handle" />
              <div className="hai-sheet__header">
                <h3 className="hai-sheet__header-title">
                  {lang === 'en' ? 'Comments' : 'التعليقات'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowComments(false)}
                  className="hai-sheet__close"
                >
                  <FiX className="hai-icon-lg" />
                </button>
              </div>
            </div>

            <div ref={commentsBodyRef} className="hai-sheet__body">
              {/* Wait for the full thread to land before painting any
                  comments — otherwise the SSR preview (1 comment)
                  flashes for ~200-400ms and then the full 50 pop in
                  underneath, which the user reads as "comments not
                  loading all in one shot". A loading spinner during
                  the fetch keeps the UX feeling intentional, and
                  every comment appears together when the data is
                  ready. The SSR preview is still useful as the inline
                  row under each feed post — it just shouldn't drive
                  this sheet's first paint. */}
              {!commentsLoaded ? (
                <div className="flex justify-center py-10">
                  <HaiSpinner />
                </div>
              ) : comments.length === 0 ? (
                <p className="hai-empty-state">{t('post_no_comments')}</p>
              ) : (
                comments.map((c: any) => (
                  <div key={c.id}>
                    <div className="hai-comment">
                      {c.author.avatarUrl ? (
                        <img src={c.author.avatarUrl} alt="" className="hai-avatar hai-avatar--sm cursor-pointer" onClick={() => { setPopupUser(c.author); setShowUserPopup(true) }} />
                      ) : (
                        <div className="hai-avatar hai-avatar--sm cursor-pointer" onClick={() => { setPopupUser(c.author); setShowUserPopup(true) }}>
                          {c.author.name?.[0] || '؟'}
                        </div>
                      )}
                      <div className="hai-comment__body">
                        <div className="hai-comment__meta">
                          <span className="hai-comment__author cursor-pointer" onClick={() => { setPopupUser(c.author); setShowUserPopup(true) }}>{fullName(c.author) || t('post_neighbor')}</span>
                          <UserBadgeDisplay accountType={c.author.accountType} providerStatus={c.author.providerStatus} reputation={c.author.reputation} />
                          {c.author.id === post.author.id && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-primary-100 text-primary-700 dark:bg-primary-500/20 dark:text-primary-300">
                              {lang === 'en' ? 'Author' : 'صاحب المنشور'}
                            </span>
                          )}
                          {c.pinnedAt && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                              📌 {lang === 'en' ? 'Pinned' : 'مثبّت'}
                            </span>
                          )}
                          <span className="hai-comment__time">
                            {(() => {
                              const mins = Math.floor((Date.now() - new Date(c.createdAt).getTime()) / 60000)
                              if (mins < 1) return lang === 'en' ? 'now' : 'الآن'
                              if (mins < 60) return lang === 'en' ? `${mins}m` : `${mins}د`
                              const hrs = Math.floor(mins / 60)
                              if (hrs < 24) return lang === 'en' ? `${hrs}h` : `${hrs}س`
                              return lang === 'en' ? `${Math.floor(hrs/24)}d` : `${Math.floor(hrs/24)}ي`
                            })()}
                          </span>
                        </div>
                        {editingCommentId === c.id ? (
                          <div className="hai-comment__edit-form">
                            <input
                              type="text"
                              value={editCommentBody}
                              onChange={e => setEditCommentBody(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveCommentEdit(c.id, post.id); if (e.key === 'Escape') setEditingCommentId(null) }}
                              autoFocus
                              maxLength={500}
                            />
                            <button onClick={() => saveCommentEdit(c.id, post.id)} className="hai-comment__edit-btn hai-comment__edit-btn--save">✓</button>
                            <button onClick={() => setEditingCommentId(null)} className="hai-comment__edit-btn hai-comment__edit-btn--cancel">✕</button>
                          </div>
                        ) : (
                          <>
                            {c.body && (() => {
                              const tx = commentTx[c.id]
                              const showTx = !!tx?.show
                              const displayBody = showTx && tx?.body ? tx.body : c.body
                              return (
                                <p className="hai-comment__text selectable-text">
                                  <SmartTextWithPlacePreviews text={displayBody} />
                                  {c.editedAt && <span className="hai-meta hai-comment__edited"> {lang === 'en' ? '(edited)' : '(معدّل)'}</span>}
                                </p>
                              )
                            })()}
                            {c.imageUrl && (parseStickerRef(c.imageUrl) ? (
                              <div className="mt-1.5">
                                <Sticker id={parseStickerRef(c.imageUrl)!} size={118} />
                              </div>
                            ) : (
                              <img
                                src={c.imageUrl}
                                alt=""
                                className="hai-comment__image"
                                onClick={() => setCommentLightbox(c.imageUrl!)}
                              />
                            ))}
                            {c.pdfUrl && (
                              <div className="mt-1.5">
                                <PdfTile url={c.pdfUrl} name={c.pdfName} variant="comment" />
                              </div>
                            )}
                          </>
                        )}
                        <div className="hai-comment__actions">
                          <button
                            onClick={() => setReplyingTo(replyingTo?.id === c.id ? null : { id: c.id, name: fullName(c.author) || t('post_neighbor') })}
                            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-bold active:scale-95 transition-transform ${
                              replyingTo?.id === c.id
                                ? 'bg-primary-600 text-white'
                                : 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-500/10'
                            }`}
                          >
                            <FiCornerDownRight className="w-3.5 h-3.5" />
                            {t('post_reply')}
                          </button>
                          {/* Pin/unpin — post author or mod only. */}
                          {(post.author.id === currentUserId || isAdmin) && (
                            <button
                              onClick={() => pinComment(c.id)}
                              className={`hai-comment__action ${c.pinnedAt ? 'is-active' : ''}`}
                            >
                              {c.pinnedAt
                                ? (lang === 'en' ? 'Unpin' : 'إلغاء التثبيت')
                                : (lang === 'en' ? 'Pin' : 'تثبيت')}
                            </button>
                          )}
                          {c.author.id === currentUserId && (
                            <>
                              {Date.now() - new Date(c.createdAt).getTime() < 30 * 60_000 && (
                                <button
                                  onClick={() => { setEditingCommentId(c.id); setEditCommentBody(c.body) }}
                                  className="hai-comment__action"
                                >
                                  {lang === 'en' ? 'Edit' : 'تعديل'}
                                </button>
                              )}
                              <button
                                onClick={() => deleteComment(c.id, post.id)}
                                className="hai-comment__action is-danger"
                              >
                                {lang === 'en' ? 'Delete' : 'حذف'}
                              </button>
                            </>
                          )}
                          {/* Translate — shows only when the comment's
                              detected language differs from the UI. */}
                          {c.body && detectLang(c.body) !== lang && (
                            <button
                              onClick={() => toggleCommentTranslate(c.id, c.body)}
                              disabled={commentTx[c.id]?.loading}
                              className="hai-comment__action"
                            >
                              {commentTx[c.id]?.loading
                                ? <HaiSpinner />
                                : commentTx[c.id]?.show
                                  ? (lang === 'en' ? 'Original' : lang === 'ur' ? 'اصل' : 'الأصل')
                                  : (lang === 'en' ? 'Translate' : lang === 'ur' ? 'ترجمہ' : 'ترجمة')}
                            </button>
                          )}
                          {/* Report — only on other people's comments. */}
                          {c.author.id !== currentUserId && (
                            <button
                              onClick={() => setCommentReportTarget({ id: c.author.id, name: fullName(c.author) || c.author.name, commentId: c.id })}
                              className="hai-comment__action is-danger"
                            >
                              {lang === 'en' ? 'Report' : lang === 'ur' ? 'رپورٹ' : 'إبلاغ'}
                            </button>
                          )}
                          {/* Mod/admin — remove another user's comment. */}
                          {isAdmin && c.author.id !== currentUserId && (
                            <button
                              onClick={() => deleteComment(c.id, post.id)}
                              className="hai-comment__action is-danger"
                            >
                              {lang === 'en' ? 'Delete' : 'حذف'}
                            </button>
                          )}
                        </div>
                      </div>
                      {/* Instagram-style: like on the trailing edge, count beneath. */}
                      <button
                        type="button"
                        onClick={() => handleCommentLike(c.id)}
                        aria-label="like"
                        className="flex flex-col items-center gap-0.5 flex-shrink-0 self-center active:scale-90 transition-transform"
                      >
                        <FiHeart className={`hai-icon-sm ${c.isLiked ? 'hai-fill-current text-red-500' : 'text-gray-400'}`} />
                        {(c.likeCount || 0) > 0 && <span className="text-[10px] text-gray-500 dark:text-gray-400 leading-none">{c.likeCount}</span>}
                      </button>
                    </div>

                    {/* Replies */}
                    {c.replies.length > 0 && (
                      <div className="hai-comment-replies">
                        {c.replies.map((reply: any) => (
                          <div key={reply.id} className="hai-comment-reply">
                            {reply.author.avatarUrl ? (
                              <img src={reply.author.avatarUrl} alt="" className="hai-avatar hai-avatar--xs cursor-pointer" onClick={() => { setPopupUser(reply.author); setShowUserPopup(true) }} />
                            ) : (
                              <div className="hai-avatar hai-avatar--xs cursor-pointer" onClick={() => { setPopupUser(reply.author); setShowUserPopup(true) }}>
                                {reply.author.name?.[0] || '؟'}
                              </div>
                            )}
                            <div className="hai-comment__body">
                              <div className="hai-comment__meta">
                                <span className="hai-comment__author cursor-pointer" onClick={() => { setPopupUser(reply.author); setShowUserPopup(true) }}>{fullName(reply.author) || t('post_neighbor')}</span>
                                <UserBadgeDisplay accountType={reply.author.accountType} providerStatus={reply.author.providerStatus} reputation={reply.author.reputation} />
                                {reply.author.id === post.author.id && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-primary-100 text-primary-700 dark:bg-primary-500/20 dark:text-primary-300">
                                    {lang === 'en' ? 'Author' : 'صاحب المنشور'}
                                  </span>
                                )}
                                <span className="hai-comment__time">
                                  {(() => {
                                    const mins = Math.floor((Date.now() - new Date(reply.createdAt).getTime()) / 60000)
                                    if (mins < 1) return lang === 'en' ? 'now' : 'الآن'
                                    if (mins < 60) return lang === 'en' ? `${mins}m` : `${mins}د`
                                    const hrs = Math.floor(mins / 60)
                                    if (hrs < 24) return lang === 'en' ? `${hrs}h` : `${hrs}س`
                                    return lang === 'en' ? `${Math.floor(hrs / 24)}d` : `${Math.floor(hrs / 24)}ي`
                                  })()}
                                </span>
                              </div>
                              {reply.body && (() => {
                                const tx = commentTx[reply.id]
                                const showTx = !!tx?.show
                                const displayBody = showTx && tx?.body ? tx.body : reply.body
                                return (
                                  <p className="hai-comment__text selectable-text">
                                    <SmartTextWithPlacePreviews text={displayBody} />
                                  </p>
                                )
                              })()}
                              {reply.imageUrl && (parseStickerRef(reply.imageUrl) ? (
                                <div className="mt-1.5">
                                  <Sticker id={parseStickerRef(reply.imageUrl)!} size={100} />
                                </div>
                              ) : (
                                <img
                                  src={reply.imageUrl}
                                  alt=""
                                  className="hai-comment__image"
                                  onClick={() => setCommentLightbox(reply.imageUrl!)}
                                />
                              ))}
                              {reply.pdfUrl && (
                                <div className="mt-1.5">
                                  <PdfTile url={reply.pdfUrl} name={reply.pdfName} variant="comment" />
                                </div>
                              )}
                              <div className="hai-comment__actions">
                                {reply.author.id === currentUserId && (
                                  <button
                                    onClick={() => deleteComment(reply.id, post.id)}
                                    className="hai-comment__action is-danger"
                                  >
                                    {lang === 'en' ? 'Delete' : 'حذف'}
                                  </button>
                                )}
                                {reply.body && detectLang(reply.body) !== lang && (
                                  <button
                                    onClick={() => toggleCommentTranslate(reply.id, reply.body)}
                                    disabled={commentTx[reply.id]?.loading}
                                    className="hai-comment__action"
                                  >
                                    {commentTx[reply.id]?.loading
                                      ? <HaiSpinner />
                                      : commentTx[reply.id]?.show
                                        ? (lang === 'en' ? 'Original' : lang === 'ur' ? 'اصل' : 'الأصل')
                                        : (lang === 'en' ? 'Translate' : lang === 'ur' ? 'ترجمہ' : 'ترجمة')}
                                  </button>
                                )}
                                {reply.author.id !== currentUserId && (
                                  <button
                                    onClick={() => setCommentReportTarget({ id: reply.author.id, name: fullName(reply.author) || reply.author.name, commentId: reply.id })}
                                    className="hai-comment__action is-danger"
                                  >
                                    {lang === 'en' ? 'Report' : lang === 'ur' ? 'رپورٹ' : 'إبلاغ'}
                                  </button>
                                )}
                                {/* Mod/admin — remove another user's reply. */}
                                {isAdmin && reply.author.id !== currentUserId && (
                                  <button
                                    onClick={() => deleteComment(reply.id, post.id)}
                                    className="hai-comment__action is-danger"
                                  >
                                    {lang === 'en' ? 'Delete' : 'حذف'}
                                  </button>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCommentLike(reply.id)}
                              aria-label="like"
                              className="flex flex-col items-center gap-0.5 flex-shrink-0 self-center active:scale-90 transition-transform"
                            >
                              <FiHeart className={`hai-icon-xs ${reply.isLiked ? 'hai-fill-current text-red-500' : 'text-gray-400'}`} />
                              {(reply.likeCount || 0) > 0 && <span className="text-[10px] text-gray-500 dark:text-gray-400 leading-none">{reply.likeCount}</span>}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Reply input */}
                    {replyingTo?.id === c.id && (
                      <div className="hai-comment-reply-composer">
                        {replyImagePreview && (
                          <div className="hai-comment-input__attach">
                            <img src={replyImagePreview} alt="" />
                            <button
                              type="button"
                              onClick={() => { if (replyImagePreview) URL.revokeObjectURL(replyImagePreview); setReplyImage(null); setReplyImagePreview(null) }}
                              className="hai-comment-input__attach-remove"
                            >
                              <FiX className="hai-icon-xs" />
                            </button>
                          </div>
                        )}
                        {replyPdf && (
                          <div className="pb-2 space-y-1">
                            <div className="flex items-stretch gap-2">
                              <div className="flex-1 min-w-0">
                                <PdfTile url={replyPdf.url || '#'} name={replyPdf.name} size={replyPdf.size} variant="preview" />
                              </div>
                              <button
                                type="button"
                                onClick={() => setReplyPdf(null)}
                                aria-label={lang === 'en' ? 'Remove PDF' : 'إزالة الملف'}
                                className="flex-shrink-0 w-9 self-stretch rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 active:scale-95 transition-transform flex items-center justify-center"
                              >
                                <FiX className="w-4 h-4" />
                              </button>
                            </div>
                            {replyPdf.uploading ? (
                              <div className="px-1">
                                <div className="flex items-center justify-between mb-0.5 text-[10px]">
                                  <span
                                    key={replyPdf.stage}
                                    className="hai-typing-dots text-gray-500 dark:text-gray-400 animate-fade-in"
                                  >
                                    {uploadStageLabel(replyPdf.stage, lang as 'ar' | 'en' | 'ur')}
                                  </span>
                                  <span className="text-gray-500 dark:text-gray-400 font-medium tabular-nums">
                                    {replyPdf.stage === 'uploading' ? `${replyPdf.percent}%` : ''}
                                  </span>
                                </div>
                                <div className="h-0.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full transition-all duration-300 ${replyPdf.stage === 'uploading' ? 'bg-rose-500' : 'bg-rose-300 dark:bg-rose-400/60 animate-pulse'}`}
                                    style={{ width: replyPdf.stage === 'uploading' ? `${Math.max(2, Math.min(100, replyPdf.percent))}%` : '30%' }}
                                  />
                                </div>
                              </div>
                            ) : replyPdf.error ? (
                              <p className="px-1 text-[10px] text-rose-600 dark:text-rose-400">
                                {lang === 'en' ? 'Upload failed — remove and retry' : 'فشل الرفع — احذف وأعد المحاولة'}
                              </p>
                            ) : null}
                          </div>
                        )}
                        <form onSubmit={handleReply} className="hai-comment-input hai-comment-input--compact">
                          <input
                            type="text"
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                            placeholder={`${t('post_reply')}...`}
                            autoFocus
                            maxLength={500}
                          />
                          <input type="file" accept="image/*" ref={replyImgRef} onChange={e => handleCommentImageSelect(e, 'reply')} className="hai-hidden" />
                          <button
                            type="button"
                            onClick={() => { hapticLight(); setStickerTarget('reply') }}
                            className="hai-comment-input__attach-btn"
                            aria-label={lang === 'en' ? 'Stickers' : 'ملصقات'}
                            title={lang === 'en' ? 'Stickers' : 'ملصقات'}
                          >
                            <FiSmile className="hai-icon-sm" />
                          </button>
                          <button
                            type="button"
                            onClick={() => { hapticLight(); setShowAttachMenu('reply') }}
                            className="hai-comment-input__attach-btn"
                            aria-label={lang === 'en' ? 'Attach' : lang === 'ur' ? 'منسلک کریں' : 'إرفاق'}
                            title={lang === 'en' ? 'Attach' : lang === 'ur' ? 'منسلک کریں' : 'إرفاق'}
                          >
                            <FiPaperclip className="hai-icon-sm" />
                          </button>
                          <button
                            type="submit"
                            disabled={submittingReply || (!replyText.trim() && !replyImage)}
                            className="hai-comment-input__send"
                          >
                            <FiSend className="hai-icon-xs" />
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Pinned footer — comment composer. Hidden while an inline
                reply box is open so we never show two input bars at once. */}
            {!replyingTo && (
            <div className="hai-sheet__footer">
              {/* Pick contact from phone — only for LOOKING_FOR on supported devices */}
              {commentImagePreview && (
                <div className="hai-comment-input__attach">
                  <img src={commentImagePreview} alt="" />
                  <button
                    type="button"
                    onClick={() => { if (commentImagePreview) URL.revokeObjectURL(commentImagePreview); setCommentImage(null); setCommentImagePreview(null) }}
                    className="hai-comment-input__attach-remove"
                  >
                    <FiX className="hai-icon-xs" />
                  </button>
                </div>
              )}
              {commentPdf && (
                <div className="px-3 pb-2 space-y-1">
                  <div className="flex items-stretch gap-2">
                    <div className="flex-1 min-w-0">
                      <PdfTile url={commentPdf.url || '#'} name={commentPdf.name} size={commentPdf.size} variant="preview" />
                    </div>
                    <button
                      type="button"
                      onClick={() => setCommentPdf(null)}
                      aria-label={lang === 'en' ? 'Remove PDF' : 'إزالة الملف'}
                      className="flex-shrink-0 w-9 self-stretch rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 active:scale-95 transition-transform flex items-center justify-center"
                    >
                      <FiX className="w-4 h-4" />
                    </button>
                  </div>
                  {commentPdf.uploading ? (
                    <div className="px-1">
                      <div className="flex items-center justify-between mb-0.5 text-[10px]">
                        <span
                          key={commentPdf.stage}
                          className="hai-typing-dots text-gray-500 dark:text-gray-400 animate-fade-in"
                        >
                          {uploadStageLabel(commentPdf.stage, lang as 'ar' | 'en' | 'ur')}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400 font-medium tabular-nums">
                          {commentPdf.stage === 'uploading' ? `${commentPdf.percent}%` : ''}
                        </span>
                      </div>
                      <div className="h-0.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${commentPdf.stage === 'uploading' ? 'bg-rose-500' : 'bg-rose-300 dark:bg-rose-400/60 animate-pulse'}`}
                          style={{ width: commentPdf.stage === 'uploading' ? `${Math.max(2, Math.min(100, commentPdf.percent))}%` : '30%' }}
                        />
                      </div>
                    </div>
                  ) : commentPdf.error ? (
                    <p className="px-1 text-[10px] text-rose-600 dark:text-rose-400">
                      {lang === 'en' ? 'Upload failed — remove and retry' : 'فشل الرفع — احذف وأعد المحاولة'}
                    </p>
                  ) : null}
                </div>
              )}
              <form onSubmit={handleComment} className="hai-comment-input">
                <input
                  type="text"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder={isLookingFor ? t('post_share_placeholder') : t('post_comment_placeholder')}
                  maxLength={500}
                />
                <input type="file" accept="image/*" ref={commentImgRef} onChange={e => handleCommentImageSelect(e, 'comment')} className="hai-hidden" />
                <button
                  type="button"
                  onClick={() => { hapticLight(); setStickerTarget('comment') }}
                  className="hai-comment-input__attach-btn"
                  aria-label={lang === 'en' ? 'Stickers' : 'ملصقات'}
                  title={lang === 'en' ? 'Stickers' : 'ملصقات'}
                >
                  <FiSmile className="hai-icon-md" />
                </button>
                <button
                  type="button"
                  onClick={() => { hapticLight(); setShowAttachMenu('comment') }}
                  className="hai-comment-input__attach-btn"
                  aria-label={lang === 'en' ? 'Attach' : lang === 'ur' ? 'منسلک کریں' : 'إرفاق'}
                  title={lang === 'en' ? 'Attach' : lang === 'ur' ? 'منسلک کریں' : 'إرفاق'}
                >
                  <FiPaperclip className="hai-icon-md" />
                </button>
                <button
                  type="submit"
                  disabled={submitting || (!commentText.trim() && !commentImage)}
                  className="hai-comment-input__send"
                >
                  <FiSend className="hai-icon-md" />
                </button>
              </form>
            </div>
            )}
            {/* Sticker picker — mounted outside the footer so it stays
                available whether the comment or a reply composer is open. */}
            <StickerPicker
              open={!!stickerTarget}
              onPick={sendSticker}
              onClose={() => setStickerTarget(null)}
            />
          </div>
        </div>
      )}

      {/* User Profile Popup */}
      {showUserPopup && (popupProfile ? ((post: any) => {
        const rep = post.author.reputation
        const level = getRepLevel(rep)
        const levelLabel = { new: lang === 'en' ? 'New' : lang === 'ur' ? 'نیا' : 'جديد', active: lang !== 'en' ? 'نشط' : 'Active', trusted: lang !== 'en' ? 'موثوق' : 'Trusted', top: lang !== 'en' ? 'متميّز' : 'Top' }[level]
        const levelColor = { new: 'text-gray-500', active: 'text-green-600', trusted: 'text-blue-600', top: 'text-amber-500' }[level]
        const levelBg = { new: 'bg-gray-100 dark:bg-gray-700', active: 'bg-green-50 dark:bg-green-900/30', trusted: 'bg-blue-50 dark:bg-blue-900/30', top: 'bg-amber-50 dark:bg-amber-900/30' }[level]
        const ageDays = post.author.createdAt ? Math.floor((Date.now() - new Date(post.author.createdAt).getTime()) / 86400000) : 0
        const postCount = post.author._count?.posts || 0

        return (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
            onPointerDown={(e) => {
              // Only close when the press lands on THIS element itself
              // (the backdrop), never from bubbling. Android WebViews
              // occasionally dispatch a late touchend/click whose target
              // is a parent after an <a target="_blank"> tap — that
              // stray event was closing the popup right after social
              // chips were pressed. Comparing target vs currentTarget
              // is the one pattern that always gets it right.
              if (e.target !== e.currentTarget) return
              // Suppress the iOS ghost-click on whatever sits at these
              // coordinates after the popup unmounts.
              e.preventDefault()
              consumeNextClick()
              setShowUserPopup(false)
            }}
          >
            <div
              className="relative bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm mx-auto animate-slide-up max-h-[85vh] overflow-y-auto"
              style={{ paddingBottom: 'calc(var(--hai-safe-bottom, 0px) + 2rem)' }}
            >
              {/* Cover header — uses user's cover or default */}
              <div className="relative h-28 rounded-t-3xl sm:rounded-t-2xl"
                style={{ background: post.author.coverUrl || 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)' }}>
                {post.author.coverUrl?.startsWith('http') && (
                  <img src={post.author.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover rounded-t-3xl sm:rounded-t-2xl" />
                )}
                <div className="absolute top-0 left-0 right-0 h-72 pointer-events-none"
                  style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.1) 30%, transparent 100%)' }} />
                <button onClick={() => setShowUserPopup(false)} className="absolute top-3 left-3 bg-black/30 hover:bg-black/50 backdrop-blur-sm rounded-full p-1.5 z-10">
                  <FiX className="w-4 h-4 text-white" />
                </button>
              </div>

              <div className="flex flex-col items-center text-center px-5 -mt-12 relative z-10">
                {/* Large avatar — tap to fullscreen */}
                <div
                  onClick={() => post.author.avatarUrl && setShowFullAvatar(true)}
                  className={`w-24 h-24 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-3xl overflow-hidden mb-3 border-4 border-white dark:border-gray-800 shadow-lg ${post.author.avatarUrl ? 'cursor-pointer active:scale-95 transition-transform' : ''}`}
                >
                  {post.author.avatarUrl
                    ? <img src={post.author.avatarUrl} alt="" className="w-full h-full object-cover" />
                    : (post.author.name?.[0] || '؟')
                  }
                </div>

                {/* Name */}
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{fullName(post.author) || t('post_neighbor')}</h3>

                {/* Identity badges (verification, role) */}
                <div className="flex items-center gap-1.5 mt-1">
                  <UserBadgeDisplay accountType={post.author.accountType} providerStatus={post.author.providerStatus} reputation={rep} role={post.author.role} showLabel />
                  {/* Verified residents look normal (no badge); only CLAIMED
                      ("بانتظار التحقق") / OUTSIDE surface a status here. */}
                  <MembershipPill membership={post.author.membership as any} />
                </div>

                {/* Tier pill (reputation) */}
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
                  {/* Neighborhood */}
                  {post.author.neighborhood && (
                    <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-gray-700 rounded-xl">
                      <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><FiMapPin className="w-3.5 h-3.5" /> {lang !== 'en' ? 'الحي' : 'Neighborhood'}</span>
                      <span className="text-sm font-medium text-gray-800 dark:text-white">{lang === 'en' && post.author.neighborhood.nameEn ? post.author.neighborhood.nameEn : post.author.neighborhood.name}</span>
                    </div>
                  )}

                  {/* Gender */}
                  {post.author.gender && post.author.gender !== 'UNSPECIFIED' && (
                    <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-gray-700 rounded-xl">
                      <span className="text-xs text-gray-500 dark:text-gray-400">{lang !== 'en' ? 'الجنس' : 'Gender'}</span>
                      <span className="text-sm font-medium text-gray-800 dark:text-white">
                        {post.author.gender === 'MALE' ? (lang !== 'en' ? '👨 ذكر' : '👨 Male') : (lang !== 'en' ? '👩 أنثى' : '👩 Female')}
                      </span>
                    </div>
                  )}

                  {/* Account type — only shown publicly when the provider passed the status gate */}
                  {post.author.accountType && post.author.accountType !== 'NORMAL' &&
                    (post.author.providerStatus === 'ACTIVE' || post.author.providerStatus === 'VERIFIED') && (
                    <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-gray-700 rounded-xl">
                      <span className="text-xs text-gray-500 dark:text-gray-400">{lang !== 'en' ? 'نوع الحساب' : 'Account'}</span>
                      <span className="text-sm font-medium text-gray-800 dark:text-white">
                        {post.author.accountType === 'VERIFIED_PROVIDER' ? (lang !== 'en' ? '🛡 مقدم خدمة موثّق' : '🛡 Verified Provider') : (lang !== 'en' ? '🛠 مقدم خدمة' : '🛠 Service Provider')}
                      </span>
                    </div>
                  )}

                  {/* Member since */}
                  {post.author.createdAt && (
                    <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-gray-700 rounded-xl">
                      <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><FiCalendar className="w-3.5 h-3.5" /> {lang !== 'en' ? 'عضو منذ' : 'Joined'}</span>
                      <span className="text-sm font-medium text-gray-800 dark:text-white">{new Date(post.author.createdAt).toLocaleDateString(lang !== 'en' ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                    </div>
                  )}
                </div>

                {/* Bio + Service — unified card. Service block only shows for visible providers (ACTIVE/VERIFIED). */}
                {(post.author.bio || (post.author.accountType && post.author.accountType !== 'NORMAL' && (post.author.providerStatus === 'ACTIVE' || post.author.providerStatus === 'VERIFIED') && (post.author.serviceDescription || post.author.serviceAddress || post.author.serviceLat))) && (
                  <div className="mt-4 w-full rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-700">

                    {/* Bio section */}
                    {post.author.bio && (
                      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/50">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{lang !== 'en' ? 'نبذة' : 'About'}</p>
                        <p className="text-[13px] text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">{post.author.bio}</p>
                      </div>
                    )}

                    {/* Service section */}
                    {post.author.accountType && post.author.accountType !== 'NORMAL' && (post.author.providerStatus === 'ACTIVE' || post.author.providerStatus === 'VERIFIED') && (post.author.serviceDescription || post.author.serviceAddress || post.author.serviceLat) && (
                      <div className={`px-4 py-3 bg-green-50 dark:bg-green-900/20 ${post.author.bio ? 'border-t border-gray-100 dark:border-gray-700' : ''}`}>
                        <p className="text-[10px] font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide mb-1.5">
                          {lang !== 'en' ? 'الخدمة' : 'Service'}
                        </p>
                        {post.author.serviceDescription && (
                          <p className="text-[13px] text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">{post.author.serviceDescription}</p>
                        )}
                        {(post.author.serviceAddress || post.author.serviceLat) && (
                          <div className={`flex items-center gap-2 ${post.author.serviceDescription ? 'mt-2.5' : ''}`}>
                            <div className="flex-1 min-w-0">
                              {post.author.serviceAddress && (
                                <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{post.author.serviceAddress}</p>
                              )}
                            </div>
                            {post.author.serviceLat && post.author.serviceLng && (
                              <a
                                href={`https://maps.google.com/?q=${post.author.serviceLat},${post.author.serviceLng}`}
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

                {/* Social links — providers only, rendered as tappable
                    icon chips. Tapping opens the platform's app if
                    installed, falls back to the web profile. */}
                {post.author.socialLinks && Object.keys(post.author.socialLinks).length > 0 && (
                  <div className="flex justify-center pt-1">
                    <SocialChips links={post.author.socialLinks} />
                  </div>
                )}

                {/* Service Catalog */}
                {post.author.accountType && post.author.accountType !== 'NORMAL' && (
                  <ServiceCatalog userId={post.author.id} lang={lang} />
                )}

                {/* Report + Block user — both visible; report is
                    account-level and doesn't imply a block. */}
                {post.author.id !== currentUserId && (
                  <div className="flex items-center justify-center gap-4 mt-1">
                    <button
                      onClick={() => { setShowUserPopup(false); setReportingUser(true) }}
                      className="text-xs text-red-400 py-2"
                    >
                      {lang === 'en' ? 'Report user' : lang === 'ur' ? 'صارف رپورٹ کریں' : 'الإبلاغ عن المستخدم'}
                    </button>
                    <span className="text-gray-300 dark:text-gray-600">·</span>
                    <button
                      onClick={async () => {
                        const ok = await confirmDialog({
                          message: lang === 'en' ? "Block this user? You won't see their content." : 'حظر هذا المستخدم؟ لن ترى محتواه.',
                          variant: 'danger',
                          confirmText: lang === 'en' ? 'Block' : 'حظر',
                        })
                        if (!ok) return
                        try {
                          await fetch('/api/users/block', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: post.author.id }) })
                          toast.success(lang === 'en' ? 'User blocked' : 'تم الحظر')
                          setShowUserPopup(false)
                          router.refresh()
                        } catch {}
                      }}
                      className="text-xs text-red-400 py-2"
                    >
                      {lang !== 'en' ? 'حظر المستخدم' : 'Block User'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })({ ...post, author: popupProfile }) : (
        // Profile still loading — show the branded loader so the user never
        // sees a half-empty card pop its bio/details in late.
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowUserPopup(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm mx-auto py-20 flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <HaiLoader size="md" />
          </div>
        </div>
      ))}

      {/* Fullscreen Avatar */}
      {/* Mod / admin: Edit category sheet — bypasses the keyword
          classifier (manual override is authoritative). PATCHes
          /api/posts/:id/category. */}
      {showEditCategory && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4"
          data-overlay="true"
          onClick={() => !editCatBusy && setShowEditCategory(false)}
          style={{
            paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)',
            paddingBottom: 'max(var(--hai-safe-bottom, 0px), 16px)',
          }}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                {lang === 'en' ? 'Edit category' : 'تعديل التصنيف'}
              </h2>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                {lang === 'en'
                  ? 'Manual override — bypasses the auto-classifier.'
                  : 'تجاوز يدوي — يتجاهل المصنّف التلقائي.'}
              </p>
            </div>

            <div className="px-4 py-3 space-y-3">
              <label className="block">
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {lang === 'en' ? 'Category' : 'التصنيف'}
                </span>
                <select
                  value={editCatCategory}
                  onChange={(e) => setEditCatCategory(e.target.value)}
                  className="mt-1 w-full bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200"
                >
                  {([
                    { key: 'NEIGHBORHOOD_REPORTS', icon: '⚠️', tKey: 'post_v2_NEIGHBORHOOD_REPORTS' as TranslationKey },
                    { key: 'LOST_FOUND',           icon: '🔍', tKey: 'post_v2_LOST_FOUND'           as TranslationKey },
                    { key: 'EVENTS',               icon: '🎉', tKey: 'post_v2_EVENTS'               as TranslationKey },
                    { key: 'SERVICES',             icon: '🔧', tKey: 'post_v2_SERVICES'             as TranslationKey },
                    { key: 'HOME_BUSINESSES',      icon: '🍱', tKey: 'post_v2_HOME_BUSINESSES'      as TranslationKey },
                    { key: 'MARKETPLACE',          icon: '🛒', tKey: 'post_v2_MARKETPLACE'          as TranslationKey },
                    { key: 'REAL_ESTATE',          icon: '🏠', tKey: 'post_v2_REAL_ESTATE'          as TranslationKey },
                    { key: 'RIDES',                icon: '🚗', tKey: 'post_v2_RIDES'                as TranslationKey },
                    { key: 'COMPETITIONS',         icon: '🏆', tKey: 'post_v2_COMPETITIONS'         as TranslationKey },
                    { key: 'GENERAL',              icon: '💬', tKey: 'cat_GENERAL'                  as TranslationKey },
                  ]).map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.icon} {t(c.tKey)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {lang === 'en' ? 'Intent' : 'النوع'}
                </span>
                <select
                  value={editCatIntent}
                  onChange={(e) => setEditCatIntent(e.target.value)}
                  className="mt-1 w-full bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200"
                >
                  <option value="NORMAL">{lang === 'en' ? 'Normal' : 'عادي'}</option>
                  <option value="OFFER">{t('post_intent_offer')}</option>
                  <option value="REQUEST">{t('post_intent_request')}</option>
                </select>
              </label>

              {editCatCategory === 'MARKETPLACE' && (
                <label className="block">
                  <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {lang === 'en' ? 'Marketplace type' : 'نوع الإعلان'}
                  </span>
                  <select
                    value={editCatMarketplaceType}
                    onChange={(e) => setEditCatMarketplaceType(e.target.value)}
                    className="mt-1 w-full bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200"
                  >
                    <option value="SELL">🛒 {lang === 'en' ? 'Sell' : 'بيع'}</option>
                    <option value="BUY">📥 {lang === 'en' ? 'Buy' : 'شراء'}</option>
                    <option value="JOB">💼 {lang === 'en' ? 'Job' : 'فرصة عمل'}</option>
                  </select>
                </label>
              )}
            </div>

            <div className="flex gap-2 px-4 py-3 border-t border-gray-100 dark:border-gray-800">
              <button
                disabled={editCatBusy}
                onClick={() => setShowEditCategory(false)}
                className="flex-1 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-200 active:scale-95"
              >
                {lang === 'en' ? 'Cancel' : 'إلغاء'}
              </button>
              <button
                disabled={editCatBusy}
                onClick={async () => {
                  setEditCatBusy(true)
                  try {
                    const res = await fetch(`/api/posts/${post.id}/category`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        category: editCatCategory,
                        intent: editCatIntent,
                        ...(editCatCategory === 'MARKETPLACE'
                          ? { marketplaceType: editCatMarketplaceType }
                          : {}),
                      }),
                    })
                    if (res.ok) {
                      toast.success(lang === 'en' ? 'Category updated' : 'تم تحديث التصنيف')
                      setShowEditCategory(false)
                      router.refresh()
                    } else {
                      const d = await res.json().catch(() => ({}))
                      toast.error(d?.error || (lang === 'en' ? 'Failed' : 'فشل'))
                    }
                  } catch {
                    toast.error(lang === 'en' ? 'Connection failed' : 'فشل الاتصال')
                  } finally {
                    setEditCatBusy(false)
                  }
                }}
                className="flex-1 py-2 rounded-lg bg-primary-600 text-white text-sm font-semibold active:scale-95 disabled:opacity-60"
              >
                {editCatBusy
                  ? (lang === 'en' ? 'Saving…' : 'جاري الحفظ…')
                  : (lang === 'en' ? 'Save' : 'حفظ')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showFullAvatar && post.author.avatarUrl && (
        <div className="fixed inset-0 z-[60] bg-black flex items-center justify-center" onClick={() => setShowFullAvatar(false)}>
          <button onClick={() => setShowFullAvatar(false)} className="absolute top-4 right-4 text-white/70 hover:text-white z-10">
            <FiX className="w-6 h-6" />
          </button>
          <img src={post.author.avatarUrl} alt="" className="max-w-full max-h-full object-contain" />
        </div>
      )}

      {/* Report user sheet — mounted once per card, opened from the
          overflow menu or the user popup. Separate from the post-report
          action; never blocks automatically. */}
      <ReportUserSheet
        open={reportingUser}
        onClose={() => setReportingUser(false)}
        targetUserId={post.author.id}
        targetName={fullName(post.author) || post.author.name}
        targetRole={post.author.role}
        source="POST"
        postId={post.id}
        onBlockRequested={async () => {
          try {
            const res = await fetch('/api/users/block', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: post.author.id }),
            })
            if (res.ok) {
              toast.success(lang === 'en' ? 'User blocked' : lang === 'ur' ? 'صارف بلاک ہو گیا' : 'تم حظر المستخدم')
            }
          } catch { /* ignore — block is best-effort post-report */ }
        }}
      />

      {/* Separate sheet for comment/reply author reports — keeps
          the post-author target untouched while a different target
          can be open at the same time via the comment's Report
          action. */}
      <ReportUserSheet
        open={!!commentReportTarget}
        onClose={() => setCommentReportTarget(null)}
        targetUserId={commentReportTarget?.id || ''}
        targetName={commentReportTarget?.name}
        targetRole={commentReportTarget?.role ?? null}
        source="POST"
        postId={post.id}
        onBlockRequested={async () => {
          const target = commentReportTarget
          if (!target) return
          try {
            const res = await fetch('/api/users/block', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: target.id }),
            })
            if (res.ok) {
              toast.success(lang === 'en' ? 'User blocked' : lang === 'ur' ? 'صارف بلاک ہو گیا' : 'تم حظر المستخدم')
            }
          } catch { /* ignore */ }
        }}
      />

      <ImageSourceSheet
        open={showEditImageSheet}
        onClose={() => setShowEditImageSheet(false)}
        onCamera={async () => {
          const isNative = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.()
          if (isNative) {
            try {
              const file = await pickImageFromCamera()
              setEditImageUploading(true)
              try {
                const urls = await uploadFiles([file])
                setEditImages((prev) => [...prev, ...urls].slice(0, 5))
              } catch {
                toast.error(lang === 'en' ? 'Upload failed' : lang === 'ur' ? 'اپ لوڈ ناکام' : 'فشل رفع الصورة')
              } finally {
                setEditImageUploading(false)
              }
            } catch (err: any) {
              if (!err?.message?.toLowerCase?.().includes('cancel') && err?.message !== 'no_image') {
                console.warn('[postEdit] camera failed', err)
              }
            }
          } else {
            editCameraInputRef.current?.click()
          }
        }}
        onGallery={async () => {
          const file = await pickImageOrFallback(lang as any, editImageInputRef)
          if (!file) return
          setEditImageUploading(true)
          try {
            const urls = await uploadFiles([file])
            setEditImages((prev) => [...prev, ...urls].slice(0, 5))
          } catch {
            toast.error(lang === 'en' ? 'Upload failed' : lang === 'ur' ? 'اپ لوڈ ناکام' : 'فشل رفع الصورة')
          } finally {
            setEditImageUploading(false)
          }
        }}
      />
    </div>
  )
}

/** Lazy-loaded service catalog — 2-column grid with item detail */
function ServiceCatalog({ userId, lang }: { userId: string; lang: string }) {
  const router = useRouter()
  const [items, setItems] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const [catalogLightbox, setCatalogLightbox] = useState(false)

  useEffect(() => {
    fetch(`/api/service-items?userId=${userId}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setItems(d) })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [userId])

  if (!loaded || items.length === 0) return null

  const shown = expanded ? items : items.slice(0, 4)
  const dn = (ar: string, en: string) => lang === 'en' ? en : ar

  return (
    <div className="mt-4 w-full">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
        {dn('الكتالوج', 'Catalog')} ({items.length})
      </p>

      {/* 2-column grid */}
      <div className="grid grid-cols-2 gap-2">
        {shown.map(item => (
          <button
            key={item.id}
            onClick={() => setSelected(item)}
            className="bg-gray-50 dark:bg-gray-700/50 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-600 text-start active:scale-[0.97] transition-transform"
          >
            {item.imageUrl ? (
              <img src={item.imageUrl} alt="" className="w-full h-24 object-cover" />
            ) : (
              <div className="w-full h-16 bg-gray-100 dark:bg-gray-600 flex items-center justify-center text-2xl text-gray-300">📦</div>
            )}
            <div className="p-2">
              <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{item.title}</p>
              <p className="text-[11px] font-bold text-primary-600 dark:text-primary-400 mt-0.5">
                {item.price != null ? `${item.price} ${dn('ريال', 'SAR')}` : dn('تواصل للسعر', 'Contact')}
              </p>
            </div>
          </button>
        ))}
      </div>

      {items.length > 4 && !expanded && (
        <button onClick={() => setExpanded(true)} className="w-full text-center text-xs text-primary-600 font-medium mt-2.5 py-1">
          {dn(`عرض الكل (${items.length})`, `Show all ${items.length} items`)}
        </button>
      )}

      {/* Item Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-[9998] bg-black/60 flex items-end justify-center" onClick={() => setSelected(null)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-t-3xl w-full max-w-md max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
            style={{ paddingBottom: 'var(--hai-safe-bottom, 0px)' }}
          >
            {/* Image */}
            {selected.imageUrl ? (
              <img src={selected.imageUrl} alt="" className="w-full h-48 object-cover cursor-pointer" onClick={() => setCatalogLightbox(true)} />
            ) : (
              <div className="w-full h-32 bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-4xl text-gray-300">📦</div>
            )}

            <div className="p-5">
              {/* Title + Price */}
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{selected.title}</h3>
              <p className="text-base font-bold text-primary-600 dark:text-primary-400 mt-1">
                {selected.price != null ? `${selected.price} ${dn('ريال', 'SAR')}` : dn('السعر عند التواصل', 'Contact for price')}
              </p>

              {/* Description */}
              {selected.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-3 leading-relaxed">{selected.description}</p>
              )}

              {/* CTA */}
              <button
                onClick={async () => {
                  try {
                    const res = await fetch('/api/threads', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ userId }),
                    })
                    if (res.ok) {
                      const { threadId } = await res.json()
                      router.push(`/threads/${threadId}`)
                    }
                  } catch {}
                }}
                className="w-full mt-5 bg-primary-600 text-white py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              >
                <FiSend className="w-4 h-4" />
                {dn('تواصل لطلب الخدمة', 'Request this service')}
              </button>

              <button onClick={() => setSelected(null)} className="w-full text-center text-xs text-gray-400 mt-3 py-2">
                {dn('إغلاق', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Tap the catalog item photo → full-screen lightbox (sits above the
          z-[9998] detail modal via --hai-z-lightbox). */}
      <ImageLightbox
        images={selected?.imageUrl ? [selected.imageUrl] : []}
        initialIndex={0}
        open={catalogLightbox && !!selected?.imageUrl}
        onClose={() => setCatalogLightbox(false)}
      />
    </div>
  )
}
