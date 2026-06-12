# PharmaLeads — Agentic Workflows

Each workflow below is documented as a self-contained "agent" — a discrete processing unit with a clear trigger, data sources, steps, and failure modes.

---

## Agent 1: Authentication Agent

**Trigger**: User submits `/login` with email + password  
**Files**: `src/app/api/auth/login/route.ts`, `src/lib/utils/session.ts`, `src/lib/utils/password.ts`, `src/lib/models/User.ts`

### Processing Steps

1. Parse JSON body — reject if malformed
2. If `email` present → user-based flow:
   - `connectDB()`
   - `ensureFirstAdmin()` — on first run, creates admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD` if no users exist
   - `User.findOne({ email })` — case-insensitive via schema `lowercase: true`
   - Check `user.active === true` → 403 if disabled
   - `verifyPassword(plaintext, hash)` — scrypt-based, Node.js built-in crypto
   - `createSessionToken(userId, role, JWT_SECRET)` → `v2|userId|role|expiryMs|hmac`
   - Set `pharma_auth` cookie (httpOnly, secure in prod, SameSite=strict, 8h TTL)
   - DB error during any of above → 503 (never falls through to legacy password)
3. If no `email` → legacy single-password flow:
   - Compare password against `APP_PASSWORD` env var
   - Same token creation, role hardcoded as 'admin'

### APIs Called
- None external

### Collections Used
- `users` — read + potentially write (first admin creation)

### Outputs
- Session cookie `pharma_auth` with v2 token
- `{ success: true }` JSON

### Failure Scenarios
- MongoDB down → 503
- Wrong password → 401
- Account deactivated → 403
- JWT_SECRET missing in production → 503 from middleware
- Race condition on first admin creation → caught by unique email index

### Recovery
- DB down: wait for Atlas recovery
- Only admin deactivated: connect to Atlas directly, set `active: true` on the user document

---

## Agent 2: Apollo Lead Discovery Agent

**Trigger**: User submits search from `/apollo` page  
**Files**: `src/app/api/apollo/search/route.ts`, `src/app/api/apollo/import/route.ts`, `src/app/api/apollo/enrich/route.ts`, `src/lib/services/apollo.ts`, `src/lib/utils/scoreLead.ts`

### Processing Steps

1. **Search** (`POST /api/apollo/search`):
   - `getSettings()` → read `apolloApiKey` from DB/env
   - `POST https://api.apollo.io/api/v1/mixed_people/api_search` with `x-api-key` header
   - Parse `.people[]` → `normalizeApolloLead()` per result
   - Return normalised leads to UI (not yet saved to DB)

2. **Import** (`POST /api/apollo/import`):
   - `scoreLead()` per lead → score 0–100
   - `Lead.insertMany({ ordered: false })` — skips duplicates on email index
   - Return inserted vs skipped count

3. **Enrich** (`POST /api/apollo/enrich`):
   - `enrichApolloPerson()` → `POST /api/v1/people/match` with `reveal_personal_emails: true`
   - Update Lead with found email + phone

### Scoring Formula (Apollo leads)
| Signal | Points |
|---|---|
| Email present | +40 |
| Relevant title keyword | +20 |
| Company name present | +15 |
| Website present | +10 |
| Country present | +10 |
| Healthcare category keyword | +10 |
| No email | cap total at 40 |

### Collections Used
- `leads` — write
- `integrationsettings` — read via settingsCache

### Failure Scenarios
- API key invalid → 401 from Apollo
- Rate limit / credits exhausted → 429 from Apollo
- Duplicate email on import → silently skipped (MongoDB unique index)
- Apollo matches person but no email found → `found: false`, not an error

### Recovery
- Quota exhausted: wait for monthly reset
- Key misconfigured: update in Settings → Integrations; cache expires in 60s

---

## Agent 3: Apify Maps Discovery Agent

**Trigger**: User submits search from `/apify` page  
**Files**: `src/app/api/apify/maps-search/route.ts`, `src/app/api/apify/import/route.ts`, `src/app/api/apify/enrich-website/route.ts`, `src/lib/services/apify.ts`, `src/lib/utils/scoreLead.ts`

### Processing Steps

1. **Search** (`POST /api/apify/maps-search`):
   - `getSettings()` → `apifyToken`, `apifyActorId`, `apifyMaxResults`
   - Build query: `{keyword} {city} {country}`
   - `POST https://api.apify.com/v2/acts/{actorId}/runs?waitForFinish=90`
   - `GET /datasets/{datasetId}/items` — fetch results
   - `normalizeApifyBusiness()` per result
   - If `apifyWebsiteEnrichment=true`: `enrichLeadsWithEmails()` — fetch up to 5 business websites
   - `scoreGoogleMapsLead()` per result

2. **Import** (`POST /api/apify/import`): same as Apollo import

3. **Per-lead website enrich** (`POST /api/apify/enrich-website`):
   - `extractEmailsFromWebsite(website)` — checks `/`, `/contact`, `/about`
   - Validates email against placeholder domain list + binary extension check

### Google Maps Scoring Formula
| Signal | Points |
|---|---|
| Email found | +35 |
| Phone present | +20 |
| Website present | +15 |
| Healthcare category | +10 |
| Rating ≥ 4 stars | +10 |
| Reviews ≥ 20 | +10 |

### Collections Used
- `leads` — write
- `integrationsettings` — read via settingsCache

### Failure Scenarios
- Apify run exceeds 90s → timeout error
- Actor returns status ≠ SUCCEEDED → error with status string
- Website enrichment domain timeout → silently skipped (`not_found`)
- Wrong actor ID in settings → 404 from Apify

### Recovery
- Reduce `maxResults` in Settings for faster runs
- Disable website enrichment if causing timeouts
- Default actor: `compass/crawler-google-places`

---

## Agent 4: Smartlead Sending Agent

**Trigger**: User sends email from `/compose`, `/bulk-email`, or reply approval  
**Files**: `src/app/api/bulk-email/send/route.ts`, `src/app/api/email-logs/[id]/send/route.ts`, `src/lib/services/smartlead.ts`

### Three Operating Modes

| Mode | Condition | Behaviour |
|---|---|---|
| `no_key` | `smartleadApiKey` not configured | Returns preview, marks `ready_to_send_test`, no external call |
| `dry_run` | `smartleadDryRun=true` (default) | Validates payload, logs intent, no external call |
| `live` | `smartleadDryRun=false` and key set | Calls Smartlead REST API |

### Two Send Functions

**`sendEmail()`** — Campaign sequence mode:
- `POST /api/v1/campaigns/{campaignId}/leads`
- Adds lead to Smartlead campaign's email sequence
- Campaign schedule controls actual send time
- `upload_count === 0` → treated as failure

**`sendCustomEmailViaSmartlead()`** — Direct send mode:
- `POST /api/v1/send-email/initiate`
- Sends a specific body immediately
- Returns `trackId` stored in `EmailLog.smartleadTrackId`

### Bulk Email Processing Steps

1. Validate with Zod schema
2. For each lead in `leadIds`:
   - Verify lead belongs to campaign (CampaignLead check)
   - Skip: `do_not_contact` / `rejected` / `no_response` / no email
   - Render `{{variable}}` placeholders
   - `EmailLog.create({ status:'pending' })`
   - `sendCustomEmailViaSmartlead()`
   - Update `EmailLog.status` → `sent` / `ready_to_send_test` / `failed`
   - If sent: update `Lead.lastContactedAt`, `Lead.status='contacted'`
   - `markLeadWaitingForReply()` → upsert `NoReplyLead`
3. Write audit log `bulk_email_sent`

### Collections Used
- `leads` — read + update
- `emaillogs` — create + update
- `campaigns` — read
- `campaignleads` — read
- `noreplyleads` — upsert
- `products` — read
- `auditlogs` — write

### Failure Scenarios
- Smartlead 429 (rate limit) → `EmailLog.status=failed`
- `upload_count: 0` (duplicate/unsubscribed) → marked failed with reason
- Campaign ID not set in live mode → immediate failure
- Network timeout (15s) → axios error → `EmailLog.status=failed`

### Recovery
- Resend individually via `/email-logs` route
- Check Smartlead dashboard for bounces
- Toggle dry_run in Settings while investigating

---

## Agent 5: Gmail Sync Agent

**Trigger**: User clicks "Sync Gmail Inbox" on `/settings`, `POST /api/gmail/sync`  
**Files**: `src/app/api/gmail/sync/route.ts`, `src/app/api/gmail/connect/route.ts`, `src/app/api/gmail/callback/route.ts`, `src/lib/services/gmail.ts`, `src/lib/models/InboxAccount.ts`

### One-Time Setup Flow

1. `GET /api/gmail/connect` → `getGmailOAuthUrl()` → redirect to Google consent screen
2. User grants permission; Google redirects to `GET /api/gmail/callback?code=...`
3. `exchangeCodeForTokens(code)` → access + refresh tokens
4. `InboxAccount.create({ provider:'gmail', email, accessToken, refreshToken, tokenExpiry })`
5. Redirect to `/settings?gmail=connected`

### Sync Flow

1. Load active `InboxAccount`
2. Refresh access token if expiring within 5 minutes
3. `fetchRecentGmailReplies(accessToken, 50)` — last 50 inbox messages
4. For each message:
   - Match `senderEmail` → `Lead.email`
   - Dedup: by `gmailMessageId` then by `bodyHash + leadId`
   - `classifyReply(body)` — keyword rules
   - `Reply.create({ source:'gmail', gmailMessageId, ... })`
   - Update Lead status + stop follow-ups
   - Resolve NoReplyLead record
5. Update `InboxAccount.lastSyncedAt`

### Gmail API Endpoints Called
- `GET /gmail/v1/users/me/messages?q=in:inbox -in:sent`
- `GET /gmail/v1/users/me/messages/{id}?format=full`
- `POST https://oauth2.googleapis.com/token` (token refresh)

### Collections Used
- `inboxaccounts` — read + update
- `leads` — read + update
- `replies` — write
- `campaignleads` — update
- `noreplyleads` — update

### Failure Scenarios
- No Gmail account connected → 400 with helpful message
- Refresh token revoked → 500, user must reconnect via Settings
- Google message fetch rate limit → partial results (continues to next message)
- No extractable body → silently skipped

### Security Notes
- OAuth scope: `gmail.readonly` — cannot send email from this integration
- Access tokens stored in plain text in DB (TODO: encrypt before full production use)
- Client ID / secret stored encrypted via settingsCache

---

## Agent 6: Smartlead Reply Sync Agent

**Trigger**: User clicks "Sync Smartlead Replies", `POST /api/replies/sync-smartlead`  
**Files**: `src/app/api/replies/sync-smartlead/route.ts`, `src/lib/services/mailboxReplySync.ts`

### Source Priority

1. **Primary**: Smartlead Master Inbox — `POST /api/v1/master-inbox/inbox-replies` (up to 5 pages × 20)
2. **Supplement**: Campaign message history — `GET /campaigns/{id}/leads/{leadId}/message-history`
3. **Fallback**: Campaign statistics — `GET /campaigns/{id}/statistics?email_status=replied` (only when master inbox is empty)
4. **IMAP mailbox**: `runMailboxSync()` — runs after Smartlead sync if `mailboxEnabled=true`

### Deduplication Strategy (all sources)

```
1. By message ID (smartleadMessageId / mailboxMessageId / gmailMessageId)
2. By leadId + bodyHash (SHA-256 of normalised body, first 16 hex chars)
3. By exact body + leadId (mailbox sync only)
```

### IMAP Mailbox Sync Sub-Flow

1. Load IMAP credentials from `getSettings()`
2. Connect via `imapflow` to configured host (default: imap.gmail.com:993)
3. Search INBOX since `lookbackDays` ago
4. For each message: parse with `mailparser`, match FROM email to `EmailLog.leadEmail`
5. Subject normalisation: strip Re:/Fwd:/Fw: prefixes iteratively
6. 3-layer dedup → classify → `Reply.create({ source:'mailbox_sync' })`

### Collections Used
- `leads` — read + update
- `replies` — write
- `emaillogs` — read (mailbox matching)
- `campaignleads` — update
- `noreplyleads` — update

### Failure Scenarios
- Smartlead returns empty master inbox → falls back to campaign stats
- IMAP connection refused → error in `errors[]`, partial result returned
- Wrong IMAP password → AUTH error in result
- Inbox items with no extractable body → `repliesExtracted=0` in diagnostics

---

## Agent 7: Reply Classification & AI Draft Agent

**Trigger**: Reply saved (automatic classification) → user clicks "Generate AI Draft" (optional)  
**Files**: `src/lib/services/reply-classifier.ts`, `src/app/api/replies/[id]/generate-draft/route.ts`, `src/app/api/replies/[id]/approve-send/route.ts`, `src/lib/services/claude.ts`

### Automatic Classification (zero AI credits)

`classifyReply(body)` runs on every saved reply. Priority order:

| Priority | Classification | Lead Status Update | Needs Approval |
|---|---|---|---|
| 1 | `do_not_contact` | `rejected` | false |
| 2 | `not_interested` | `rejected` | false |
| 3 | `out_of_office` | `needs_review` | false |
| 4 | `pricing_query` | `warm` | true |
| 5 | `certificate_query` | `warm` | true |
| 6 | `shipping_query` | `warm` | true |
| 7 | `interested` | `warm` | true |
| 8 | `needs_review` (fallback) | `needs_review` | true |

### AI Draft Generation (user-triggered, uses Claude credits)

1. `POST /api/replies/{id}/generate-draft`
2. `getSettings()` → `claudeApiKey` required
3. Load Reply, Lead, Product context
4. Call `draftReplyEmail()` via Claude Haiku (claude-haiku-4-5-20251001, max 300 tokens)
5. `ClaudeUsageLog.create()` — logs tokens + estimated cost
6. `Reply.aiDraft = text`, `Reply.status = 'draft_generated'`

### Approval Flow

1. `POST /api/replies/{id}/approve-send`
2. `sendCustomEmailViaSmartlead({ body: reply.aiDraft })`
3. `EmailLog.create({ type:'reply' })`
4. `Reply.status = 'draft_approved'`

### Collections Used
- `replies` — read + update
- `leads` — read
- `products` — read
- `claudeusagelogs` — write
- `emaillogs` — write

### Failure Scenarios
- Claude key not configured → 400
- Claude returns malformed JSON → fallback: `{ classification:'unclassified', draft:'', needsApproval:true }`

---

## Agent 8: Campaign Management Agent

**Trigger**: User creates/manages campaigns from `/campaigns`  
**Files**: `src/app/api/campaigns/route.ts`, `src/app/api/campaigns/[id]/leads/add/route.ts`, `src/app/api/campaigns/[id]/leads/route.ts`

### Operations
- **Create**: `POST /api/campaigns` → `Campaign.create()` + audit log
- **List leads**: `GET /api/campaigns/{id}/leads` — join CampaignLead + Lead
- **Add leads**: `POST /api/campaigns/{id}/leads/add` → `CampaignLead.insertMany({ ordered:false })`
- **Activity feed**: `GET /api/campaigns/{id}/activity` — recent EmailLogs

### Collections Used
- `campaigns`, `campaignleads`, `leads`, `emaillogs`, `auditlogs`

---

## Agent 9: No-Reply Tracking Agent

**Trigger**: Email sent → starts waiting; reply received → resolves  
**Files**: `src/lib/utils/noReplySync.ts`, `src/app/api/leads/no-reply/route.ts`, `src/lib/models/NoReplyLead.ts`

### Purpose
Tracks emailed leads awaiting a reply. Surfaces them in `/leads/no-reply` for follow-up or archival.

### Mark waiting: `markLeadWaitingForReply()`
Called after every successful send. Upserts `NoReplyLead` with `status='active'`, `isActive=true`.

### Resolve: `removeNoReplyOnReply()` / `resolveNoReplyForLead()`
Called by all sync agents when a reply is detected. Sets `isActive=false`, `status='resolved'`.

### Collections Used
- `noreplyleads` — CRUD
- `leads`, `replies`, `campaigns` — read

---

## Agent 10: Settings & User Management Agent

**Trigger**: Admin navigates to `/settings` or `/admin/users`  
**Files**: `src/app/api/settings/integrations/route.ts`, `src/app/api/users/route.ts`, `src/app/api/users/[id]/route.ts`

### Credential Save Flow
1. `POST /api/settings/integrations`
2. `encrypt(plaintext)` → `EncryptedField { ct, iv, tag }`
3. `IntegrationSettings.findOneAndUpdate({ upsert:true })`
4. `invalidateSettingsCache()` — immediate effect
5. Audit log: `settings_changed`

### User Management
- All routes require `role === 'admin'` (enforced at middleware level)
- `checkLastAdminMutation()` prevents deactivating/demoting the last admin
- Passwords hashed with scrypt via `hashPassword()` before storage

### Collections Used
- `integrationsettings`, `users`, `auditlogs`
