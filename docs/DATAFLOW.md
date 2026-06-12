# PharmaLeads — Data Flow Maps

End-to-end traces for every major workflow.

---

## Flow 1: Apollo Lead Discovery

```
User enters keywords + country + job title on /apollo
              │
              ▼
POST /api/apollo/search
  → getSettings() [settingsCache: DB || env]
  → apolloApiKey resolved
              │
              ▼
Apollo API: POST https://api.apollo.io/api/v1/mixed_people/api_search
  Headers: x-api-key: {apolloApiKey}
  Body: { q_keywords, person_locations, person_titles, per_page }
              │
              ▼
Response: { people: ApolloPersonRaw[] }
  normalizeApolloLead() per person
  → { apolloId, firstName, lastName, companyName, country, email?, phone?, website?, source:'apollo' }
              │
              ▼
Results displayed in browser table (NOT yet in DB)
  User selects leads to import
              │
              ▼
POST /api/apollo/import
  { leads: NormalizedApolloLead[] }
              │
              ▼
scoreLead(lead) per lead
  → { score: 0-100, status: 'qualified'|'needs_review'|'low_priority' }
              │
              ▼
Lead.insertMany(leads, { ordered: false })
  → MongoDB: leads collection
  → Duplicate emails silently skipped (sparse unique index)
              │
              ▼
Return: { inserted: N, skipped: M }
              │
              ▼
User optionally clicks "Enrich" on a lead
              │
              ▼
POST /api/apollo/enrich
  → enrichApolloPerson() → POST /api/v1/people/match
  → Lead.findByIdAndUpdate({ email, phone })
  → ClaudeUsageLog NOT written (Apollo, not Claude)
```

---

## Flow 2: Apify Google Maps Discovery

```
User enters keyword + city + country on /apify
              │
              ▼
POST /api/apify/maps-search
  → getSettings() → apifyToken, apifyActorId, apifyMaxResults, apifyWebsiteEnrichment
              │
              ▼
Apify API: POST https://api.apify.com/v2/acts/{actorId}/runs
  Params: token={apifyToken}&waitForFinish=90
  Body: { searchStringsArray, maxCrawledPlaces, language:'en', maxImages:0 }
  ── Wait up to 90 seconds ──
              │
              ▼
Actor run SUCCEEDED → defaultDatasetId returned
              │
              ▼
Apify API: GET /datasets/{datasetId}/items?token={token}&limit={limit}
  → ApifyPlaceRaw[] { title, phone, website, categoryName, emails[], totalScore, reviewsCount }
              │
              ▼
normalizeApifyBusiness() per place
  → NormalizedApifyLead { companyName, country, city, category, email?, phone?, website?, rating?, reviewsCount? }
              │
              ▼
apifyWebsiteEnrichment=true?
  │   Yes →  enrichLeadsWithEmails(leads)
  │          → For up to 5 leads with website but no email:
  │            fetchEmailsFromPage(url) — checks '/', '/contact', '/about'
  │            regex email extraction → normalizeEmails() → filter placeholders
  │            emailEnrichmentStatus = 'enriched'|'not_found'|'skipped'|'not_checked'
  │   No  →  all leads unchanged, emailEnrichmentStatus = 'not_checked'
              │
              ▼
scoreGoogleMapsLead() per lead
              │
              ▼
Results displayed in browser (NOT yet in DB)
  User selects leads → POST /api/apify/import
              │
              ▼
Lead.insertMany() → MongoDB leads collection
```

---

## Flow 3: Lead Scoring

```
New lead data arrives (from Apollo / Apify / CSV import / manual form)
              │
              ▼
scoreLead(lead) OR scoreGoogleMapsLead(lead) — pure function, no DB call
              │
              ├─ Apollo / CSV / manual → scoreLead()
              │    +40 email, +20 relevant title, +15 company,
              │    +10 website, +10 country, +10 category match
              │    No email → cap at 40
              │
              └─ Apify Maps → scoreGoogleMapsLead()
                   +35 email, +20 phone, +15 website,
                   +10 category, +10 rating ≥ 4★, +10 reviews ≥ 20
              │
              ▼
score ≥ 80 → status = 'qualified'   (eligible for AI personalisation)
score ≥ 40 → status = 'needs_review'
score  < 40 → status = 'low_priority'
              │
              ▼
Lead.create({ score, status, ... }) → MongoDB leads collection
```

---

## Flow 4: Email Send (Bulk)

```
User on /bulk-email selects campaign + leads + template + product
              │
              ▼
POST /api/bulk-email/send
  Body: { campaignId, subject, body, leadIds[], productId? }
  Validated by Zod BulkSendSchema
              │
              ▼
Campaign.findById(campaignId) → verify exists
Product.findById(productId) → fetch product vars (optional)
CampaignLead.find({ campaignId, leadId: { $in: leadIds }, status:'active' })
  → campaignLeadSet (only leads in this campaign are processed)
Lead.find({ _id: { $in: campaignLeadSet } }) → leadMap
              │
              ▼
For each lead:
  Skip if: no email | status in [do_not_contact, rejected, no_response]
              │
  renderVars(subject, lead, product)
    → Replace {{companyName}}, {{country}}, {{category}},
               {{productName}}, {{moq}}, {{pricing}},
               {{certifications}}, {{shippingDetails}}
              │
  EmailLog.create({ leadId, campaignId, type:'initial', status:'pending',
                    sendMode:'custom', leadEmail, subject, body })
              │
  sendCustomEmailViaSmartlead({ leadEmail, emailSubject, emailBody, ... })
    → getSettings() → smartleadApiKey, isDryRun, fromEmail, fromName
              │
    isDryRun=true  → status='ready_to_send_test', no external call
    isDryRun=false → POST https://server.smartlead.ai/api/v1/send-email/initiate
                     Returns trackId
              │
  EmailLog.findByIdAndUpdate({ status:'sent'|'failed', sentAt, smartleadTrackId })
  Lead.findByIdAndUpdate({ lastContactedAt, status:'contacted' })
  markLeadWaitingForReply() → NoReplyLead.findOneAndUpdate({ upsert:true })
              │
              ▼
writeAuditLog({ action:'bulk_email_sent', meta:{ sent, failed, skipped } })
              │
              ▼
Return: { sent, failed, skipped, total, results[] }
```

---

## Flow 5: Reply Capture (Gmail)

```
Leads replied to your Gmail inbox
              │
              ▼
User clicks "Sync Gmail Inbox" on /settings
              │
              ▼
POST /api/gmail/sync
              │
              ▼
InboxAccount.findOne({ provider:'gmail', isActive:true })
  No account → 400 (user must connect Gmail first)
              │
  tokenExpiry < 5min away?
    Yes → POST https://oauth2.googleapis.com/token (refresh)
          InboxAccount.save({ accessToken, tokenExpiry })
              │
              ▼
GET https://www.googleapis.com/gmail/v1/users/me/messages
  Params: q='in:inbox -in:sent', maxResults=50
  → { messages: [{ id, threadId }] }
              │
              ▼
For each message id:
  GET /gmail/v1/users/me/messages/{id}?format=full
  Extract headers: From, Subject, Date
  parseSender(fromHeader) → { email, name }
  extractBodyText(payload) → text/plain || text/html (stripped)
              │
  Lead.findOne({ email: senderEmail }) → match lead
    No match → skippedNoLead++, skip
              │
  Dedup check 1: Reply.findOne({ gmailMessageId })
    Exists → duplicates++, skip
              │
  Dedup check 2: Reply.findOne({ bodyHash, leadId })
    Exists → duplicates++, skip
              │
  classifyReply(body) → { classification, updateLeadStatus, needsApproval }
              │
  Reply.create({
    leadId, body, classification, needsApproval,
    source:'gmail', gmailMessageId, gmailThreadId,
    bodyHash, receivedAt
  })
              │
  Lead.findByIdAndUpdate({ nextFollowUpAt:null, status:updateLeadStatus })
  resolveNoReplyForLead({ leadId, replyReceivedAt })
  CampaignLead.updateMany({ leadId, status:'active' }, { lastReplyAt })
              │
              ▼
InboxAccount.save({ lastSyncedAt: now })
Return: { checked, created, duplicates, skippedNoLead }
```

---

## Flow 6: Reply Classification & Response

```
Reply arrives in DB (from any sync source)
Reply.classification = 'interested' | 'pricing_query' | etc.
Reply.needsApproval = true
Reply.status = 'pending'
              │
              ▼
User sees reply in /leads/reply or /replies
              │
              ├─ "Generate AI Draft" clicked
              │    │
              │    ▼
              │  POST /api/replies/{id}/generate-draft
              │    getSettings() → claudeApiKey required
              │    Load: Reply + Lead + Product context
              │    draftReplyEmail({ replyBody, classification, companyName, country })
              │      → POST https://api.anthropic.com/v1/messages
              │         Model: claude-haiku-4-5-20251001, max_tokens: 300
              │    ClaudeUsageLog.create({ promptTokens, completionTokens, estimatedCost })
              │    Reply.aiDraft = text
              │    Reply.status = 'draft_generated'
              │    Reply.aiDraftGenerated = true
              │    Return draft text
              │
              ├─ "Approve & Send" clicked
              │    │
              │    ▼
              │  POST /api/replies/{id}/approve-send
              │    sendCustomEmailViaSmartlead({ body: reply.aiDraft })
              │    EmailLog.create({ type:'reply', sendMode:'custom' })
              │    Reply.status = 'draft_approved'
              │    Reply.approvedAt = now
              │
              └─ "Reject" clicked
                   POST /api/replies/{id}/reject-draft
                   Reply.status = 'draft_rejected'
                   Reply.rejectedAt = now
```

---

## Flow 7: Settings Save (Credential Update)

```
Admin enters API key in Settings → Integrations form
              │
              ▼
POST /api/settings/integrations
  Body: { smartleadApiKey: 'sk-...', apolloApiKey: 'ap-...', ... }
              │
              ▼
For each secret field:
  encrypt(plaintext, APP_ENCRYPTION_KEY)
    → EncryptedField { ct: hex, iv: hex, tag: hex }
    AES-256-GCM, unique 16-byte IV per field, auth tag prevents tampering
              │
              ▼
IntegrationSettings.findOneAndUpdate(
  {},
  { $set: { smartleadApiKey: encryptedField, ... } },
  { upsert: true, new: true }
)
              │
              ▼
invalidateSettingsCache()
  → _cache = null, _expiry = 0
  → Next getSettings() call will re-read from DB
              │
              ▼
writeAuditLog({ action:'settings_changed', meta:{ fields:['smartleadApiKey'] } })
              │
              ▼
Return: { success: true, settings: { maskedApiKey: 'sk-••••-key' } }
              │
              ▼
Next API call to any route:
  getSettings()
    → _cache miss
    → IntegrationSettings.findOne({}).lean()
    → decrypt(encryptedField) per sensitive field
    → merge with process.env fallbacks
    → cache for 60 seconds
```

---

## Flow 8: User Session (Request-to-Response)

```
Browser sends GET /leads with cookie: pharma_auth=v2|userId|role|expiry|hmac
              │
              ▼
Edge Middleware (src/middleware.ts) [runs in Edge Runtime, no MongoDB]
  isPublic('/leads') → false
  process.env.NODE_ENV === 'production' && !JWT_SECRET → 503 (if misconfigured)
  cookie starts with 'v2|' → verifySessionToken(cookie, JWT_SECRET)
    → extract message = 'v2|userId|role|expiry'
    → extract sig = last segment
    → Date.now() > expiry → return null (expired)
    → verifyHmac(message, sig, JWT_SECRET) → constant-time compare
    → return { userId, role }
  isAdminRoute('/leads') → false (leads is not admin-only)
  authed=true, isAdmin=(role==='admin')
              │
              ▼
Next.js Route Handler executes
  (role info is embedded in the cookie — no DB lookup at middleware)
              │
              ▼
Route optionally reads requestActor(req) for audit logging:
  getRequestActor(req)
    → Reads pharma_auth cookie
    → verifySessionToken again (with full context this time)
    → Returns { actorId: userId, actorEmail: user.email }
    Note: This DOES call the DB to get email — only used for audit log writes
```

---

## Flow 9: Lead Status Transitions

```
Lead created
  status = 'new'
        │
        ├─ Score < 40
        │    status = 'low_priority'
        │
        ├─ Score 40-79
        │    status = 'needs_review'
        │
        └─ Score ≥ 80
             status = 'qualified'
                │
                ▼ (email sent)
             status = 'contacted'
             lastContactedAt = now
             NoReplyLead.status = 'active'
                │
                ▼ (reply received → classifyReply)
                │
                ├─ interested / pricing_query / cert / shipping
                │    status = 'warm'
                │    NoReplyLead resolved
                │
                ├─ not_interested / do_not_contact
                │    status = 'rejected'
                │    NoReplyLead resolved
                │
                ├─ out_of_office / needs_review
                │    status = 'needs_review'
                │    NoReplyLead resolved
                │
                └─ No reply after follow-up sequence
                     status = 'no_response'
                     NoReplyLead.status = 'archived'

Terminal statuses: rejected, no_response, do_not_contact
  → All three block future email sends
  → do_not_contact also blocks manual compose
```

---

## Flow 10: NoReplyLead Lifecycle

```
EmailLog saved with status='sent' (any send path)
              │
              ▼
markLeadWaitingForReply({ leadId, emailLogId, sentAt })
  NoReplyLead.findOneAndUpdate(
    { leadId },
    { status:'active', isActive:true, lastSentAt:sentAt, lastEmailLogId },
    { upsert:true }
  )
              │
              ▼ lead appears in /leads/no-reply
              │
  ┌───────────┴──────────────────────────┐
  │                                      │
  ▼                                      ▼
Reply received                    No reply
(any sync agent)                  (user action: archive)
  │                                      │
  ▼                                      ▼
removeNoReplyOnReply()         NoReplyLead.status = 'archived'
  isActive = false               isActive = false
  status = 'resolved'            Lead.status = 'no_response'
  removedFromNoReplyAt = now
  removedByReplyId = replyId
  latestReplySource = source
              │
              ▼
Lead disappears from /leads/no-reply view
```
