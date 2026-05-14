/**
 * Centralized identity for guide / system helper messages.
 *
 * "مرشد حي" is the user-facing name of Hai's in-app guide
 * persona — the same character represented by HaiGuideMascot.
 * Use this constant in any NEW guidance / education /
 * permission-nudge / onboarding / helper / system-explanation
 * copy. Existing inline strings in FirstRunGuide and
 * ContextualGuide are intentionally NOT refactored here to
 * avoid a risky multi-file touch; a follow-up task can swap
 * them when convenient.
 *
 * ── When to use GUIDE_NAME_AR ───────────────────────────────
 *   ✓ "مرشد حي: فعّل التنبيهات عشان ما تفوتك الردود."
 *   ✓ First-run welcome bubble headers
 *   ✓ Permission nudges
 *   ✓ Empty-state explanations of how a feature works
 *   ✓ Educational tips ("did you know…")
 *
 * ── When NOT to use it ──────────────────────────────────────
 *   ✗ Transactional notifications (new DM, comment reply, ride
 *     offer, emergency alert) — those stay direct and clear,
 *     no persona wrapper.
 *   ✗ Error messages from the server
 *   ✗ Form validation feedback
 *
 * The rule of thumb: if a real human moderator / employee
 * might say it, it's transactional and the persona stays out
 * of the copy. If it's the app teaching the user how to use
 * the app, the persona is welcome.
 */
export const GUIDE_NAME_AR = 'مرشد حي'
