'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { FiFlag, FiMoreVertical, FiMessageCircle, FiSend, FiCornerDownRight, FiMail, FiHeart, FiShare2, FiMapPin, FiX, FiCalendar, FiEdit2, FiTrash2, FiBookmark, FiImage, FiUser } from 'react-icons/fi'
import { uploadFiles } from '@/lib/upload'
import { playSend, playReaction, playDelete } from '@/lib/sound'
import { hapticLight, hapticMedium } from '@/lib/haptic'
import EmojiPicker from './EmojiPickerWrapper'
import { useLanguage } from '@/hooks/useLanguage'
import { useConfirm } from './ConfirmProvider'
import { pickImageOrFallback } from '@/lib/imagePicker'
import { useAttachContact } from '@/hooks/useAttachContact'
import ImageLightbox from './ImageLightbox'
import SmartText from './SmartText'
import ReportUserSheet from './ReportUserSheet'
import { showApiError } from '@/lib/apiError'
import { detectLang } from '@/lib/detectLang'
import { HaiSpinner } from './HaiLoader'
import { useDragToDismiss } from '@/hooks/useDragToDismiss'
import type { TranslationKey } from '@/lib/i18n'
import { canStartPrivateThread } from '@/lib/thread-rules'
import { getRepLevel } from '@/lib/reputation-levels'
import RiyalIcon from './RiyalIcon'
import UserBadgeDisplay, { TierLabel } from './UserBadge'
import { StatePill } from '@/lib/state-render'

/**
 * Category → semantic label + icon.
 *
 * Appearance is NO LONGER stored here. All category colors (light + dark)
 * live in design-tokens.css as --hai-category-{ENUM}-{bg|fg} and are
 * applied by the `.hai-category-badge` primitive via `data-category`.
 * This map is pure business metadata (translation key + icon glyph).
 */
const CATEGORY_STYLES: Record<string, { tKey: TranslationKey; icon: string }> = {
  ALERT:              { tKey: 'cat_ALERT',              icon: '🔔' },
  NEIGHBORHOOD_ISSUE: { tKey: 'cat_NEIGHBORHOOD_ISSUE', icon: '⚠️' },
  LOOKING_FOR:        { tKey: 'cat_LOOKING_FOR',        icon: '🔎' },
  MARKETPLACE:        { tKey: 'cat_MARKETPLACE',        icon: '🛒' },
  FOOD_HOME:          { tKey: 'cat_FOOD_HOME',          icon: '🍱' },
  REAL_ESTATE:        { tKey: 'cat_REAL_ESTATE',        icon: '🏠' },
  SERVICES:           { tKey: 'cat_SERVICES',           icon: '🔧' },
  LOST_FOUND:         { tKey: 'cat_LOST_FOUND',         icon: '🔍' },
  MOSQUE:             { tKey: 'cat_MOSQUE',             icon: '🕌' },
  EID_RAMADAN:        { tKey: 'cat_EID_RAMADAN',        icon: '🎉' },
  CONTESTS:           { tKey: 'cat_CONTESTS',           icon: '🏆' },
  RIDE_REQUEST:       { tKey: 'cat_RIDE_REQUEST',       icon: '🚗' },
  WOMEN_ONLY:         { tKey: 'cat_WOMEN_ONLY',         icon: '👩' },
  GENERAL:            { tKey: 'cat_GENERAL',            icon: '💬' },
}


interface Reply {
  id: string
  body: string
  imageUrl?: string | null
  createdAt: string
  author: { id: string; name: string | null; reputation: number; accountType?: string; providerStatus?: string | null }
  likeCount?: number
  isLiked?: boolean
}

interface Comment {
  id: string
  body: string
  imageUrl?: string | null
  createdAt: string
  author: { id: string; name: string | null; reputation: number; accountType?: string; providerStatus?: string | null }
  likeCount?: number
  isLiked?: boolean
  replies: Reply[]
}

interface Post {
  id: string
  title: string
  body: string
  category: string
  isPaid: boolean
  isFeatured: boolean
  isPinned: boolean
  price: number | null
  imageUrls: string[]
  locationLat?: number | null
  locationLng?: number | null
  locationName?: string | null
  createdAt: string
  editedAt?: string | null
  author: {
    id: string
    name: string | null
    reputation: number
    accountType?: string
    providerStatus?: string | null
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
  onDelete,
}: {
  post: Post
  currentUserId: string
  currentUserPhone?: string
  currentUserRole?: string
  isBookmarked?: boolean
  onDelete?: (postId: string) => void
}) {
  const { t, lang } = useLanguage()
  const router = useRouter()
  const confirmDialog = useConfirm()
  const attachContact = useAttachContact()

  // Safety guard — if post or author is missing, render nothing
  if (!post || !post.author) return null

  const isAdmin = ['SUPER_ADMIN', 'PLATFORM_MOD', 'NEIGHBORHOOD_MOD'].includes(currentUserRole || '')
  const [reported, setReported] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [reportingUser, setReportingUser] = useState(false)
  // Reporting a comment or reply author: opens the same sheet with a
  // different target. Kept separate from `reportingUser` (post author)
  // so one doesn't clobber the other.
  const [commentReportTarget, setCommentReportTarget] = useState<{ id: string; name: string | null; commentId: string } | null>(null)
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
  const [showUserPopup, setShowUserPopup] = useState(false)
  const [showFullAvatar, setShowFullAvatar] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(post.title)
  const [editBody, setEditBody] = useState(post.body)
  const [editLoading, setEditLoading] = useState(false)
  const [postData, setPostData] = useState({ title: post.title, body: post.body, editedAt: post.editedAt })
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
  const displayTitle = showTranslated && translated ? translated.title : postData.title
  const displayBody  = showTranslated && translated ? translated.body  : postData.body
  const pickerRef = useRef<HTMLDivElement>(null)

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
  const { sheetRef: commentsSheetRef, handleRef: commentsHandleRef } =
    useDragToDismiss<HTMLDivElement, HTMLDivElement>({
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
  const commentImgRef = useRef<HTMLInputElement>(null)
  const replyImgRef = useRef<HTMLInputElement>(null)
  const [commentsLoaded, setCommentsLoaded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editCommentBody, setEditCommentBody] = useState('')
  const [bookmarked, setBookmarked] = useState(initialBookmarked)
  const [replyText, setReplyText] = useState('')
  const [submittingReply, setSubmittingReply] = useState(false)
  const [supportsContacts] = useState(
    () => typeof window !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window
  )

  const style = CATEGORY_STYLES[post.category] || CATEGORY_STYLES.GENERAL
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
      // Always refetch when opening to get fresh data
      await fetchComments()
    }
    setShowComments(v => !v)
  }

  // Lock body scroll while comments modal is open + close on Escape
  useEffect(() => {
    if (!showComments) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowComments(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [showComments])

  async function handleComment(e: React.FormEvent) {
    e.preventDefault()
    if (!commentText.trim() && !commentImage) return
    setSubmitting(true)
    try {
      let imageUrl: string | null = null
      if (commentImage) {
        const urls = await uploadFiles([commentImage])
        if (!urls[0]) { toast.error(t('common_error')); return }
        imageUrl = urls[0]
      }
      const res = await fetch(`/api/posts/${post.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: commentText, imageUrl }),
      })
      if (!res.ok) { await showApiError(res, lang); return }
      const comment = await res.json()
      playSend()
      setComments(prev => [...prev, { ...comment, replies: comment.replies || [] }])
      setCommentText('')
      setCommentImage(null)
      setCommentImagePreview(null)
    } catch {
      toast.error(t('common_error'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault()
    if ((!replyText.trim() && !replyImage) || !replyingTo) return
    setSubmittingReply(true)
    try {
      let imageUrl: string | null = null
      if (replyImage) {
        const urls = await uploadFiles([replyImage])
        if (!urls[0]) { toast.error(t('common_error')); return }
        imageUrl = urls[0]
      }
      const res = await fetch(`/api/posts/${post.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: replyText, parentId: replyingTo.id, imageUrl }),
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
      setReplyingTo(null)
    } catch {
      toast.error(t('common_error'))
    } finally {
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
    try {
      const res = await fetch(`/api/posts/${post.id}/bookmark`, { method: 'POST' })
      if (res.ok) {
        const { bookmarked: b } = await res.json()
        setBookmarked(b)
        toast.success(b ? (lang === 'en' ? 'Saved' : 'تم الحفظ') : (lang === 'en' ? 'Removed' : 'تم الإزالة'))
      }
    } catch { /* ignore */ }
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

  const isLookingFor = post.category === 'LOOKING_FOR'

  return (
    <div className={`hai-card relative animate-fade-in-up glow-card ${post.isPinned ? 'hai-post--pinned' : ''} ${isLookingFor ? 'hai-post--looking-for' : ''}`}>
      {post.isPinned && (
        <StatePill state="pinned" label={t('post_pinned')} className="hai-mb-1" />
      )}

      {/* Header */}
      <div className="hai-row-2 hai-justify-between hai-items-start hai-mb-2">
        <div className="hai-row-2 hai-cursor-pointer" onClick={() => setShowUserPopup(true)}>
          <div className="hai-avatar hai-avatar--sm">
            {post.author.avatarUrl
              ? <img src={post.author.avatarUrl} alt="" />
              : (post.author.name?.[0] || '؟')
            }
          </div>
          <div>
            <div className="hai-row-1">
              <span className="hai-body-strong">{post.author.name || t('post_neighbor')}</span>
              <UserBadgeDisplay accountType={post.author.accountType} providerStatus={post.author.providerStatus} reputation={post.author.reputation} role={post.author.role} />
            </div>
            <div className="hai-row-1">
              <span className="hai-meta">{timeAgo(post.createdAt)}</span>
              <TierLabel reputation={post.author.reputation} compact />
              {post.isFeatured && (
                <StatePill state="featured" label={lang !== 'en' ? 'بارز' : 'Featured'} />
              )}
            </div>
          </div>
        </div>
        <div className="hai-row-2">
          <span className="hai-category-badge" data-category={post.category}>{style.icon} {t(style.tKey)}</span>
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
          <div className="hai-row-2">
            <button
              disabled={editLoading}
              onClick={async () => {
                setEditLoading(true)
                const res = await fetch(`/api/posts/${post.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ title: editTitle.trim(), body: editBody.trim() }),
                })
                if (res.ok) {
                  const d = await res.json()
                  setPostData({ title: d.title, body: d.body, editedAt: d.editedAt })
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
              onClick={() => { setEditing(false); setEditTitle(postData.title); setEditBody(postData.body) }}
              className="hai-btn-ghost hai-btn-sm"
            >
              {lang === 'en' ? 'Cancel' : lang === 'ur' ? 'منسوخ' : 'إلغاء'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <h3 className="hai-body-strong hai-mb-1 selectable-text">{displayTitle}</h3>
          <p className="hai-body hai-tc-sub line-clamp-3 selectable-text">{displayBody}</p>
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

      {post.price && (
        <div className="hai-mt-2">
          <span className="hai-price">{post.price.toLocaleString('ar-SA')} <RiyalIcon /></span>
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

      {post.imageUrls.length > 0 && (
        <>
          <div className="hai-media-grid" data-count={Math.min(post.imageUrls.length, 4)}>
            {post.imageUrls.slice(0, 3).map((url, i) => {
              const extra = post.imageUrls.length - 3
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
            images={post.imageUrls}
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

          {/* Emoji-mart picker */}
          {showReactionPicker && (
            <div
              ref={pickerRef}
              className="hai-reaction-popover reaction-picker-enter"
            >
              <EmojiPicker onSelect={(emoji) => { handleReact(emoji); setShowReactionPicker(false) }} />
            </div>
          )}

          {/* Trigger button — tap own reaction to remove, long-press to change */}
          <button
            onClick={() => myReaction ? handleReact(myReaction) : setShowReactionPicker(v => !v)}
            className="hai-reaction-item"
            data-selected={myReaction ? 'true' : 'false'}
          >
            <span className={`hai-reaction-item__icon hai-reaction-emoji-lg ${bouncingReaction && myReaction ? 'reaction-bounce' : ''}`}>
              {myReaction ?? '😊'}
            </span>
          </button>
          {/* Change reaction button when already reacted */}
          {myReaction && (
            <button
              onClick={() => setShowReactionPicker(v => !v)}
              className="hai-reaction-item"
            >
              <span className="hai-reaction-item__count">+</span>
            </button>
          )}

          {/* Reaction summary: unique emojis + total */}
          {totalReactions > 0 && (
            <div className="hai-row-1">
              <span className="hai-reaction-stack">
                {Object.keys(reactionCounts).filter(e => reactionCounts[e] > 0).slice(0, 3).map(e => (
                  <span key={e} className="hai-reaction-stack__emoji">{e}</span>
                ))}
              </span>
              <span className="hai-meta">{totalReactions}</span>
            </div>
          )}
        </div>

        <div className="hai-row-1">
          {/* Contact / DM button */}
          {post.author.id !== currentUserId && canStartPrivateThread(post.category) && (
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
              const url = `${window.location.origin}/feed`
              const text = `${post.title}\n${post.body.slice(0, 100)}${post.body.length > 100 ? '...' : ''}`
              if (navigator.share) {
                try { await navigator.share({ title: post.title, text, url }) } catch { /* cancelled */ }
              } else {
                await navigator.clipboard.writeText(`${post.title}\n${url}`)
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
                    <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">{top.author.name}</span>
                    <p className="text-[12px] text-gray-500 dark:text-gray-400 leading-snug line-clamp-2">{top.body}</p>
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
      {showComments && (
        <div
          data-overlay="true"
          className="hai-sheet-overlay"
          onClick={() => setShowComments(false)}
        >
          <div
            ref={commentsSheetRef}
            className="hai-sheet animate-slide-up"
            onClick={(e) => e.stopPropagation()}
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

            <div className="hai-sheet__body">
              {comments.length === 0 ? (
                <p className="hai-empty-state">{t('post_no_comments')}</p>
              ) : (
                comments.map((c: any) => (
                  <div key={c.id}>
                    <div className="hai-comment">
                      {c.author.avatarUrl ? (
                        <img src={c.author.avatarUrl} alt="" className="hai-avatar hai-avatar--sm" />
                      ) : (
                        <div className="hai-avatar hai-avatar--sm">
                          {c.author.name?.[0] || '؟'}
                        </div>
                      )}
                      <div className="hai-comment__body">
                        <div className="hai-comment__meta">
                          <span className="hai-comment__author">{c.author.name || t('post_neighbor')}</span>
                          <UserBadgeDisplay accountType={c.author.accountType} providerStatus={c.author.providerStatus} reputation={c.author.reputation} />
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
                                  <SmartText text={displayBody} />
                                  {c.editedAt && <span className="hai-meta hai-comment__edited"> {lang === 'en' ? '(edited)' : '(معدّل)'}</span>}
                                </p>
                              )
                            })()}
                            {c.imageUrl && (
                              <img
                                src={c.imageUrl}
                                alt=""
                                className="hai-comment__image"
                                onClick={() => setCommentLightbox(c.imageUrl!)}
                              />
                            )}
                          </>
                        )}
                        <div className="hai-comment__actions">
                          <button
                            onClick={() => handleCommentLike(c.id)}
                            data-selected={c.isLiked ? 'true' : 'false'}
                            className="hai-comment__action is-liked"
                          >
                            <FiHeart className={`hai-icon-sm ${c.isLiked ? 'hai-fill-current' : ''}`} />
                            {(c.likeCount || 0) > 0 && <span>{c.likeCount}</span>}
                          </button>
                          <button
                            onClick={() => setReplyingTo(replyingTo?.id === c.id ? null : { id: c.id, name: c.author.name || t('post_neighbor') })}
                            className="hai-comment__action"
                          >
                            {t('post_reply')}
                          </button>
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
                              onClick={() => setCommentReportTarget({ id: c.author.id, name: c.author.name, commentId: c.id })}
                              className="hai-comment__action is-danger"
                            >
                              {lang === 'en' ? 'Report' : lang === 'ur' ? 'رپورٹ' : 'إبلاغ'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Replies */}
                    {c.replies.length > 0 && (
                      <div className="hai-comment-replies">
                        {c.replies.map((reply: any) => (
                          <div key={reply.id} className="hai-comment-reply">
                            {reply.author.avatarUrl ? (
                              <img src={reply.author.avatarUrl} alt="" className="hai-avatar hai-avatar--xs" />
                            ) : (
                              <div className="hai-avatar hai-avatar--xs">
                                {reply.author.name?.[0] || '؟'}
                              </div>
                            )}
                            <div className="hai-comment__body">
                              <div className="hai-comment__meta">
                                <span className="hai-comment__author">{reply.author.name || t('post_neighbor')}</span>
                                <UserBadgeDisplay accountType={reply.author.accountType} providerStatus={reply.author.providerStatus} reputation={reply.author.reputation} />
                              </div>
                              {reply.body && (() => {
                                const tx = commentTx[reply.id]
                                const showTx = !!tx?.show
                                const displayBody = showTx && tx?.body ? tx.body : reply.body
                                return (
                                  <p className="hai-comment__text selectable-text">
                                    <SmartText text={displayBody} />
                                  </p>
                                )
                              })()}
                              {reply.imageUrl && (
                                <img
                                  src={reply.imageUrl}
                                  alt=""
                                  className="hai-comment__image"
                                  onClick={() => setCommentLightbox(reply.imageUrl!)}
                                />
                              )}
                              <div className="hai-comment__actions">
                                <button
                                  onClick={() => handleCommentLike(reply.id)}
                                  data-selected={reply.isLiked ? 'true' : 'false'}
                                  className="hai-comment__action is-liked"
                                >
                                  <FiHeart className={`hai-icon-xs ${reply.isLiked ? 'hai-fill-current' : ''}`} />
                                  {(reply.likeCount || 0) > 0 && <span>{reply.likeCount}</span>}
                                </button>
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
                                    onClick={() => setCommentReportTarget({ id: reply.author.id, name: reply.author.name, commentId: reply.id })}
                                    className="hai-comment__action is-danger"
                                  >
                                    {lang === 'en' ? 'Report' : lang === 'ur' ? 'رپورٹ' : 'إبلاغ'}
                                  </button>
                                )}
                              </div>
                            </div>
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
                            onClick={() => openImagePicker('reply')}
                            className="hai-comment-input__attach-btn"
                          >
                            <FiImage className="hai-icon-sm" />
                          </button>
                          <button
                            type="button"
                            onClick={() => attachContactToComposer('reply')}
                            className="hai-comment-input__attach-btn"
                            aria-label={t('attach_contact')}
                            title={t('attach_contact')}
                          >
                            <FiUser className="hai-icon-sm" />
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

            {/* Pinned footer — contact picker + input, safe-area aware */}
            <div className="hai-sheet__footer">
              {/* Pick contact from phone — only for LOOKING_FOR on supported devices */}
              {isLookingFor && supportsContacts && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      // @ts-ignore — Contact Picker API not yet in TS lib
                      const results = await navigator.contacts.select(['name', 'tel'], { multiple: false })
                      if (results.length > 0) {
                        const name = results[0].name?.[0] || ''
                        const tel  = results[0].tel?.[0]  || ''
                        setCommentText(name && tel ? `${name}: ${tel}` : tel || name)
                      }
                    } catch {
                      // user cancelled — do nothing
                    }
                  }}
                  className="hai-callout hai-callout--info hai-row-2 hai-justify-center hai-mb-2 hai-cursor-pointer"
                >
                  <span>📱</span>
                  <span>{t('post_share_contacts')}</span>
                </button>
              )}

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
                  onClick={() => openImagePicker('comment')}
                  className="hai-comment-input__attach-btn"
                >
                  <FiImage className="hai-icon-md" />
                </button>
                <button
                  type="button"
                  onClick={() => attachContactToComposer('comment')}
                  className="hai-comment-input__attach-btn"
                  aria-label={t('attach_contact')}
                  title={t('attach_contact')}
                >
                  <FiUser className="hai-icon-md" />
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
          </div>
        </div>
      )}

      {/* User Profile Popup */}
      {showUserPopup && (() => {
        const rep = post.author.reputation
        const level = getRepLevel(rep)
        const levelLabel = { new: lang === 'en' ? 'New' : lang === 'ur' ? 'نیا' : 'جديد', active: lang !== 'en' ? 'نشط' : 'Active', trusted: lang !== 'en' ? 'موثوق' : 'Trusted', top: lang !== 'en' ? 'متميّز' : 'Top' }[level]
        const levelColor = { new: 'text-gray-500', active: 'text-green-600', trusted: 'text-blue-600', top: 'text-amber-500' }[level]
        const levelBg = { new: 'bg-gray-100 dark:bg-gray-700', active: 'bg-green-50 dark:bg-green-900/30', trusted: 'bg-blue-50 dark:bg-blue-900/30', top: 'bg-amber-50 dark:bg-amber-900/30' }[level]
        const ageDays = post.author.createdAt ? Math.floor((Date.now() - new Date(post.author.createdAt).getTime()) / 86400000) : 0
        const postCount = post.author._count?.posts || 0

        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={() => setShowUserPopup(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <div
              className="relative bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm mx-auto pb-8 animate-slide-up max-h-[85vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
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
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{post.author.name || t('post_neighbor')}</h3>

                {/* Identity badges (verification, role) */}
                <div className="flex items-center gap-1.5 mt-1">
                  <UserBadgeDisplay accountType={post.author.accountType} providerStatus={post.author.providerStatus} reputation={rep} role={post.author.role} showLabel />
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
      })()}

      {/* Fullscreen Avatar */}
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
        targetName={post.author.name}
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
          >
            {/* Image */}
            {selected.imageUrl ? (
              <img src={selected.imageUrl} alt="" className="w-full h-48 object-cover" />
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
    </div>
  )
}
