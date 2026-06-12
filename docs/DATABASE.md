# PharmaLeads — Database Documentation

MongoDB Atlas. ORM: Mongoose 9. All models: `src/lib/models/`.

---

## Collection Relationship Diagram

```
users
  └─ (creates sessions — no FK, userId stored in cookie)

products
  └─ referenced in EmailLog (optional, for template variables)

leads ──────────────────────────────────────────┐
  │                                             │
  ├──── emaillogs (leadId → leads._id)          │
  │       └── campaignleads.lastEmailLogId      │
  │                                             │
  ├──── replies (leadId → leads._id)            │
  │       └── Reply.draftEmailLogId → emaillogs │
  │                                             │
  ├──── noreplyleads (leadId → leads._id, 1:1)  │
  │       └── lastEmailLogId → emaillogs        │
  │       └── removedByReplyId → replies        │
  │                                             │
  └──── campaignleads (leadId → leads._id) ─────┘
           └── campaignId → campaigns._id

campaigns
  └──── campaignleads (campaignId → campaigns._id)
  └──── emaillogs (campaignId → campaigns._id, optional)

emailtemplates (standalone — no FK relationships)

integrationsettings (singleton document — no FK relationships)

inboxaccounts (standalone — provider:'gmail', one active record)

auditlogs (standalone — actorId is string, not ObjectId reference)

claudeusagelogs (leadId → leads._id, optional)
```

---

## Collection: `leads`

**Model**: `src/lib/models/Lead.ts`  
**Purpose**: Core entity. Every discovered business is a Lead.

### Schema

| Field | Type | Required | Notes |
|---|---|---|---|
| `companyName` | String | Yes | trimmed |
| `country` | String | Yes | trimmed |
| `city` | String | No | trimmed |
| `category` | String | Yes | business category |
| `email` | String | No | lowercase, trimmed |
| `phone` | String | No | |
| `website` | String | No | |
| `source` | String | No | 'apollo', 'apify', 'csv', 'manual' |
| `status` | String | Yes | enum — see below |
| `score` | Number | Yes | 0–100, default 0 |
| `aiProcessed` | Boolean | Yes | default false |
| `lastContactedAt` | Date | No | set when email sent |
| `followUpCount` | Number | Yes | default 0 |
| `nextFollowUpAt` | Date | No | cleared when reply received |
| `notes` | String | No | free text |
| `createdAt` | Date | Auto | timestamps |
| `updatedAt` | Date | Auto | timestamps |

### Status Enum

`new` → `qualified` / `needs_review` / `low_priority` (scoring)  
→ `contacted` (email sent)  
→ `warm` / `cold` / `rejected` / `no_response` / `do_not_contact` (reply or outcome)

### Indexes

```javascript
{ email: 1 }           // sparse — email dedup lookup
{ status: 1 }          // filter by status in UI
{ country: 1 }         // geographic filter
{ score: -1 }          // sort by score descending
{ source: 1 }          // sparse — filter by source
{ createdAt: -1 }      // default sort
{ nextFollowUpAt: 1 }  // sparse — follow-up scheduler
```

### Creation Flow
- Apollo import: `Lead.insertMany(leads, { ordered: false })`
- Apify import: same
- CSV import: `Lead.insertMany()` in batches
- Manual: `Lead.create(body)` via `POST /api/leads`

### Update Flow
- Score/status: set at creation or enrichment
- `lastContactedAt`: set when email sent
- `status`: updated by reply classification
- `nextFollowUpAt=null`: cleared when any reply is received

### Deletion Flow
- `DELETE /api/leads/{id}` → `Lead.findByIdAndDelete()`
- Does NOT cascade: related EmailLogs, Replies, NoReplyLeads, CampaignLeads remain

---

## Collection: `campaigns`

**Model**: `src/lib/models/Campaign.ts`  
**Purpose**: Groups leads for coordinated outreach.

### Schema

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | String | Yes | |
| `targetCountry` | String | No | for documentation only |
| `targetCategory` | String | No | for documentation only |
| `status` | String | Yes | `draft`/`active`/`paused`/`completed` |
| `emailsSent` | Number | Yes | default 0 — counter |
| `replies` | Number | Yes | default 0 — counter |
| `createdAt` | Date | Auto | |
| `updatedAt` | Date | Auto | |

### Indexes
```javascript
{ status: 1 }
{ createdAt: -1 }
```

### Notes
- `emailsSent` and `replies` are counters incremented manually — not always perfectly in sync with EmailLog/Reply counts. Use those collections for exact counts.
- Status is set manually by operators — no automatic transitions.

---

## Collection: `campaignleads`

**Model**: `src/lib/models/CampaignLead.ts`  
**Purpose**: Junction table between campaigns and leads.

### Schema

| Field | Type | Required | Notes |
|---|---|---|---|
| `campaignId` | ObjectId | Yes | ref: Campaign |
| `leadId` | ObjectId | Yes | ref: Lead |
| `status` | String | Yes | `active`/`removed` |
| `addedAt` | Date | Yes | default: now |
| `lastReplyAt` | Date | No | updated by sync agents |

### Indexes
```javascript
{ campaignId: 1 }
{ leadId: 1 }
{ campaignId: 1, leadId: 1 }  // unique — prevents duplicate membership
```

### Notes
- A lead can belong to multiple campaigns (different `campaignId` documents).
- `lastReplyAt` is updated by all three sync agents when a reply from this lead is found.

---

## Collection: `emaillogs`

**Model**: `src/lib/models/EmailLog.ts`  
**Purpose**: Audit record of every email sent (or attempted). Also used for IMAP reply matching.

### Schema

| Field | Type | Required | Notes |
|---|---|---|---|
| `leadId` | ObjectId | Yes | ref: Lead |
| `campaignId` | ObjectId | No | ref: Campaign |
| `replyId` | ObjectId | No | ref: Reply (for reply emails) |
| `type` | String | Yes | `initial`/`follow_up`/`reply` |
| `subject` | String | Yes | |
| `body` | String | Yes | |
| `status` | String | Yes | see below |
| `sentAt` | Date | No | set when status=sent |
| `sendMode` | String | No | `campaign`/`custom` |
| `leadEmail` | String | No | denormalised for reply matching |
| `smartleadTrackId` | String | No | Smartlead trackId for custom sends |
| `smartleadResponse` | Mixed | No | raw Smartlead API response |

### Status Enum
`pending` → `ready_to_send_test` / `sent` / `failed` / `opened` / `clicked`

### Indexes
```javascript
{ leadId: 1 }
{ replyId: 1 }
{ status: 1 }
{ type: 1, status: 1 }
{ sendMode: 1, status: 1 }  // sparse
{ leadEmail: 1 }            // sparse — used by IMAP mailbox sync
{ smartleadTrackId: 1 }     // sparse
{ sentAt: -1 }              // sparse
{ createdAt: -1 }
```

### Important Note on `leadEmail`
This field is denormalised (copied from `Lead.email` at send time). The IMAP mailbox sync uses `leadEmail` to match inbound replies: it queries `EmailLog.find({ sendMode:'custom', status:'sent', leadEmail: fromAddress })`. If `leadEmail` is missing or wrong, IMAP matching will fail for that email.

---

## Collection: `replies`

**Model**: `src/lib/models/Reply.ts`  
**Purpose**: Every inbound reply from a lead, regardless of source.

### Schema

| Field | Type | Required | Notes |
|---|---|---|---|
| `leadId` | ObjectId | Yes | ref: Lead |
| `emailLogId` | ObjectId | No | ref: EmailLog (initial email) |
| `messageId` | String | No | general message ID |
| `body` | String | Yes | full reply text |
| `classification` | String | No | see enum below |
| `aiDraft` | String | No | Claude-generated draft |
| `needsApproval` | Boolean | Yes | default false |
| `status` | String | Yes | see below |
| `aiDraftGenerated` | Boolean | Yes | default false |
| `draftEmailLogId` | ObjectId | No | EmailLog for approved reply |
| `approvedAt` | Date | No | |
| `rejectedAt` | Date | No | |
| `source` | String | No | `webhook`/`smartlead_sync`/`mailbox_sync`/`manual`/`gmail` |
| `mailboxMessageId` | String | No | IMAP Message-ID header |
| `smartleadMessageId` | String | No | Smartlead reply ID |
| `bodyHash` | String | No | SHA-256 first 16 hex chars of normalised body |
| `receivedAt` | Date | No | actual receive time |
| `gmailMessageId` | String | No | Gmail message ID |
| `gmailThreadId` | String | No | Gmail thread ID |

### Classification Enum
`interested` / `not_interested` / `do_not_contact` / `pricing_query` / `certificate_query` / `shipping_query` / `out_of_office` / `needs_review` / `unclassified`

### Status Enum
`pending` → `draft_generated` → `draft_approved` / `draft_rejected` → `handled`

### Indexes
```javascript
{ leadId: 1 }
{ status: 1 }
{ needsApproval: 1, status: 1 }
{ messageId: 1 }            // sparse
{ source: 1 }               // sparse
{ mailboxMessageId: 1 }     // sparse — IMAP dedup
{ bodyHash: 1, leadId: 1 }  // sparse — content dedup
{ gmailMessageId: 1 }       // sparse — Gmail dedup
{ smartleadMessageId: 1 }   // sparse — Smartlead dedup
{ classification: 1 }       // sparse
{ createdAt: -1 }
{ receivedAt: -1 }          // sparse
```

### Deduplication
Three separate message ID fields exist because the same reply can arrive via multiple sync sources. The system checks all three before creating a new record, plus the `bodyHash + leadId` compound index as a content-level fallback.

---

## Collection: `noreplyleads`

**Model**: `src/lib/models/NoReplyLead.ts`  
**Purpose**: Tracks leads that have been emailed but have not replied. One record per lead (unique constraint on `leadId`).

### Schema

| Field | Type | Notes |
|---|---|---|
| `leadId` | ObjectId | unique, ref: Lead |
| `companyName` | String | denormalised |
| `email` | String | denormalised |
| `country` | String | denormalised |
| `category` | String | denormalised |
| `status` | String | `active`/`resolved`/`archived` |
| `lastSentAt` | Date | when last email was sent |
| `lastEmailLogId` | ObjectId | ref: EmailLog |
| `replyReceivedAt` | Date | when reply was received (if resolved) |
| `campaignIds` | ObjectId[] | campaigns this lead was in |
| `isActive` | Boolean | false = removed from active view |
| `removedFromNoReplyAt` | Date | when resolved/archived |
| `removedFromNoReplyReason` | String | reason for removal |
| `removedByReplyId` | ObjectId | ref: Reply |
| `latestReplySource` | String | which sync source resolved this |
| `followUpCount` | Number | default 0 |

### Legacy Fields (kept for backward compat)
`originalStatus`, `finalStatus`, `lastContactedAt`, `campaignId`, `reason`, `archivedAt`

### Indexes
```javascript
{ leadId: 1 }           // (also unique constraint)
{ email: 1 }            // sparse
{ status: 1 }
{ isActive: 1 }         // primary filter for /leads/no-reply page
{ isActive: 1, status: 1 }
{ status: 1, lastSentAt: -1 }
{ lastSentAt: -1 }      // sparse
{ removedFromNoReplyAt: -1 } // sparse
{ archivedAt: -1 }
{ country: 1 }
{ campaignIds: 1 }      // sparse
{ createdAt: -1 }
```

---

## Collection: `products`

**Model**: `src/lib/models/Product.ts`  
**Purpose**: Product catalogue for email variable substitution.

### Schema

| Field | Type | Notes |
|---|---|---|
| `name` | String | required |
| `category` | String | required |
| `description` | String | |
| `pricing` | String | |
| `moq` | String | minimum order quantity |
| `certifications` | String[] | |
| `shippingDetails` | String | |
| `approvedClaims` | String[] | approved marketing claims |
| `restrictedClaims` | String[] | claims NOT to use |

### Usage
Products are selected in the bulk-email and compose flows. Their fields are interpolated into email templates via `{{productName}}`, `{{moq}}`, `{{pricing}}`, etc.

`approvedClaims` is passed to Claude when generating personalized emails — Claude is instructed not to make claims outside this list.

---

## Collection: `emailtemplates`

**Model**: `src/lib/models/EmailTemplate.ts`  
**Purpose**: Reusable email templates with `{{variable}}` placeholders.

### Schema

| Field | Type | Notes |
|---|---|---|
| `name` | String | required |
| `type` | String | `initial`/`follow_up`/`warm_reply`/`cold_reply`/`pricing`/`custom` |
| `subject` | String | required |
| `body` | String | required |
| `isActive` | Boolean | default true |

---

## Collection: `integrationsettings`

**Model**: `src/lib/models/IntegrationSettings.ts`  
**Purpose**: Singleton document storing all integration credentials (encrypted) and configuration.

### Schema

All API key fields use the `EncryptedField` sub-schema `{ ct: String, iv: String, tag: String }`.

| Field | Type | Notes |
|---|---|---|
| `claudeApiKey` | EncryptedField | Anthropic API key |
| `smartleadApiKey` | EncryptedField | Smartlead key |
| `smartleadCampaignId` | String | Target campaign ID |
| `smartleadFromEmail` | String | Sender address |
| `smartleadFromName` | String | Sender display name |
| `smartleadDryRun` | Boolean | false = live sending |
| `apolloApiKey` | EncryptedField | Apollo.io key |
| `apolloMaxResults` | Number | |
| `apifyToken` | EncryptedField | Apify cloud token |
| `apifyActorId` | String | Default: compass/crawler-google-places |
| `apifyMaxResults` | Number | |
| `apifyWebsiteEnrichment` | Boolean | |
| `mailboxEnabled` | Boolean | IMAP sync toggle |
| `mailboxImapHost` | String | |
| `mailboxImapPort` | Number | |
| `mailboxImapSecure` | Boolean | |
| `mailboxUser` | String | |
| `mailboxPassword` | EncryptedField | |
| `mailboxLookbackDays` | Number | |
| `appUrl` | String | |
| `googleClientId` | EncryptedField | Google OAuth client ID |
| `googleClientSecret` | EncryptedField | Google OAuth client secret |
| `googleRedirectUri` | String | |

### Important
There is exactly ONE document in this collection. `findOne({})` always returns it.  
`settingsCache.ts` caches the decrypted values for 60 seconds.

---

## Collection: `inboxaccounts`

**Model**: `src/lib/models/InboxAccount.ts`  
**Purpose**: Stores Gmail OAuth tokens for the connected inbox account.

### Schema

| Field | Type | Notes |
|---|---|---|
| `provider` | String | 'gmail' (only supported value) |
| `email` | String | unique |
| `accessToken` | String | **plain text — TODO: encrypt** |
| `refreshToken` | String | **plain text — TODO: encrypt** |
| `tokenExpiry` | Date | |
| `lastSyncedAt` | Date | |
| `lastHistoryId` | String | Gmail history ID (for incremental sync) |
| `isActive` | Boolean | default true |

### Security Note
The model itself has a TODO comment noting that `accessToken` and `refreshToken` should be encrypted before full production use. Currently stored in plain text in MongoDB.

---

## Collection: `users`

**Model**: `src/lib/models/User.ts`  
**Purpose**: User accounts for the multi-user auth system.

### Schema

| Field | Type | Notes |
|---|---|---|
| `name` | String | required |
| `email` | String | required, unique, lowercase |
| `passwordHash` | String | scrypt hash |
| `role` | String | `admin`/`user` |
| `active` | Boolean | default true |

### Password Hashing
Uses Node.js `crypto.scryptSync()` with a random salt. Format: `{hash_hex}:{salt_hex}`. See `src/lib/utils/password.ts`.

---

## Collection: `auditlogs`

**Model**: `src/lib/models/AuditLog.ts`  
**Purpose**: Immutable record of important admin actions.

### Schema

| Field | Type | Notes |
|---|---|---|
| `action` | String | see enum below |
| `actorId` | String | userId (null for system) |
| `actorEmail` | String | null for system actions |
| `targetId` | String | resource ID affected |
| `targetLabel` | String | human-readable target |
| `meta` | Mixed | extra context, no secrets |
| `createdAt` | Date | no `updatedAt` |

### Action Enum
`user_created` / `user_deleted` / `user_updated` / `password_reset` / `settings_changed` / `lead_imported` / `campaign_created` / `bulk_email_sent`

---

## Collection: `claudeusagelogs`

**Model**: `src/lib/models/ClaudeUsageLog.ts`  
**Purpose**: Track AI API usage and costs.

### Schema

| Field | Type | Notes |
|---|---|---|
| `actionType` | String | `personalized_email`/`analyze_reply`/`draft_response` |
| `leadId` | ObjectId | optional ref: Lead |
| `promptTokens` | Number | |
| `completionTokens` | Number | |
| `estimatedCost` | Number | USD, based on Haiku pricing |
| `createdAt` | Date | |

### Cost Rates (Claude Haiku)
- Input: $0.25 / 1M tokens
- Output: $1.25 / 1M tokens
