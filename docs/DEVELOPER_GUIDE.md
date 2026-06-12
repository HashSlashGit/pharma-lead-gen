# PharmaLeads — Developer Guide

This guide answers "where do I touch to change X?" for every major feature. Includes file maps, impact analysis, and conventions.

---

## Directory Map

```
pharma-lead-gen/
├── src/
│   ├── __tests__/               # Unit tests (tsx --test runner)
│   │   └── adminGuard.test.ts   # Tests for checkLastAdminMutation()
│   │
│   ├── app/                     # Next.js App Router — pages + API routes
│   │   ├── api/                 # All REST endpoints (server-side only)
│   │   │   ├── apify/           # Apify Google Maps integration
│   │   │   ├── apollo/          # Apollo.io B2B search
│   │   │   ├── auth/            # login, logout, me
│   │   │   ├── bulk-email/      # Bulk send endpoint
│   │   │   ├── campaigns/       # Campaign CRUD + lead management
│   │   │   ├── config/          # Runtime feature flags for frontend
│   │   │   ├── dashboard/       # Stats aggregation
│   │   │   ├── email-logs/      # Email send history
│   │   │   ├── email-templates/ # Template CRUD
│   │   │   ├── follow-ups/      # Follow-up scheduler (disabled)
│   │   │   ├── gmail/           # Gmail OAuth + sync
│   │   │   ├── health/          # Public health check
│   │   │   ├── leads/           # Lead CRUD + import + no-reply
│   │   │   ├── products/        # Product CRUD
│   │   │   ├── replies/         # Reply management + sync endpoints
│   │   │   ├── settings/        # Integration credential management
│   │   │   └── users/           # User management (admin only)
│   │   │
│   │   ├── admin/users/         # User management UI (admin only)
│   │   ├── apollo/              # Apollo search UI
│   │   ├── apify/               # Apify Maps search UI
│   │   ├── bulk-email/          # Bulk email sender UI
│   │   ├── campaigns/           # Campaign list UI
│   │   ├── compose/             # Single email compose UI
│   │   ├── dashboard/           # Main dashboard
│   │   ├── email-templates/     # Template editor UI
│   │   ├── follow-ups/          # Follow-ups UI
│   │   ├── leads/               # Lead list + detail + import
│   │   │   ├── [id]/            # Lead detail page
│   │   │   ├── import/          # CSV import page
│   │   │   ├── new/             # Create lead form
│   │   │   ├── no-reply/        # No-reply leads view
│   │   │   └── reply/           # Reply inbox
│   │   ├── login/               # Login page (public)
│   │   ├── products/            # Product catalogue UI
│   │   ├── replies/[id]/        # Single reply detail
│   │   ├── settings/            # Settings + health UI (admin)
│   │   ├── globals.css          # Global Tailwind styles
│   │   ├── layout.tsx           # Root layout (AppShell wrapper)
│   │   └── page.tsx             # Root redirect (→ /dashboard)
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx     # Authenticated app layout wrapper
│   │   │   └── Sidebar.tsx      # Navigation sidebar (role-aware)
│   │   └── ui/
│   │       ├── KeywordSelector.tsx  # Multi-select keyword chip input
│   │       ├── ScoreBadge.tsx       # Lead score display
│   │       ├── StatCard.tsx         # Dashboard metric card
│   │       └── StatusBadge.tsx      # Lead/reply status badge
│   │
│   ├── lib/
│   │   ├── db/
│   │   │   └── mongoose.ts      # MongoDB connection (cached)
│   │   ├── models/              # Mongoose schemas
│   │   │   ├── AuditLog.ts
│   │   │   ├── Campaign.ts
│   │   │   ├── CampaignLead.ts
│   │   │   ├── ClaudeUsageLog.ts
│   │   │   ├── EmailLog.ts
│   │   │   ├── EmailTemplate.ts
│   │   │   ├── InboxAccount.ts
│   │   │   ├── IntegrationSettings.ts
│   │   │   ├── Lead.ts
│   │   │   ├── NoReplyLead.ts
│   │   │   ├── Product.ts
│   │   │   ├── Reply.ts
│   │   │   └── User.ts
│   │   ├── services/            # External API integrations + complex business logic
│   │   │   ├── apify.ts         # Apify actor runner + email extraction
│   │   │   ├── apollo.ts        # Apollo search + enrichment
│   │   │   ├── claude.ts        # Claude AI email + reply drafting
│   │   │   ├── gmail.ts         # Gmail OAuth + inbox fetch
│   │   │   ├── mailboxReplySync.ts  # IMAP inbox sync
│   │   │   ├── removeNoReplyOnReply.ts  # NoReplyLead resolution helper
│   │   │   ├── reply-classifier.ts      # Keyword-based reply classifier
│   │   │   ├── settingsCache.ts         # DB-first credential cache
│   │   │   ├── smartlead.ts             # Smartlead email sending
│   │   │   └── syncLeadStatusFromReply.ts  # Lead status update on reply
│   │   └── utils/               # Pure utilities (no external calls)
│   │       ├── adminGuard.ts    # Last-admin mutation check
│   │       ├── auditLog.ts      # Write audit log helper
│   │       ├── emailFormatting.ts  # Plain text → HTML
│   │       ├── encryption.ts    # AES-256-GCM encrypt/decrypt
│   │       ├── followupScheduler.ts  # Follow-up schedule logic
│   │       ├── noReplySync.ts   # markLeadWaitingForReply / resolveNoReplyForLead
│   │       ├── password.ts      # scrypt hash / verify
│   │       ├── requestActor.ts  # Extract actor from session cookie
│   │       ├── scoreLead.ts     # Lead scoring formulas
│   │       └── session.ts       # Token create / verify
│   │
│   ├── middleware.ts            # Edge middleware — auth enforcement
│   └── types/index.ts           # Shared TypeScript types
│
├── docs/                        # This documentation
├── ARCHITECTURE.md
├── WORKFLOWS.md
├── DATAFLOW.md
├── API_REFERENCE.md
├── DATABASE.md
├── TROUBLESHOOTING.md
└── DEVELOPER_GUIDE.md           # (this file)
```

### Directory Rules

**`src/app/api/`** — API route handlers only. Must export named HTTP methods (`GET`, `POST`, `PATCH`, `DELETE`). No business logic here — call services and utils. Add `export const dynamic = 'force-dynamic'` to any route that reads from the DB or env at request time.

**`src/lib/services/`** — External API integrations and multi-step orchestration. May call the DB. May call external APIs. Must import credentials via `getSettings()`, never via `process.env` directly (except `settingsCache.ts` itself, which is the only place that reads from env).

**`src/lib/utils/`** — Pure utilities. Should have no external API calls. Prefer pure functions. All DB writes should go through a dedicated util (e.g., `auditLog.ts`, `noReplySync.ts`) rather than inline in routes.

**`src/lib/models/`** — Mongoose schema definitions only. No business logic. Follow the pattern: define interface, define schema, export model with `mongoose.models.X || mongoose.model('X', schema)`.

**Never place in `src/app/api/`**: business logic, external API client code, service orchestration. These belong in `src/lib/services/`.

**Never place in `src/lib/utils/`**: external API calls, DB queries (except the DB-calling utils like `auditLog.ts`).

---

## Change Impact Map

### Adding a new integration credential

1. `src/lib/models/IntegrationSettings.ts` — add field (use `EncryptedField` for secrets)
2. `src/lib/services/settingsCache.ts` — add to `ResolvedSettings` interface + `loadFromDB()` + `getSettings()` merge
3. `src/app/api/settings/integrations/route.ts` — add to encrypt/save logic
4. `src/app/settings/page.tsx` — add UI input field
5. The service that uses it — call `getSettings()` and read the new field

### Adding a new lead field

1. `src/lib/models/Lead.ts` — add to schema + interface
2. `src/lib/utils/scoreLead.ts` — update scoring if relevant
3. `src/app/api/leads/route.ts` — accept in POST handler
4. `src/app/leads/[id]/page.tsx` — display in UI
5. `src/app/api/bulk-email/send/route.ts` — add to `renderVars()` if it should be a template variable
6. `src/lib/services/apify.ts` / `apollo.ts` — update `normalizeApifyBusiness()` / `normalizeApolloLead()` if the source provides it

### Adding a new reply classification

1. `src/lib/services/reply-classifier.ts` — add keyword list + case in `classifyReply()`
2. `src/lib/models/Reply.ts` — add to `classification` enum
3. `src/lib/services/claude.ts` — add hint in `draftReplyEmail()`
4. Status badge UI if the classification needs a visual indicator

### Adding a new campaign status

1. `src/lib/models/Campaign.ts` — add to `status` enum
2. `src/app/campaigns/page.tsx` — update UI filter/display
3. `src/app/api/bulk-email/send/route.ts` — check if new status should block sends

### Adding a new admin-only route

1. `src/middleware.ts` — add path to `isAdminRoute()` function
2. Create API route at `src/app/api/.../route.ts`

### Adding a new audit log action

1. `src/lib/models/AuditLog.ts` — add to `AuditAction` type union
2. Call `writeAuditLog({ action: 'new_action', ... })` from the relevant route
3. `src/lib/utils/auditLog.ts` — no changes needed (accepts any string)

### Changing the session token format

The token format (`v2|userId|role|expiry|hmac`) is verified in two places:

1. `src/middleware.ts` — `verifySessionToken()` (runs on every request in Edge runtime)
2. `src/lib/utils/session.ts` — `createSessionToken()` and `verifySessionToken()`

Both must be updated together. Changing the format invalidates all existing sessions.

### Changing password hashing

1. `src/lib/utils/password.ts` — `hashPassword()` and `verifyPassword()`
2. `src/app/api/auth/login/route.ts` — `verifyPassword()` call
3. `src/app/api/users/route.ts` — `hashPassword()` on create
4. `src/app/api/users/[id]/reset-password/route.ts` — `hashPassword()` on reset
5. All existing passwords in DB will be invalid after changing the algorithm — require all users to reset

---

## Key Conventions

### Credentials: always use `getSettings()`

```typescript
// CORRECT
const settings = await getSettings();
const apiKey = settings.apolloApiKey;

// WRONG — bypasses DB-stored credentials
const apiKey = process.env.APOLLO_API_KEY;
```

The only exception is `settingsCache.ts` itself (it reads from both DB and env to build the merged result).

### Route caching: force-dynamic for data routes

All API routes that read from MongoDB or return user-specific data must include:

```typescript
export const dynamic = 'force-dynamic';
```

Without this, Next.js may cache the response at build time.

### Zod validation for POST bodies

Use Zod for request body validation in POST/PATCH routes:

```typescript
const Schema = z.object({ ... });
const parsed = Schema.safeParse(await req.json());
if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
```

### MongoDB model pattern

```typescript
const MyModel: Model<IMyDoc> = mongoose.models.MyModel || mongoose.model<IMyDoc>('MyModel', MySchema);
export default MyModel;
```

This prevents "Cannot overwrite model" errors in Next.js hot-reload.

### useEffect pattern (avoid react-hooks/set-state-in-effect)

To avoid the ESLint `react-hooks/set-state-in-effect` error, use inline async fetch in `useEffect` rather than calling a `useCallback` that synchronously calls `setState`:

```typescript
// CORRECT — setState only in async .then() callbacks
useEffect(() => {
  let active = true;
  fetch('/api/resource')
    .then(r => r.json())
    .then(data => { if (active) setState(data); })
    .catch(() => { if (active) setError('Failed'); })
    .finally(() => { if (active) setLoading(false); });
  return () => { active = false; };
}, []);
```

Keep a separate `fetchData` useCallback for manual refreshes after mutations.

### Encryption for stored credentials

```typescript
import { encrypt, decrypt, isEncryptionConfigured } from '@/lib/utils/encryption';

// Before saving to DB:
const encryptedField = encrypt(plaintextApiKey); // { ct, iv, tag }

// When reading from DB:
if (isEncryptionConfigured() && field?.ct) {
  const plaintext = decrypt(field);
}
```

### Audit logging

```typescript
import { writeAuditLog } from '@/lib/utils/auditLog';
import { getRequestActor } from '@/lib/utils/requestActor';

const actor = await getRequestActor(req);
void writeAuditLog({
  action: 'campaign_created',
  ...actor,
  targetId: campaign._id.toString(),
  targetLabel: campaign.name,
  meta: { extraContext: 'value' },
});
```

Use `void` — audit log writes are fire-and-forget; don't await them in the response path.

---

## Testing

Run tests:
```bash
npm test
```

Currently one test file: `src/__tests__/adminGuard.test.ts`

The test framework is Node.js built-in `--test` runner via `tsx`.

When adding tests:
- Place test files in `src/__tests__/`
- Name them `*.test.ts`
- Pure utility functions are the best candidates for unit tests
- Service functions require mocking external APIs — use a test double pattern

---

## Local Development

```bash
npm run dev        # Start dev server
npm run typecheck  # TypeScript check (no emit)
npm run lint       # ESLint check
npm test           # Run unit tests
```

### Required env vars for local dev

Create `.env.local`:
```
MONGODB_URI=mongodb+srv://...
JWT_SECRET=any-long-random-string
APP_ENCRYPTION_KEY=<64 hex chars>
ADMIN_EMAIL=admin@yourcompany.com
ADMIN_PASSWORD=yourpassword
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Integration credentials (Smartlead, Apollo, etc.) can be set via the Settings UI after logging in, or in `.env.local`.

### First run

1. Start dev server: `npm run dev`
2. Navigate to `http://localhost:3000/login`
3. Enter `ADMIN_EMAIL` and `ADMIN_PASSWORD` from your `.env.local`
4. The first login will create the admin user automatically (`ensureFirstAdmin()`)
5. Go to Settings → Integrations to configure API keys

---

## Deployment (Vercel)

1. Push to GitHub
2. Vercel auto-deploys from the connected repository
3. Required environment variables must be set in Vercel Project Settings → Environment Variables:
   - `MONGODB_URI`, `JWT_SECRET`, `APP_ENCRYPTION_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `NEXT_PUBLIC_APP_URL`
4. Integration credentials can be entered via the Settings UI after first login

### DNS for Gmail OAuth

`NEXT_PUBLIC_APP_URL` and `GOOGLE_REDIRECT_URI` must use the exact production domain. The OAuth redirect URI registered in Google Cloud Console must match `GOOGLE_REDIRECT_URI` exactly.

---

## Adding a New Page

1. Create `src/app/{route}/page.tsx` with `'use client'` directive
2. Export a default React component
3. Add to the `navGroups` or `adminNavItems` array in `src/components/layout/Sidebar.tsx`
4. If the page needs data: fetch from the relevant API routes
5. If admin-only: add to `isAdminRoute()` in `src/middleware.ts`

---

## Adding a New API Route

1. Create `src/app/api/{route}/route.ts`
2. Export named HTTP methods: `export async function GET(req: NextRequest) { ... }`
3. Add `export const dynamic = 'force-dynamic'` at the top
4. Call `connectDB()` if reading/writing to MongoDB
5. Call `getSettings()` if reading integration credentials
6. Use `NextResponse.json()` for all responses

**Authentication** is handled by the Edge Middleware — routes do not need to verify the session cookie themselves unless they need the actor's userId (e.g., for audit logs).

**Admin-only routes**: Add the path prefix to `isAdminRoute()` in `src/middleware.ts`. The middleware returns 403/redirect before the route handler runs.

---

## File-by-File Reference

### `src/middleware.ts`
**Purpose**: Runs on every request before any page or API route. Enforces auth.  
**Runtime**: Edge (no Node.js APIs — uses Web Crypto only)  
**Modify when**: Adding new public paths, changing admin route prefixes, updating session verification  
**Must NOT**: Import any Node.js-only modules (crypto, fs, etc.)

---

### `src/lib/db/mongoose.ts`
**Purpose**: MongoDB connection with caching across serverless function invocations  
**Pattern**: Stores connection in `global.mongooseCache` to survive hot-reload and Lambda reuse  
**Modify when**: Changing connection options, adding connection event handlers  
**Never**: Add business logic here

---

### `src/lib/services/settingsCache.ts`
**Purpose**: Single source of truth for all integration credentials  
**Pattern**: DB-first, env fallback, 60s in-process cache  
**Modify when**: Adding new credential fields  
**Critical**: All services MUST use `getSettings()` — never read `process.env` for credentials directly

---

### `src/lib/utils/session.ts`
**Purpose**: Create and verify HMAC-SHA256 session tokens  
**Token format**: `v2|{userId}|{role}|{expiryMs}|{hmac}`  
**Works in**: Both Edge (middleware) and Node.js (routes)  
**Modify when**: Changing session duration (`SESSION_MAX_AGE_MS`), adding new token fields  
**Warning**: Any format change invalidates all existing sessions

---

### `src/lib/utils/encryption.ts`
**Purpose**: AES-256-GCM encrypt/decrypt for storing credentials in MongoDB  
**Key**: `APP_ENCRYPTION_KEY` env var (64 hex chars)  
**Modify when**: Changing encryption algorithm (migration required for existing data)

---

### `src/lib/services/reply-classifier.ts`
**Purpose**: Keyword-based reply classification — zero AI cost  
**Modify when**: Adding new keywords, adjusting classification priorities  
**Priority order**: do_not_contact > not_interested > out_of_office > pricing_query > cert_query > shipping_query > interested > needs_review  
**Note**: Higher priority classifications win when multiple keywords match

---

### `src/lib/utils/scoreLead.ts`
**Purpose**: Two scoring formulas: `scoreLead()` for Apollo/CSV/manual, `scoreGoogleMapsLead()` for Apify  
**Modify when**: Adjusting point values, adding new scoring signals  
**Thresholds**: qualified ≥ 80, needs_review ≥ 40, low_priority < 40

---

### `src/lib/utils/followupScheduler.ts`
**Purpose**: Determines next follow-up action based on lead state  
**Currently**: Automated follow-ups disabled (`/api/follow-ups/process` returns disabled)  
**Sequence**: Day 1 → Day 3 → Day 7 → archive  
**To re-enable**: Implement a cron job (Vercel Cron or external) that calls `POST /api/follow-ups/process`

---

### `src/instrumentation.ts`
**Purpose**: Next.js instrumentation hook — runs once at server startup  
**Current use**: Check for required env vars, log startup warnings  
**Modify when**: Adding startup validation or initialization logic
