import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-6">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 max-w-sm w-full text-center">
        <div className="text-5xl mb-4">🔍</div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
          الصفحة غير موجودة
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Page not found
        </p>
        <Link
          href="/feed"
          className="inline-block bg-primary-600 text-white py-2.5 px-8 rounded-xl text-sm font-semibold active:scale-95 transition-transform"
        >
          الرئيسية
        </Link>
      </div>
    </div>
  )
}
