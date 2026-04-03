'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'

export default function EditProfilePage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    fetch('/api/profile')
      .then(r => r.json())
      .then(data => { setName(data.name || ''); setFetching(false) })
      .catch(() => setFetching(false))
  }, [])

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

  if (fetching) return (
    <div className="min-h-screen flex items-center justify-center text-primary-600">
      <div className="hai-loader" style={{width:48,height:48}}><svg viewBox="0 0 64 64" fill="none" className="w-full h-full"><circle className="hai-dot hai-dot-center" cx="32" cy="35" r="6" fill="currentColor"/><circle className="hai-dot hai-dot-top" cx="32" cy="15" r="4" fill="currentColor"/><circle className="hai-dot hai-dot-br" cx="48" cy="47" r="4" fill="currentColor"/><circle className="hai-dot hai-dot-bl" cx="16" cy="47" r="4" fill="currentColor"/></svg></div>
    </div>
  )

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
