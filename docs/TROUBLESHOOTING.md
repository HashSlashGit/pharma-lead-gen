# PharmaLeads — Troubleshooting Guide

---

## Problem: Cannot log in — "Authentication service unavailable"

**HTTP status**: 503

**Possible causes**:
1. MongoDB connection failing
2. `MONGODB_URI` not set or wrong

**Files to check**:
- `src/app/api/auth/login/route.ts` — catch block returns 503
- `src/lib/db/mongoose.ts` — connection error logs `[db] MongoDB connection failed:`

**Fix procedure**:
1. Check Vercel logs for `[db] MongoDB connection failed:`
2. Verify `MONGODB_URI` is set in Vercel environment variables
3. Check MongoDB Atlas: cluster is running, IP whitelist includes `0.0.0.0/0` (for Vercel)
4. Test connection string locally: `node -e "require('mongoose').connect(process.env.MONGODB_URI).then(() => console.log('ok'))"`
5. If Atlas SRV resolution fails: `mongoose.ts` forces DNS to Google (8.8.8.8) for Atlas URIs — check if Vercel blocks outbound DNS on port 53

---

## Problem: Cannot log in — "Incorrect password" / "Invalid email or password"

**HTTP status**: 401

**Possible causes**:
1. Wrong password
2. User doesn't exist
3. Email case mismatch

**Files to check**:
- `src/lib/utils/password.ts` — `verifyPassword()`
- `src/lib/models/User.ts` — email stored lowercase

**Fix procedure**:
1. Verify email is lowercase (schema enforces lowercase on save)
2. As admin, use `/admin/users` → Reset Password to set a known password
3. If locked out entirely (no admin): connect to MongoDB Atlas console, run:
   ```js
   db.users.updateOne({ email: "admin@example.com" }, { $set: { active: true } })
   ```
4. If no users exist at all: ensure `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set in env, then trigger a login — `ensureFirstAdmin()` runs automatically

---

## Problem: Cannot log in — "Server misconfigured"

**HTTP status**: 503 (from middleware, not login route)

**Cause**: `JWT_SECRET` is not set in production environment

**Fix**:
1. Generate a secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Set `JWT_SECRET` in Vercel environment variables
3. Redeploy

---

## Problem: Session expires immediately / "Unauthorized" on every request

**Possible causes**:
1. `JWT_SECRET` changed after sessions were issued
2. Clock skew between server and client (unlikely on Vercel)
3. Cookie not being sent (SameSite=Strict blocks cross-origin cookies)

**Fix**:
1. If `JWT_SECRET` changed, all existing sessions are invalidated — users must log in again (expected behavior)
2. Verify `NEXT_PUBLIC_APP_URL` matches the actual deployment URL (affects OAuth redirects, not cookies directly)
3. Sessions last 8 hours — verify the token expiry in `src/lib/utils/session.ts` (`SESSION_MAX_AGE_MS`)

---

## Problem: MongoDB connection fails on Vercel

**Symptoms**: `[db] MongoDB connection failed: MongoNetworkError`

**Possible causes**:
1. IP whitelist on Atlas doesn't include Vercel IPs
2. `MONGODB_URI` uses old SRV format
3. Wrong username/password in URI

**Files to check**:
- `src/lib/db/mongoose.ts` — DNS override for Atlas: forces `8.8.8.8`, `1.1.1.1`

**Fix procedure**:
1. MongoDB Atlas → Network Access → Add `0.0.0.0/0` (allow all) for Vercel serverless
2. Verify `MONGODB_URI` format: `mongodb+srv://user:pass@cluster.mongodb.net/dbname`
3. Check Atlas → Database Access: user has `readWriteAnyDatabase` role
4. URL-encode special characters in password: `@` → `%40`, `#` → `%23`

---

## Problem: Apollo search returns no results

**Possible causes**:
1. Apollo API key not configured
2. Apollo credits exhausted
3. Too-specific search filters

**Files to check**:
- `src/lib/services/apollo.ts` — `searchApolloLeads()`
- `src/lib/services/settingsCache.ts` — key resolution

**Fix procedure**:
1. Go to Settings → Integrations → verify Apollo API key is set
2. Check Apollo dashboard for remaining credits
3. Try broader search: remove job title filter, reduce limit
4. Check Vercel logs for `[apollo]` prefix errors
5. Apollo error codes:
   - 401 → key invalid
   - 403 → plan doesn't allow this operation
   - 429 → rate limit / credits exhausted

---

## Problem: Apify scraping fails or returns no results

**Possible causes**:
1. Apify token not configured
2. Actor run times out (>90s)
3. Wrong actor ID
4. Apify monthly usage limit reached

**Files to check**:
- `src/app/api/apify/maps-search/route.ts`
- `src/lib/services/apify.ts` — `runApifyActor()`

**Fix procedure**:
1. Verify Apify token in Settings → Integrations
2. Reduce `maxResults` in Settings (try 10–20 for testing)
3. Verify actor ID: default is `compass/crawler-google-places`
4. Check Apify console at apify.com — view recent runs for errors
5. If actor run status is `TIMED-OUT`: increase timeout or reduce limit
6. Website enrichment causing slowness → disable in Settings

---

## Problem: Smartlead emails not sending

**Possible causes**:
1. `smartleadDryRun` is still `true` (default)
2. API key or campaign ID not set
3. Lead already exists in Smartlead campaign (upload_count=0)
4. Lead email invalid/unsubscribed in Smartlead

**Files to check**:
- `src/lib/services/smartlead.ts` — `sendEmail()`, `sendCustomEmailViaSmartlead()`
- `src/app/api/bulk-email/send/route.ts`

**Fix procedure**:
1. Check Settings → Integrations → Smartlead mode toggle: ensure `dryRun=false`
2. Verify `smartleadApiKey` and `smartleadCampaignId` are set
3. Verify `smartleadFromEmail` and `smartleadFromName` are set (required for custom sends)
4. Check EmailLog records in MongoDB: `db.emaillogs.find({ status:'failed' })` — read the `smartleadResponse` field
5. `upload_count: 0` → Lead is duplicate/unsubscribed in Smartlead — check Smartlead dashboard
6. Verify the campaign ID exists in your Smartlead account

---

## Problem: Smartlead replies not syncing

**Possible causes**:
1. Smartlead API key not set
2. Master Inbox returns empty results
3. Reply emails don't match any Lead in DB
4. Body hash or message ID collision causing false duplicates

**Files to check**:
- `src/app/api/replies/sync-smartlead/route.ts` — check `endpointsTried` in response
- `src/lib/services/reply-classifier.ts`

**Fix procedure**:
1. Call `POST /api/replies/sync-smartlead` with `{ "debug": true }` — check `endpointsTried`, `preview`, `duplicateDetails` in response
2. `inboxRepliesFound > 0` but `repliesExtracted = 0` → Smartlead body fields are empty — this means the reply body is nested differently. Check `preview[].hasBody`
3. `unmatched > N` → Lead emails in Smartlead don't match any `Lead.email` in DB — check for email casing or typos
4. All replies are `duplicate` → Replies were already synced. Check `duplicateDetails[].reason` for dedup path used
5. Try setting `{ "pages": 5 }` to fetch more pages from Master Inbox

---

## Problem: Gmail OAuth fails / "Error connecting Gmail"

**Possible causes**:
1. Google OAuth credentials not configured
2. Redirect URI mismatch
3. Token exchange failed
4. Refresh token not returned (app already authorized)

**Files to check**:
- `src/app/api/gmail/callback/route.ts`
- `src/lib/services/gmail.ts` — `exchangeCodeForTokens()`

**Fix procedure**:
1. Verify in Settings → Integrations: `googleClientId`, `googleClientSecret`, `googleRedirectUri` are all set
2. `googleRedirectUri` must exactly match what's configured in Google Cloud Console Authorized Redirect URIs
   - Format: `https://your-domain.com/api/gmail/callback`
3. Error "No refresh_token received": Go to myaccount.google.com/permissions → revoke PharmaLeads access → reconnect
4. After reconnect, Gmail OAuth uses `prompt: 'consent'` which forces the consent screen to re-issue a refresh token
5. Check `/api/gmail/status` to confirm connection is active

---

## Problem: Gmail sync doesn't find replies

**Possible causes**:
1. Reply sender email doesn't match any Lead.email in DB
2. All messages already synced (duplicates)
3. Token expired and refresh failed

**Files to check**:
- `src/app/api/gmail/sync/route.ts`

**Fix procedure**:
1. Check sync response: `skippedNoLead` count — if high, leads don't have email addresses matching the senders
2. Check `duplicates` count — if all messages are duplicates, everything is already in DB
3. If `success: false` and error about token: go to Settings → disconnect → reconnect Gmail
4. Verify the connected Gmail account is the same inbox where replies arrive

---

## Problem: Replies not being classified correctly

**Possible causes**:
1. Reply body is in a language other than English
2. Reply keywords don't match the keyword lists
3. Reply is an HTML-heavy email (tags not stripped)

**Files to check**:
- `src/lib/services/reply-classifier.ts` — keyword lists

**Fix procedure**:
1. Check `Reply.classification` in DB for misclassified replies
2. The classifier is pure keyword matching — add missing keywords to the appropriate list in `reply-classifier.ts`
3. For non-English replies: AI classification via `analyzeReply()` (Claude) can be used instead — this is what `POST /api/replies/{id}/generate-draft` does when it runs classification
4. `needs_review` is the fallback for unmatched replies — these are surfaced in the Reply Inbox for human review

---

## Problem: Claude AI draft generation fails

**Possible causes**:
1. Claude API key not configured
2. API key invalid or quota exceeded
3. Reply body is empty

**Files to check**:
- `src/app/api/replies/[id]/generate-draft/route.ts`
- `src/lib/services/claude.ts`

**Fix procedure**:
1. Verify Claude API key in Settings → Integrations
2. Error "API key not configured" → key is missing from both DB and env
3. Check Anthropic console for quota/billing issues
4. Check `ClaudeUsageLog` collection for estimated costs and usage patterns

---

## Problem: Settings credentials not taking effect after save

**Possible causes**:
1. Settings cache hasn't expired (60s TTL)
2. Encryption key mismatch
3. `APP_ENCRYPTION_KEY` not set

**Files to check**:
- `src/lib/services/settingsCache.ts` — `invalidateSettingsCache()`
- `src/lib/utils/encryption.ts`

**Fix procedure**:
1. Settings save calls `invalidateSettingsCache()` immediately — next API call re-reads from DB
2. If still not working after 60s: check Vercel logs for `[db]` errors — DB may not be accessible
3. If `APP_ENCRYPTION_KEY` is missing or not 64 hex chars: `isEncryptionConfigured()` returns false, `safeDecrypt()` returns undefined, env fallback is used
4. `APP_ENCRYPTION_KEY` must be exactly 64 hex characters (32 bytes). Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

---

## Problem: "Last admin" error when managing users

**Error**: "Cannot demote the last admin account" / "Cannot deactivate the last admin account"

**File**: `src/lib/utils/adminGuard.ts`

**Explanation**: The system prevents the last active admin from being demoted or deactivated. This is a safety guard to prevent lockout.

**Fix**: Create a second admin account first, then modify the original admin.

---

## Problem: Email template variables not substituting

**Symptom**: Emails contain literal `{{companyName}}` instead of the company name

**File**: `src/app/api/bulk-email/send/route.ts` — `renderVars()`

**Fix procedure**:
1. Verify the variable name matches exactly: `{{companyName}}`, `{{country}}`, `{{category}}`, `{{productName}}`, `{{moq}}`, `{{pricing}}`, `{{certifications}}`, `{{shippingDetails}}`
2. Variable names are case-sensitive
3. Product variables only substitute if `productId` is passed in the request
4. Check that the Lead has the corresponding field populated

---

## Problem: NoReplyLead not resolving when reply arrives

**Symptom**: Lead still appears in `/leads/no-reply` after a reply has been received

**Files to check**:
- `src/lib/utils/noReplySync.ts` — `removeNoReplyOnReply()`, `resolveNoReplyForLead()`
- Sync agents call these after saving a reply

**Fix procedure**:
1. Go to `/leads/no-reply` → click "Reconcile Replies" (calls `POST /api/leads/no-reply/reconcile-replies`)
2. This scans all Reply records and resolves any matching NoReplyLead records
3. Check that the Lead's email in DB matches the reply sender email exactly (case-insensitive)

---

## Problem: Dashboard stats are wrong / stale

**File**: `src/app/api/dashboard/stats/route.ts`

**Explanation**: Stats are computed live from MongoDB aggregations on each page load. If counts look wrong:
1. Check if leads were deleted without cascading (related records remain)
2. Check `Campaign.emailsSent` — this counter is incremented manually and may drift from actual EmailLog count
3. For accurate counts, query the EmailLog collection directly: `db.emaillogs.countDocuments({ status:'sent' })`
