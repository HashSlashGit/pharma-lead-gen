# PharmaLeads — System Architecture

> Internal engineering documentation. Intended for: new developers, maintainers, founders, technical support, and AI agents modifying this codebase.

---

## 1. What This Platform Does

PharmaLeads is a B2B pharmaceutical lead-generation and outreach SaaS. It helps pharmaceutical exporters find pharmacies, distributors, hospitals, and healthcare businesses worldwide, then sends personalised cold emails and manages the reply lifecycle through to a closed deal.

Core loop:

1. **Discover** — Find businesses via Apollo (B2B database) or Apify (Google Maps scraper)
2. **Score** — Rule-based scoring determines lead quality; scores ≥ 70 unlock AI personalisation
3. **Outreach** — Smartlead sends emails on behalf of the sender; templates support `{{variable}}` substitution
4. **Reply capture** — Gmail OAuth sync or IMAP mailbox sync or Smartlead API pull captures inbound replies
5. **Classify** — Keyword rules classify each reply (interested / pricing_query / do_not_contact / etc.)
6. **Respond** — Optional Claude AI drafts a reply; human approves before send
7. **Follow-up** — Rule-based scheduler sends up to 3 follow-ups if no reply; archives to No-Reply if still no response

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.6 — App Router, React 19 |
| Runtime | Node.js 20 (server); Edge (middleware only) |
| Database | MongoDB Atlas via Mongoose 9 |
| Styling | Tailwind CSS 4 |
| Authentication | Custom HMAC-SHA256 session tokens; scrypt password hashing |
| AI | Anthropic Claude Haiku (claude-haiku-4-5-20251001) |
| Email sending | Smartlead REST API |
| Lead discovery | Apollo.io REST API + Apify Google Maps actor |
| Gmail sync | Google OAuth2 + Gmail REST API (native fetch, no SDK) |
| IMAP sync | imapflow + mailparser |
| Validation | Zod |
| Deployment | Vercel (serverless functions) |

---

## 3. High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BROWSER (React 19)                          │
│                                                                     │
│  /dashboard  /leads  /apollo  /apify  /campaigns  /settings  ...   │
└──────────────────────────┬──────────────────────────────────────────┘
                           │  HTTPS
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    VERCEL EDGE NETWORK                              │
│                                                                     │
│  src/middleware.ts (Edge Runtime)                                   │
│  ─ JWT_SECRET production guard                                      │
│  ─ v2 token verification (HMAC-SHA256)                              │
│  ─ Legacy APP_PASSWORD compatibility                                │
│  ─ Route protection (auth + admin enforcement)                      │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  NEXT.JS APP ROUTER (Node.js)                       │
│                                                                     │
│  Pages (src/app/**/page.tsx) — Server-rendered React UI            │
│  API Routes (src/app/api/**/route.ts) — REST endpoints             │
│                                                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │
│  │  Auth Routes    │  │  Lead Routes    │  │  Reply Routes   │    │
│  │ /api/auth/...   │  │ /api/leads/...  │  │ /api/replies/.. │    │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘    │
│           │                    │                     │             │
│  ┌────────┴────────────────────┴─────────────────────┴──────────┐  │
│  │              Service Layer (src/lib/services/)               │  │
│  │  smartlead.ts  apollo.ts  apify.ts  gmail.ts                 │  │
│  │  claude.ts  mailboxReplySync.ts  reply-classifier.ts         │  │
│  │  settingsCache.ts (60s in-process cache)                     │  │
│  └──────────────────────────────┬───────────────────────────────┘  │
│                                 │                                   │
│  ┌──────────────────────────────┴───────────────────────────────┐  │
│  │                   Utility Layer (src/lib/utils/)             │  │
│  │  session.ts  encryption.ts  scoreLead.ts  password.ts        │  │
│  │  adminGuard.ts  auditLog.ts  followupScheduler.ts            │  │
│  │  noReplySync.ts  emailFormatting.ts  requestActor.ts         │  │
│  └──────────────────────────────┬───────────────────────────────┘  │
└─────────────────────────────────┼───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      MONGODB ATLAS                                  │
│                                                                     │
│  Collections:                                                       │
│  users  leads  campaigns  campaignleads  emailogs  replies          │
│  noreplyleads  products  emailtemplates  integrationsettings        │
│  inboxaccounts  auditlogs  claudeusagelogs                          │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ External API calls
          ┌───────────────────────┼──────────────────────────┐
          ▼                       ▼                          ▼
┌──────────────────┐  ┌───────────────────┐  ┌──────────────────────┐
│  Smartlead API   │  │   Apollo.io API   │  │    Apify Cloud       │
│  (email sending) │  │  (B2B contacts)   │  │  (Google Maps actor) │
└──────────────────┘  └───────────────────┘  └──────────────────────┘
          │
          ▼
┌──────────────────┐  ┌───────────────────┐
│  Gmail REST API  │  │  Anthropic Claude  │
│  (reply sync)    │  │  (Haiku — AI draft)│
└──────────────────┘  └───────────────────┘
```

---

## 4. Request Flow Diagram

```
Browser Request
      │
      ▼
Edge Middleware (src/middleware.ts)
  ├─ Is ALWAYS_PUBLIC path? ──► Pass through
  ├─ Is production & no JWT_SECRET? ──► 503
  ├─ Has valid v2 token? ──► Set authed=true, isAdmin from payload
  ├─ Has legacy APP_PASSWORD token? ──► Set authed=true, isAdmin=true
  ├─ Dev mode, no APP_PASSWORD? ──► authed=true, isAdmin=true
  └─ None of above ──► 401 (API) or redirect /login (page)
      │
      ▼ (authenticated)
  Is admin route + not admin? ──► 403 (API) or redirect /dashboard
      │
      ▼
Next.js Route Handler (app/api/**/route.ts)
  ├─ connectDB()  — connection-cached Mongoose
  ├─ getSettings() — 60s cached integration credentials
  ├─ Business logic
  └─ Response
```

---

## 5. Authentication Flow Diagram

```
User submits /login (email + password)
      │
      ▼
POST /api/auth/login
  ├─ email present?
  │   ├─ connectDB()
  │   ├─ ensureFirstAdmin()  — creates admin from ADMIN_EMAIL env if no users exist
  │   ├─ Find user by email (case-insensitive)
  │   ├─ user.active = false? ──► 403
  │   ├─ verifyPassword(password, passwordHash)?
  │   │   ├─ No ──► 401
  │   │   └─ Yes ──► createSessionToken(userId, role, JWT_SECRET)
  │   │               Token format: v2|{userId}|{role}|{expiryMs}|{hmac}
  │   │               Set cookie: pharma_auth (httpOnly, secure, SameSite=Strict, 8h)
  │   └─ DB error ──► 503 (never falls through to legacy password)
  │
  └─ no email?  (legacy mode)
      ├─ APP_PASSWORD env set?
      │   ├─ No ──► 503
      │   └─ password === APP_PASSWORD?
      │       ├─ No ──► 401
      │       └─ Yes ──► createSessionToken('legacy', 'admin', JWT_SECRET)
      └─ Set same cookie

Every subsequent request:
  Edge Middleware reads pharma_auth cookie
  → verifySessionToken(cookie, JWT_SECRET)
  → Checks expiry + HMAC signature
  → Extracts userId + role from token payload
  → Role enforcement without any DB lookup (stateless)
```

---

## 6. User Lifecycle Diagram

```
First deploy
  │
  ▼
No users in DB + ADMIN_EMAIL + ADMIN_PASSWORD set
  │
  ▼
First login triggers ensureFirstAdmin() ──► Creates admin user in DB

Admin creates additional users via /admin/users
  │
  ▼
POST /api/users ──► hashPassword(scrypt) ──► User.create()
  │
  ▼
User receives credentials from admin (out-of-band)
  │
  ▼
User logs in ──► session cookie issued ──► role embedded in token
  │
  ▼
Admin can: deactivate | reset password | promote/demote role
  │
  └─ checkLastAdminMutation() prevents deactivating/demoting last admin

User deactivated ──► existing sessions still valid until expiry (8h)
                     (no session revocation — token is stateless)
```

---

## 7. Lead Lifecycle Diagram

```
Discovery
  ├─ Apollo search ──► NormalizedApolloLead ──► scoreLead() ──► Lead.create()
  ├─ Apify Maps ──────► NormalizedApifyLead ──► scoreGoogleMapsLead() ──► Lead.create()
  ├─ CSV import ──────► parsed rows ──────────► scoreLead() ──► Lead.bulkWrite()
  └─ Manual form ─────► /api/leads POST ──────► scoreLead() ──► Lead.create()

status=new, score=0-100
  │
  ▼
Lead scoring (src/lib/utils/scoreLead.ts)
  ├─ email present    → +35-40 pts
  ├─ phone present    → +20 pts (Maps) or +0 (Apollo)
  ├─ website present  → +10-15 pts
  ├─ relevant title   → +20 pts (Apollo only)
  ├─ company present  → +15 pts
  ├─ country present  → +10 pts
  ├─ category match   → +10 pts
  ├─ rating ≥ 4★     → +10 pts (Maps only)
  └─ reviews ≥ 20    → +10 pts (Maps only)

  score ≥ 80 → status=qualified (eligible for AI personalisation)
  score ≥ 40 → status=needs_review
  score  < 40 → status=low_priority

Lead assigned to Campaign ──► CampaignLead record created
  │
  ▼
Email sent via Smartlead (sendEmail or sendCustomEmailViaSmartlead)
  │
  └─ EmailLog created (status=pending→sent/ready_to_send_test/failed)
  └─ Lead.lastContactedAt set
  └─ NoReplyLead upserted (status=active, waiting for reply)
  │
  ▼
Reply received (Gmail sync / IMAP sync / Smartlead sync)
  │
  ▼
classifyReply() — keyword-based, zero AI credits
  ├─ do_not_contact → Lead.status=rejected, NoReplyLead resolved
  ├─ not_interested → Lead.status=rejected, NoReplyLead resolved
  ├─ out_of_office  → Lead.status=needs_review, NoReplyLead resolved
  ├─ pricing_query  → Lead.status=warm, needsApproval=true
  ├─ certificate_query → Lead.status=warm, needsApproval=true
  ├─ shipping_query → Lead.status=warm, needsApproval=true
  ├─ interested     → Lead.status=warm, needsApproval=true
  └─ needs_review   → Lead.status=needs_review, needsApproval=true
  │
  ▼
Human reviews reply in /leads/reply
  └─ Optionally: "Generate AI Draft" → Claude drafts response
  └─ Approve draft → EmailLog created → sent via Smartlead
  └─ Reject draft → status=draft_rejected
  │
  ▼ (no reply after N days)
Follow-up scheduler (disabled — manual flow via /leads/no-reply)
  └─ Day 1: followup_1 template
  └─ Day 3: followup_2 template
  └─ Day 7: followup_final template
  └─ After final: NoReplyLead archived (status=no_response)
```

---

## 8. Campaign Lifecycle Diagram

```
Create campaign (/campaigns → POST /api/campaigns)
  └─ Campaign.create({ name, status:'draft' })
  │
  ▼
Add leads to campaign (POST /api/campaigns/{id}/leads/add)
  └─ CampaignLead.create({ campaignId, leadId, status:'active' })
  │
  ▼
Send bulk email (/bulk-email → POST /api/bulk-email/send)
  ├─ Validate leads belong to campaign
  ├─ Skip: do_not_contact / rejected / no_response / no email
  ├─ Render {{variable}} placeholders per lead
  ├─ EmailLog.create() for each lead
  ├─ sendCustomEmailViaSmartlead() per lead
  ├─ markLeadWaitingForReply() → NoReplyLead upserted
  └─ Campaign.emailsSent incremented
  │
  ▼
Replies sync in via Gmail / IMAP / Smartlead
  └─ CampaignLead.lastReplyAt updated
  │
  ▼
Campaign lifecycle: draft → active → paused → completed
(manual status changes via UI — no automatic status transitions)
```

---

## 9. Reply Processing Lifecycle Diagram

```
Reply arrives in Gmail inbox / Smartlead master inbox / IMAP mailbox
      │
      ▼
Source determines handler:
  ├─ Gmail OAuth ──► POST /api/gmail/sync (manual trigger)
  ├─ Smartlead ───► POST /api/replies/sync-smartlead (manual trigger)
  └─ IMAP ────────► runMailboxSync() (called inside sync-smartlead)

Each handler:
  1. Resolve lead: match senderEmail → Lead.email
  2. Dedup (3 checks):
     ├─ By Gmail message ID / IMAP message ID / Smartlead message ID
     ├─ By bodyHash + leadId (SHA-256 first 16 hex chars of normalised body)
     └─ By exact body + leadId (mailbox sync only)
  3. classifyReply(body) — keyword rules, zero AI
  4. Reply.create({ leadId, body, classification, source, bodyHash, ... })
  5. syncLeadStatusFromReply() — update Lead.status
  6. removeNoReplyOnReply() — resolve NoReplyLead record
  7. CampaignLead.updateMany({ lastReplyAt })
  8. Lead.nextFollowUpAt = null (stops follow-ups)

Human action in /replies or /leads/reply:
  ├─ Generate Draft ──► POST /api/replies/{id}/generate-draft
  │   └─ draftReplyEmail() via Claude ──► Reply.aiDraft set
  ├─ Approve ─────────► POST /api/replies/{id}/approve-send
  │   └─ sendCustomEmailViaSmartlead() ──► EmailLog.create()
  │   └─ Reply.status = draft_approved
  └─ Reject ──────────► POST /api/replies/{id}/reject-draft
      └─ Reply.status = draft_rejected
```

---

## 10. Settings & Credentials Architecture

All integration credentials follow a **DB-first, env-fallback** pattern:

```
getSettings() called by any service/route that needs credentials
      │
      ▼
Cache hit? (_expiry > Date.now()) ──► return cached ResolvedSettings
      │
      ▼ (cache miss)
IntegrationSettings.findOne({}).lean()
      │
      ├─ doc.claudeApiKey (EncryptedField) ──► decrypt(AES-256-GCM) ──► string
      ├─ doc.smartleadApiKey ...
      └─ ...
      │
      ▼
Merge: DB values || process.env fallback
      │
      ▼
Cache for 60 seconds (_expiry = Date.now() + 60_000)
      │
      ▼
Return ResolvedSettings

Settings UI save:
  POST /api/settings/integrations
  └─ encrypt(plaintext) ──► EncryptedField { ct, iv, tag }
  └─ IntegrationSettings.findOneAndUpdate({ upsert:true })
  └─ invalidateSettingsCache() — forces next call to re-read DB
```

Encryption: AES-256-GCM. Key = APP_ENCRYPTION_KEY env var (64 hex chars = 32 bytes).  
Each field encrypted with a unique 16-byte random IV. The auth tag prevents tampering.

---

## 11. Environment Variables Reference

| Variable | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB Atlas connection string |
| `JWT_SECRET` | Yes (production) | Session token signing — 32+ random chars |
| `APP_ENCRYPTION_KEY` | Yes | AES-256-GCM key — exactly 64 hex chars |
| `ADMIN_EMAIL` | Yes | Bootstrap first admin account email |
| `ADMIN_PASSWORD` | Yes | Bootstrap first admin account password |
| `NEXT_PUBLIC_APP_URL` | Yes | Public URL for OAuth callbacks |
| `APP_PASSWORD` | No | Legacy single-user mode password |
| `CLAUDE_API_KEY` | No (env fallback) | Anthropic API key (prefer Settings UI) |
| `SMARTLEAD_API_KEY` | No (env fallback) | Smartlead API key |
| `SMARTLEAD_CAMPAIGN_ID` | No (env fallback) | Target campaign ID in Smartlead |
| `SMARTLEAD_FROM_EMAIL` | No (env fallback) | Sender email for custom sends |
| `SMARTLEAD_DRY_RUN` | No | `false` to enable live sending (default: dry-run) |
| `APOLLO_API_KEY` | No (env fallback) | Apollo.io API key |
| `APIFY_API_TOKEN` | No (env fallback) | Apify cloud token |
| `GOOGLE_CLIENT_ID` | No (env fallback) | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No (env fallback) | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | No (env fallback) | OAuth callback URI |

**Security note**: All credentials except `MONGODB_URI`, `JWT_SECRET`, `APP_ENCRYPTION_KEY`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` can be stored in MongoDB via the Settings UI. Env vars act as fallback only. When a credential is updated in Settings, `invalidateSettingsCache()` is called immediately.
