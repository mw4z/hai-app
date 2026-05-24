# WhatsApp → Hai bridge — core smoke test

Covers the **Hai-side core only** (the part that lives in this repo). The
actual WhatsApp ingestion (group listener vs forward-to-bot) is **not built
yet** — so we test the secured ingest endpoint directly, simulating what the
future ingestion layer will send after a sender confirms.

> The bridge is **OFF by default** (`WHATSAPP_BRIDGE_ENABLED` unset/false).
> Nothing happens until it's explicitly enabled in test mode.

## Prerequisites

1. **Apply the migration** `prisma/migrations/20260524_whatsapp_bridge/migration.sql` to Supabase (see verification queries below), then deploy.
2. **A system author user** for bridge posts (so unmatched senders are never
   exposed). Pick/confirm a user id and set it as `WHATSAPP_BRIDGE_SYSTEM_USER_ID`.
   Its name is never shown — bridge posts render as **"أحد سكان الحي"**.
3. **Env (test mode):**
   ```
   WHATSAPP_BRIDGE_ENABLED=true
   WHATSAPP_BRIDGE_MODE=test
   WHATSAPP_BRIDGE_TEST_NEIGHBORHOOD_ID=<test_nbhd_id>
   WHATSAPP_BRIDGE_SECRET=<long random secret>
   WHATSAPP_BRIDGE_SYSTEM_USER_ID=<system user id>
   # optional: WHATSAPP_BRIDGE_REVIEW_FIRST=true  (creates posts HIDDEN for mod review)
   ```

## Calling the endpoint

```bash
curl -sS https://app.hai-app.net/api/bridge/whatsapp \
  -H "content-type: application/json" \
  -H "x-bridge-secret: $WHATSAPP_BRIDGE_SECRET" \
  -d '{
    "sourceChatId": "group_test_1",
    "sourceMessageId": "msg_001",
    "senderHash": "hash_abc",
    "senderDisplayName": "جار",
    "text": "تعرفون سباك قريب؟",
    "confirmedBySender": true,
    "confirmationMethod": "TEXT",
    "neighborhoodId": "<test_nbhd_id>"
  }'
```

## Checklist

| # | Scenario | Send | Expected |
|---|----------|------|----------|
| A | **Useful + confirmed** | `"تعرفون سباك قريب؟"`, confirmed, test nbhd | `200 {ok, postId, url}` — a REQUEST/SERVICES post created, origin WHATSAPP_BRIDGE |
| B | **Lost/found** | `"ضاعت محفظة عند المسجد"` | `200` — LOST_FOUND post |
| C | **Question** | `"وين أقرب مغسلة؟"` | `200` — REQUEST/GENERAL post |
| D | **Unconfirmed** | same as A but `confirmedBySender:false` | `400 not_confirmed`, no post |
| E | **Duplicate** | re-send A with the **same** sourceMessageId | `200 {idempotent:true}` — same postId, **no second post** |
| F | **Greeting / casual** | `"السلام عليكم"` | `422 not_useful`, no post |
| G | **Risky — emergency** | `"فيه حريق اتصلوا بالطوارئ"` | `422 risky_content`, no post |
| G2 | **Risky — accusation** | `"فلان نصاب"` | `422 risky_content`, no post |
| G3 | **Risky — link** | `"شوفوا https://x.com"` | `422 risky_content`, no post |
| H | **Wrong neighborhood** | useful text, `neighborhoodId` ≠ test | `422 wrong_neighborhood`, no post |
| I | **Rate limit (sender)** | publish 4 useful msgs (distinct ids) from same `senderHash` in a day | 4th → `429 rate_limited (sender)` |
| I2 | **Rate limit (nbhd)** | 11 published in an hour in the test nbhd | 11th → `429 rate_limited (neighborhood)` |
| J | **Flag off** | unset `WHATSAPP_BRIDGE_ENABLED` | `403 bridge_disabled` for everything |
| K | **Bad/no secret** | omit/!match `x-bridge-secret` | `401 unauthorized` |
| L | **No phone exposed** | inspect created post + logs | post shows **"أحد سكان الحي" + "نُشر عبر واتساب"**, never a phone; logs show only `senderHash` |
| M | **Moderation** | as a mod, open the created post | reportable + hideable/removable like any post; tagged `origin=WHATSAPP_BRIDGE` |

## Migration verification (run in Supabase after applying)

```sql
-- existing posts are all APP, none WHATSAPP_BRIDGE
SELECT "origin", COUNT(*) FROM "Post" GROUP BY "origin";
-- bridge audit table empty at first
SELECT COUNT(*) FROM "WhatsappBridgeMessage";
-- sample
SELECT id, "origin", category, intent, status FROM "Post" LIMIT 5;
```
Expected: every existing post `origin = APP`, `WhatsappBridgeMessage` count `0`.

## Deployment order
1. Apply SQL in Supabase → run verification queries.
2. If clean, deploy code.
3. Set env (test mode), with `WHATSAPP_BRIDGE_SYSTEM_USER_ID` + `WHATSAPP_BRIDGE_TEST_NEIGHBORHOOD_ID`.
4. Run this checklist against the **test** neighborhood only.
5. Only after it passes do we build + connect a real ingestion method (and never a real group until the test group flow passes).

## Safety invariants (already enforced server-side)
- Bridge can only create **REQUEST** posts in **SERVICES / GENERAL / LOST_FOUND**.
- Never emergency, marketplace, high/critical priority, polls, or official posts.
- Disabled flag ⇒ endpoint rejects everything.
- Idempotency key = `sourceChatId + sourceMessageId + senderHash`.
- Plain phone numbers are never stored or logged — only `senderHash`.
