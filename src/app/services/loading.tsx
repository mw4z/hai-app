'use client'

// Services redirects to Market — just show a spinner
export default function ServicesLoading() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[var(--bg)] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
