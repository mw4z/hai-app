'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { useLanguage } from '@/hooks/useLanguage'
import { FiArrowRight, FiArrowLeft, FiAlertTriangle, FiEyeOff, FiUserX, FiActivity, FiFileText } from 'react-icons/fi'
import BottomNav from '@/components/BottomNav'
import EmergencyCreator from '@/components/EmergencyCreator'

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

type Tab = 'reports' | 'user_reports' | 'hidden' | 'banned' | 'activity'

interface Props {
  data: {
    user: { name: string | null; role: string; neighborhood: string; neighborhoodEn: string }
    reportedPosts: any[]
    hiddenPosts: any[]
    bannedUsers: any[]
    recentLogs: any[]
    userReports: any[]
    stats: { activePosts: number; reportedPosts: number; totalUsers: number; myActions: number }
  }
}

const USER_REPORT_REASON_LABELS: Record<string, { ar: string; en: string }> = {
  IMPERSONATION:         { ar: 'حساب مزيف / انتحال شخصية',  en: 'Fake account / impersonation' },
  SCAM_FRAUD:            { ar: 'احتيال أو نصب',              en: 'Scam or fraud' },
  HARASSMENT:            { ar: 'تحرش أو تواصل غير مرغوب',    en: 'Harassment' },
  ABUSIVE_LANGUAGE:      { ar: 'إساءة لفظية أو تهديد',        en: 'Abusive language / threats' },
  SPAM:                  { ar: 'سبام أو إعلانات مزعجة',       en: 'Spam' },
  INAPPROPRIATE_PROFILE: { ar: 'محتوى ملف شخصي غير لائق',     en: 'Inappropriate profile' },
  OTHER:                 { ar: 'سبب آخر',                     en: 'Other' },
}

const USER_REPORT_SOURCE_LABELS: Record<string, { ar: string; en: string }> = {
  PROFILE:     { ar: 'الملف الشخصي', en: 'Profile' },
  POST:        { ar: 'منشور',         en: 'Post' },
  CHAT:        { ar: 'محادثة',        en: 'Chat' },
  MARKETPLACE: { ar: 'السوق',         en: 'Marketplace' },
  PROVIDER:    { ar: 'مقدم خدمة',     en: 'Provider' },
}

export default function ModDashboard({ data }: Props) {
  const { t, lang } = useLanguage()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('reports')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const dn = (ar: string, en: string) => lang === 'en' ? en : ar

  async function modAction(action: string, payload: Record<string, any>) {
    if (actionLoading) return
    setActionLoading(action + JSON.stringify(payload))
    try {
      const res = await fetch('/api/admin/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      })
      if (res.ok) {
        toast.success(dn('تم', 'Done'))
        router.refresh()
      } else {
        const d = await res.json()
        if (d.canEscalate) {
          // Conflict of interest — offer escalation
          toast.error(dn('تعارض مصالح — يمكنك التصعيد', 'Conflict of interest — you can escalate'))
        } else {
          toast.error(d.error || 'Error')
        }
      }
    } catch { toast.error('Error') }
    finally { setActionLoading(null) }
  }

  async function escalatePost(postId: string) {
    if (actionLoading) return
    setActionLoading('escalate-' + postId)
    try {
      const res = await fetch('/api/admin/escalate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, reason: dn('تصعيد بسبب تعارض مصالح أو حاجة لمراجعة أعلى', 'Escalated due to conflict of interest or need for higher review') }),
      })
      if (res.ok) {
        toast.success(dn('تم التصعيد للمشرف الأعلى', 'Escalated to platform admin'))
      } else {
        toast.error('Error')
      }
    } catch { toast.error('Error') }
    finally { setActionLoading(null) }
  }

  const tabs: { key: Tab; icon: React.ReactNode; ar: string; en: string; count?: number }[] = [
    { key: 'reports', icon: <FiAlertTriangle className="w-4 h-4" />, ar: 'بلاغات المنشورات', en: 'Post reports', count: data.reportedPosts.length },
    { key: 'user_reports', icon: <FiUserX className="w-4 h-4" />, ar: 'بلاغات المستخدمين', en: 'User reports', count: data.userReports.length },
    { key: 'hidden', icon: <FiEyeOff className="w-4 h-4" />, ar: 'المخفية', en: 'Hidden', count: data.hiddenPosts.length },
    { key: 'banned', icon: <FiUserX className="w-4 h-4" />, ar: 'المحظورين', en: 'Banned', count: data.bannedUsers.length },
    { key: 'activity', icon: <FiActivity className="w-4 h-4" />, ar: 'نشاطي', en: 'My Activity' },
  ]

  async function resolveUserReport(reportId: string, status: 'REVIEWED' | 'DISMISSED' | 'ACTION_TAKEN') {
    if (actionLoading) return
    setActionLoading(`ur-${status}-${reportId}`)
    try {
      const res = await fetch(`/api/admin/user-reports/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        toast.success(dn('تم', 'Done'))
        router.refresh()
      } else {
        const d = await res.json()
        toast.error(d.error || 'Error')
      }
    } catch { toast.error('Error') }
    finally { setActionLoading(null) }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/profile" className="text-gray-400">
            {lang !== 'en' ? <FiArrowRight className="w-5 h-5" /> : <FiArrowLeft className="w-5 h-5" />}
          </Link>
          <div className="flex-1">
            <h1 className="font-bold text-gray-900 dark:text-white">{dn('لوحة المشرف', 'Mod Dashboard')}</h1>
            <p className="text-[11px] text-gray-400">{data.user.neighborhood} · 🏅 {dn('مشرف الحي', 'Neighborhood Mod')}</p>
          </div>
        </div>
      </header>

      {/* Emergency alert creator — top-of-dashboard ─── */}
      <div className="px-4 pt-4">
        <EmergencyCreator />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2.5 px-4 pt-2 pb-2">
        {[
          { label: dn('منشورات', 'Posts'), value: data.stats.activePosts },
          { label: dn('بلاغات', 'Reports'), value: data.stats.reportedPosts },
          { label: dn('مستخدمين', 'Users'), value: data.stats.totalUsers },
          { label: dn('إجراءاتي', 'Actions'), value: data.stats.myActions },
        ].map((s, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl py-3 px-2 text-center">
            <div className="text-xl font-bold text-gray-900 dark:text-white">{s.value}</div>
            <div className="text-[9px] text-gray-400 mt-0.5 leading-tight">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 px-4 pt-2 pb-3 overflow-x-auto">
        {tabs.map(tb => (
          <button key={tb.key} onClick={() => setTab(tb.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
              tab === tb.key
                ? 'bg-primary-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400'
            }`}
          >
            {tb.icon}
            {dn(tb.ar, tb.en)}
            {tb.count !== undefined && tb.count > 0 && (
              <span className={`min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold ${
                tab === tb.key ? 'bg-white/20 text-white' : 'bg-red-500 text-white'
              }`}>{tb.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-4 space-y-3">

        {/* Reports Tab */}
        {tab === 'reports' && (
          data.reportedPosts.length === 0 ? (
            <EmptyState icon="✅" text={dn('لا يوجد بلاغات', 'No reports')} />
          ) : (
            data.reportedPosts.map(post => (
              <div key={post.id} className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{post.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{post.author?.name} · {post.author?.reputation} rep</p>
                  </div>
                  <span className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                    {post.reportCount} {dn('بلاغ', 'reports')}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">{post.body}</p>
                <div className="flex gap-2">
                  <button onClick={() => modAction('hide_post', { targetId: post.id, reason: 'Reported content' })}
                    disabled={!!actionLoading}
                    className="flex-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 py-2 rounded-xl text-xs font-medium disabled:opacity-50">
                    {dn('إخفاء', 'Hide')}
                  </button>
                  <button onClick={() => modAction('dismiss_reports', { targetId: post.id })}
                    disabled={!!actionLoading}
                    className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 py-2 rounded-xl text-xs font-medium disabled:opacity-50">
                    {dn('تجاهل', 'Dismiss')}
                  </button>
                  <button onClick={() => escalatePost(post.id)}
                    disabled={!!actionLoading}
                    className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 py-2 px-2.5 rounded-xl text-xs font-medium disabled:opacity-50"
                    title={dn('تصعيد', 'Escalate')}>
                    ⬆
                  </button>
                  <Link href={`/post/${post.id}`}
                    className="bg-gray-100 dark:bg-gray-700 text-gray-500 p-2 rounded-xl">
                    <FiFileText className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))
          )
        )}

        {/* User Reports Tab */}
        {tab === 'user_reports' && (
          data.userReports.length === 0 ? (
            <EmptyState icon="✅" text={dn('لا يوجد بلاغات عن مستخدمين', 'No user reports')} />
          ) : (
            data.userReports.map((r: any) => {
              const reasonLabel = USER_REPORT_REASON_LABELS[r.reason] || { ar: r.reason, en: r.reason }
              const sourceLabel = USER_REPORT_SOURCE_LABELS[r.source] || { ar: r.source, en: r.source }
              return (
                <div key={r.id} className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
                  <div className="flex items-start justify-between mb-2 gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {r.reportedUser?.name || dn('مستخدم', 'User')}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {dn(reasonLabel.ar, reasonLabel.en)} · {dn(sourceLabel.ar, sourceLabel.en)}
                      </p>
                    </div>
                    <span className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                      {dn('بلاغ', 'Report')}
                    </span>
                  </div>
                  {r.details && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3 mb-2 bg-gray-50 dark:bg-gray-900/40 rounded-lg px-2 py-1.5">
                      {r.details}
                    </p>
                  )}
                  <p className="text-[11px] text-gray-400 mb-3">
                    {dn('المُبلِّغ', 'Reporter')}: {r.reporter?.name || dn('مجهول', 'Unknown')}
                    {typeof r.reporter?.reputation === 'number' && ` · ${r.reporter.reputation} rep`}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => resolveUserReport(r.id, 'ACTION_TAKEN')}
                      disabled={!!actionLoading}
                      className="flex-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 py-2 rounded-xl text-xs font-medium disabled:opacity-50"
                    >
                      {dn('اتخاذ إجراء', 'Action taken')}
                    </button>
                    <button
                      onClick={() => resolveUserReport(r.id, 'REVIEWED')}
                      disabled={!!actionLoading}
                      className="flex-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 py-2 rounded-xl text-xs font-medium disabled:opacity-50"
                    >
                      {dn('مُراجَع', 'Reviewed')}
                    </button>
                    <button
                      onClick={() => resolveUserReport(r.id, 'DISMISSED')}
                      disabled={!!actionLoading}
                      className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 py-2 rounded-xl text-xs font-medium disabled:opacity-50"
                    >
                      {dn('تجاهل', 'Dismiss')}
                    </button>
                    <Link
                      href={r.postId
                        ? `/post/${r.postId}`
                        : r.conversationId
                          ? `/threads/${r.conversationId}`
                          : '#'}
                      className={`bg-gray-100 dark:bg-gray-700 text-gray-500 p-2 rounded-xl ${(!r.postId && !r.conversationId) ? 'pointer-events-none opacity-40' : ''}`}
                      title={dn('فتح السياق', 'Open context')}
                    >
                      <FiFileText className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              )
            })
          )
        )}

        {/* Hidden Tab */}
        {tab === 'hidden' && (
          data.hiddenPosts.length === 0 ? (
            <EmptyState icon="📂" text={dn('لا يوجد منشورات مخفية', 'No hidden posts')} />
          ) : (
            data.hiddenPosts.map(post => (
              <div key={post.id} className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{post.title}</p>
                  <p className="text-[11px] text-gray-400">{post.author?.name} · {post.category}</p>
                </div>
                <button onClick={() => modAction('restore_post', { targetId: post.id })}
                  disabled={!!actionLoading}
                  className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-3 py-1.5 rounded-xl text-xs font-medium disabled:opacity-50">
                  {dn('استعادة', 'Restore')}
                </button>
              </div>
            ))
          )
        )}

        {/* Banned Tab */}
        {tab === 'banned' && (
          data.bannedUsers.length === 0 ? (
            <EmptyState icon="👥" text={dn('لا يوجد مستخدمين محظورين', 'No banned users')} />
          ) : (
            data.bannedUsers.map(user => (
              <div key={user.id} className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{user.name}</p>
                  <p className="text-[11px] text-gray-400">{user.status === 'BANNED_TEMP' ? dn('حظر مؤقت', 'Temp ban') : dn('حظر دائم', 'Perm ban')} · {user.reputation} rep</p>
                </div>
                {user.status === 'BANNED_TEMP' && (
                  <button onClick={() => modAction('unban_user', { targetId: user.id })}
                    disabled={!!actionLoading}
                    className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-3 py-1.5 rounded-xl text-xs font-medium disabled:opacity-50">
                    {dn('رفع الحظر', 'Unban')}
                  </button>
                )}
              </div>
            ))
          )
        )}

        {/* Activity Tab */}
        {tab === 'activity' && (
          data.recentLogs.length === 0 ? (
            <EmptyState icon="📋" text={dn('لا يوجد إجراءات بعد', 'No actions yet')} />
          ) : (
            data.recentLogs.map(log => (
              <div key={log.id} className="bg-white dark:bg-gray-800 rounded-2xl p-3 border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{ACTION_LABELS[log.action]?.[lang === 'en' ? 'en' : 'ar'] || log.action}</span>
                  <span className="text-[10px] text-gray-400">
                    {new Date(log.createdAt).toLocaleDateString(lang !== 'en' ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                {log.reason && <p className="text-[11px] text-gray-400 mt-1">{log.reason}</p>}
              </div>
            ))
          )
        )}
      </div>

      <BottomNav active="mod" />
    </div>
  )
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="text-center py-12">
      <div className="text-3xl mb-2">{icon}</div>
      <p className="text-sm text-gray-400">{text}</p>
    </div>
  )
}
