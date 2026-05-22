/**
 * Pure resolution-order decision for "add a service contact". Given the
 * facts already looked up by the API (does this phone belong to a public
 * provider? to an existing visible contact in this nbhd+category? to a
 * normal app user?), decide what to do — WITHOUT any DB or PII access, so
 * it's fully unit-testable.
 *
 * Order matters and is the spec's order:
 *   1. public provider  → MATCHED_PROVIDER (link, don't create)
 *   2. existing contact → MATCHED_SERVICE_CONTACT (link, don't duplicate)
 *   3. normal app user  → GENERIC_PENDING_MATCH (queue + prompt owner;
 *                          NEVER expose that the number is a user's)
 *   4. nothing          → CREATE_NEW (community-added, unverified)
 *
 * PRIVACY INVARIANT: the GENERIC_PENDING_MATCH result carries the linked
 * user id for the SERVER to notify them — it must never be returned to
 * the submitter or surfaced in any public response.
 */

export interface ResolutionFacts {
  /** A user with a PUBLIC provider profile (providerStatus ACTIVE/VERIFIED) whose phone matches. */
  providerUserId: string | null
  /** A visible service contact already exists for this identity + neighborhood + category. */
  existingContactId: string | null
  /** A normal app user (no public provider profile) owns this phone. */
  linkedUserId: string | null
}

export type Resolution =
  | { kind: 'MATCHED_PROVIDER'; providerUserId: string }
  | { kind: 'MATCHED_SERVICE_CONTACT'; contactId: string }
  | { kind: 'GENERIC_PENDING_MATCH'; linkedUserId: string }
  | { kind: 'CREATE_NEW' }

export function resolveServiceContact(facts: ResolutionFacts): Resolution {
  if (facts.providerUserId) {
    return { kind: 'MATCHED_PROVIDER', providerUserId: facts.providerUserId }
  }
  if (facts.existingContactId) {
    return { kind: 'MATCHED_SERVICE_CONTACT', contactId: facts.existingContactId }
  }
  if (facts.linkedUserId) {
    return { kind: 'GENERIC_PENDING_MATCH', linkedUserId: facts.linkedUserId }
  }
  return { kind: 'CREATE_NEW' }
}

/**
 * Public-facing message + machine code for each resolution. The submitter
 * NEVER learns whether GENERIC_PENDING_MATCH was triggered by a real user
 * — the copy is intentionally generic ("exists in the system, under
 * review") so it can't be used to probe whether a number is registered.
 */
export function resolutionResponse(r: Resolution): { code: string; messageAr: string } {
  switch (r.kind) {
    case 'MATCHED_PROVIDER':
      return { code: 'MATCHED_PROVIDER', messageAr: 'هذا الرقم موجود مسبقًا كمزود خدمة في الدليل.' }
    case 'MATCHED_SERVICE_CONTACT':
      return { code: 'MATCHED_SERVICE_CONTACT', messageAr: 'هذا الرقم مضاف مسبقًا في الدليل لهذا القسم.' }
    case 'GENERIC_PENDING_MATCH':
      return { code: 'GENERIC_PENDING_MATCH', messageAr: 'هذا الرقم موجود مسبقًا في النظام. سيتم مراجعته قبل ظهوره في الدليل.' }
    case 'CREATE_NEW':
      return { code: 'CREATED', messageAr: 'تمت إضافة جهة الخدمة. ستظهر في الدليل بوسم "مضاف من السكان".' }
  }
}
