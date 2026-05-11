'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'

export default function EditProfileClient({ initialName }: { initialName: string }) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [loading, setLoading] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { toast.error('أدخل اسمك'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error()
      toast.success('تم حفظ التغييرات')
      router.push('/profile')
    } catch {
      toast.error('فشل الحفظ، حاول مجدداً')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-white px-6 pt-12">
      <Link href="/profile" className="text-gray-400 text-sm mb-8 inline-block">← رجوع</Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-8">تعديل الملف الشخصي</h1>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">الاسم</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="input-field"
            placeholder="اسمك"
            maxLength={50}
          />
        </div>

        <button type="submit" disabled={loading} className="btn-primary mt-4">
          {loading ? 'جاري الحفظ...' : 'حفظ التغييرات'}
        </button>
      </form>
    </main>
  )
}
