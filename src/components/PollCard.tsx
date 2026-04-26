'use client'

import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { useLanguage } from '@/hooks/useLanguage'
import { useConfirm } from './ConfirmProvider'
import { hapticLight, hapticMedium, hapticSuccess } from '@/lib/haptic'
import { FiMessageCircle, FiSend, FiTrash2 } from 'react-icons/fi'
import { fullName } from '@/lib/displayName'

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

  useEffect(() => { setVotes(poll.votes); setTotalVotes(poll._count.votes); setReactions(poll.reactions); setCommentCount(poll._count.comments) }, [voteSignature, poll._count.comments])
  useEffect(() => { setTimeout(() => setAnimated(true), 100) }, [])

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
    if (res.ok) setComments(await res.json())
  }

  async function addComment() {
    if (!newComment.trim()) return
    const res = await fetch(`/api/polls/${poll.id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: newComment.trim() }) })
    if (res.ok) { const c = await res.json(); setComments(prev => [...prev, c]); setNewComment(''); setCommentCount(prev => prev + 1); hapticLight() }
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
    <div className="card animate-fade-in-up">
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

      {/* Footer: vote count + expiry */}
      <div className="flex items-center justify-between mt-3 mb-2">
        <span className="text-[11px] text-gray-400">{totalVotes} {t('poll_votes')}</span>
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

        {/* Comment toggle */}
        <button onClick={() => { setShowComments(!showComments); if (!showComments) loadComments() }}
          className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-gray-50 dark:bg-gray-700 border border-transparent active:scale-90 mr-auto">
          <FiMessageCircle className="w-3.5 h-3.5 text-gray-400" />
          {commentCount > 0 && <span className="text-[10px] text-gray-400">{commentCount}</span>}
        </button>
      </div>

      {/* Comments section */}
      {showComments && (
        <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-3 animate-fade-in-up">
          <div className="space-y-2 max-h-40 overflow-y-auto mb-2">
            {comments.map(c => (
              <div key={c.id} className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-primary-100 overflow-hidden flex-shrink-0 mt-0.5">
                  {c.authorAvatar ? <img src={c.authorAvatar} alt="" className="w-full h-full object-cover" /> : null}
                </div>
                <div>
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{c.authorName} </span>
                  <span className="text-xs text-gray-600 dark:text-gray-400">{c.body}</span>
                </div>
              </div>
            ))}
            {comments.length === 0 && <p className="text-xs text-gray-400 text-center py-2">{lang === 'en' ? 'No comments' : lang === 'ur' ? 'کوئی تبصرہ نہیں' : 'لا توجد تعليقات'}</p>}
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <input value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && addComment()}
              placeholder={lang === 'en' ? 'Add comment...' : lang === 'ur' ? 'تبصرہ شامل کریں...' : 'أضف تعليق...'}
              className="flex-1 min-w-0 bg-gray-50 dark:bg-gray-700 rounded-full px-3 py-2 text-xs focus:outline-none text-gray-900 dark:text-white" />
            <button onClick={addComment} className="text-primary-600 p-1.5"><FiSend className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      )}
    </div>
  )
}
