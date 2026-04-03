/** Phone validation — safe to import from client components */

export function formatSaudiPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.startsWith('966')) return `+${cleaned}`
  if (cleaned.startsWith('0')) return `+966${cleaned.slice(1)}`
  return `+966${cleaned}`
}

export function isValidSaudiPhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '')
  return /^(0?5[0-9]{8})$/.test(cleaned)
}
