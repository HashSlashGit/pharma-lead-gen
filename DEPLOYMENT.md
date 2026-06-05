# Deployment Guide — PharmaLeads MVP

Simple, affordable deployment for a small organization.
No Docker, no Kubernetes, no paid monitoring.

---

## Deployment targets

| Option | Best for | Cost |
|---|---|---|
| Local production test | Verifying the build before deploying | Free |
| VPS (recommended) | Webhooks, automation, always-on | $6–12/mo |

---

## Monthly cost reference

| Service | Cost |
|---|---|
| VPS (DigitalOcean/Vultr/Hetzner) | $6–12/mo |
| MongoDB Atlas M0 | Free |
| Smartlead (starter plan) | ~$59/mo |
| Claude Haiku | Pay-per-use — ~$1–5/mo at this volume |
| Apollo.io | Optional — varies by plan |
| Apify | Optional — $5 free/mo on starter |
| **Total** | **~$70–80/mo minimum** |

---

## 1. Local Production Test

Run the full production build locally before touching a server.

```bash
# Copy and fill env file
cp .env.local.example .env.local

# Set required vars at minimum:
# MONGODB_URI=mongodb+srv://...
# SMARTLEAD_DRY_RUN=true

npm install
npm run typecheck     # TypeScript — must be clean
npm run build         # Next.js production build
npm start             # Starts on http://localhost:3000
```

Open [http://localhost:3000/settings](http://localhost:3000/settings) and verify the health check.
Open [http://localhost:3000/production-checklist](http://localhost:3000/production-checklist) to review readiness.

**Warning:** `npm start` reads `.env.local` in development but in production you must export environment variables
directly in your shell or via a process manager (see VPS section). `.env.local` is NOT loaded by `next start`
when `NODE_ENV=production`.

---

## 2. VPS Deployment (Ubuntu 22.04 LTS)

### 2.1 Provision the server

Use any provider: DigitalOcean, Vultr, Hetzner, Linode.
- **Minimum spec:** 1 vCPU, 1 GB RAM, 25 GB SSD
- **Recommended:** 1 vCPU, 2 GB RAM (comfortable for Next.js + PM2)

### 2.2 Install Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # should be 20.x
npm --version
```

### 2.3 Install PM2 (process manager)

```bash
sudo npm install -g pm2
```

PM2 keeps the app running after crashes and across reboots.

### 2.4 Upload the project

From your local machine:

```bash
# Option A: git clone (recommended)
# Push to GitHub first, then on the server:
git clone https://github.com/YOUR_ORG/pharma-lead-gen.git /var/www/pharma-lead-gen

# Option B: rsync
rsync -avz --exclude node_modules --exclude .next \
  ./pharma-lead-gen/ user@YOUR_VPS_IP:/var/www/pharma-lead-gen/
```

### 2.5 Create the environment file on the server

```bash
cd /var/www/pharma-lead-gen
nano .env.production
```

Paste your production env vars (see section 3 below).

**Important:** `.env.production` is loaded automatically by Next.js in production.
Alternatively, set vars via PM2's ecosystem file (preferred — see 2.6).

### 2.6 Build and start with PM2

```bash
cd /var/www/pharma-lead-gen
npm install --production=false   # devDependencies needed for build
npm run build

# Start with PM2 (reads .env.production automatically via next start)
pm2 start npm --name "pharma-leads" -- start
pm2 save                         # persist across reboots
pm2 startup                      # follow the printed command to enable boot start
```

Useful PM2 commands:

```bash
pm2 status                       # show running processes
pm2 logs pharma-leads            # tail logs
pm2 restart pharma-leads         # restart after config change
pm2 stop pharma-leads            # stop
```

### 2.7 Nginx reverse proxy

Install nginx:

```bash
sudo apt install -y nginx
```

Create a site config:

```bash
sudo nano /etc/nginx/sites-available/pharma-leads
```

Paste:

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/pharma-leads /etc/nginx/sites-enabled/
sudo nginx -t              # test config
sudo systemctl reload nginx
```

### 2.8 SSL with Certbot (free)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

Certbot auto-renews — confirm with:

```bash
sudo certbot renew --dry-run
```

### 2.9 Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

---

## 3. Environment Variables (Production)

Set these in `.env.production` in the project root on the server.

```bash
# ── Required ──────────────────────────────────────────────────────────────
NODE_ENV=production
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/pharma-leads-prod?retryWrites=true&w=majority

# ── Smartlead ──────────────────────────────────────────────────────────────
SMARTLEAD_API_KEY=your-live-api-key
SMARTLEAD_DRY_RUN=true                # keep true until you have tested the full flow
SMARTLEAD_CAMPAIGN_ID=your-campaign-id

# ── Claude AI (optional) ───────────────────────────────────────────────────
CLAUDE_API_KEY=sk-ant-...

# ── Apollo.io (optional) ───────────────────────────────────────────────────
APOLLO_API_KEY=

# ── Apify (optional) ──────────────────────────────────────────────────────
APIFY_API_TOKEN=
APIFY_GOOGLE_MAPS_ACTOR_ID=
APIFY_WEBSITE_ENRICHMENT_ENABLED=false
```

**Never commit `.env.production` to git.** Add it to `.gitignore`.

---

## 4. MongoDB Atlas Production Setup

1. Create a new project in Atlas for production (keep dev and prod separate).
2. Create an M0 free cluster (or M2/M5 if you need guaranteed uptime).
3. Create a database user with read/write access to `pharma-leads-prod`.
4. In **Network Access**, add your VPS IP address. If the IP changes, add `0.0.0.0/0` (accept all) — less secure but fine for an internal tool.
5. Copy the connection string and set `MONGODB_URI` on the server.
6. Test connectivity: `npm run build && npm start` — check `/settings` health card.

---

## 5. Smartlead Webhook Setup

Inbound replies from Smartlead campaigns are delivered to:

```
POST https://your-domain.com/api/webhooks/smartlead/reply
```

To register:

1. Log into Smartlead → **Campaigns** → select your campaign.
2. Go to **Settings** → **Webhooks**.
3. Add a new webhook:
   - **Event type:** `REPLY` (or "Email reply" depending on Smartlead version)
   - **URL:** `https://your-domain.com/api/webhooks/smartlead/reply`
4. Save. Smartlead will POST each inbound reply to this URL.

The webhook handler classifies the reply by keyword (no Claude call) and creates a `Reply` record visible in the Reply Inbox.

**Local testing:** Smartlead cannot reach `localhost`. Use [ngrok](https://ngrok.com) for local webhook testing:

```bash
ngrok http 3000
# Use the generated https://xxxxx.ngrok.io/api/webhooks/smartlead/reply URL in Smartlead
```

---

## 6. Dry-Run Before Live Sending

**Never set `SMARTLEAD_DRY_RUN=false` without testing the full send flow first.**

Steps:

1. Set `SMARTLEAD_DRY_RUN=true` on the server.
2. Deploy and start the app.
3. Open `/compose`, select a real lead, write an email, click **Test Send**.
4. Verify the EmailLog in the database shows `status: 'ready_to_send_test'` — not `sent`.
5. Verify no email appears in your Smartlead sent folder.
6. Check `/settings` shows "Test Mode" for Smartlead.
7. Only once confident: set `SMARTLEAD_DRY_RUN=false` and restart PM2.

---

## 7. Deploying Updates

```bash
cd /var/www/pharma-lead-gen
git pull origin main          # or however you push updates
npm install
npm run build
pm2 restart pharma-leads
```

Zero-downtime restarts are handled by PM2's cluster mode, but for this MVP a brief restart (~5 seconds) is acceptable.

---

## 8. Production Safety Summary

| Guard | How it works |
|---|---|
| Dev routes blocked | `POST /api/dev/seed` and `/api/dev/reset` return 403 when `NODE_ENV=production` |
| Dev sidebar hidden | `process.env.NODE_ENV !== 'production'` is inlined at build time — links don't render |
| Secrets never exposed | API routes return only boolean flags, never raw key values |
| Claude cost-controlled | Only called on manual user action — never automatic |
| Smartlead cost-controlled | Dry-run by default — real sends require explicit opt-in |
| Human approval required | AI reply drafts never auto-send — require approval click |

---

## 9. Production Checklist

Visit `/production-checklist` in the running app for a live automated + manual checklist.

Quick reference:

- [ ] `NODE_ENV=production` on server
- [ ] `MONGODB_URI` set and MongoDB connected (green on `/settings`)
- [ ] Atlas IP whitelist includes your VPS IP
- [ ] `SMARTLEAD_API_KEY` set
- [ ] `SMARTLEAD_CAMPAIGN_ID` set
- [ ] Webhook URL registered in Smartlead campaign
- [ ] Test send cycle completed (`DRY_RUN=true`)
- [ ] Sample data removed (`/dev-tools` → Reset)
- [ ] Domain DNS resolved
- [ ] SSL certificate active (Certbot)
- [ ] `SMARTLEAD_DRY_RUN=false` — **only after all above confirmed**
