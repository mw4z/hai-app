'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { FiShield, FiUsers, FiFileText, FiMapPin, FiActivity, FiStar, FiMessageCircle, FiUser } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import HaiLoader, { HaiSpinner } from '@/components/HaiLoader'
import { useConfirm, usePrompt } from '@/components/ConfirmProvider'
import { getPrimaryBadge, getSecondaryBadge } from '@/lib/user-badge'
import MembershipPill from '@/components/MembershipPill'
import UserProfileSheet from '@/components/UserProfileSheet'
import { buildWhatsAppHref } from '@/lib/phone'
import type { TranslationKey } from '@/lib/i18n'

const ACTION_LABELS: Record<string, { ar: string; en: string }> = {
  hide_post: { ar: 'إخفاء منشور', en: 'Hide post' },
  restore_post: { ar: 'استعادة منشور', en: 'Restore post' },
  remove_post: { ar: 'حذف منشور', en: 'Remove post' },
  ban_user: { ar: 'حظر مستخدم', en: 'Ban user' },
  temp_ban_user: { ar: 'حظر مؤقت', en: 'Temp ban' },
  unban_user: { ar: 'رفع الحظر', en: 'Unban user' },
  delete_user: { ar: 'حذف مستخدم', en: 'Delete user' },
  change_role: { ar: 'تغيير الصلاحية', en: 'Change role' },
  change_plan: { ar: 'تغيير الباقة', en: 'Change plan' },
  remove_provider: { ar: 'إزالة شارة المزود', en: 'Remove provider' },
  approve_verification: { ar: 'قبول التوثيق', en: 'Approve verification' },
  reject_verification: { ar: 'رفض التوثيق', en: 'Reject verification' },
  set_reputation: { ar: 'تعديل السمعة', en: 'Set reputation' },
  review_reports: { ar: 'مراجعة البلاغات', en: 'Review reports' },
  dismiss_reports: { ar: 'تجاهل البلاغات', en: 'Dismiss reports' },
  approve_mod_request: { ar: 'قبول طلب إشراف', en: 'Approve mod request' },
  reject_mod_request: { ar: 'رفض طلب إشراف', en: 'Reject mod request' },
  approve_nbhd: { ar: 'قبول نقل حي', en: 'Approve transfer' },
  reject_nbhd: { ar: 'رفض نقل حي', en: 'Reject transfer' },
  reply_report: { ar: 'رد على بلاغ', en: 'Reply to report' },
  reply_ticket: { ar: 'رد على تذكرة', en: 'Reply to ticket' },
  close_ticket: { ar: 'إغلاق تذكرة', en: 'Close ticket' },
  send_email: { ar: 'إرسال بريد', en: 'Send email' },
  CONFLICT_BLOCKED: { ar: 'تم حظر الإجراء (تعارض)', en: 'Action blocked (conflict)' },
}

type Tab = 'overview' | 'posts' | 'reports' | 'requests' | 'verify' | 'mod_requests' | 'users' | 'nbhd_reports' | 'support' | 'logs' | 'seeds'

export default function AdminClient({
  role,
  adminName,
  initialDashboard = null,
}: {
  role: string
  adminName: string
  /** SSR'd overview payload (stats + recent logs). Lets the dashboard's
   *  first screen paint populated instead of fetching on mount. */
  initialDashboard?: { stats: any; recentLogs: any[] } | null
}) {
  const { t, lang } = useLanguage()
  const router = useRouter()
  const confirmDialog = useConfirm()
  const promptDialog = usePrompt()
  const [tab, setTab] = useState<Tab>('overview')
  // Open user-profile sheet (admin quick-view + contact actions)
  const [sheetUser, setSheetUser] = useState<any | null>(null)
  const [stats, setStats] = useState<any>(initialDashboard?.stats ?? null)
  const [reports, setReports] = useState<any[]>([])
  const [allPosts, setAllPosts] = useState<any[]>([])
  const [postSearch, setPostSearch] = useState('')
  const [postStatusFilter, setPostStatusFilter] = useState('')
  const [requests, setRequests] = useState<any[]>([])
  const [verifyReqs, setVerifyReqs] = useState<any[]>([])
  const [modReqs, setModReqs] = useState<any[]>([])
  const [supportTickets, setSupportTickets] = useState<any[]>([])
  const [nbhdReports, setNbhdReports] = useState<any[]>([])
  const [reportReply, setReportReply] = useState('')
  const [ticketReply, setTicketReply] = useState('')
  const [users, setUsers] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>(initialDashboard?.recentLogs ?? [])
  const [userSearch, setUserSearch] = useState('')

  // Seed control (SUPER_ADMIN only)
  const [seedStats, setSeedStats] = useState<any>(null)
  const [seedLoading, setSeedLoading] = useState(false)
  const [seedTargetPosts, setSeedTargetPosts] = useState(8)
  const [seedCommentsPerPost, setSeedCommentsPerPost] = useState(2)
  const [seedActionOn, setSeedActionOn] = useState<string | null>(null)
  const [seedSearch, setSeedSearch] = useState('')

  const isSuper = role === 'SUPER_ADMIN'

  // Refresh dashboard stats + recent logs live: fetch immediately on mount,
  // then every 15s while the overview tab is open and the page is visible,
  // and again whenever the user focuses the tab or returns from background.
  useEffect(() => {
    let cancelled = false
    async function refresh() {
      try {
        const res = await fetch('/api/admin/dashboard', { cache: 'no-store' })
        if (!res.ok) return
        const d = await res.json()
        if (cancelled) return
        setStats(d.stats)
        setLogs(d.recentLogs || [])
      } catch { /* ignore */ }
    }
    refresh()
    const interval = setInterval(() => {
      if (tab === 'overview' && document.visibilityState === 'visible') refresh()
    }, 15_000)
    function onVisible() {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refresh)
    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refresh)
    }
  }, [tab])

  useEffect(() => {
    if (tab === 'reports') fetchList('reported_posts', setReports)
    if (tab === 'posts') fetchPosts()
    if (tab === 'requests') fetchList('pending_requests', setRequests)
    if (tab === 'verify') fetchList('verification_requests', setVerifyReqs)
    if (tab === 'mod_requests') fetchList('mod_requests', setModReqs)
    if (tab === 'nbhd_reports') fetchList('neighborhood_reports', setNbhdReports)
    if (tab === 'support') fetchList('support_tickets', setSupportTickets)
    if (tab === 'users') fetchUsers()
    if (tab === 'seeds') fetchSeedStats()
  }, [tab, postStatusFilter])

  async function fetchSeedStats() {
    setSeedLoading(true)
    try {
      const res = await fetch('/api/admin/seed/stats')
      if (res.ok) setSeedStats(await res.json())
    } catch {}
    finally { setSeedLoading(false) }
  }

  async function seedGenerate(scope: 'one' | 'all', neighborhoodId?: string) {
    const label = scope === 'all'
      ? (lang === 'en' ? `Generate ${seedTargetPosts} posts in EVERY neighborhood?` : `إنشاء ${seedTargetPosts} منشور في كل حي؟`)
      : (lang === 'en' ? `Generate ${seedTargetPosts} posts here?` : `إنشاء ${seedTargetPosts} منشور في هذا الحي؟`)
    const ok = await confirmDialog({ message: label, confirmText: lang === 'en' ? 'Generate' : 'إنشاء' })
    if (!ok) return
    const key = scope === 'all' ? 'all' : neighborhoodId || 'one'
    setSeedActionOn(key)
    try {
      const res = await fetch('/api/admin/seed/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope,
          neighborhoodId,
          targetPosts: seedTargetPosts,
          commentsPerPost: seedCommentsPerPost,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        const partialNote = d.partial
          ? (lang === 'en' ? ` (${d.neighborhoods}/${d.requested} — rerun to continue)` : ` (${d.neighborhoods}/${d.requested} — أعد المحاولة للباقي)`)
          : ''
        toast.success(
          (lang === 'en'
            ? `+${d.totalPosts} posts, +${d.totalComments} comments${partialNote}`
            : `+${d.totalPosts} منشور، +${d.totalComments} تعليق${partialNote}`),
          { duration: 4500 },
        )
        if (d.errors && d.errors.length > 0) {
          console.error('[SEED] partial errors', d.errors)
          toast.error(
            lang === 'en'
              ? `${d.errors.length} neighborhood(s) failed — check console`
              : `فشل ${d.errors.length} حي — راجع وحدة التحكم`,
          )
        }
        fetchSeedStats()
      } else {
        const msg = d.error || (lang === 'en' ? 'Failed' : 'فشل')
        toast.error(typeof msg === 'string' ? msg : 'Failed')
      }
    } catch (err: any) {
      console.error('[SEED] network error', err)
      toast.error(
        (lang === 'en' ? 'Request timed out or network error' : 'انتهت المهلة أو خطأ في الشبكة'),
      )
    } finally {
      setSeedActionOn(null)
    }
  }

  async function seedClear(
    scope: 'posts' | 'comments' | 'all',
    neighborhoodId?: string,
    includeUsers = false,
  ) {
    const label = neighborhoodId
      ? (lang === 'en' ? `Clear seed ${scope} in this neighborhood?` : `حذف محتوى البذور (${scope}) في هذا الحي؟`)
      : (lang === 'en' ? `Clear seed ${scope} in ALL neighborhoods?${includeUsers ? ' (INCLUDING seed users)' : ''}` : `حذف محتوى البذور (${scope}) في كل الأحياء؟${includeUsers ? ' (مع المستخدمين)' : ''}`)
    const ok = await confirmDialog({
      message: label,
      variant: 'danger',
      confirmText: lang === 'en' ? 'Delete' : 'حذف',
    })
    if (!ok) return
    const key = neighborhoodId || (includeUsers ? 'clear-all-users' : 'clear-all')
    setSeedActionOn(key)
    try {
      const res = await fetch('/api/admin/seed/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ neighborhoodId, scope, includeUsers }),
      })
      const d = await res.json()
      if (res.ok) {
        toast.success(
          lang === 'en'
            ? `-${d.posts} posts, -${d.comments} comments, -${d.users} users`
            : `-${d.posts} منشور، -${d.comments} تعليق، -${d.users} مستخدم`,
        )
        fetchSeedStats()
      } else {
        toast.error(d.error || (lang === 'en' ? 'Failed' : 'فشل'))
      }
    } catch {
      toast.error(lang === 'en' ? 'Connection failed' : 'فشل الاتصال')
    } finally {
      setSeedActionOn(null)
    }
  }

  function fetchList(list: string, setter: (d: any[]) => void) {
    fetch(`/api/admin/lists?list=${list}`).then(r => r.json()).then(setter).catch(() => {})
  }
  function fetchPosts() {
    const params = new URLSearchParams({ list: 'all_posts', q: postSearch })
    if (postStatusFilter) params.set('status', postStatusFilter)
    fetch(`/api/admin/lists?${params}`).then(r => r.json()).then(setAllPosts).catch(() => {})
  }
  function fetchUsers() {
    fetch(`/api/admin/lists?list=users&q=${userSearch}`).then(r => r.json()).then(setUsers).catch(() => {})
  }

  // Open (or create) a 1:1 in-app chat with a user, then navigate to it.
  async function startChatWithUser(userId: string) {
    try {
      const res = await fetch('/api/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.threadId) {
        router.push(`/threads/${d.threadId}`)
        return
      }
      toast.error(d.message || d.error || (lang !== 'en' ? 'تعذّر بدء المحادثة' : 'Could not start chat'))
    } catch {
      toast.error(lang !== 'en' ? 'خطأ في الاتصال' : 'Connection error')
    }
  }

  async function doAction(action: string, targetId: string, reason?: string) {
    const res = await fetch('/api/admin/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, targetId, reason }),
    })
    if (res.ok) {
      toast.success(lang !== 'en' ? 'تم' : 'Done')
      if (tab === 'posts') fetchPosts()
      if (tab === 'reports') fetchList('reported_posts', setReports)
      if (tab === 'requests') fetchList('pending_requests', setRequests)
      if (tab === 'verify') fetchList('verification_requests', setVerifyReqs)
      if (tab === 'users') fetchUsers()
    } else {
      const d = await res.json()
      toast.error(d.error || (lang !== 'en' ? 'خطأ' : 'Error'))
    }
  }

  const TABS: { key: Tab; label: TranslationKey; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'admin_overview', icon: <FiActivity className="w-4 h-4" /> },
    { key: 'posts', label: 'admin_posts', icon: <FiFileText className="w-4 h-4" /> },
    { key: 'reports', label: 'admin_reports', icon: <FiFileText className="w-4 h-4" /> },
    { key: 'requests', label: 'admin_requests', icon: <FiMapPin className="w-4 h-4" /> },
    { key: 'verify', label: 'admin_verify' as TranslationKey, icon: <FiShield className="w-4 h-4" /> },
    ...(isSuper ? [{ key: 'mod_requests' as Tab, label: 'admin_mod_requests' as TranslationKey, icon: <FiStar className="w-4 h-4" /> }] : []),
    { key: 'nbhd_reports' as Tab, label: 'admin_nbhd_reports' as TranslationKey, icon: <FiShield className="w-4 h-4" /> },
    { key: 'support' as Tab, label: 'admin_support' as TranslationKey, icon: <FiStar className="w-4 h-4" /> },
    { key: 'users' as Tab, label: 'admin_users' as TranslationKey, icon: <FiUsers className="w-4 h-4" /> },
    { key: 'logs' as Tab, label: 'admin_logs' as TranslationKey, icon: <FiShield className="w-4 h-4" /> },
    ...(isSuper ? [{ key: 'seeds' as Tab, label: 'admin_seeds' as TranslationKey, icon: <FiActivity className="w-4 h-4" /> }] : []),
  ]

  const STATUS_FILTERS: { key: string; label: TranslationKey }[] = [
    { key: '', label: 'admin_filter_all' },
    { key: 'ACTIVE', label: 'admin_filter_active' },
    { key: 'HIDDEN', label: 'admin_filter_hidden' },
    { key: 'REMOVED', label: 'admin_filter_removed' },
    { key: 'IN_PROGRESS', label: 'admin_filter_progress' },
    { key: 'PENDING_AI', label: 'admin_filter_pending' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-primary-700 text-white px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-bold text-lg">{t('admin_title')}</h1>
            <p className="text-primary-200 text-xs">{adminName} · {role}</p>
          </div>
          <Link href="/feed" className="text-primary-200 text-sm underline">{t('admin_home')}</Link>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 px-2 py-2 bg-white border-b border-gray-100 overflow-x-auto">
        {TABS.map(tb => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              tab === tb.key ? 'bg-primary-600 text-white' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {tb.icon}{t(tb.label)}
          </button>
        ))}
      </div>

      <div className="p-4">
        {/* ─── Overview ─── */}
        {tab === 'overview' && (
          stats ? (
            <div className="grid grid-cols-2 gap-3">
              <StatCard label={t('admin_active_posts')} value={stats.totalPosts} />
              <StatCard label={lang === 'en' ? 'All users' : 'إجمالي المستخدمين'} value={stats.allUsers} />
              <StatCard label={t('admin_users_count')} value={stats.totalUsers} />
              <StatCard label={t('admin_pending_reports')} value={stats.reportedPosts} color="amber" />
              <StatCard label={t('admin_transfer_reqs')} value={stats.pendingRequests} color="blue" />
              <StatCard label={t('admin_removed')} value={stats.hiddenPosts} color="red" />
              <StatCard label={t('admin_banned')} value={stats.bannedUsers} color="red" />
            </div>
          ) : (
            <div className="py-8"><HaiLoader size="md" /></div>
          )
        )}

        {/* ─── All Posts ─── */}
        {tab === 'posts' && (
          <div>
            <div className="flex gap-2 mb-3 overflow-x-auto">
              {STATUS_FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setPostStatusFilter(f.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    postStatusFilter === f.key ? 'bg-primary-600 text-white' : 'bg-white border border-gray-200 text-gray-600'
                  }`}
                >
                  {t(f.label)}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mb-3">
              <input type="text" value={postSearch} onChange={e => setPostSearch(e.target.value)}
                placeholder={t('admin_search_posts')}
                className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
              <button onClick={fetchPosts} className="bg-primary-600 text-white text-xs px-4 rounded-lg">{t('admin_search')}</button>
            </div>
            <div className="space-y-3">
              {allPosts.length === 0 ? (
                <p className="text-center text-gray-400 py-8">{t('admin_no_posts')}</p>
              ) : allPosts.map((post: any) => (
                <div key={post.id} className="bg-white rounded-xl p-3 border border-gray-100">
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{post.title}</p>
                      <p className="text-xs text-gray-400">{post.author?.name || post.author?.phone} · {post.neighborhood?.name}</p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 ${
                      post.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                      post.status === 'HIDDEN' ? 'bg-amber-100 text-amber-700' :
                      post.status === 'REMOVED' ? 'bg-red-100 text-red-600' :
                      'bg-gray-100 text-gray-600'
                    }`}>{post.status}</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-3 line-clamp-2">{post.body}</p>
                  <div className="flex gap-2 flex-wrap">
                    {post.status === 'ACTIVE' && (
                      <ActionBtn onClick={() => doAction('hide_post', post.id)} color="amber">{t('admin_hide')}</ActionBtn>
                    )}
                    {isSuper && post.status !== 'REMOVED' && (
                      <ActionBtn onClick={() => doAction('remove_post', post.id)} color="red">{t('admin_delete')}</ActionBtn>
                    )}
                    {post.status !== 'ACTIVE' && (
                      <ActionBtn onClick={() => doAction('restore_post', post.id)} color="green">{t('admin_restore')}</ActionBtn>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Reported Posts ─── */}
        {tab === 'reports' && (
          <div className="space-y-3">
            {reports.length === 0 ? (
              <p className="text-center text-gray-400 py-8">{t('admin_no_reports')}</p>
            ) : reports.map((post: any) => (
              <div key={post.id} className="bg-white rounded-xl p-3 border border-gray-100">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{post.title}</p>
                    <p className="text-xs text-gray-400">{post.author?.name} · {post.neighborhood?.name}</p>
                  </div>
                  <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{post.reportCount} {t('admin_report_count')}</span>
                </div>
                <p className="text-xs text-gray-500 mb-3 line-clamp-2">{post.body}</p>
                <div className="flex gap-2 flex-wrap">
                  {post.status === 'ACTIVE' && (
                    <ActionBtn onClick={() => doAction('hide_post', post.id)} color="amber">{t('admin_hide')}</ActionBtn>
                  )}
                  {isSuper && (
                    <ActionBtn onClick={() => doAction('remove_post', post.id)} color="red">{t('admin_delete')}</ActionBtn>
                  )}
                  {post.status !== 'ACTIVE' && (
                    <ActionBtn onClick={() => doAction('restore_post', post.id)} color="green">{t('admin_restore')}</ActionBtn>
                  )}
                  <ActionBtn onClick={() => doAction('dismiss_reports', post.id)} color="gray">{t('admin_dismiss')}</ActionBtn>
                  <ActionBtn onClick={() => doAction('review_reports', post.id)} color="blue">{t('admin_reviewed')}</ActionBtn>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── Neighborhood Change Requests ─── */}
        {tab === 'requests' && (
          <div className="space-y-3">
            {requests.length === 0 ? (
              <p className="text-center text-gray-400 py-8">{t('admin_no_requests')}</p>
            ) : requests.map((r: any) => (
              <div key={r.id} className="bg-white rounded-xl p-3 border border-gray-100">
                <p className="text-sm font-medium text-gray-800">{r.userName || r.userPhone}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {t('admin_from')} <span className="font-medium">{r.fromName}</span> → {t('admin_to')} <span className="font-medium">{r.toName}</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">{t('admin_reason')} {r.reason} {r.customReason ? `— ${r.customReason}` : ''}</p>
                <div className="flex gap-2 mt-3">
                  <ActionBtn onClick={() => doAction('approve_nbhd_request', r.id)} color="green">{t('admin_approve')}</ActionBtn>
                  <ActionBtn onClick={() => doAction('reject_nbhd_request', r.id)} color="red">{t('admin_reject')}</ActionBtn>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── Verification Requests ─── */}
        {tab === 'verify' && (
          <div className="space-y-3">
            {verifyReqs.length === 0 ? (
              <p className="text-center text-gray-400 py-8">{t('admin_no_verify')}</p>
            ) : verifyReqs.map((v: any) => (
              <div key={v.id} className="bg-white rounded-xl p-3 border border-gray-100">
                <p className="text-sm font-medium text-gray-800">{v.userName || v.userPhone}</p>
                {v.businessName && <p className="text-xs text-primary-600 mt-0.5">{v.businessName}</p>}
                <p className="text-xs text-gray-500 mt-1">{v.description}</p>
                <div className="flex gap-2 mt-3">
                  <ActionBtn onClick={() => doAction('approve_verification', v.id)} color="green">🛡 {lang !== 'en' ? 'توثيق' : 'Verify'}</ActionBtn>
                  <ActionBtn onClick={() => doAction('reject_verification', v.id)} color="red">{t('admin_reject')}</ActionBtn>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── Mod Requests ─── */}
        {tab === 'mod_requests' && (
          <div className="space-y-3">
            {modReqs.length === 0 ? (
              <p className="text-center text-gray-400 py-8">{t('admin_no_mod_requests')}</p>
            ) : modReqs.map((m: any) => (
              <div key={m.id} className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-gray-800 dark:text-white flex-1">{m.userName || m.userPhone}</p>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{m.reputation || 0} {lang !== 'en' ? 'نقطة' : 'pts'}</span>
                </div>
                <p className="text-xs text-gray-400 mb-1">{m.userPhone} · {m.ageDays} {lang !== 'en' ? 'يوم' : 'days'}</p>
                <p className="text-xs text-primary-600 mb-1">{lang !== 'en' ? m.neighborhoodName : (m.neighborhoodNameEn || m.neighborhoodName)}</p>
                <p className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 rounded-lg p-2 mb-2">{m.reason}</p>
                <div className="flex gap-2">
                  <ActionBtn onClick={async () => { await doAction('approve_mod_request', m.id); fetchList('mod_requests', setModReqs) }} color="green">{t('admin_approve')}</ActionBtn>
                  <ActionBtn onClick={async () => { await doAction('reject_mod_request', m.id); fetchList('mod_requests', setModReqs) }} color="red">{t('admin_reject')}</ActionBtn>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── Neighborhood Reports ─── */}
        {tab === 'nbhd_reports' && (
          <div className="space-y-3">
            {nbhdReports.length === 0 ? (
              <p className="text-center text-gray-400 py-8">{lang !== 'en' ? 'لا توجد بلاغات' : 'No reports'}</p>
            ) : nbhdReports.map((r: any) => {
              const typeEmoji = { complaint: '⚠️', suggestion: '💡', issue: '🔧', other: '📝' }[r.type as string] || '📝'
              return (
                <div key={r.id} className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
                  <div className="flex items-start justify-between mb-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-white">{typeEmoji} {r.subject}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.status === 'open' ? 'bg-green-100 text-green-700' : r.status === 'resolved' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{r.status}</span>
                  </div>
                  <p className="text-xs text-gray-400 mb-1">{r.userName || r.userPhone} · {new Date(r.createdAt).toLocaleDateString()}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-300 mb-2 leading-relaxed">{r.body}</p>
                  {r.imageUrls?.length > 0 && (
                    <div className="flex gap-2 mb-2">{r.imageUrls.map((url: string, i: number) => (
                      <a key={i} href={url} target="_blank"><img src={url} alt="" className="w-14 h-14 object-cover rounded-lg border border-gray-200 dark:border-gray-700" /></a>
                    ))}</div>
                  )}
                  {r.reply ? (
                    <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-2"><p className="text-xs text-green-700 dark:text-green-300">{r.reply}</p></div>
                  ) : (
                    <div className="space-y-2">
                      <textarea placeholder={lang !== 'en' ? 'اكتب الرد...' : 'Write reply...'}
                        className="w-full border border-gray-200 dark:border-gray-600 rounded-lg p-2 text-xs bg-transparent text-gray-900 dark:text-white resize-none" rows={2}
                        onChange={e => setReportReply(e.target.value)} />
                      <button onClick={async () => {
                        if (!reportReply.trim()) return
                        await doAction('reply_neighborhood_report', r.id, reportReply)
                        setReportReply('')
                        fetchList('neighborhood_reports', setNbhdReports)
                      }} className="text-xs bg-primary-600 text-white px-3 py-1.5 rounded-lg font-medium">
                        {lang !== 'en' ? 'رد وحل' : 'Reply & Resolve'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ─── Support Tickets ─── */}
        {tab === 'support' && (
          <div className="space-y-3">
            {supportTickets.length === 0 ? (
              <p className="text-center text-gray-400 py-8">{t('admin_no_tickets')}</p>
            ) : supportTickets.map((ticket: any) => {
              const typeEmoji = { bug: '🐛', feature: '💡', complaint: '⚠️', other: '📝' }[ticket.type as string] || '📝'
              return (
                <div key={ticket.id} className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-white">{typeEmoji} {ticket.subject}</p>
                      <p className="text-xs text-gray-400">{ticket.userName || ticket.userPhone} · {new Date(ticket.createdAt).toLocaleDateString()}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      ticket.status === 'open' ? 'bg-green-100 text-green-700' :
                      ticket.status === 'in_progress' ? 'bg-amber-100 text-amber-700' :
                      ticket.status === 'resolved' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>{ticket.status}</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300 mb-2 leading-relaxed">{ticket.body}</p>
                  {ticket.imageUrls?.length > 0 && (
                    <div className="flex gap-2 mb-2 overflow-x-auto">
                      {ticket.imageUrls.map((url: string, i: number) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                          <img src={url} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-200 dark:border-gray-700" />
                        </a>
                      ))}
                    </div>
                  )}
                  {ticket.reply ? (
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2 mb-2">
                      <p className="text-xs text-blue-700 dark:text-blue-300">{ticket.reply}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <textarea placeholder={lang !== 'en' ? 'اكتب الرد...' : 'Write reply...'}
                        className="w-full border border-gray-200 dark:border-gray-600 rounded-lg p-2 text-xs bg-transparent text-gray-900 dark:text-white resize-none" rows={2}
                        onChange={e => setTicketReply(e.target.value)} />
                      <div className="flex gap-2">
                        <button onClick={async () => {
                          if (!ticketReply.trim()) return
                          await doAction('reply_ticket', ticket.id, ticketReply)
                          setTicketReply('')
                          fetchList('support_tickets', setSupportTickets)
                        }} className="text-xs bg-primary-600 text-white px-3 py-1.5 rounded-lg font-medium">
                          {lang !== 'en' ? 'رد وحل' : 'Reply & Resolve'}
                        </button>
                        <button onClick={async () => {
                          await doAction('close_ticket', ticket.id)
                          fetchList('support_tickets', setSupportTickets)
                        }} className="text-xs text-gray-500 px-3 py-1.5">
                          {lang !== 'en' ? 'إغلاق' : 'Close'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ─── Users ─── */}
        {tab === 'users' && (
          <div>
            <div className="flex gap-2 mb-3">
              <input type="text" value={userSearch} onChange={e => setUserSearch(e.target.value)}
                placeholder={t('admin_search_users')}
                className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
              <button onClick={fetchUsers} className="bg-primary-600 text-white text-xs px-4 rounded-lg">{t('admin_search')}</button>
            </div>
            <div className="space-y-2">
              {users.map((u: any) => {
                const fullName = [u.name, u.lastName].filter(Boolean).join(' ') || t('admin_no_name')
                const wa = buildWhatsAppHref(u.phone)
                return (
                <div key={u.id} className="bg-white rounded-xl p-3 border border-gray-100">
                  {/* Header: avatar + name + status pills (membership/role) */}
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => setSheetUser(u)}
                      className="w-11 h-11 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-lg overflow-hidden flex-shrink-0 active:scale-95"
                    >
                      {u.avatarUrl
                        ? <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                        : (fullName?.[0] || '؟')}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-semibold text-gray-800 truncate">{fullName}</p>
                        {u.status !== 'ACTIVE' && (
                          <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{u.status}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        {/* Admin context: show ALL membership states incl. verified */}
                        <MembershipPill membership={u.membership} showVerified />
                        {u.role !== 'RESIDENT' && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{u.role}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">{u.phone}{u.email ? ` · ${u.email}` : ''}</p>
                  {u.neighborhood && (
                    <p className="text-[11px] text-gray-400 mt-0.5">📍 {lang === 'en' ? (u.neighborhood.nameEn || u.neighborhood.name) : u.neighborhood.name}{u.neighborhood.city ? ` — ${lang === 'en' ? (u.neighborhood.city.nameEn || u.neighborhood.city.name) : u.neighborhood.city.name}` : ''}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {(() => {
                      const p = getPrimaryBadge(u.accountType || 'NORMAL', (u as any).providerStatus)
                      const s = getSecondaryBadge(u.reputation || 0)
                      return (
                        <>
                          {p && <span className="text-xs">{p.emoji} {lang !== 'en' ? p.ar : p.en}</span>}
                          {s && <span className="text-xs">{s.emoji} {lang !== 'en' ? s.ar : s.en}</span>}
                        </>
                      )
                    })()}
                    <span className="text-xs text-gray-400">{u.reputation || 0} {lang !== 'en' ? 'نقطة' : 'pts'}</span>
                    {isSuper && (
                      <button
                        onClick={async () => {
                          const val = await promptDialog({
                            message: lang !== 'en' ? 'أدخل النقاط الجديدة:' : 'Enter new reputation:',
                            defaultValue: String(u.reputation || 0),
                            inputType: 'number',
                          })
                          if (val !== null && !isNaN(Number(val))) {
                            doAction('set_reputation', u.id, undefined)
                            fetch('/api/admin/action', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'set_reputation', targetId: u.id, newReputation: Number(val) }),
                            }).then(r => { if (r.ok) { toast.success(lang !== 'en' ? 'تم' : 'Done'); fetchUsers() } })
                          }
                        }}
                        className="text-[10px] text-primary-600 underline"
                      >
                        {lang === 'en' ? 'Edit' : lang === 'ur' ? 'ترمیم' : 'تعديل'}
                      </button>
                    )}
                  </div>
                  {/* Contact actions: profile sheet / in-app DM / WhatsApp */}
                  <div className="flex items-center gap-1.5 mt-2.5">
                    <button
                      onClick={() => setSheetUser(u)}
                      className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-700 active:scale-95"
                    >
                      <FiUser className="w-3.5 h-3.5" /> {lang === 'en' ? 'Profile' : 'الملف'}
                    </button>
                    <button
                      onClick={() => startChatWithUser(u.id)}
                      className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-primary-50 text-primary-700 active:scale-95"
                    >
                      <FiMessageCircle className="w-3.5 h-3.5" /> {lang === 'en' ? 'Message' : 'محادثة'}
                    </button>
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-[#25D366]/15 text-[#1da851] active:scale-95"
                      >
                        <FiMessageCircle className="w-3.5 h-3.5" /> {lang === 'en' ? 'WhatsApp' : 'واتساب'}
                      </a>
                    )}
                  </div>

                  {(() => {
                    // Hide all actions if target outranks current admin
                    const ROLE_RANK: Record<string, number> = { RESIDENT: 0, NEIGHBORHOOD_MOD: 1, PLATFORM_MOD: 2, SUPER_ADMIN: 3 }
                    const myRank = ROLE_RANK[role] ?? 0
                    const targetRank = ROLE_RANK[u.role] ?? 0
                    if (targetRank >= myRank) return null // can't control equal or higher rank
                    return (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {u.status === 'ACTIVE' ? (
                          <>
                            <ActionBtn onClick={() => doAction('temp_ban_user', u.id)} color="amber">{t('admin_temp_ban')}</ActionBtn>
                            {isSuper && <ActionBtn onClick={() => doAction('ban_user', u.id)} color="red">{t('admin_perm_ban')}</ActionBtn>}
                          </>
                        ) : (
                          <ActionBtn onClick={() => doAction('unban_user', u.id)} color="green">{t('admin_unban')}</ActionBtn>
                        )}
                        {isSuper && u.role === 'RESIDENT' && (
                          <>
                            <ActionBtn onClick={() => doAction('change_role', u.id, 'NEIGHBORHOOD_MOD')} color="blue">{t('admin_nbhd_mod')}</ActionBtn>
                            <ActionBtn onClick={() => doAction('change_role', u.id, 'PLATFORM_MOD')} color="indigo">{t('admin_platform_mod')}</ActionBtn>
                          </>
                        )}
                        {isSuper && u.role !== 'RESIDENT' && u.role !== 'SUPER_ADMIN' && (
                          <ActionBtn onClick={() => doAction('change_role', u.id, 'RESIDENT')} color="gray">{t('admin_remove_role')}</ActionBtn>
                        )}
                        {isSuper && (u.accountType === 'SERVICE_PROVIDER' || u.accountType === 'VERIFIED_PROVIDER') && (
                          <ActionBtn onClick={() => doAction('remove_provider', u.id)} color="gray">{lang !== 'en' ? 'إزالة الشارة' : 'Remove badge'}</ActionBtn>
                        )}
                        {isSuper && u.role !== 'SUPER_ADMIN' && (
                          <ActionBtn onClick={async () => {
                            const ok = await confirmDialog({
                              message: t('admin_delete_confirm'),
                              variant: 'danger',
                              confirmText: t('admin_delete_user'),
                            })
                            if (ok) doAction('delete_user', u.id)
                          }} color="redbg">{t('admin_delete_user')}</ActionBtn>
                        )}
                        {isSuper && u.email && (
                          <ActionBtn onClick={async () => {
                            const subject = await promptDialog({
                              message: lang !== 'en' ? 'عنوان البريد:' : 'Email subject:',
                              placeholder: lang !== 'en' ? 'عنوان' : 'Subject',
                            })
                            if (!subject) return
                            const body = await promptDialog({
                              message: lang !== 'en' ? 'محتوى البريد:' : 'Email body:',
                              placeholder: lang !== 'en' ? 'المحتوى' : 'Body',
                              multiline: true,
                            })
                            if (!body) return
                            fetch('/api/admin/action', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'send_email', targetId: u.id, emailSubject: subject, emailBody: body }),
                            }).then(async r => {
                              const d = await r.json()
                              if (r.ok) toast.success(lang !== 'en' ? `تم الإرسال إلى ${d.sentTo}` : `Sent to ${d.sentTo}`)
                              else toast.error(d.error || 'Error')
                            })
                          }} color="blue">
                            {lang !== 'en' ? `📧 إرسال بريد (${u.email})` : `📧 Email (${u.email})`}
                          </ActionBtn>
                        )}
                      </div>
                    )
                  })()}
                </div>
                )
              })}
            </div>
            {sheetUser && (
              <UserProfileSheet
                profileUserId={sheetUser.id}
                onClose={() => setSheetUser(null)}
                extraActions={
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { const id = sheetUser.id; setSheetUser(null); startChatWithUser(id) }}
                      className="flex-1 flex items-center justify-center gap-2 bg-primary-600 text-white rounded-xl py-2.5 text-sm font-semibold active:scale-95 transition-transform"
                    >
                      <FiMessageCircle className="w-4 h-4" /> {lang === 'en' ? 'Message' : 'محادثة'}
                    </button>
                    {buildWhatsAppHref(sheetUser.phone) && (
                      <a
                        href={buildWhatsAppHref(sheetUser.phone)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 bg-[#25D366] text-white rounded-xl py-2.5 text-sm font-semibold active:scale-95 transition-transform"
                      >
                        <FiMessageCircle className="w-4 h-4" /> {lang === 'en' ? 'WhatsApp' : 'واتساب'}
                      </a>
                    )}
                  </div>
                }
              />
            )}
          </div>
        )}

        {/* ─── Logs ─── */}
        {tab === 'logs' && (
          <div className="space-y-2">
            {logs.length === 0 ? (
              <p className="text-center text-gray-400 py-8">{t('admin_no_logs')}</p>
            ) : logs.map((log: any) => (
              <div key={log.id} className="bg-white rounded-xl p-3 border border-gray-100">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-700">{log.adminName || 'Admin'} — {ACTION_LABELS[log.action]?.[lang === 'en' ? 'en' : 'ar'] || log.action}</p>
                  <p className="text-[10px] text-gray-400">{new Date(log.createdAt).toLocaleDateString(lang !== 'en' ? 'ar-SA' : 'en')}</p>
                </div>
                {(log.reason || log.details) && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {log.reason || ''}{log.details ? ` (${log.details})` : ''}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* SUPER_ADMIN content seed control */}
        {tab === 'seeds' && isSuper && (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm font-bold text-amber-900 mb-1">
                {lang === 'en' ? '🌱 Content Seed Control' : '🌱 التحكم في محتوى البذور'}
              </p>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                {lang === 'en'
                  ? 'Generate or clear auto-content (users, posts, comments) per neighborhood. Used to bootstrap empty neighborhoods so the feed doesn\'t look dead to new real users.'
                  : 'أنشئ أو احذف المحتوى التلقائي (مستخدمين، منشورات، تعليقات) لكل حي. يُستخدم لملء الأحياء الفارغة حتى لا يبدو الفيد فارغاً للمستخدمين الجدد.'}
              </p>
            </div>

            {/* Global stats */}
            {seedLoading && !seedStats ? (
              <div className="py-8"><HaiLoader size="md" /></div>
            ) : seedStats ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <StatCard
                    label={lang === 'en' ? 'Seed users' : 'مستخدمون'}
                    value={seedStats.totalSeedUsers}
                  />
                  <StatCard
                    label={lang === 'en' ? 'Seed posts' : 'منشورات'}
                    value={seedStats.totalSeedPosts}
                  />
                  <StatCard
                    label={lang === 'en' ? 'Seed comments' : 'تعليقات'}
                    value={seedStats.totalSeedComments}
                  />
                </div>

                {/* Control inputs */}
                <div className="bg-white rounded-xl p-4 border border-gray-100 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">
                      {lang === 'en' ? 'Target posts per neighborhood' : 'عدد المنشورات لكل حي'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={30}
                      value={seedTargetPosts}
                      onChange={(e) => setSeedTargetPosts(Math.max(0, Math.min(30, Number(e.target.value) || 0)))}
                      className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">
                      {lang === 'en' ? 'Comments per seed post' : 'تعليقات لكل منشور'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={seedCommentsPerPost}
                      onChange={(e) => setSeedCommentsPerPost(Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
                      className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm"
                    />
                  </div>

                  {/* Global actions */}
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => seedGenerate('all')}
                      disabled={seedActionOn === 'all'}
                      className="py-2.5 bg-primary-600 text-white font-bold text-xs rounded-lg active:scale-95 disabled:opacity-50"
                    >
                      {seedActionOn === 'all'
                        ? (lang === 'en' ? 'Generating...' : 'جاري الإنشاء...')
                        : (lang === 'en' ? '+ Seed ALL neighborhoods' : '+ بذر كل الأحياء')}
                    </button>
                    <button
                      type="button"
                      onClick={() => seedClear('all')}
                      disabled={seedActionOn === 'clear-all'}
                      className="py-2.5 bg-red-600 text-white font-bold text-xs rounded-lg active:scale-95 disabled:opacity-50"
                    >
                      {seedActionOn === 'clear-all'
                        ? (lang === 'en' ? 'Clearing...' : 'جاري الحذف...')
                        : (lang === 'en' ? '✕ Clear ALL seed content' : '✕ حذف كل محتوى البذور')}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => seedClear('all', undefined, true)}
                    disabled={seedActionOn === 'clear-all-users'}
                    className="w-full py-2 bg-red-50 text-red-600 border border-red-200 font-semibold text-[11px] rounded-lg active:scale-95 disabled:opacity-50"
                  >
                    {seedActionOn === 'clear-all-users'
                      ? (lang === 'en' ? 'Clearing...' : 'جاري الحذف...')
                      : (lang === 'en' ? '⚠ Nuke seed content + seed users' : '⚠ احذف المحتوى + المستخدمين')}
                  </button>
                </div>

                {/* Per-neighborhood table */}
                <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100">
                  <div className="px-3 py-2 bg-gray-50 flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-600 flex-shrink-0">
                      {lang === 'en' ? `Neighborhoods (${seedStats.perNeighborhood.length})` : `الأحياء (${seedStats.perNeighborhood.length})`}
                    </span>
                    <input
                      type="text"
                      value={seedSearch}
                      onChange={(e) => setSeedSearch(e.target.value)}
                      placeholder={lang === 'en' ? 'Search...' : 'بحث...'}
                      className="flex-1 min-w-0 px-2 py-1 text-xs rounded-md bg-white border border-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-400"
                    />
                    {seedSearch && (
                      <button
                        type="button"
                        onClick={() => setSeedSearch('')}
                        className="text-[10px] text-gray-400 px-1"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  {seedStats.perNeighborhood
                    .filter((n: any) => {
                      if (!seedSearch.trim()) return true
                      const q = seedSearch.trim().toLowerCase()
                      return (
                        n.name.toLowerCase().includes(q) ||
                        (n.nameEn || '').toLowerCase().includes(q)
                      )
                    })
                    .map((n: any) => (
                    <div key={n.id} className="px-3 py-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">
                            {lang === 'en' ? n.nameEn || n.name : n.name}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {lang === 'en' ? 'seed' : 'بذور'}: {n.seedPosts}📝 {n.seedComments}💬 · {lang === 'en' ? 'real' : 'حقيقي'}: {n.realPosts}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => seedGenerate('one', n.id)}
                          disabled={seedActionOn === n.id}
                          className="flex-1 py-1.5 bg-primary-600 text-white text-[10px] font-bold rounded-lg active:scale-95 disabled:opacity-50"
                        >
                          {seedActionOn === n.id
                            ? <HaiSpinner />
                            : (lang === 'en' ? '+ Seed' : '+ بذر')}
                        </button>
                        <button
                          type="button"
                          onClick={() => seedClear('posts', n.id)}
                          disabled={seedActionOn === n.id}
                          className="flex-1 py-1.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-lg active:scale-95 disabled:opacity-50"
                        >
                          {lang === 'en' ? '✕ Posts' : '✕ منشورات'}
                        </button>
                        <button
                          type="button"
                          onClick={() => seedClear('comments', n.id)}
                          disabled={seedActionOn === n.id}
                          className="flex-1 py-1.5 bg-red-50 text-red-600 text-[10px] font-bold rounded-lg active:scale-95 disabled:opacity-50"
                        >
                          {lang === 'en' ? '✕ Comments' : '✕ تعليقات'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-center text-gray-400 py-8">{lang === 'en' ? 'Failed to load' : 'فشل التحميل'}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, color = 'gray' }: { label: string; value: number; color?: string }) {
  const styles: Record<string, { bg: string; border: string; text: string; sub: string }> = {
    gray:  { bg: 'bg-white dark:bg-slate-800', border: 'border-gray-100 dark:border-slate-700', text: 'text-gray-900 dark:text-white', sub: 'text-gray-500 dark:text-gray-400' },
    amber: { bg: 'bg-amber-500', border: 'border-amber-600', text: 'text-white', sub: 'text-amber-100' },
    blue:  { bg: 'bg-blue-500', border: 'border-blue-600', text: 'text-white', sub: 'text-blue-100' },
    red:   { bg: 'bg-red-500', border: 'border-red-600', text: 'text-white', sub: 'text-red-100' },
  }
  const s = styles[color] || styles.gray
  return (
    <div className={`rounded-xl p-3 border ${s.bg} ${s.border}`}>
      <p className={`text-2xl font-bold ${s.text}`}>{value}</p>
      <p className={`text-xs ${s.sub}`}>{label}</p>
    </div>
  )
}

function ActionBtn({ onClick, color, children }: { onClick: () => void; color: string; children: React.ReactNode }) {
  const styles: Record<string, string> = {
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-600',
    redbg: 'bg-red-500 text-white',
    green: 'bg-green-100 text-green-700',
    blue: 'bg-blue-100 text-blue-600',
    indigo: 'bg-indigo-100 text-indigo-600',
    gray: 'bg-gray-100 text-gray-600',
  }
  return (
    <button onClick={onClick} className={`text-xs px-3 py-2 rounded-lg active:scale-95 transition-transform ${styles[color] || styles.gray}`}>
      {children}
    </button>
  )
}
