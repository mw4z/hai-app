import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import Link from 'next/link'
import RiyalIcon from '@/components/RiyalIcon'

const PRICING: Record<string, { label: string; price: number }[]> = {
  MARKETPLACE:     [{ label: 'إعلان عادي', price: 10 }, { label: 'إعلان بارز', price: 30 }],
  HOME_BUSINESSES: [{ label: 'نشر يومي', price: 10 }, { label: 'نشر أسبوعي', price: 25 }],
  REAL_ESTATE:     [{ label: 'إعلان عادي', price: 20 }, { label: 'إعلان بارز', price: 50 }],
  SERVICES:        [{ label: 'إدراج شهري', price: 50 }, { label: 'إدراج بارز', price: 150 }],
}

export default async function PayPage({ params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const post = await db.post.findUnique({
    where: { id: params.id, authorId: session.userId },
  })

  if (!post) redirect('/feed')

  // Phase 3 read-flag-on era: read v2 column directly. Falls through
  // to the default plan if category is null (pre-Phase-2 row).
  const plans = (post.category && PRICING[post.category]) || [{ label: 'نشر', price: 10 }]

  return (
    <main className="min-h-screen bg-white dark:bg-gray-900 flex flex-col px-4 pt-10">
      <Link href="/feed" className="text-gray-400 dark:text-gray-500 text-sm mb-6 inline-block">← إلغاء</Link>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">اختر خطة النشر</h1>
      <p className="text-gray-500 dark:text-gray-400 text-sm mb-8">إعلانك جاهز — اختر كيف تريد نشره</p>

      <div className="space-y-3 mb-8">
        {plans.map((plan, i) => (
          <div
            key={i}
            className={`border-2 rounded-2xl p-4 ${i === 1 ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30' : 'border-gray-200 dark:border-gray-700'}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">{plan.label}</p>
                {i === 1 && <p className="text-xs text-primary-600 dark:text-primary-400 mt-0.5">الأكثر مشاهدة ⭐</p>}
              </div>
              <span className="text-xl font-bold text-primary-600 dark:text-primary-400">{plan.price} <RiyalIcon /></span>
            </div>
          </div>
        ))}
      </div>

      {/* Payment coming soon notice */}
      <div className="bg-amber-50 dark:bg-amber-900/30 rounded-2xl p-4 mb-6">
        <p className="text-amber-800 dark:text-amber-300 font-medium text-sm">💳 الدفع قريباً</p>
        <p className="text-amber-700 dark:text-amber-400 text-xs mt-1">
          سيتم تفعيل الدفع عبر Moyasar قريباً. في الوقت الحالي سيتم نشر إعلانك مجاناً.
        </p>
      </div>

      <form action={`/api/posts/${params.id}/activate`} method="POST">
        <button type="submit" className="btn-primary">
          نشر الإعلان الآن
        </button>
      </form>
    </main>
  )
}
