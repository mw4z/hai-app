import { registerPlugin } from '@capacitor/core'
import type { HaiContactsPlugin } from './definitions'

const HaiContacts = registerPlugin<HaiContactsPlugin>('HaiContacts')

export * from './definitions'
export { HaiContacts }
