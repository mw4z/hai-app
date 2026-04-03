'use client'

import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Global error boundary — catches render crashes and shows a recovery UI
 * instead of a blank white screen.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught render error:', error.message)
    if (info.componentStack) {
      console.error('[ErrorBoundary] Component stack:', info.componentStack)
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 max-w-sm w-full text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
              حدث خطأ غير متوقع
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Something went wrong. Please try again.
            </p>
            <div className="flex gap-3">
              <button
                onClick={this.handleRetry}
                className="flex-1 bg-primary-600 text-white py-2.5 rounded-xl text-sm font-semibold active:scale-95 transition-transform"
              >
                حاول مرة أخرى
              </button>
              <button
                onClick={this.handleReload}
                className="flex-1 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 py-2.5 rounded-xl text-sm font-medium"
              >
                إعادة تحميل
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
