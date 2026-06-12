# PharmaLeads — API Reference

All routes are under `/api/`. Authentication is enforced at the Edge Middleware layer for all non-public paths.

**Auth requirements**:
- `user` — any authenticated user (admin or regular)
- `admin` — admin role required (enforced by middleware, not individual routes)
- `public` — no auth required

Cookie: `pharma_auth` (httpOnly, SameSite=Strict, 8h TTL)

---

## Authentication

### `POST /api/auth/login`
**Auth**: public  
**Purpose**: Authenticate and issue session cookie

**Request**:
```json
{ "email": "user@example.com", "password": "secret" }
```
Email is optional — omit for legacy APP_PASSWORD mode.

**Response (200)**:
```json
{ "success": true }
```
Sets `pharma_auth` cookie.

**Error responses**:
- `400` — missing password or malformed body
- `401` — invalid email/password
- `403` — account deactivated
- `503` — DB unavailable or auth not configured

---

### `POST /api/auth/logout`
**Auth**: user  
**Purpose**: Clear session cookie

**Response (200)**:
```json
{ "success": true }
```

---

### `GET /api/auth/me`
**Auth**: user  
**Purpose**: Get current user info

**Response (200)**:
```json
{
  "authenticated": true,
  "user": { "id": "...", "email": "...", "name": "...", "role": "admin" }
}
```
Returns `{ "authenticated": false }` if not authenticated (used by Sidebar to determine admin nav).

---

## Leads

### `GET /api/leads`
**Auth**: user  
**Purpose**: List leads with optional filters

**Query params**:
- `status` — filter by lead status
- `from` — ISO date (createdAt ≥)
- `to` — ISO date (createdAt ≤)
- `page` — pagination (default 1)
- `limit` — per page (default 50)

**Response (200)**:
```json
{
  "leads": [{ "_id": "...", "companyName": "...", "status": "qualified", "score": 85, ... }],
  "total": 142,
  "page": 1
}
```

---

### `POST /api/leads`
**Auth**: user  
**Purpose**: Create a single lead manually

**Request**:
```json
{
  "companyName": "ABC Pharmacy",
  "country": "Germany",
  "category": "pharmacy",
  "email": "contact@abc.de",
  "phone": "+49...",
  "website": "abc.de"
}
```

**Response (201)**:
```json
{ "lead": { "_id": "...", "score": 85, "status": "qualified", ... } }
```

---

### `GET /api/leads/{id}`
**Auth**: user  
**Purpose**: Get single lead with full details

**Response (200)**: Lead document

---

### `PATCH /api/leads/{id}`
**Auth**: user  
**Purpose**: Update lead fields

**Request**: Any subset of lead fields

**Database impact**: `Lead.findByIdAndUpdate()`

---

### `DELETE /api/leads/{id}`
**Auth**: user  
**Purpose**: Delete lead

**Database impact**: `Lead.findByIdAndDelete()` — does NOT cascade to EmailLogs, Replies, etc.

---

### `POST /api/leads/{id}/personalize`
**Auth**: user  
**Purpose**: Generate AI-personalised email for a qualified lead

**Request**:
```json
{ "productId": "..." }
```

**Database impact**: Creates `EmailLog`, writes `ClaudeUsageLog`  
**External calls**: Anthropic Claude API (`generatePersonalizedEmail`)

**Response (200)**:
```json
{ "subject": "...", "body": "...", "emailLogId": "..." }
```

---

### `POST /api/leads/import`
**Auth**: user  
**Purpose**: Bulk import leads from CSV (multipart form data)

**Request**: `multipart/form-data` with `file` field (CSV)  
**Database impact**: `Lead.insertMany()`, writes `AuditLog`

---

### `GET /api/leads/no-reply`
**Auth**: user  
**Purpose**: List leads waiting for reply

**Response (200)**:
```json
{ "leads": [...], "total": N }
```

---

### `POST /api/leads/no-reply/assign-campaign`
**Auth**: user  
**Purpose**: Assign selected no-reply leads to a campaign

**Request**:
```json
{ "leadIds": ["..."], "campaignId": "..." }
```

---

### `POST /api/leads/no-reply/reconcile-replies`
**Auth**: user  
**Purpose**: Scan Reply collection and resolve any NoReplyLead records that already have a reply

---

## Campaigns

### `GET /api/campaigns`
**Auth**: user  
**Purpose**: List all campaigns

---

### `POST /api/campaigns`
**Auth**: user  
**Purpose**: Create campaign

**Request**:
```json
{ "name": "Germany Q1", "targetCountry": "Germany", "targetCategory": "pharmacy" }
```

**Database impact**: `Campaign.create()`, `AuditLog.create()`

---

### `GET /api/campaigns/{id}/leads`
**Auth**: user  
**Purpose**: List leads in a campaign (with lead details)

---

### `POST /api/campaigns/{id}/leads/add`
**Auth**: user  
**Purpose**: Add leads to campaign

**Request**:
```json
{ "leadIds": ["...", "..."] }
```

**Database impact**: `CampaignLead.insertMany({ ordered: false })`

---

### `GET /api/campaigns/{id}/activity`
**Auth**: user  
**Purpose**: Get recent email activity for a campaign

---

## Email Sending

### `POST /api/bulk-email/send`
**Auth**: user  
**Purpose**: Send email to multiple leads in a campaign

**Request**:
```json
{
  "campaignId": "...",
  "subject": "Hello {{companyName}}",
  "body": "Dear {{companyName}} team...",
  "leadIds": ["...", "..."],
  "productId": "..." 
}
```

**Database impact**: Creates `EmailLog` per lead, updates `Lead`, upserts `NoReplyLead`, writes `AuditLog`  
**External calls**: Smartlead API per lead

**Response (200)**:
```json
{
  "sent": 45,
  "failed": 2,
  "skipped": 3,
  "total": 50,
  "results": [{ "leadId": "...", "email": "...", "status": "sent" }]
}
```

---

### `GET /api/email-logs`
**Auth**: user  
**Purpose**: List email logs with filters

---

### `POST /api/email-logs/{id}/send`
**Auth**: user  
**Purpose**: Resend or send a pending email log

---

### `POST /api/email-logs/manual-draft`
**Auth**: user  
**Purpose**: Create a manual email draft

---

### `POST /api/email-logs/{id}/improve-with-ai`
**Auth**: user  
**Purpose**: Improve an email draft using Claude AI

**Database impact**: Updates `EmailLog.body`, creates `ClaudeUsageLog`  
**External calls**: Anthropic Claude API (`improveEmailDraft`)

---

## Replies

### `GET /api/replies`
**Auth**: user  
**Purpose**: List replies (pending review)

**Query params**:
- `status` — filter
- `classification` — filter
- `needsApproval` — `true`/`false`

---

### `GET /api/replies/{id}`
**Auth**: user  
**Purpose**: Get single reply with lead context

---

### `POST /api/replies/{id}/generate-draft`
**Auth**: user  
**Purpose**: Generate AI reply draft

**Database impact**: Updates `Reply.aiDraft`, `Reply.status`, creates `ClaudeUsageLog`  
**External calls**: Anthropic Claude API

**Response (200)**:
```json
{ "draft": "Dear ...", "replyId": "..." }
```

---

### `POST /api/replies/{id}/approve-send`
**Auth**: user  
**Purpose**: Approve draft and send reply via Smartlead

**Database impact**: Creates `EmailLog`, updates `Reply.status='draft_approved'`  
**External calls**: Smartlead API (`sendCustomEmailViaSmartlead`)

---

### `POST /api/replies/{id}/reject-draft`
**Auth**: user  
**Purpose**: Reject AI draft without sending

**Database impact**: `Reply.status='draft_rejected'`, `Reply.rejectedAt=now`

---

### `POST /api/replies/sync-smartlead`
**Auth**: user  
**Purpose**: Sync replies from Smartlead Master Inbox + optional IMAP mailbox

**Request** (all optional):
```json
{ "debug": false, "pages": 3, "limit": 20 }
```

**Response (200)**:
```json
{
  "success": true,
  "sourceUsed": "master_inbox",
  "checked": 10,
  "synced": 3,
  "duplicates": 7,
  "unmatched": 0,
  "totalSynced": 4,
  "mailbox": { "enabled": true, "synced": 1 },
  "message": "Synced 4 replies total."
}
```

---

### `POST /api/replies/sync-mailbox`
**Auth**: user  
**Purpose**: Run IMAP mailbox sync standalone (without Smartlead)

---

### `POST /api/replies/sync-lead-statuses`
**Auth**: user  
**Purpose**: Recalculate lead statuses based on existing Reply records

---

## Gmail OAuth

### `GET /api/gmail/connect`
**Auth**: user  
**Purpose**: Initiate Gmail OAuth flow → redirects to Google

**External calls**: Builds Google OAuth URL from `getSettings()` credentials

---

### `GET /api/gmail/callback`
**Auth**: public (receives OAuth redirect from Google)  
**Purpose**: Complete OAuth exchange, store tokens

**Query params**: `code` (from Google), `error` (if user denied)

**Database impact**: `InboxAccount.create()` or update  
**External calls**: `exchangeCodeForTokens()` + Gmail profile API

**Redirects to**: `/settings?gmail=connected` or `/settings?gmail=error`

---

### `GET /api/gmail/status`
**Auth**: user  
**Purpose**: Get Gmail connection status

**Response (200)**:
```json
{
  "connected": true,
  "email": "user@gmail.com",
  "lastSyncedAt": "2026-06-12T10:00:00Z"
}
```

---

### `POST /api/gmail/sync`
**Auth**: user  
**Purpose**: Sync Gmail inbox replies into Reply collection

**Response (200)**:
```json
{
  "success": true,
  "checked": 50,
  "created": 3,
  "duplicates": 47,
  "skippedNoLead": 5,
  "message": "Synced 3 new replies from Gmail."
}
```

---

## Apollo

### `POST /api/apollo/search`
**Auth**: user  
**Purpose**: Search Apollo.io for leads (does NOT save to DB)

**Request**:
```json
{
  "keyword": "pharmaceutical distributor",
  "country": "Germany",
  "jobTitle": "purchasing manager",
  "limit": 25
}
```

**External calls**: Apollo `POST /api/v1/mixed_people/api_search`

---

### `POST /api/apollo/import`
**Auth**: user  
**Purpose**: Save selected Apollo leads to DB

**Request**:
```json
{ "leads": [{ ...NormalizedApolloLead }] }
```

**Database impact**: `Lead.insertMany({ ordered: false })`

---

### `POST /api/apollo/enrich`
**Auth**: user  
**Purpose**: Enrich a specific lead with email/phone from Apollo

**Request**:
```json
{
  "leadId": "...",
  "apolloId": "...",
  "firstName": "...",
  "lastName": "...",
  "website": "..."
}
```

**External calls**: Apollo `POST /api/v1/people/match`

---

## Apify

### `POST /api/apify/maps-search`
**Auth**: user  
**Purpose**: Search Google Maps via Apify actor (does NOT save to DB)

**Request**:
```json
{
  "keyword": "pharmacy",
  "city": "Berlin",
  "country": "Germany",
  "limit": 50
}
```

**External calls**: Apify actor run + dataset fetch

---

### `POST /api/apify/import`
**Auth**: user  
**Purpose**: Save selected Apify leads to DB

---

### `POST /api/apify/enrich-website`
**Auth**: user  
**Purpose**: Extract email from a specific lead's website

**Request**:
```json
{ "leadId": "...", "website": "https://pharmacy.de" }
```

---

## Email Templates

### `GET /api/email-templates`
**Auth**: user  
**Purpose**: List all active templates

---

### `POST /api/email-templates`
**Auth**: user  
**Purpose**: Create template

---

### `GET /api/email-templates/{id}`
**Auth**: user  

---

### `PATCH /api/email-templates/{id}`
**Auth**: user  

---

### `DELETE /api/email-templates/{id}`
**Auth**: user  

---

## Products

### `GET /api/products`
**Auth**: user  

---

### `POST /api/products`
**Auth**: user  

---

## Follow-Ups

### `POST /api/follow-ups/process`
**Auth**: user  
**Purpose**: Process due follow-ups (currently disabled)

**Response (200)**:
```json
{ "success": false, "disabled": true, "message": "Automated follow-ups are disabled..." }
```

### `GET /api/follow-ups/due`
**Auth**: user  
**Purpose**: List leads with pending follow-ups

---

## Users (Admin Only)

### `GET /api/users`
**Auth**: admin  
**Purpose**: List all user accounts

---

### `POST /api/users`
**Auth**: admin  
**Purpose**: Create new user

**Request**:
```json
{ "name": "Jane Smith", "email": "jane@company.com", "password": "...", "role": "user" }
```

**Database impact**: `User.create()`, writes `AuditLog`

---

### `GET /api/users/{id}`
**Auth**: admin  

---

### `PATCH /api/users/{id}`
**Auth**: admin  
**Purpose**: Update user (name, role, active)

**Guard**: `checkLastAdminMutation()` prevents demoting/deactivating last admin

---

### `DELETE /api/users/{id}`
**Auth**: admin  
**Purpose**: Delete user account

**Database impact**: `User.findByIdAndDelete()`, writes `AuditLog`

---

### `POST /api/users/{id}/reset-password`
**Auth**: admin  
**Purpose**: Reset user's password

**Request**:
```json
{ "newPassword": "..." }
```

**Database impact**: Updates `User.passwordHash`, writes `AuditLog`

---

## Settings (Admin Only)

### `GET /api/settings/integrations`
**Auth**: admin  
**Purpose**: Get current integration settings (secrets masked)

**Response**: All settings with sensitive fields replaced by `mask(value)`

---

### `POST /api/settings/integrations`
**Auth**: admin  
**Purpose**: Save integration credentials

**Request**: Any combination of integration fields  
**Database impact**: `IntegrationSettings.findOneAndUpdate({ upsert:true })`, `invalidateSettingsCache()`, writes `AuditLog`

---

## System

### `GET /api/health`
**Auth**: public  
**Purpose**: System health check (used by settings page)

**Response (200)**:
```json
{
  "status": "ok",
  "mongodb": "connected",
  "smartlead": { "configured": true, "dryRun": false },
  "uptime": 12345
}
```

---

### `GET /api/config`
**Auth**: user  
**Purpose**: Runtime configuration flags for frontend (not cached — `force-dynamic`)

**Response (200)**:
```json
{
  "smartlead": {
    "configured": true,
    "dryRun": false,
    "campaignId": "123",
    "fromEmail": "sales@company.com"
  },
  "claude": { "configured": true },
  "apollo": { "configured": true },
  "apify": { "configured": true, "websiteEnrichment": false }
}
```

---

### `GET /api/dashboard/stats`
**Auth**: user  
**Purpose**: Aggregate counts for dashboard cards

**Response (200)**:
```json
{
  "totalLeads": 1420,
  "qualifiedLeads": 342,
  "emailsSent": 890,
  "replies": 67,
  "warmLeads": 23
}
```
