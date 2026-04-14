/**
 * Haptic feedback — uses Capacitor Haptics on native iOS (Taptic Engine),
 * falls back to Vibration API on Android/web.
 */

function isNative(): boolean {
  return typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.()
}

// Pre-warm the Capacitor Haptics plugin on module load so the FIRST
// hapticLight/Medium call doesn't pay the dynamic-import cost inside a
// live gesture handler. Without this, the first swipe-back haptic races
// with the router.back() that follows on touchend, and the navigation
// occasionally gets dropped.
if (typeof window !== 'undefined' && isNative()) {
  import('@capacitor/haptics').catch(() => {})
}

function hapticsEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try { return localStorage.getItem('hai_haptics') !== '0' } catch { return true }
}

export function setHapticsEnabled(on: boolean) {
  try { localStorage.setItem('hai_haptics', on ? '1' : '0') } catch {}
}

async function nativeImpact(style: 'Light' | 'Medium' | 'Heavy') {
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
    await Haptics.impact({ style: ImpactStyle[style] })
  } catch {
    // fallback
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(style === 'Light' ? 10 : style === 'Medium' ? 25 : 50)
    }
  }
}

async function nativeNotification(type: 'Success' | 'Warning' | 'Error') {
  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics')
    await Haptics.notification({ type: NotificationType[type] })
  } catch {}
}

export function hapticLight() {
  if (!hapticsEnabled()) return
  if (isNative()) { nativeImpact('Light'); return }
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10)
}

export function hapticMedium() {
  if (!hapticsEnabled()) return
  if (isNative()) { nativeImpact('Medium'); return }
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(25)
}

export function hapticHeavy() {
  if (!hapticsEnabled()) return
  if (isNative()) { nativeImpact('Heavy'); return }
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(50)
}

export function hapticSuccess() {
  if (!hapticsEnabled()) return
  if (isNative()) { nativeNotification('Success'); return }
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([15, 50, 15])
}

export function hapticError() {
  if (!hapticsEnabled()) return
  if (isNative()) { nativeNotification('Error'); return }
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([30, 30, 30, 30, 30])
}

export function hapticWarning() {
  if (!hapticsEnabled()) return
  if (isNative()) { nativeNotification('Warning'); return }
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([20, 40, 20])
}
