export interface ContactResult {
  contact: {
    name: { display: string; given: string; family: string }
    phones: Array<{ number: string }>
  } | null
}

export interface HaiContactsPlugin {
  pickContact(): Promise<ContactResult>
}
