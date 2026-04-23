'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f9fafb',
          padding: '24px',
          fontFamily: 'Noto Sans Arabic, Tahoma, Arial, sans-serif',
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
            padding: '24px',
            maxWidth: '360px',
            width: '100%',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>
              حدث خطأ غير متوقع
            </h2>
            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
              Something went wrong. Please try again.
            </p>
            <button
              onClick={reset}
              style={{
                backgroundColor: '#00a884',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                padding: '10px 24px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              حاول مرة أخرى
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
