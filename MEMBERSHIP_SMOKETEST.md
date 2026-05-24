# Membership smoke test (حالة الساكن)

A quick on-device checklist to confirm the neighborhood-membership feature
behaves correctly **after a deploy**. Run it in the **real app** (or the
native webview) — not from a terminal, and not from a desktop browser
(the web app only loads inside the app).

There are three membership states:

| State | Arabic label | What they can do |
|-------|--------------|------------------|
| **VERIFIED_RESIDENT** | ساكن مؤكد | Everything — full resident. |
| **CLAIMED_RESIDENT** | مرتبط بالحي | View, comment, post **requests only**. No alerts/marketplace/voting. |
| **OUTSIDE** | من خارج الحي | No resident actions; limited. |

---

## 1. Purpose

Verify that after deploy, each state behaves as designed:
- VERIFIED keeps full access,
- CLAIMED gets limited (comment + REQUEST) access with friendly blocks,
- OUTSIDE stays limited with no accidental resident privileges,
- and a mod can review/approve residency claims.

---

## 2. Test accounts / setup

### Make a CLAIMED user (the realistic way)
1. Start a **fresh signup** (new phone number / new account).
2. Go through onboarding to the location step.
3. **Deny / skip GPS** when asked.
4. **Pick a neighborhood manually** from the list.
- ✅ You should see the hint: *“إذا كنت خارج الحي حاليًا…”*
- ✅ On finishing, a toast: *“تم ربط حسابك بالحي…”*
- This account is now **CLAIMED_RESIDENT**.

### Flip a test user directly (controlled testing, Supabase SQL editor)
Use this to put an existing **test** account into a specific state without
re-onboarding. Replace `<phone>` with the test user's number.

```sql
-- → CLAIMED
UPDATE "User" SET "membership"='CLAIMED_RESIDENT', "addressVerified"=false WHERE phone='<phone>';
-- → VERIFIED
UPDATE "User" SET "membership"='VERIFIED_RESIDENT', "addressVerified"=true  WHERE phone='<phone>';
-- → OUTSIDE
UPDATE "User" SET "membership"='OUTSIDE', "addressVerified"=false WHERE phone='<phone>';
```

To make a claim show up in the mod queue for a flipped CLAIMED user:
```sql
INSERT INTO "NeighborhoodClaim" ("id","userId","neighborhoodId","status","note","createdAt")
SELECT gen_random_uuid()::text, id, "neighborhoodId", 'PENDING', 'manual-test', now()
FROM "User" WHERE phone='<phone>';
```

> ⚠️ **Only flip TEST accounts, never real users.** **Revert** every test
> account to its original state when you're done (use the SQL above).

---

## 3. Checklist

### A. CLAIMED_RESIDENT
- [ ] Their post / profile popup shows the badge **“مرتبط بالحي”**
- [ ] Can **comment** on a post
- [ ] Can post a **limited REQUEST** (e.g. via أسأل / a general request)
- [ ] **Cannot** post a marketplace offer
- [ ] **Cannot** create an emergency alert
- [ ] **Cannot** vote in a resident poll
- [ ] Blocked actions show **friendly copy**, not a raw error

### B. VERIFIED_RESIDENT
- [ ] Full posting works
- [ ] Marketplace works
- [ ] Comments work
- [ ] Polls / alerts behave as before
- [ ] Verified badge is **hidden by default** (only shown where intended, e.g. profile popup)

### C. OUTSIDE
- [ ] Cannot post or comment as a resident
- [ ] Stays limited
- [ ] No accidental resident privileges

### D. Mod dashboard
- [ ] `/mod` shows the **“طلبات تأكيد السكن”** tab
- [ ] A pending claim appears in it
- [ ] **Approve** (تأكيد الساكن) upgrades the user to **VERIFIED_RESIDENT** (badge flips to ساكن مؤكد)
- [ ] **Reject** (رفض) works, with the optional note prompt
- [ ] A neighborhood mod only sees claims **in their own neighborhood**

### E. Arabic visual checks (in the real app, not terminal)
- [ ] مرتبط بالحي
- [ ] من خارج الحي
- [ ] طلبات تأكيد السكن
- [ ] تأكيد الساكن
- [ ] رفض
- [ ] هذه الميزة متاحة للسكان المؤكدين فقط. أكّد سكنك داخل الحي أو اطلب مراجعة المشرف.

---

## 4. Expected API / status behavior

| Situation | Expected |
|-----------|----------|
| Claimed user tries a restricted action (alert / marketplace / vote / high-priority) | **403** + friendly message |
| User changes claimed home again within 30 days | **429** (cooldown) |
| Any blocked action that has friendly copy | User sees the **friendly message**, never a raw `403` / `unauthorized` string |
| Mod approves a claim | User becomes VERIFIED_RESIDENT; `addressVerified=true` |

---

## 5. Tester notes

| Date | Device | Account state | Section | Pass / Fail | Notes / screenshot |
|------|--------|---------------|---------|-------------|--------------------|
|      |        | CLAIMED       | A       |             |                    |
|      |        | VERIFIED      | B       |             |                    |
|      |        | OUTSIDE       | C       |             |                    |
|      |        | MOD           | D       |             |                    |
|      |        | —             | E       |             |                    |

> Tip: if a check fails, note the **exact screen + what you saw** (and a
> screenshot if possible) so it can be reproduced and fixed quickly.
