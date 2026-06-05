# PharmaLeads MVP

AI lead generation platform for pharmaceutical/healthcare organizations.

## Stack

- **Next.js 16** (App Router, TypeScript)
- **MongoDB Atlas** (Mongoose)
- **Tailwind CSS 4**
- **Claude Haiku** — manual only, fully cost-controlled
- **Smartlead** — outbound email sequencing
- **Apollo.io** — B2B contact discovery
- **Apify** — Google Maps scraping

---

## Final Launch Flow

```
Local test → Dry run → Live send test → Deploy → Webhook setup → 10-lead pilot
```

| Step | Action | Verified by |
|---|---|---|
| 1. Local test | `npm run dev`, seed data, walk QA checklist | `/testing-checklist` |
| 2. Dry run | Set `SMARTLEAD_DRY_RUN=true`, send a test email | EmailLog shows `ready_to_send_test` |
| 3. Live send test | Set `SMARTLEAD_DRY_RUN=false`, send to one real lead | EmailLog shows `sent`, check Smartlead |
| 4. Deploy | Push to VPS, `pm2 start`, configure Nginx + SSL | App loads at `https://yourdomain.com` |
| 5. Webhook setup | Paste webhook URL in Smartlead campaign settings | `/webhook-setup` shows public URL |
| 6. 10-lead pilot | Import 10 real leads, run processor daily | Monitor Reply Inbox for responses |

> Before step 6: remove sample data (`/dev-tools → Reset`) and verify `/production-checklist` is green.

---

## Quick Start

```bash
cp .env.local.example .env.local
# Fill in MONGODB_URI at minimum
npm install
npm run dev
```

Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard).

---

## Local Testing (Dev Tools)

The app ships with a seeder and QA checklist so you can test the full pipeline without spending real API credits.

### Seed sample data

1. Start the dev server (`npm run dev`).
2. Open **Dev Tools** in the sidebar (`/dev-tools`).
3. Click **Seed sample data** — creates:
   - 3 products (Paracetamol, Amoxicillin, Vitamin C)
   - 1 campaign (Southeast Asia Pharma Outreach)
   - 5 leads covering every status: `qualified`, `contacted`, `needs_review`, `no_response`, `warm`
   - 4 email logs (2 pending drafts, 1 sent, 1 draft reply)
   - 2 replies (1 with AI draft awaiting approval, 1 waiting for draft generation)
   - 1 no-reply archived lead

All sample records are tagged: leads use `source: 'sample'`; products and campaigns use a `[SAMPLE]` name prefix. **Real records are never touched by the seeder or reset.**

### How sample data is identified (reset safety)

| Collection | Marker |
|---|---|
| Lead | `source === 'sample'` |
| Product | `name` starts with `[SAMPLE]` |
| Campaign | `name` starts with `[SAMPLE]` |
| EmailLog | `leadId` in sample lead set |
| Reply | `leadId` in sample lead set |
| NoReplyLead | `leadId` in sample lead set |

### Reset sample data

Click **Reset sample data** on the Dev Tools page. The reset route cascades through all linked records in two phases: linked records first, then leads/products/campaigns. Idempotent — resetting an already-clean database returns `deleted: 0`.

### Walk the full QA checklist

Open `/testing-checklist` for a step-by-step guide covering all 17 features. Each item includes exact steps, a pass condition, and a direct link to the relevant page.

### What to test before real sending

1. Seed data, walk the QA checklist, reset.
2. Set `SMARTLEAD_DRY_RUN=true`. Test the send flow on a real lead — verify `ready_to_send_test` status.
3. Configure `SMARTLEAD_CAMPAIGN_ID`. Confirm Settings shows "No Campaign" is resolved.
4. Only set `SMARTLEAD_DRY_RUN=false` when you've verified the full dry-run cycle.

---

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in the values. Never commit `.env.local`.

### Required

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string (free M0 tier works) |

### Email Sending (Smartlead)

| Variable | Purpose |
|---|---|
| `SMARTLEAD_API_KEY` | Smartlead API key — get from Settings → API Key |
| `SMARTLEAD_DRY_RUN` | `true` = validate + mark ready (no real send); `false` = live send |
| `SMARTLEAD_CAMPAIGN_ID` | ID of the target Smartlead campaign |

### AI Personalization (Claude — optional)

| Variable | Purpose |
|---|---|
| `CLAUDE_API_KEY` | Only called when user manually clicks "Personalize with AI" or "Improve with AI" |

### Lead Discovery (both optional)

| Variable | Purpose |
|---|---|
| `APOLLO_API_KEY` | Enables `/apollo` B2B contact search |
| `APIFY_API_TOKEN` | Enables `/apify` Google Maps scraping |
| `APIFY_GOOGLE_MAPS_ACTOR_ID` | Actor override — default: `compass/crawler-google-places` |
| `APIFY_WEBSITE_ENRICHMENT_ENABLED` | `false` by default — set `true` to enable contact-page scraping |

---

## First-Run Checklist

Steps to complete before using the app in production:

1. **Set `MONGODB_URI`** — the app will not start without it. Create a free cluster at mongodb.com/atlas.
2. **Set `SMARTLEAD_DRY_RUN=true`** and confirm the Test Send flow works end-to-end.
3. **Create a campaign in Smartlead**, paste its ID into `SMARTLEAD_CAMPAIGN_ID`.
4. **Import a handful of test leads** via CSV or Apollo to verify scoring and status transitions.
5. **Optionally add `CLAUDE_API_KEY`** and test "Personalize with AI" on a qualified lead (score ≥ 70).
6. **Switch `SMARTLEAD_DRY_RUN=false`** when ready to send real emails.

Open `/settings` in the app for a live health check of all services.

---

## Lead Scoring (Rule-Based — No AI)

Scoring runs instantly on every lead import. No API calls.

| Signal | Points |
|---|---|
| Email present | +25 |
| Website present | +20 |
| Phone present | +10 |
| Country present | +10 |
| Pharma/health category keyword | +25 |
| Source present | +10 |

- **≥ 70** → `qualified`
- **40–69** → `needs_review`
- **< 40** → `low_priority`

---

## Claude Usage — Cost Control

Claude is **never** called automatically. It is only invoked when you manually click **"Personalize with AI"** on a lead detail page, subject to three server-side guards:

1. Lead score must be ≥ 70 (qualified)
2. Lead must have an email address
3. Lead must not already be AI-processed

Every Claude call is logged in `ClaudeUsageLog` with token counts and estimated cost. The dashboard shows today's spend.

**Claude is never called for:** duplicate checking, scoring, follow-up scheduling, CSV import, Apollo search, Apify scraping, or dashboard stats.

---

## Apollo.io Integration

**Page:** `/apollo`

Searches Apollo.io for B2B contacts (purchasing managers, procurement officers, etc.) in the pharmaceutical and healthcare space.

### Flow

1. Enter keyword, country, and optional job title
2. Click **Search Apollo** — fetches up to 50 contacts, no DB writes
3. Preview table shows score, duplicate badges (email OR company+country match)
4. Select rows and click **Import Selected**, or **Import All** (skips duplicates automatically)

### Cost control

- Max 50 results per search (hard-coded on server)
- No auto-pagination
- No background sync
- No automatic enrichment
- No Claude calls at any point

---

## Apify Google Maps Integration

**Page:** `/apify`

Scrapes Google Maps for local pharmacies, clinics, distributors, and wholesalers using the `compass/crawler-google-places` Apify actor.

### Setup

1. Create an Apify account at [console.apify.com](https://console.apify.com)
2. Copy your API token from **Settings → Integrations**
3. Add to `.env.local`:
   ```
   APIFY_API_TOKEN=apify_api_...
   ```
4. The default actor (`compass/crawler-google-places`) runs without any additional setup

### Flow

1. Enter keyword (e.g. `pharmacy`), city (optional), and country
2. Click **Search Google Maps** — triggers an Apify actor run (30–90 seconds)
3. Preview table shows results with score, email, phone, website, Maps link
4. Duplicate detection: email OR website OR company+country match
5. Select and import; duplicates are skipped automatically

### Cost control

- Max 50 results per search (hard-coded on server)
- No auto-pagination
- No background scraping
- No automatic enrichment
- Website enrichment is **disabled by default** (`APIFY_WEBSITE_ENRICHMENT_ENABLED=false`)
- No Claude calls at any point

### Why Apify complements Apollo

| | Apollo | Apify |
|---|---|---|
| Best for | Named B2B contacts, verified emails | Local businesses, clinics, pharmacies |
| Data source | LinkedIn / professional networks | Google Maps |
| Phone numbers | Sometimes | Usually |
| Local businesses | Rare | Yes |
| Email quality | High (verified) | Variable (scraped) |

---

## Reply Management — Human-in-the-Loop Inbox

**Page:** `/replies`

Centralized inbox for all inbound replies from leads. The system never auto-sends a reply — every AI draft requires a human to click **Approve & Send**.

### Reply lifecycle

```
Webhook receives reply
       ↓
Keyword classifier runs (no Claude)
       ↓
Reply saved with classification + needsApproval flag
       ↓
Human opens Reply Inbox
       ↓
Human clicks "Generate AI Draft" (Claude Haiku — logged)
       ↓
Human reads draft, then clicks "Approve & Send" OR "Reject Draft"
       ↓
If approved: dispatched via Smartlead (dry-run or live)
If rejected: draft discarded, can regenerate
```

### Classifications

| Classification | Meaning | AI Draft Allowed |
|---|---|---|
| `interested` | Lead expressed interest | Yes |
| `pricing_query` | Asked about pricing/MOQ | Yes |
| `certificate_query` | Asked about certifications | Yes |
| `shipping_query` | Asked about delivery/freight | Yes |
| `unclassified` | Rule classifier couldn't determine | Yes |
| `not_interested` | Lead is not interested | No |

### Claude usage restrictions for reply drafts

- Not called on webhook receipt — classifier is keyword-only
- Not called during page load or dashboard refresh
- Only called when user manually clicks "Generate AI Draft"
- Blocked entirely for `not_interested` classification
- Draft stored in `EmailLog` as `type: 'reply'`, `status: 'pending'`
- Sending blocked until user explicitly clicks "Approve & Send"
- Every call logged to `ClaudeUsageLog` with token count and cost

### Why replies are never auto-sent

Pharmaceutical outreach is regulated territory. Auto-sending AI-generated content risks:
- Making unsupported medical claims
- Sending to unsubscribed contacts
- Misrepresenting pricing or certifications

The human approval step is a hard architectural constraint, not a configuration option.

---

## Follow-Up Sequence

```
Day 0 → Initial Email
Day 1 → Follow-Up 1
Day 3 → Follow-Up 2
Day 7 → Final Follow-Up
No reply → Archived to NoReplyLead
```

Scheduling is **fully rule-based** — zero Claude credits. Click **Run Follow-Up Processor** on the dashboard to process due follow-ups.

Stop conditions: replied, bounced, unsubscribed, not_interested, do_not_contact, no_response.

---

## Production Deployment

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for the full guide. Summary:

### Local production test (verify before pushing to a server)

```bash
npm run typecheck   # must be clean
npm run build
npm start           # http://localhost:3000
```

Open `/settings` to verify health, `/production-checklist` to walk the readiness checklist.

### VPS deployment (Ubuntu 22.04)

```bash
# On the server:
git clone https://github.com/YOUR_ORG/pharma-lead-gen.git /var/www/pharma-lead-gen
cd /var/www/pharma-lead-gen
# Create .env.production with all env vars
npm install
npm run build
npm install -g pm2
pm2 start npm --name "pharma-leads" -- start
pm2 save && pm2 startup
```

Then set up nginx as a reverse proxy to port 3000 and add SSL via Certbot.
Full nginx config and Certbot commands are in DEPLOYMENT.md.

### Before enabling live email sends

```
SMARTLEAD_DRY_RUN=true  ← keep this until ALL steps below are verified
```

1. MongoDB Atlas IP whitelist includes your VPS IP
2. `SMARTLEAD_CAMPAIGN_ID` is set to a real Smartlead campaign
3. Webhook URL (`/api/webhooks/smartlead/reply`) is registered in Smartlead
4. A full dry-run test send cycle completed — EmailLog shows `ready_to_send_test`
5. Sample data removed (`/dev-tools` → Reset)
6. `/production-checklist` shows all automated checks green

**Only then:** set `SMARTLEAD_DRY_RUN=false` and restart PM2.

---

## API Routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/dashboard/stats` | Dashboard metrics |
| GET/POST | `/api/leads` | List / create leads |
| GET/PATCH | `/api/leads/[id]` | Get / update lead |
| POST | `/api/leads/[id]/personalize` | Manual AI email (guarded) |
| POST | `/api/leads/import` | CSV import |
| GET | `/api/leads/no-reply` | Archived no-reply leads |
| POST | `/api/follow-ups/process` | Run follow-up scheduler |
| GET | `/api/email-logs` | List email logs |
| POST | `/api/email-logs/[id]/send` | Send / dispatch email |
| POST | `/api/webhooks/smartlead/reply` | Inbound reply webhook |
| POST | `/api/apollo/search` | Apollo search (no DB write) |
| POST | `/api/apollo/import` | Import Apollo results |
| POST | `/api/apify/maps-search` | Google Maps search (no DB write) |
| POST | `/api/apify/import` | Import Apify results |
| POST | `/api/apify/enrich-website` | Website enrichment placeholder |
| GET | `/api/config` | Non-sensitive feature flags (keys never exposed) |
| GET | `/api/health` | Live system health — env var presence + MongoDB ping |
| GET/POST | `/api/replies` | Reply inbox list |
| GET/PATCH | `/api/replies/[id]` | Reply detail / status update |
| POST | `/api/replies/[id]/generate-draft` | Generate AI reply draft (manual trigger) |
| POST | `/api/replies/[id]/approve-send` | Approve and dispatch reply via Smartlead |
| POST | `/api/replies/[id]/reject-draft` | Reject or mark handled |
| POST | `/api/email-logs/manual-draft` | Save manually composed email as draft |
| POST | `/api/email-logs/[id]/improve-with-ai` | Improve draft with Claude (manual trigger) |
| GET/POST | `/api/products` | Products CRUD |
| GET/POST | `/api/campaigns` | Campaigns CRUD |
