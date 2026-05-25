'use client'

import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { useLanguage } from '@/hooks/useLanguage'
import { useConfirm } from './ConfirmProvider'
import { hapticLight, hapticMedium, hapticSuccess } from '@/lib/haptic'
import { FiMessageCircle, FiSend, FiTrash2, FiX, FiEye } from 'react-icons/fi'

// Per-session dedup of recorded views (the server also dedups across
// sessions via the unique PollView row). Mirrors PostCard's reportedViews.
const reportedPollViews = new Set<string>()
import { fullName } from '@/lib/displayName'
import SmartText from './SmartText'
import { useDragToDismiss } from '@/hooks/useDragToDismiss'
import { useBodyScrollLock, consumeNextClick } from '@/hooks/useBodyScrollLock'
import { pushBackHandler } from '@/lib/backHandler'
import { playSend } from '@/lib/sound'

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
  onDelete?: () => void
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🙏']

export default function PollCard({ poll, currentUserId, onDelete }: Props) {
  const { t, lang } = useLanguage()
  const confirmDialog = useConfirm()
  const voteSignature = JSON.stringify(poll.votes.map(v => `${v.userId}:${v.optionIndex}`).sort())
  const [votes, setVotes] = useState(poll.votes)
  const [totalVotes, setTotalVotes] = useState(poll._count.votes)
  const [reactions, setReactions] = useState(poll.reactions)
  const [commentCount, setCommentCount] = useState(poll._count.comments)
  const [voting, setVoting] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<any[]>([])
  const [newComment, setNewComment] = useState('')
  const [animated, setAnimated] = useState(false)
  // Distinct-viewer count — seeded from the server, bumped after we record
  // this user's view, then polled live while on screen. Mirrors PostCard.
  const [viewCount, setViewCount] = useState<number>(poll.viewCount ?? 0)
  const [cardVisible, setCardVisible] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

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

  // Drag-to-dismiss + scroll lock + back-press parity with the post
  // comments sheet. Same hooks, same hai-sheet class skeleton — keeps
  // the two surfaces visually and behaviourally identical.
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

  async function addComment(e?: React.FormEvent) {
    e?.preventDefault()
    if (!newComment.trim() || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/polls/${poll.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: newComment.trim() }),
      })
      if (res.ok) {
        const c = await res.json()
        playSend()
        setComments(prev => [...prev, c])
        setNewComment('')
        setCommentCount(prev => prev + 1)
      }
    } finally {
      setSubmitting(false)
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

  const roleLabel = poll.author.role === 'SUPER_ADMIN' ? (lang === 'en' ? 'Admin' : lang === 'ur' ? 'سپر ایڈمن' : 'مدير عام') : poll.author.role === 'NEIGHBORHOOD_MOD' ? (lang === 'en' ? 'Mod' : lang === 'ur' ? 'محلے کا منتظم' : 'مشرف الحي') : ''
  const myReaction = reactions.find(r => r.userId === currentUserId)

  // Group reactions by emoji
  const reactionCounts: Record<string, number> = {}
  reactions.forEach(r => { reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1 })

  function timeAgo(d: string) { const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000); if (m < 1) return lang === 'en' ? 'now' : lang === 'ur' ? 'ابھی' : 'الآن'; if (m < 60) return `${m}${lang !== 'en' ? ' د' : 'm'}`; const h = Math.floor(m / 60); if (h < 24) return `${h}${lang !== 'en' ? ' س' : 'h'}`; return `${Math.floor(h / 24)}${lang !== 'en' ? ' ي' : 'd'}` }

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
          <span
            className="flex items-center gap-1 text-[11px] text-gray-400"
            title={lang === 'en' ? `${viewCount} views` : `${viewCount} مشاهدة`}
          >
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

        {/* Comment toggle — opens the bottom sheet, mirroring PostCard. */}
        <button onClick={openComments}
          className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-gray-50 dark:bg-gray-700 border border-transparent active:scale-90 mr-auto">
          <FiMessageCircle className="w-3.5 h-3.5 text-gray-400" />
          {commentCount > 0 && <span className="text-[10px] text-gray-400">{commentCount}</span>}
        </button>
      </div>

      {/* Comments bottom sheet — same hai-sheet skeleton, drag-to-
          dismiss, scroll lock, back-press, and playSend on submit as
          the post comments. Kept inline rather than extracted into a
          shared component because the data shape (PollComment) and
          feature surface (no images / threads / edits / likes for v1)
          differ enough that a generic CommentsSheet would have to
          branch on type — cheaper to duplicate the ~70 LOC of shell. */}
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
            ref={sheetRef}
            className="hai-sheet animate-slide-up"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div ref={handleRef} style={{ touchAction: 'none' }}>
              <div className="hai-sheet__handle" />
              <div className="hai-sheet__header">
                <h3 className="hai-sheet__header-title">
                  {lang === 'en' ? 'Comments' : lang === 'ur' ? 'تبصرے' : 'التعليقات'}
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

            <div ref={bodyRef} className="hai-sheet__body">
              {!commentsLoaded ? (
                <p className="hai-empty-state">…</p>
              ) : comments.length === 0 ? (
                <p className="hai-empty-state">
                  {lang === 'en' ? 'No comments yet' : lang === 'ur' ? 'ابھی تک کوئی تبصرہ نہیں' : 'لا توجد تعليقات'}
                </p>
              ) : (
                comments.map((c: any) => (
                  <div key={c.id} className="hai-comment">
                    {c.authorAvatar ? (
                      <img src={c.authorAvatar} alt="" className="hai-avatar hai-avatar--sm" />
                    ) : (
                      <div className="hai-avatar hai-avatar--sm">
                        {c.authorName?.[0] || '؟'}
                      </div>
                    )}
                    <div className="hai-comment__body">
                      <div className="hai-comment__meta">
                        <span className="hai-comment__author">{c.authorName}</span>
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
                      <div className="hai-comment__text">
                        <SmartText text={c.body} />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="hai-sheet__footer">
              <form onSubmit={addComment} className="hai-comment-input">
                <input
                  type="text"
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  placeholder={lang === 'en' ? 'Add a comment…' : lang === 'ur' ? 'تبصرہ شامل کریں…' : 'أضف تعليقاً…'}
                  maxLength={500}
                />
                <button
                  type="submit"
                  disabled={!newComment.trim() || submitting}
                  className="hai-comment-input__send"
                  aria-label={lang === 'en' ? 'Send' : 'إرسال'}
                >
                  <FiSend className="hai-icon-md" />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
