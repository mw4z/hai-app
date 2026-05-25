'use client'

import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { useLanguage } from '@/hooks/useLanguage'
import { useConfirm } from './ConfirmProvider'
import { hapticLight, hapticMedium, hapticSuccess } from '@/lib/haptic'
import { FiMessageCircle, FiSend, FiTrash2, FiX, FiEye, FiBell, FiHeart, FiCornerDownRight, FiSmile, FiImage } from 'react-icons/fi'
import { fullName } from '@/lib/displayName'
import SmartTextWithPlacePreviews from './SmartTextWithPlacePreviews'
import UserBadgeDisplay from './UserBadge'
import MembershipPill from './MembershipPill'
import Sticker from './Sticker'
import StickerPicker from './StickerPicker'
import ImageLightbox from './ImageLightbox'
import UserProfileSheet from './UserProfileSheet'
import ReportUserSheet from './ReportUserSheet'
import { HaiSpinner } from './HaiLoader'
import { uploadFiles } from '@/lib/upload'
import { parseStickerRef, toStickerRef } from '@/lib/stickers/catalog'
import { detectLang } from '@/lib/detectLang'
import { useDragToDismiss } from '@/hooks/useDragToDismiss'
import { useBodyScrollLock, consumeNextClick } from '@/hooks/useBodyScrollLock'
import { pushBackHandler } from '@/lib/backHandler'
import { playSend } from '@/lib/sound'

// Per-session dedup of recorded views (the server also dedups across
// sessions via the unique PollView row). Mirrors PostCard's reportedViews.
const reportedPollViews = new Set<string>()

interface Props {
  poll: {
    id: string
    question: string
    options: string[]
    status: string
    expiresAt: string | null
    createdAt: string
    authorId: string
    author: { id: string; name: string; lastName?: string | null; avatarUrl: string | null; role: string }
    votes: { userId: string; optionIndex: number }[]
    reactions: { userId: string; emoji: string }[]
    viewCount?: number
    _count: { votes: number; comments: number }
  }
  currentUserId: string
  /** SUPER_ADMIN only — shows the "re-send notification" action. */
  isSuperAdmin?: boolean
  /** Any mod/admin — shows mod-delete on others' comments (server enforces scope). */
  isAdmin?: boolean
  onDelete?: () => void
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🙏']

export default function PollCard({ poll, currentUserId, isSuperAdmin = false, isAdmin = false, onDelete }: Props) {
  const { t, lang } = useLanguage()
  const confirmDialog = useConfirm()
  const [repushing, setRepushing] = useState(false)
  const voteSignature = JSON.stringify(poll.votes.map(v => `${v.userId}:${v.optionIndex}`).sort())
  const [votes, setVotes] = useState(poll.votes)
  const [totalVotes, setTotalVotes] = useState(poll._count.votes)
  const [reactions, setReactions] = useState(poll.reactions)
  const [commentCount, setCommentCount] = useState(poll._count.comments)
  const [voting, setVoting] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<any[]>([])
  const [newComment, setNewComment] = useState('')
  const [replyText, setReplyText] = useState('')
  const [animated, setAnimated] = useState(false)
  const [viewCount, setViewCount] = useState<number>(poll.viewCount ?? 0)
  const [cardVisible, setCardVisible] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  // Comment-feature state (parity with post comments)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null)
  const [attachImage, setAttachImage] = useState<File | null>(null)
  const [attachPreview, setAttachPreview] = useState<string | null>(null)
  // 'main' | <parentCommentId> | null — which composer the sticker targets.
  const [stickerTarget, setStickerTarget] = useState<string | null>(null)
  const [commentTx, setCommentTx] = useState<Record<string, { body: string; show: boolean; loading: boolean }>>({})
  const [popupUserId, setPopupUserId] = useState<string | null>(null)
  const [reportTarget, setReportTarget] = useState<{ id: string; name: string | null; role?: string | null } | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const imgInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setVotes(poll.votes); setTotalVotes(poll._count.votes); setReactions(poll.reactions); setCommentCount(poll._count.comments) }, [voteSignature, poll._count.comments])
  useEffect(() => { setTimeout(() => setAnimated(true), 100) }, [])

  // Record this user's view ONCE the first time the card is ≥50% visible.
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        const isVis = entries.some((e) => e.isIntersecting)
        setCardVisible(isVis)
        if (isVis && !reportedPollViews.has(poll.id)) {
          reportedPollViews.add(poll.id)
          fetch(`/api/polls/${poll.id}/view`, { method: 'POST' })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (d && typeof d.viewCount === 'number') setViewCount(d.viewCount) })
            .catch(() => {})
        }
      },
      { threshold: 0.5 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [poll.id])

  // Live-ish count: re-fetch every 25s while on screen + tab visible.
  useEffect(() => {
    if (!cardVisible) return
    let cancelled = false
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return
      fetch(`/api/polls/${poll.id}/view`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (!cancelled && d && typeof d.viewCount === 'number') setViewCount(d.viewCount) })
        .catch(() => {})
    }
    const id = setInterval(tick, 25_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [cardVisible, poll.id])

  const { sheetRef, handleRef, bodyRef } = useDragToDismiss<HTMLDivElement, HTMLDivElement, HTMLDivElement>({
    open: showComments,
    onDismiss: () => setShowComments(false),
  })
  const [commentsLoaded, setCommentsLoaded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  useBodyScrollLock(showComments)
  useEffect(() => {
    if (!showComments) return
    return pushBackHandler(() => setShowComments(false))
  }, [showComments])
  useEffect(() => {
    if (!showComments) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowComments(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showComments])

  const myVote = votes.find(v => v.userId === currentUserId)
  const hasVoted = !!myVote
  const isClosed = poll.status === 'closed' || !!(poll.expiresAt && new Date(poll.expiresAt) < new Date())
  const isAuthor = poll.authorId === currentUserId
  const voteCounts = poll.options.map((_, i) => votes.filter(v => v.optionIndex === i).length)

  async function vote(i: number) {
    if (voting || isClosed) return
    hapticMedium()
    setVoting(true)
    const res = await fetch(`/api/polls/${poll.id}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ optionIndex: i }) })
    if (res.ok) {
      hapticSuccess()
      if (hasVoted) { setVotes(prev => prev.map(v => v.userId === currentUserId ? { ...v, optionIndex: i } : v)) }
      else { setVotes(prev => [...prev, { userId: currentUserId, optionIndex: i }]); setTotalVotes(prev => prev + 1) }
    }
    setVoting(false)
  }

  async function react(emoji: string) {
    hapticLight()
    const res = await fetch(`/api/polls/${poll.id}/react`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emoji }) })
    if (res.ok) {
      const data = await res.json()
      if (data.removed) setReactions(prev => prev.filter(r => r.userId !== currentUserId))
      else if (data.updated) setReactions(prev => prev.map(r => r.userId === currentUserId ? { ...r, emoji } : r))
      else setReactions(prev => [...prev, { userId: currentUserId, emoji }])
    }
  }

  async function loadComments() {
    const res = await fetch(`/api/polls/${poll.id}/comments`)
    if (res.ok) {
      setComments(await res.json())
      setCommentsLoaded(true)
    }
  }

  function clearAttach() {
    if (attachPreview) URL.revokeObjectURL(attachPreview)
    setAttachImage(null)
    setAttachPreview(null)
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (attachPreview) URL.revokeObjectURL(attachPreview)
    setAttachImage(f)
    setAttachPreview(URL.createObjectURL(f))
    e.target.value = ''
  }

  // Insert a freshly-created comment/reply into state.
  function insertComment(c: any, parentId: string | null) {
    if (parentId) {
      setComments(prev => prev.map(top => top.id === parentId
        ? { ...top, replies: [...(top.replies || []), c] }
        : top))
    } else {
      setComments(prev => [...prev, c])
    }
    setCommentCount(p => p + 1)
  }

  async function submitComment(e: React.FormEvent | undefined, parentId: string | null) {
    e?.preventDefault()
    const text = parentId ? replyText : newComment
    if ((!text.trim() && !attachImage) || submitting) return
    setSubmitting(true)
    try {
      let imageUrl: string | undefined
      if (attachImage) {
        const urls = await uploadFiles([attachImage])
        imageUrl = urls[0]
      }
      const res = await fetch(`/api/polls/${poll.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text.trim(), parentId: parentId || undefined, imageUrl }),
      })
      if (res.ok) {
        const c = await res.json()
        playSend()
        insertComment(c, parentId)
        if (parentId) { setReplyingTo(null); setReplyText('') } else { setNewComment('') }
        clearAttach()
      } else {
        const d = await res.json().catch(() => ({}))
        toast.error(d.error || (lang === 'en' ? 'Failed' : 'تعذّر الإرسال'))
      }
    } catch {
      toast.error(lang === 'en' ? 'Connection error' : 'خطأ في الاتصال')
    } finally {
      setSubmitting(false)
    }
  }

  async function sendSticker(stickerId: string) {
    const parentId = stickerTarget && stickerTarget !== 'main' ? stickerTarget : null
    setStickerTarget(null)
    try {
      const res = await fetch(`/api/polls/${poll.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: toStickerRef(stickerId), parentId: parentId || undefined }),
      })
      if (res.ok) {
        const c = await res.json()
        playSend()
        insertComment(c, parentId)
        if (parentId) setReplyingTo(null)
      }
    } catch { /* ignore */ }
  }

  // Toggle a like across top-level comments AND their replies.
  function applyLike(list: any[], id: string): any[] {
    return list.map(c => {
      if (c.id === id) return { ...c, isLiked: !c.isLiked, likeCount: (c.likeCount || 0) + (c.isLiked ? -1 : 1) }
      if (c.replies?.length) return { ...c, replies: c.replies.map((r: any) => r.id === id ? { ...r, isLiked: !r.isLiked, likeCount: (r.likeCount || 0) + (r.isLiked ? -1 : 1) } : r) }
      return c
    })
  }
  async function handleCommentLike(id: string) {
    hapticLight()
    setComments(prev => applyLike(prev, id))
    try {
      const res = await fetch(`/api/pollcomments/${id}/like`, { method: 'POST' })
      if (!res.ok) setComments(prev => applyLike(prev, id)) // revert
    } catch {
      setComments(prev => applyLike(prev, id))
    }
  }

  async function deleteComment(id: string) {
    const ok = await confirmDialog({
      message: lang === 'en' ? 'Delete this comment?' : 'حذف هذا التعليق؟',
      variant: 'danger',
      confirmText: lang === 'en' ? 'Delete' : 'حذف',
    })
    if (!ok) return
    const res = await fetch(`/api/polls/${poll.id}/comments/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setComments(prev => prev
        .filter(c => c.id !== id)
        .map(c => c.replies?.length ? { ...c, replies: c.replies.filter((r: any) => r.id !== id) } : c))
      setCommentCount(p => Math.max(0, p - 1))
    } else {
      toast.error(lang === 'en' ? 'Failed' : 'تعذّر الحذف')
    }
  }

  async function saveEdit(id: string) {
    if (!editBody.trim()) return
    const res = await fetch(`/api/polls/${poll.id}/comments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: editBody.trim() }),
    })
    if (res.ok) {
      const u = await res.json()
      const patch = (c: any) => c.id === id ? { ...c, body: u.body, editedAt: u.editedAt } : c
      setComments(prev => prev.map(c => c.replies?.length
        ? { ...patch(c), replies: c.replies.map(patch) }
        : patch(c)))
      setEditingCommentId(null)
    } else {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error || (lang === 'en' ? 'Failed' : 'تعذّر التعديل'))
    }
  }

  async function toggleTranslate(commentId: string, originalBody: string) {
    const existing = commentTx[commentId]
    if (existing?.show) { setCommentTx(prev => ({ ...prev, [commentId]: { ...existing, show: false } })); return }
    if (existing?.body) { setCommentTx(prev => ({ ...prev, [commentId]: { ...existing, show: true } })); return }
    setCommentTx(prev => ({ ...prev, [commentId]: { body: '', show: false, loading: true } }))
    try {
      const r = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: originalBody, target: lang }),
      }).then(res => res.json())
      const translated = typeof r?.translated === 'string' ? r.translated : originalBody
      setCommentTx(prev => ({ ...prev, [commentId]: { body: translated, show: true, loading: false } }))
    } catch {
      setCommentTx(prev => ({ ...prev, [commentId]: { body: originalBody, show: false, loading: false } }))
      toast.error(lang === 'en' ? 'Translation failed' : 'فشل الترجمة')
    }
  }

  function openComments() {
    hapticLight()
    setShowComments(true)
    if (!commentsLoaded) void loadComments()
  }

  async function deletePoll() {
    const ok = await confirmDialog({
      message: lang === 'en' ? 'Delete this poll?' : lang === 'ur' ? 'ووٹنگ حذف کریں؟' : 'حذف هذا التصويت؟',
      variant: 'danger',
      confirmText: lang === 'en' ? 'Delete' : 'حذف',
    })
    if (!ok) return
    const res = await fetch(`/api/polls/${poll.id}`, { method: 'DELETE' })
    if (res.ok) { toast.success(lang === 'en' ? 'Deleted' : lang === 'ur' ? 'حذف ہو گیا' : 'تم الحذف'); onDelete?.() }
  }

  async function repush() {
    if (repushing) return
    const ok = await confirmDialog({
      message: lang === 'en'
        ? 'Re-send the notification for this poll to the neighborhood?'
        : 'إعادة إرسال إشعار هذا التصويت لأهل الحي؟',
      confirmText: lang === 'en' ? 'Send' : 'إرسال',
    })
    if (!ok) return
    setRepushing(true)
    try {
      const res = await fetch(`/api/polls/${poll.id}/repush`, { method: 'POST' })
      if (res.ok) { hapticSuccess(); toast.success(lang === 'en' ? 'Notification sent' : 'تم إرسال الإشعار') }
      else { toast.error(lang === 'en' ? 'Failed to send' : 'تعذّر الإرسال') }
    } catch {
      toast.error(lang === 'en' ? 'Connection error' : 'خطأ في الاتصال')
    } finally {
      setRepushing(false)
    }
  }

  const roleLabel = poll.author.role === 'SUPER_ADMIN' ? (lang === 'en' ? 'Admin' : lang === 'ur' ? 'سپر ایڈمن' : 'مدير عام') : poll.author.role === 'NEIGHBORHOOD_MOD' ? (lang === 'en' ? 'Mod' : lang === 'ur' ? 'محلے کا منتظم' : 'مشرف الحي') : ''
  const myReaction = reactions.find(r => r.userId === currentUserId)

  const reactionCounts: Record<string, number> = {}
  reactions.forEach(r => { reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1 })

  function timeAgo(d: string) { const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000); if (m < 1) return lang === 'en' ? 'now' : lang === 'ur' ? 'ابھی' : 'الآن'; if (m < 60) return `${m}${lang !== 'en' ? ' د' : 'm'}`; const h = Math.floor(m / 60); if (h < 24) return `${h}${lang !== 'en' ? ' س' : 'h'}`; return `${Math.floor(h / 24)}${lang !== 'en' ? ' ي' : 'd'}` }

  // ── Single comment (used for top-level + replies) ────────────────────
  function renderComment(c: any, isReply: boolean) {
    const a = c.author || {}
    const isMine = a.id === currentUserId
    const canEdit = isMine && Date.now() - new Date(c.createdAt).getTime() < 30 * 60_000
    const tx = commentTx[c.id]
    const displayBody = tx?.show && tx?.body ? tx.body : c.body
    const stickerId = c.imageUrl ? parseStickerRef(c.imageUrl) : null
    const avatarCls = isReply ? 'hai-avatar hai-avatar--xs' : 'hai-avatar hai-avatar--sm'
    const openProfile = () => a.id && setPopupUserId(a.id)
    return (
      <>
        <div className="hai-comment">
          {a.avatarUrl ? (
            <img src={a.avatarUrl} alt="" className={`${avatarCls} cursor-pointer`} onClick={openProfile} />
          ) : (
            <div className={`${avatarCls} cursor-pointer`} onClick={openProfile}>{a.name?.[0] || '؟'}</div>
          )}
          <div className="hai-comment__body">
            <div className="hai-comment__meta">
              <span className="hai-comment__author cursor-pointer" onClick={openProfile}>{fullName(a) || a.name || t('post_neighbor')}</span>
              <UserBadgeDisplay accountType={a.accountType} providerStatus={a.providerStatus} reputation={a.reputation} />
              <MembershipPill membership={a.membership} />
              <span className="hai-comment__time">{timeAgo(c.createdAt)}</span>
            </div>

            {editingCommentId === c.id ? (
              <div className="hai-comment__edit-form">
                <input
                  type="text"
                  value={editBody}
                  onChange={e => setEditBody(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(c.id); if (e.key === 'Escape') setEditingCommentId(null) }}
                  autoFocus
                  maxLength={500}
                />
                <button onClick={() => saveEdit(c.id)} className="hai-comment__edit-btn hai-comment__edit-btn--save">✓</button>
                <button onClick={() => setEditingCommentId(null)} className="hai-comment__edit-btn hai-comment__edit-btn--cancel">✕</button>
              </div>
            ) : (
              <>
                {c.body && (
                  <p className="hai-comment__text selectable-text">
                    <SmartTextWithPlacePreviews text={displayBody} />
                    {c.editedAt && <span className="hai-meta hai-comment__edited"> {lang === 'en' ? '(edited)' : '(معدّل)'}</span>}
                  </p>
                )}
                {c.imageUrl && (stickerId ? (
                  <div className="mt-1.5"><Sticker id={stickerId} size={isReply ? 100 : 118} /></div>
                ) : (
                  <img src={c.imageUrl} alt="" className="hai-comment__image" onClick={() => setLightboxUrl(c.imageUrl)} />
                ))}
              </>
            )}

            <div className="hai-comment__actions">
              {!isReply && (
                <button
                  onClick={() => setReplyingTo(replyingTo?.id === c.id ? null : { id: c.id, name: fullName(a) || a.name || t('post_neighbor') })}
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-bold active:scale-95 transition-transform ${
                    replyingTo?.id === c.id ? 'bg-primary-600 text-white' : 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-500/10'
                  }`}
                >
                  <FiCornerDownRight className="w-3.5 h-3.5" />
                  {t('post_reply')}
                </button>
              )}
              {isMine && (
                <>
                  {canEdit && (
                    <button onClick={() => { setEditingCommentId(c.id); setEditBody(c.body) }} className="hai-comment__action">
                      {lang === 'en' ? 'Edit' : 'تعديل'}
                    </button>
                  )}
                  <button onClick={() => deleteComment(c.id)} className="hai-comment__action is-danger">
                    {lang === 'en' ? 'Delete' : 'حذف'}
                  </button>
                </>
              )}
              {c.body && detectLang(c.body) !== lang && (
                <button onClick={() => toggleTranslate(c.id, c.body)} disabled={tx?.loading} className="hai-comment__action">
                  {tx?.loading ? <HaiSpinner /> : tx?.show ? (lang === 'en' ? 'Original' : 'الأصل') : (lang === 'en' ? 'Translate' : 'ترجمة')}
                </button>
              )}
              {!isMine && (
                <button onClick={() => setReportTarget({ id: a.id, name: fullName(a) || a.name, role: a.role })} className="hai-comment__action is-danger">
                  {lang === 'en' ? 'Report' : 'إبلاغ'}
                </button>
              )}
              {isAdmin && !isMine && (
                <button onClick={() => deleteComment(c.id)} className="hai-comment__action is-danger">
                  {lang === 'en' ? 'Delete' : 'حذف'}
                </button>
              )}
            </div>
          </div>

          <button type="button" onClick={() => handleCommentLike(c.id)} aria-label="like" className="flex flex-col items-center gap-0.5 flex-shrink-0 self-center active:scale-90 transition-transform">
            <FiHeart className={`${isReply ? 'hai-icon-xs' : 'hai-icon-sm'} ${c.isLiked ? 'hai-fill-current text-red-500' : 'text-gray-400'}`} />
            {(c.likeCount || 0) > 0 && <span className="text-[10px] text-gray-500 dark:text-gray-400 leading-none">{c.likeCount}</span>}
          </button>
        </div>

        {/* Replies */}
        {!isReply && c.replies?.length > 0 && (
          <div className="hai-comment-replies">
            {c.replies.map((r: any) => <div key={r.id} className="hai-comment-reply">{renderComment(r, true)}</div>)}
          </div>
        )}

        {/* Reply composer */}
        {!isReply && replyingTo?.id === c.id && (
          <div className="hai-comment-reply-composer">
            {attachPreview && (
              <div className="hai-comment-input__attach">
                <img src={attachPreview} alt="" />
                <button type="button" onClick={clearAttach} className="hai-comment-input__attach-remove"><FiX className="hai-icon-xs" /></button>
              </div>
            )}
            <form onSubmit={(e) => submitComment(e, c.id)} className="hai-comment-input">
              <input type="text" value={replyText} onChange={e => setReplyText(e.target.value)} placeholder={lang === 'en' ? `Reply to ${replyingTo?.name ?? ''}…` : `الرد على ${replyingTo?.name ?? ''}…`} maxLength={500} autoFocus />
              <button type="button" onClick={() => { hapticLight(); setStickerTarget(c.id) }} className="hai-comment-input__attach-btn" aria-label="stickers"><FiSmile className="hai-icon-md" /></button>
              <button type="button" onClick={() => { setStickerTarget(null); imgInputRef.current?.click() }} className="hai-comment-input__attach-btn" aria-label="image"><FiImage className="hai-icon-md" /></button>
              <button type="submit" disabled={submitting || (!replyText.trim() && !attachImage)} className="hai-comment-input__send"><FiSend className="hai-icon-md" /></button>
            </form>
          </div>
        )}
      </>
    )
  }

  return (
    <div ref={cardRef} className="card animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-primary-100 overflow-hidden flex-shrink-0">
          {poll.author.avatarUrl ? <img src={poll.author.avatarUrl} alt="" className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center text-primary-700 font-bold text-xs">{poll.author.name?.[0]}</span>}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-gray-800 dark:text-white">{fullName(poll.author) || poll.author.name}</span>
            {roleLabel && <span className="text-[9px] bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 px-1.5 py-0.5 rounded-full font-bold">{roleLabel}</span>}
          </div>
          <p className="text-[10px] text-gray-400">{timeAgo(poll.createdAt)}</p>
        </div>
        <span className="text-[10px] bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full font-bold">📊 {lang === 'en' ? 'Poll' : lang === 'ur' ? 'ووٹنگ' : 'تصويت'}</span>
        {isSuperAdmin && (
          <button onClick={repush} disabled={repushing} title={lang === 'en' ? 'Re-send notification' : 'إعادة إرسال الإشعار'} className="text-gray-300 hover:text-primary-500 p-1 disabled:opacity-40">
            <FiBell className="w-3.5 h-3.5" />
          </button>
        )}
        {isAuthor && (
          <button onClick={deletePoll} className="text-gray-300 hover:text-red-400 p-1"><FiTrash2 className="w-3.5 h-3.5" /></button>
        )}
      </div>

      {/* Question */}
      <h3 className="font-bold text-gray-900 dark:text-white text-sm mb-3">{poll.question}</h3>

      {/* Options with animated bars */}
      <div className="space-y-2">
        {poll.options.map((option, i) => {
          const count = voteCounts[i]
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
          const isMyVote = myVote?.optionIndex === i
          const showResults = hasVoted || isClosed
          return (
            <button key={i} onClick={() => !isClosed && vote(i)} disabled={voting || isClosed}
              className={`w-full text-start rounded-xl overflow-hidden relative active:scale-[0.99] ${isMyVote ? 'border-2 border-primary-500' : 'border border-gray-200 dark:border-gray-600'}`}>
              {showResults && (
                <div className={`absolute inset-y-0 rounded-lg ${isMyVote ? 'bg-green-500/30' : 'bg-blue-500/25'}`}
                  style={{ width: animated ? `${pct}%` : '0%', transition: 'width 0.8s cubic-bezier(0.25, 1, 0.5, 1)', right: 0 }} />
              )}
              <div className="relative flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2">
                  {isMyVote && <span className="text-primary-600 text-xs font-bold">✓</span>}
                  <span className={`text-sm ${isMyVote ? 'font-bold text-primary-700 dark:text-primary-300' : 'text-gray-700 dark:text-gray-300'}`}>{option}</span>
                </div>
                {showResults && <span className={`text-xs font-semibold ${isMyVote ? 'text-primary-600' : 'text-gray-400'}`}>{pct}%</span>}
              </div>
            </button>
          )
        })}
      </div>

      {/* Footer: vote count + view count + expiry */}
      <div className="flex items-center justify-between mt-3 mb-2">
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-gray-400">{totalVotes} {t('poll_votes')}</span>
          <span className="flex items-center gap-1 text-[11px] text-gray-400" title={lang === 'en' ? `${viewCount} views` : `${viewCount} مشاهدة`}>
            <FiEye className="w-3.5 h-3.5" />{viewCount}
          </span>
        </div>
        {isClosed && <span className="text-[10px] text-red-400 font-medium">{t('poll_closed')}</span>}
      </div>

      {/* Reactions row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {QUICK_EMOJIS.map(emoji => {
          const count = reactionCounts[emoji] || 0
          const isActive = myReaction?.emoji === emoji
          return (
            <button key={emoji} onClick={() => react(emoji)}
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-all active:scale-90 ${
                isActive ? 'bg-primary-100 dark:bg-primary-900/40 border border-primary-300' : 'bg-gray-50 dark:bg-gray-700 border border-transparent'
              }`}>
              <span>{emoji}</span>
              {count > 0 && <span className={`text-[10px] ${isActive ? 'text-primary-600 font-bold' : 'text-gray-400'}`}>{count}</span>}
            </button>
          )
        })}
        <button onClick={openComments} className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-gray-50 dark:bg-gray-700 border border-transparent active:scale-90 mr-auto">
          <FiMessageCircle className="w-3.5 h-3.5 text-gray-400" />
          {commentCount > 0 && <span className="text-[10px] text-gray-400">{commentCount}</span>}
        </button>
      </div>

      {/* Comments bottom sheet */}
      {showComments && (
        <div data-overlay="true" className="hai-sheet-overlay"
          onPointerDown={(e) => { if (e.target !== e.currentTarget) return; e.preventDefault(); consumeNextClick(); setShowComments(false) }}>
          <div ref={sheetRef} className="hai-sheet animate-slide-up" onPointerDown={(e) => e.stopPropagation()}>
            <div ref={handleRef} style={{ touchAction: 'none' }}>
              <div className="hai-sheet__handle" />
              <div className="hai-sheet__header">
                <h3 className="hai-sheet__header-title">{lang === 'en' ? 'Comments' : lang === 'ur' ? 'تبصرے' : 'التعليقات'}</h3>
                <button type="button" onClick={() => setShowComments(false)} className="hai-sheet__close"><FiX className="hai-icon-lg" /></button>
              </div>
            </div>

            <div ref={bodyRef} className="hai-sheet__body">
              {!commentsLoaded ? (
                <p className="hai-empty-state">…</p>
              ) : comments.length === 0 ? (
                <p className="hai-empty-state">{lang === 'en' ? 'No comments yet' : lang === 'ur' ? 'ابھی تک کوئی تبصرہ نہیں' : 'لا توجد تعليقات'}</p>
              ) : (
                comments.map((c: any) => <div key={c.id}>{renderComment(c, false)}</div>)
              )}
            </div>

            {/* Main composer — hidden while a reply box is open. */}
            {!replyingTo && (
              <div className="hai-sheet__footer">
                {attachPreview && (
                  <div className="hai-comment-input__attach">
                    <img src={attachPreview} alt="" />
                    <button type="button" onClick={clearAttach} className="hai-comment-input__attach-remove"><FiX className="hai-icon-xs" /></button>
                  </div>
                )}
                <form onSubmit={(e) => submitComment(e, null)} className="hai-comment-input">
                  <input type="text" value={newComment} onChange={e => setNewComment(e.target.value)} placeholder={lang === 'en' ? 'Add a comment…' : lang === 'ur' ? 'تبصرہ شامل کریں…' : 'أضف تعليقاً…'} maxLength={500} />
                  <button type="button" onClick={() => { hapticLight(); setStickerTarget('main') }} className="hai-comment-input__attach-btn" aria-label="stickers"><FiSmile className="hai-icon-md" /></button>
                  <button type="button" onClick={() => { setStickerTarget(null); imgInputRef.current?.click() }} className="hai-comment-input__attach-btn" aria-label="image"><FiImage className="hai-icon-md" /></button>
                  <button type="submit" disabled={submitting || (!newComment.trim() && !attachImage)} className="hai-comment-input__send" aria-label={lang === 'en' ? 'Send' : 'إرسال'}><FiSend className="hai-icon-md" /></button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Shared hidden image input + portals */}
      <input type="file" accept="image/*" ref={imgInputRef} onChange={handleImageSelect} className="hai-hidden" />
      <StickerPicker open={!!stickerTarget} onPick={sendSticker} onClose={() => setStickerTarget(null)} />
      <ImageLightbox images={lightboxUrl ? [lightboxUrl] : []} initialIndex={0} open={!!lightboxUrl} onClose={() => setLightboxUrl(null)} />
      {popupUserId && (
        <UserProfileSheet profileUserId={popupUserId} currentUserId={currentUserId} onClose={() => setPopupUserId(null)} />
      )}
      <ReportUserSheet
        open={!!reportTarget}
        onClose={() => setReportTarget(null)}
        targetUserId={reportTarget?.id || ''}
        targetName={reportTarget?.name}
        targetRole={reportTarget?.role ?? null}
        onBlockRequested={async () => {
          const target = reportTarget
          if (!target) return
          try {
            const res = await fetch('/api/users/block', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: target.id }) })
            if (res.ok) toast.success(lang === 'en' ? 'User blocked' : 'تم حظر المستخدم')
          } catch { /* ignore */ }
        }}
      />
    </div>
  )
}
