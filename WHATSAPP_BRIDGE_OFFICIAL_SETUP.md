# WhatsApp → Hai bridge — Official (forward-to-bot) setup

The **official** ingestion path. A resident **forwards (or types) a message to
the Hai bot's WhatsApp number** → the bot replies with **نشر / إلغاء** buttons →
on confirm, an anonymous "نُشر عبر واتساب · أحد سكان الحي" request is published
to the feed. ToS-safe, runs entirely on Vercel — **no VPS, no Baileys, no ban
risk.** Consent is explicit: whoever forwards confirms.

```
resident → (forwards msg to bot number)
  → Meta Cloud API → POST /api/bridge/whatsapp/webhook
    → classify (rules) [+ optional Claude rewrite/filter]
    → reply with Confirm buttons
  → resident taps "✅ انشرها"
    → re-gate + rate-limit → createBridgePost → reply with the post link
```

Everything is **OFF until `WHATSAPP_BRIDGE_ENABLED=true`** and inert until the
Cloud API envs are set. No migration needed (the `WhatsappBridgeMessage` audit
model + statuses already exist on prod).

---

## 1. Meta setup (you do this once)

1. **developers.facebook.com → Create App → "Business".**
2. In the app, **Add product → WhatsApp → Set up.**
3. WhatsApp → **API Setup**:
   - Either use the free **test number** Meta gives you, or **add your own
     number** (must be a number **not currently registered in the WhatsApp app**).
   - Copy the **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`.
4. **Permanent access token** (the temporary one expires in 24h):
   - Business Settings → **System users** → create one (Admin) →
     **Generate token** → select the app → scopes **`whatsapp_business_messaging`**
     and **`whatsapp_business_management`** → copy → `WHATSAPP_CLOUD_TOKEN`.
5. **App Secret**: App Settings → **Basic** → copy **App secret** →
   `WHATSAPP_APP_SECRET` (used to verify Meta's webhook signature).
6. **Webhook**:
   - WhatsApp → **Configuration → Webhook → Edit**.
   - **Callback URL:** `https://app.hai-app.net/api/bridge/whatsapp/webhook`
   - **Verify token:** any string you pick → also set it as
     `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (must match, or the GET handshake fails).
   - Click **Verify and save** (Meta calls our `GET` and expects the challenge).
   - **Subscribe** to the **`messages`** field. (That's the only one we need.)
7. For the test number, add the recipient numbers you'll test with to the
   allowed list in API Setup (Meta requires this until the number is live).

### 1b. Coexistence — using an existing WhatsApp Business *app* number

If the bot number is already running in the **WhatsApp Business app** (e.g. the
real +966 number) and you want to keep using that app, use **Coexistence** —
the number runs in the app AND on the Cloud API at the same time. Only the
*number attachment* differs from above; the token/app-secret/webhook/envs are
identical.

1. Prereqs: you're an **admin** of that number in the WhatsApp Business app, the
   app is **updated to the latest version**, and you have a **Meta Business
   Portfolio**.
2. developers.facebook.com → your Meta app → add the **WhatsApp** product.
3. **WhatsApp Manager** (business.facebook.com/wa/manage) → **Phone numbers →
   Add phone number** → choose **connect a number already on the WhatsApp
   Business app**.
4. It shows a **QR code** → on the phone, **WhatsApp Business app → Settings →
   scan the Coexistence QR** to authorize. This links the number to the API
   **without** removing it from the app (recent chats sync over).
5. Then continue exactly as in steps 3–6 above (Phone Number ID, permanent
   token, App Secret, webhook + verify token, subscribe to `messages`).

> Meta's menu labels shift; if something looks different, follow Meta's
> **"Coexistence"** doc under the WhatsApp Cloud API getting-started guide. The
> concept is always: connect existing Business-app number → scan QR in the app.

---

## 2. Vercel environment variables

Set these in the Hai project (Production), then redeploy.

**Bridge core (some already set from the dormant core):**
| Var | Value |
|---|---|
| `WHATSAPP_BRIDGE_ENABLED` | `true` |
| `WHATSAPP_BRIDGE_MODE` | `test` |
| `WHATSAPP_BRIDGE_TEST_NEIGHBORHOOD_ID` | the id of your test neighborhood |
| `WHATSAPP_BRIDGE_SYSTEM_USER_ID` | a real User id that authors bridge posts |
| `WHATSAPP_BRIDGE_REVIEW_FIRST` | `true` (recommended for the test — posts land HIDDEN for mod review) |
| `WHATSAPP_BRIDGE_SENDER_PEPPER` | a long random string (HMAC pepper; never sends the phone) |

**Cloud API (new):**
| Var | Value |
|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | from step 3 |
| `WHATSAPP_CLOUD_TOKEN` | permanent token from step 4 |
| `WHATSAPP_APP_SECRET` | from step 5 |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | the string you chose in step 6 |
| `WHATSAPP_GRAPH_VERSION` | optional, defaults `v21.0` |

**AI (optional — Claude rewrite + extra filter):**
| Var | Value |
|---|---|
| `WHATSAPP_BRIDGE_AI_ENABLED` | `true` to turn it on |
| `ANTHROPIC_API_KEY` | a key from console.anthropic.com — **billed separately, pay-per-token; NOT your Claude Code plan** |
| `WHATSAPP_BRIDGE_AI_MODEL` | optional, defaults `claude-haiku-4-5` (cheap; ~fraction of a cent per message) |

> The AI only ever **rewrites** the text and can **veto** a message. Whatever it
> returns is **re-checked by the rule classifier** before anything publishes,
> and we fall back to the original text if the rewrite doesn't pass. It can't
> push through links, PII, emergencies, politics, etc.

---

## 3. Test it

1. Confirm the webhook verified (green check in Meta's Configuration page).
2. From an allowed test number, **send the bot**: `أبحث عن سبّاك شاطر في الحي`
   - Bot should reply with the **نشر / إلغاء** buttons.
3. Tap **✅ انشرها** → bot replies with a feed link.
   - With `REVIEW_FIRST=true` the post is **HIDDEN** — approve it in the mod
     dashboard to make it live. With it `false`, it's live immediately.
4. Send a greeting like `السلام عليكم` → bot should NOT prompt (not a request).
5. Send something with a link or 2 phone numbers → silently ignored (risk block).

**Rate limits:** 3 published/sender/day, 10/neighborhood/hour.

---

## 4. Safety / notes

- **Test neighborhood only:** in `mode=test`, every bridged post goes to
  `WHATSAPP_BRIDGE_TEST_NEIGHBORHOOD_ID`. Don't flip to `live` until the flow is
  proven. Keep `REVIEW_FIRST=true` while testing so a human approves each post.
- **Privacy:** the phone number is never stored or shown — only `senderHash`
  (HMAC). Posts always render as "أحد سكان الحي".
- **Audit:** every step is logged in the `WhatsappBridgeMessage` table
  (`DETECTED`/`PROMPTED`/`CONFIRMED`/`PUBLISHED`/`IGNORED`/`FAILED`). When AI is
  on, `originalText` holds the text actually published (the cleaned version).
- **Disabling:** set `WHATSAPP_BRIDGE_ENABLED=false` — the webhook still 200s
  Meta but does nothing.

## 5. Troubleshooting

- **Webhook won't verify:** `WHATSAPP_WEBHOOK_VERIFY_TOKEN` mismatch, or the app
  isn't deployed yet.
- **`bad signature` (401):** `WHATSAPP_APP_SECRET` is wrong/missing.
- **Bot receives but never replies:** check `WHATSAPP_CLOUD_TOKEN` /
  `WHATSAPP_PHONE_NUMBER_ID`, and that you're within the 24h window (the user
  must have messaged the bot — they have, by forwarding).
- **"This request expired":** the pending record is older than 24h — forward
  again.
