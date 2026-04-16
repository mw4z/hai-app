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
import type { TranslationKey } from '@/lib/i18n'
import { canStartPrivateThread } from '@/lib/thread-rules'
import { getRepLevel } from '@/lib/reputation-levels'
import RiyalIcon from './RiyalIcon'
import UserBadgeDisplay, { TierLabel } from './UserBadge'

const CATEGORY_STYLES: Record<string, { tKey: TranslationKey; bg: string; text: string; icon: string }> = {
  ALERT:             { tKey: 'cat_ALERT',             bg: 'bg-red-50',     text: 'text-red-600',     icon: '🔔' },
  NEIGHBORHOOD_ISSUE:{ tKey: 'cat_NEIGHBORHOOD_ISSUE', bg: 'bg-orange-50',  text: 'text-orange-600',  icon: '⚠️' },
  LOOKING_FOR:       { tKey: 'cat_LOOKING_FOR',        bg: 'bg-sky-50',     text: 'text-sky-600',     icon: '🔎' },
  MARKETPLACE:       { tKey: 'cat_MARKETPLACE',        bg: 'bg-amber-50',   text: 'text-amber-600',   icon: '🛒' },
  FOOD_HOME:         { tKey: 'cat_FOOD_HOME',          bg: 'bg-lime-50',    text: 'text-lime-700',    icon: '🍱' },
  REAL_ESTATE:       { tKey: 'cat_REAL_ESTATE',        bg: 'bg-teal-50',    text: 'text-teal-700',    icon: '🏠' },
  SERVICES:          { tKey: 'cat_SERVICES',           bg: 'bg-blue-50',    text: 'text-blue-600',    icon: '🔧' },
  LOST_FOUND:        { tKey: 'cat_LOST_FOUND',         bg: 'bg-purple-50',  text: 'text-purple-600',  icon: '🔍' },
  MOSQUE:            { tKey: 'cat_MOSQUE',             bg: 'bg-green-50',   text: 'text-green-700',   icon: '🕌' },
  EID_RAMADAN:       { tKey: 'cat_EID_RAMADAN',        bg: 'bg-yellow-50',  text: 'text-yellow-700',  icon: '🎉' },
  CONTESTS:          { tKey: 'cat_CONTESTS',           bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', icon: '🏆' },
  RIDE_REQUEST:      { tKey: 'cat_RIDE_REQUEST',        bg: 'bg-indigo-50',  text: 'text-indigo-600',  icon: '🚗' },
  WOMEN_ONLY:        { tKey: 'cat_WOMEN_ONLY',         bg: 'bg-pink-50',    text: 'text-pink-600',    icon: '👩' },
  GENERAL:           { tKey: 'cat_GENERAL',            bg: 'bg-gray-50',    text: 'text-gray-600',    icon: '💬' },
}


interface Reply {
  id: string
  body: string
  imageUrl?: string | null
  createdAt: string
  author: { id: string; name: string | null; reputation: number; accountType?: string }
  likeCount?: number
  isLiked?: boolean
}

interface Comment {
  id: string
  body: string
  imageUrl?: string | null
  createdAt: string
  author: { id: string; name: string | null; reputation: number; accountType?: string }
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
  const [comments, setComments] = useState<Comment[]>([])
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
  const totalComments = comments.reduce((acc, c) => acc + 1 + c.replies.length, 0)

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

  // Auto-load comments to show top comment preview
  const serverCommentCount = post._count?.comments || 0
  useEffect(() => {
    if (!commentsLoaded && serverCommentCount > 0) {
      fetchComments()
    }
  }, [])

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
      if (!res.ok) { toast.error(t('common_error')); return }
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
      if (!res.ok) { toast.error(t('common_error')); return }
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
    <div className={`card relative animate-fade-in-up glow-card ${post.isPinned ? 'border-t-2 border-t-primary-500' : ''} ${isLookingFor ? 'border border-sky-200 bg-sky-50/40' : ''}`}>
      {post.isPinned && <span className="text-xs text-primary-600 font-medium mb-1 block">{t('post_pinned')}</span>}

      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setShowUserPopup(true)}>
          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-sm flex-shrink-0 overflow-hidden">
            {post.author.avatarUrl
              ? <img src={post.author.avatarUrl} alt="" className="w-full h-full object-cover" />
              : (post.author.name?.[0] || '؟')
            }
          </div>
          <div>
            <div className="flex items-center">
              <span className="text-sm font-medium text-gray-800">{post.author.name || t('post_neighbor')}</span>
              <UserBadgeDisplay accountType={post.author.accountType} reputation={post.author.reputation} role={post.author.role} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">{timeAgo(post.createdAt)}</span>
              <TierLabel reputation={post.author.reputation} compact />
              {post.isFeatured && (
                <span className="text-[9px] font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">
                  {lang !== 'en' ? 'بارز' : 'Featured'}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`category-badge ${style.bg} ${style.text}`}>{style.icon} {t(style.tKey)}</span>
          <div className="relative" ref={menuRef}>
            <button onClick={() => { setShowMenu(!showMenu); hapticLight() }} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
              <FiMoreVertical className="w-4 h-4" />
            </button>
            {showMenu && (
              <div className="absolute left-0 top-6 bg-white dark:bg-gray-800 shadow-lg rounded-xl border border-gray-100 dark:border-gray-700 py-1 z-10 min-w-40">
                {/* Owner: edit + delete */}
                {post.author.id === currentUserId && (
                  <>
                    <button onClick={() => { setEditing(true); setShowMenu(false) }} className="flex items-center gap-2 px-3 py-2.5 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 w-full text-right">
                      <FiEdit2 className="w-3.5 h-3.5" />
                      {lang === 'en' ? 'Edit' : lang === 'ur' ? 'ترمیم' : 'تعديل'}
                    </button>
                    <button onClick={async () => {
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
                    }} className="flex items-center gap-2 px-3 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 w-full text-right">
                      <FiTrash2 className="w-3.5 h-3.5" />
                      {lang !== 'en' ? 'حذف' : 'Delete'}
                    </button>
                  </>
                )}
                {/* Admin actions */}
                {isAdmin && post.status !== 'HIDDEN' && (
                  <button onClick={() => { handleAdminAction('hide_post'); setShowMenu(false) }} className="flex items-center gap-2 px-3 py-2.5 text-sm text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 w-full text-right">
                    <FiFlag className="w-3.5 h-3.5" />
                    {lang !== 'en' ? 'إخفاء' : 'Hide'}
                  </button>
                )}
                {currentUserRole === 'SUPER_ADMIN' && (
                  <button onClick={() => { handleAdminAction('remove_post'); setShowMenu(false) }} className="flex items-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 w-full text-right">
                    <FiFlag className="w-3.5 h-3.5" />
                    {lang !== 'en' ? 'حذف نهائي' : 'Remove'}
                  </button>
                )}
                {isAdmin && post.status === 'HIDDEN' && (
                  <button onClick={() => { handleAdminAction('restore_post'); setShowMenu(false) }} className="flex items-center gap-2 px-3 py-2.5 text-sm text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 w-full text-right">
                    <FiFlag className="w-3.5 h-3.5" />
                    {lang !== 'en' ? 'استعادة' : 'Restore'}
                  </button>
                )}
                {/* Report */}
                {post.author.id !== currentUserId && (
                  <button onClick={handleReport} disabled={reported} className="flex items-center gap-2 px-3 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 w-full text-right">
                    <FiFlag className="w-3.5 h-3.5" />
                    {reported ? t('post_reported') : t('post_report')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content — editable or display */}
      {editing ? (
        <div className="space-y-2 mb-2">
          <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)}
            className="w-full border border-blue-300 dark:border-blue-700 rounded-xl px-3 py-2 text-sm font-semibold bg-transparent text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <textarea value={editBody} onChange={e => setEditBody(e.target.value)}
            className="w-full border border-blue-300 dark:border-blue-700 rounded-xl px-3 py-2 text-sm bg-transparent text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={3} />
          <div className="flex gap-2">
            <button disabled={editLoading} onClick={async () => {
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
              className="flex-1 bg-blue-600 text-white rounded-xl py-2 text-sm font-semibold disabled:opacity-50">
              {editLoading ? '...' : (lang === 'en' ? 'Save' : lang === 'ur' ? 'محفوظ' : 'حفظ')}
            </button>
            <button onClick={() => { setEditing(false); setEditTitle(postData.title); setEditBody(postData.body) }}
              className="px-4 py-2 text-sm text-gray-500">{lang === 'en' ? 'Cancel' : lang === 'ur' ? 'منسوخ' : 'إلغاء'}</button>
          </div>
        </div>
      ) : (
        <>
          <h3 className="font-semibold text-gray-900 text-sm mb-1 selectable-text">{postData.title}</h3>
          <p className="text-gray-600 text-sm leading-relaxed line-clamp-3 selectable-text">{postData.body}</p>
          {postData.editedAt && (
            <p className="text-[10px] text-gray-400 mt-1">
              {lang === 'en' ? 'Edited' : lang === 'ur' ? 'ترمیم شدہ' : 'تم التعديل'} {new Date(postData.editedAt).toLocaleDateString(lang !== 'en' ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </>
      )}

      {post.price && (
        <div className="mt-2">
          <span className="text-primary-600 font-bold text-base">{post.price.toLocaleString('ar-SA')} <RiyalIcon /></span>
        </div>
      )}

      {post.locationLat && post.locationLng && (
        <a
          href={`https://www.google.com/maps?q=${post.locationLat},${post.locationLng}`}
          target="_blank" rel="noopener noreferrer"
          className="mt-2 flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl px-3 py-2 active:scale-[0.98] transition-transform"
        >
          <FiMapPin className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
          <span className="text-xs font-medium text-blue-700 dark:text-blue-300 truncate">
            {post.locationName || `${post.locationLat.toFixed(4)}, ${post.locationLng.toFixed(4)}`}
          </span>
          <span className="text-[10px] text-blue-500 flex-shrink-0">{lang === 'en' ? 'Open map' : lang === 'ur' ? 'نقشہ کھولیں' : 'فتح الخريطة'}</span>
        </a>
      )}

      {post.imageUrls.length > 0 && (
        <>
          <div className={`mt-3 grid gap-1 rounded-xl overflow-hidden ${
            post.imageUrls.length === 1 ? 'grid-cols-1' : post.imageUrls.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
          }`}>
            {post.imageUrls.slice(0, 3).map((url, i) => {
              const extra = post.imageUrls.length - 3
              const showOverlay = i === 2 && extra > 0
              return (
                <div key={i} className="relative cursor-pointer active:opacity-80" onClick={() => setLightboxIndex(i)}>
                  <img
                    src={url}
                    alt=""
                    className={`w-full object-cover ${
                      post.imageUrls.length === 1 ? 'h-48 rounded-xl' : 'h-24'
                    }`}
                  />
                  {showOverlay && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="text-white text-xl font-black">+{extra}</span>
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
      <div className="mt-3 pt-3 border-t border-gray-100/50 dark:border-white/[0.06] flex items-center justify-between">
        {/* Reactions — full emoji picker */}
        <div className="relative flex items-center gap-2">

          {/* Emoji-mart picker */}
          {showReactionPicker && (
            <div
              ref={pickerRef}
              className="absolute bottom-10 right-0 z-30 reaction-picker-enter shadow-2xl rounded-2xl overflow-hidden"
            >
              <EmojiPicker onSelect={(emoji) => { handleReact(emoji); setShowReactionPicker(false) }} />
            </div>
          )}

          {/* Trigger button — tap own reaction to remove, long-press to change */}
          <button
            onClick={() => myReaction ? handleReact(myReaction) : setShowReactionPicker(v => !v)}
            className="flex items-center gap-1.5 active:scale-90 transition-transform"
          >
            <span className={`text-2xl leading-none ${bouncingReaction && myReaction ? 'reaction-bounce' : ''}`}>
              {myReaction ?? '😊'}
            </span>
          </button>
          {/* Change reaction button when already reacted */}
          {myReaction && (
            <button
              onClick={() => setShowReactionPicker(v => !v)}
              className="text-xs text-gray-400 active:text-gray-600"
            >
              +
            </button>
          )}

          {/* Reaction summary: unique emojis + total */}
          {totalReactions > 0 && (
            <div className="flex items-center gap-1">
              <span className="flex">
                {Object.keys(reactionCounts).filter(e => reactionCounts[e] > 0).slice(0, 3).map(e => (
                  <span key={e} className="text-sm leading-none -mr-0.5">{e}</span>
                ))}
              </span>
              <span className="text-xs text-gray-400 mr-1">{totalReactions}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Contact / DM button */}
          {post.author.id !== currentUserId && canStartPrivateThread(post.category) && (
            post.coordinationMode === 'EXCLUSIVE' && post.activeThreadId ? (
              <span className="text-xs text-amber-500 font-medium flex items-center gap-1 px-2 py-1.5">
                <FiMail className="w-4 h-4" />
                {t('thread_in_progress')}
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
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-primary-600 transition-colors px-2.5 py-2 rounded-lg active:bg-gray-100 dark:active:bg-white/5 min-w-[40px] justify-center"
              >
                <FiMail className="w-4.5 h-4.5" />
                <span>{t('thread_contact')}</span>
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
            className="flex items-center justify-center text-gray-400 hover:text-primary-600 transition-colors p-2.5 rounded-lg active:bg-gray-100 dark:active:bg-white/5 min-w-[40px]"
          >
            <FiShare2 className="w-4.5 h-4.5" />
          </button>

          {/* Bookmark */}
          <button
            onClick={toggleBookmark}
            className={`flex items-center justify-center p-2.5 rounded-lg active:bg-gray-100 dark:active:bg-white/5 min-w-[40px] transition-colors ${
              bookmarked ? 'text-primary-600' : 'text-gray-400 hover:text-primary-600'
            }`}
          >
            <FiBookmark className={`w-4.5 h-4.5 ${bookmarked ? 'fill-current' : ''}`} />
          </button>

          {/* Comment toggle */}
          {isLookingFor ? (
            <button
              onClick={() => { toggleComments(); hapticLight() }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all active:scale-95 ${
                showComments
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'bg-sky-500 text-white shadow-md shadow-sky-500/30 hover:bg-sky-600'
              }`}
            >
              <span>🤝</span>
              <span>{showComments ? (totalComments > 0 ? `${totalComments} ${t('post_helped')}` : t('post_help_btn')) : (lang !== 'en' ? 'ساعده' : 'Help')}</span>
            </button>
          ) : (
            <button
              onClick={toggleComments}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-primary-600 transition-colors p-2.5 rounded-lg active:bg-gray-100 dark:active:bg-white/5 min-w-[40px] justify-center"
            >
              <FiMessageCircle className="w-4.5 h-4.5" />
              <span>{totalComments > 0 ? totalComments : t('post_comment')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Top comment preview — always visible if has comments */}
      {!showComments && (totalComments > 0 || serverCommentCount > 0) && comments.length > 0 && (() => {
        const top: any = [...comments].sort((a: any, b: any) => (b.likeCount || 0) - (a.likeCount || 0))[0]
        if (!top) return null
        return (
          <div className="mt-2 pt-2 border-t border-gray-100/50 dark:border-white/[0.04]">
            <button onClick={toggleComments} className="w-full text-right">
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
          </div>
        )
      })()}

      {/* Comments — Instagram-style bottom sheet.
          Opens in a fixed-position overlay so long threads never push
          the feed around. Scrollable body + pinned input at the bottom. */}
      {showComments && (
        <div
          data-overlay="true"
          className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center"
          onClick={() => setShowComments(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 w-full sm:max-w-lg max-h-[90vh] rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden animate-slide-up shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 0 }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-700" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-center py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0 relative">
              <h3 className="font-semibold text-sm text-gray-900 dark:text-white">
                {lang === 'en' ? 'Comments' : 'التعليقات'}
              </h3>
              <button
                type="button"
                onClick={() => setShowComments(false)}
                className="absolute end-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable comments list */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {comments.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">{t('post_no_comments')}</p>
          ) : (
            comments.map((c: any) => (
              <div key={c.id}>
                {/* Comment */}
                <div className="flex gap-2.5">
                  {c.author.avatarUrl ? (
                    <img src={c.author.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-600 dark:to-gray-700 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300 flex-shrink-0">
                      {c.author.name?.[0] || '؟'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-200">{c.author.name || t('post_neighbor')}</span>
                      <UserBadgeDisplay accountType={c.author.accountType} reputation={c.author.reputation} />
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">
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
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="text"
                          value={editCommentBody}
                          onChange={e => setEditCommentBody(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveCommentEdit(c.id, post.id); if (e.key === 'Escape') setEditingCommentId(null) }}
                          className="flex-1 bg-white dark:bg-gray-700 border border-primary-300 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary-400/50"
                          autoFocus
                          maxLength={500}
                        />
                        <button onClick={() => saveCommentEdit(c.id, post.id)} className="w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center active:scale-90 transition-transform text-sm font-bold">✓</button>
                        <button onClick={() => setEditingCommentId(null)} className="w-8 h-8 bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-300 rounded-full flex items-center justify-center active:scale-90 transition-transform text-sm">✕</button>
                      </div>
                    ) : (
                      <>
                        {c.body && (
                          <p className="text-[13px] text-gray-600 dark:text-gray-300 leading-relaxed selectable-text">
                            <SmartText text={c.body} />
                            {c.editedAt && <span className="text-[10px] text-gray-400 dark:text-gray-500 italic ml-1">{lang === 'en' ? '(edited)' : '(معدّل)'}</span>}
                          </p>
                        )}
                        {c.imageUrl && (
                          <img
                            src={c.imageUrl}
                            alt=""
                            className="mt-1.5 max-w-[200px] max-h-48 rounded-xl object-cover cursor-pointer"
                            onClick={() => setCommentLightbox(c.imageUrl!)}
                          />
                        )}
                      </>
                    )}
                    <div className="flex items-center gap-4 mt-1.5">
                      <button
                        onClick={() => handleCommentLike(c.id)}
                        className={`text-[12px] flex items-center gap-1 transition-colors ${c.isLiked ? 'text-red-500 font-medium' : 'text-gray-400 hover:text-red-400'}`}
                      >
                        <FiHeart className={`w-3.5 h-3.5 ${c.isLiked ? 'fill-current' : ''}`} />
                        {(c.likeCount || 0) > 0 && <span>{c.likeCount}</span>}
                      </button>
                      <button
                        onClick={() => setReplyingTo(replyingTo?.id === c.id ? null : { id: c.id, name: c.author.name || t('post_neighbor') })}
                        className="text-[12px] text-gray-400 hover:text-primary-600 font-medium"
                      >
                        {t('post_reply')}
                      </button>
                      {c.author.id === currentUserId && (
                        <>
                          {Date.now() - new Date(c.createdAt).getTime() < 30 * 60_000 && (
                            <button onClick={() => { setEditingCommentId(c.id); setEditCommentBody(c.body) }}
                              className="text-[12px] text-gray-400 hover:text-blue-500">{lang === 'en' ? 'Edit' : 'تعديل'}</button>
                          )}
                          <button onClick={() => deleteComment(c.id, post.id)}
                            className="text-[12px] text-gray-400 hover:text-red-500">{lang === 'en' ? 'Delete' : 'حذف'}</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Replies */}
                {c.replies.length > 0 && (
                  <div className="mr-10 mt-2.5 space-y-2.5 border-r-2 border-gray-100 dark:border-gray-700/50 pr-3">
                    {c.replies.map((reply: any) => (
                      <div key={reply.id} className="flex gap-2">
                        {reply.author.avatarUrl ? (
                          <img src={reply.author.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-600 dark:to-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-500 dark:text-gray-400 flex-shrink-0">
                            {reply.author.name?.[0] || '؟'}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[12px] font-semibold text-gray-700 dark:text-gray-300">{reply.author.name || t('post_neighbor')}</span>
                            <UserBadgeDisplay accountType={reply.author.accountType} reputation={reply.author.reputation} />
                          </div>
                          {reply.body && <p className="text-[12px] text-gray-500 dark:text-gray-400 leading-relaxed selectable-text"><SmartText text={reply.body} /></p>}
                          {reply.imageUrl && (
                            <img
                              src={reply.imageUrl}
                              alt=""
                              className="mt-1 max-w-[160px] max-h-40 rounded-lg object-cover cursor-pointer"
                              onClick={() => setCommentLightbox(reply.imageUrl!)}
                            />
                          )}
                          <div className="flex items-center gap-3 mt-1">
                            <button
                              onClick={() => handleCommentLike(reply.id)}
                              className={`text-[11px] flex items-center gap-1 transition-colors ${reply.isLiked ? 'text-red-500' : 'text-gray-400 hover:text-red-400'}`}
                            >
                              <FiHeart className={`w-3 h-3 ${reply.isLiked ? 'fill-current' : ''}`} />
                              {(reply.likeCount || 0) > 0 && <span>{reply.likeCount}</span>}
                            </button>
                            {reply.author.id === currentUserId && (
                              <button
                                onClick={() => deleteComment(reply.id, post.id)}
                                className="text-[11px] text-gray-400 hover:text-red-500"
                              >
                                {lang === 'en' ? 'Delete' : 'حذف'}
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
                  <div className="mr-9 mt-2">
                    {replyImagePreview && (
                      <div className="relative inline-block mb-2">
                        <img src={replyImagePreview} alt="" className="h-20 rounded-lg object-cover" />
                        <button
                          type="button"
                          onClick={() => { if (replyImagePreview) URL.revokeObjectURL(replyImagePreview); setReplyImage(null); setReplyImagePreview(null) }}
                          className="absolute -top-1 -right-1 w-5 h-5 bg-black/70 text-white rounded-full flex items-center justify-center"
                        ><FiX className="w-3 h-3" /></button>
                      </div>
                    )}
                    <form onSubmit={handleReply} className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        placeholder={`${t('post_reply')}...`}
                        autoFocus
                        className="flex-1 bg-gray-50 border border-primary-200 rounded-full px-3 py-1.5 text-xs text-right focus:outline-none focus:ring-2 focus:ring-primary-400"
                        maxLength={500}
                      />
                      <input type="file" accept="image/*" ref={replyImgRef} onChange={e => handleCommentImageSelect(e, 'reply')} className="hidden" />
                      <button
                        type="button"
                        onClick={() => openImagePicker('reply')}
                        className="w-7 h-7 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-gray-500 flex-shrink-0"
                      >
                        <FiImage className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => attachContactToComposer('reply')}
                        className="w-7 h-7 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-gray-500 flex-shrink-0"
                        aria-label={t('attach_contact')}
                        title={t('attach_contact')}
                      >
                        <FiUser className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="submit"
                        disabled={submittingReply || (!replyText.trim() && !replyImage)}
                        className="w-7 h-7 bg-primary-600 rounded-full flex items-center justify-center text-white disabled:opacity-40 flex-shrink-0"
                      >
                        <FiSend className="w-3 h-3" />
                      </button>
                    </form>
                  </div>
                )}
              </div>
            ))
          )}

            </div>

            {/* Pinned footer — contact picker + input, safe-area aware */}
            <div
              className="border-t border-gray-100 dark:border-gray-800 px-3 py-2 flex-shrink-0 bg-white dark:bg-gray-900"
              style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
            >
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
                  className="flex items-center gap-2 px-3 py-2 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-700 font-medium hover:bg-sky-100 transition-colors w-full justify-center mb-2"
                >
                  <span>📱</span>
                  <span>{t('post_share_contacts')}</span>
                </button>
              )}

              {commentImagePreview && (
                <div className="relative inline-block mb-2">
                  <img src={commentImagePreview} alt="" className="h-20 rounded-lg object-cover" />
                  <button
                    type="button"
                    onClick={() => { if (commentImagePreview) URL.revokeObjectURL(commentImagePreview); setCommentImage(null); setCommentImagePreview(null) }}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-black/70 text-white rounded-full flex items-center justify-center"
                  ><FiX className="w-3 h-3" /></button>
                </div>
              )}
              <form onSubmit={handleComment} className="flex gap-2 items-center">
                <input
                  type="text"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder={isLookingFor ? t('post_share_placeholder') : t('post_comment_placeholder')}
                  className="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 dark:text-white"
                  maxLength={500}
                />
                <input type="file" accept="image/*" ref={commentImgRef} onChange={e => handleCommentImageSelect(e, 'comment')} className="hidden" />
                <button
                  type="button"
                  onClick={() => openImagePicker('comment')}
                  className="w-9 h-9 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-gray-500 flex-shrink-0"
                >
                  <FiImage className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => attachContactToComposer('comment')}
                  className="w-9 h-9 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-gray-500 flex-shrink-0"
                  aria-label={t('attach_contact')}
                  title={t('attach_contact')}
                >
                  <FiUser className="w-4 h-4" />
                </button>
                <button
                  type="submit"
                  disabled={submitting || (!commentText.trim() && !commentImage)}
                  className="w-9 h-9 bg-primary-600 rounded-full flex items-center justify-center text-white disabled:opacity-40 flex-shrink-0"
                >
                  <FiSend className="w-4 h-4" />
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
                  <UserBadgeDisplay accountType={post.author.accountType} reputation={rep} role={post.author.role} showLabel />
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

                  {/* Account type */}
                  {post.author.accountType && post.author.accountType !== 'NORMAL' && (
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

                {/* Bio + Service — unified card */}
                {(post.author.bio || (post.author.accountType && post.author.accountType !== 'NORMAL' && (post.author.serviceDescription || post.author.serviceAddress || post.author.serviceLat))) && (
                  <div className="mt-4 w-full rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-700">

                    {/* Bio section */}
                    {post.author.bio && (
                      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/50">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{lang !== 'en' ? 'نبذة' : 'About'}</p>
                        <p className="text-[13px] text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">{post.author.bio}</p>
                      </div>
                    )}

                    {/* Service section */}
                    {post.author.accountType && post.author.accountType !== 'NORMAL' && (post.author.serviceDescription || post.author.serviceAddress || post.author.serviceLat) && (
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

                {/* Block user */}
                {post.author.id !== currentUserId && (
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
                    className="w-full text-center text-xs text-red-400 py-2 mt-1"
                  >
                    {lang !== 'en' ? 'حظر المستخدم' : 'Block User'}
                  </button>
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
            className="bg-gray-50 dark:bg-gray-700/50 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-600 text-right active:scale-[0.97] transition-transform"
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
