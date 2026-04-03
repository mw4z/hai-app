/**
 * Haptic feedback using the Vibration API.
 * Falls back silently on unsupported devices.
 */

export function hapticLight() {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(10)
  }
}

export function hapticMedium() {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(25)
  }
}

export function hapticHeavy() {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(50)
  }
}

export function hapticSuccess() {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate([15, 50, 15])
  }
}

export function hapticError() {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate([30, 30, 30, 30, 30])
  }
}

export function hapticWarning() {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate([20, 40, 20])
  }
}
