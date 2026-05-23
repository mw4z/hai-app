'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { FiTrash2, FiMessageCircle, FiHeart } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { useConfirm } from '@/components/ConfirmProvider'
import BackButton from '@/components/BackButton'

interface MyPost {
  id: string
  title: string | null
  body: string
  category: string
  status: string
  createdAt: string
  imageUrls: string[]
  _count: { comments: number; reactions: number }
}

// Badge for non-live statuses so the user understands each post's state.
const STATUS: Record<string, { ar: string; en: string; cls: string }> = {
  PENDING_AI:  { ar: 'قيد المراجعة', en: 'Reviewing',   cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
  IN_PROGRESS: { ar: 'قيد التنفيذ',  en: 'In progress',  cls: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' },
  HIDDEN:      { ar: 'مخفي',         en: 'Hidden',       cls: 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300' },
  EXPIRED:     { ar: 'منتهي',        en: 'Expired',      cls: 'bg-gray-200 dark:bg-gray-700 text-gray-500' },
  ARCHIVED:    { ar: 'مؤرشف',        en: 'Archived',     cls: 'bg-gray-200 dark:bg-gray-700 text-gray-500' },
}

export default function MyPostsClient({ posts: initial }: { posts: MyPost[] }) {
  const { lang } = useLanguage()
  const router = useRouter()
  const confirmDialog = useConfirm()
  const tr = (en: string, ar: string) => (lang === 'en' ? en : ar)
  const [posts, setPosts] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  async function remove(id: string) {
    const ok = await confirmDialog({
      title: tr('Delete post', 'حذف المنشور'),
      message: tr('Delete this post permanently? This cannot be undone.', 'حذف هذا المنشور نهائياً؟ لا يمكن التراجع.'),
      confirmText: tr('Delete', 'حذف'),
    })
    if (!ok) return
    setBusy(id)
    try {
      const res = await fetch(`/api/posts/${id}`, { method: 'DELETE' })
      if (res.ok) { toast.success(tr('Deleted', 'تم الحذف')); setPosts((p) => p.filter((x) => x.id !== id)) }
      else { const d = await res.json().catch(() => ({})); toast.error(d.error || tr('Failed', 'فشل')) }
    } catch { toast.error(tr('Connection error', 'خطأ بالاتصال')) }
    finally { setBusy(null) }
  }

  const q = query.trim().toLowerCase()
  const filtered = q ? posts.filter((p) => (`${p.title ?? ''} ${p.body}`).toLowerCase().includes(q)) : posts
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <main className="min-h-dvh bg-gray-50 dark:bg-gray-900" style={{ paddingBottom: 'calc(var(--hai-safe-bottom, 0px) + 2rem)' }}>
      <header
        className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-4 py-3 flex items-center gap-3"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
      >
        <BackButton href="/profile" />
        <h1 className="text-lg font-bold text-gray-900 dark:text-white flex-1">{tr('My posts', 'منشوراتي')}</h1>
        <span className="text-xs text-gray-400">{posts.length}</span>
      </header>

      <div className="max-w-[640px] mx-auto px-4 py-4 space-y-2.5">
        {posts.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-5xl mb-3">📝</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm">{tr('You have no posts yet.', 'لا توجد لديك منشورات بعد.')}</p>
          </div>
        ) : (
          <>
            {posts.length > 6 && (
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tr('Search your posts…', 'ابحث في منشوراتك…')}
                className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 mb-1"
              />
            )}
            {filtered.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-10">{tr('No results', 'لا نتائج')}</p>
            ) : (
              filtered.map((p) => {
                const st = STATUS[p.status]
                const thumb = p.imageUrls?.[0]
                return (
                  <div key={p.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-3 flex gap-3">
                    <button onClick={() => router.push(`/feed?post=${p.id}`)} className="flex-1 min-w-0 text-start flex gap-3">
                      {thumb && <img src={thumb} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0 bg-gray-100 dark:bg-gray-700" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {p.title && <p className="text-sm font-semibold text-gray-900 dark:text-white truncate flex-1">{p.title}</p>}
                          {st && <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 flex-shrink-0 ${st.cls}`}>{lang === 'en' ? st.en : st.ar}</span>}
                        </div>
                        {p.body && <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">{p.body}</p>}
                        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
                          <span>{fmt(p.createdAt)}</span>
                          {p._count.reactions > 0 && <span className="flex items-center gap-0.5"><FiHeart className="w-3 h-3" />{p._count.reactions}</span>}
                          {p._count.comments > 0 && <span className="flex items-center gap-0.5"><FiMessageCircle className="w-3 h-3" />{p._count.comments}</span>}
                        </div>
                      </div>
                    </button>
                    <button onClick={() => remove(p.id)} disabled={busy === p.id} aria-label={tr('Delete', 'حذف')} className="self-start p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 flex-shrink-0">
                      <FiTrash2 className="w-4 h-4" />
                    </button>
                  </div>
                )
              })
            )}
          </>
        )}
      </div>
    </main>
  )
}
