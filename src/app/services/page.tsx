import { redirect } from 'next/navigation'

// Services merged into Market — redirect for deep link compatibility
export default function ServicesPage() {
  redirect('/market?tab=SERVICES')
}
