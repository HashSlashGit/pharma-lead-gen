# PharmaLeads - Setup and Integration Guide

This guide walks you through getting PharmaLeads running and connecting every service it uses. No technical background required.

---

## What is PharmaLeads?

PharmaLeads is a lead generation platform built for pharmaceutical outreach. It lets you:

- **Find leads** from Google Maps (via Apify) and Apollo.io contact databases
- **Send personalised outreach emails** via Smartlead
- **Track replies** automatically from your inbox or Gmail
- **Manage campaigns** with AI-assisted email personalisation (Claude AI)

---

## Before You Start - What You Will Need

You will need accounts on the following services. All have free tiers or trials:

| Service | What it is for |
|---|---|
| **MongoDB Atlas** | Database to store your leads and settings |
| **Smartlead** | Sending outreach emails at scale |
| **Apollo.io** | Finding B2B contacts (pharmacists, buyers, etc.) |
| **Apify** | Scraping Google Maps for local pharmacy leads |
| **Anthropic (Claude)** | AI email personalisation (optional) |
| **Google Cloud** | Gmail inbox sync (optional) |

---

## Step 1 - Copy the Environment File

The app reads its configuration from a file called `.env.local`. A template already exists.

1. In the project folder, find the file named `.env.local.example`
2. Make a copy of it and name the copy `.env.local`
3. Open `.env.local` in any text editor (Notepad works fine)

You will fill this file in as you complete each section below.

---

## Step 2 - MongoDB (Database)

This is the only required step - nothing else works without it.

1. Go to https://cloud.mongodb.com and create a free account
2. Create a new **Project**, then inside it create a **Cluster** (choose the free M0 tier)
3. When prompted, create a **database user** - save the username and password somewhere
4. Click **Connect** on your cluster and choose **Connect your application**
5. Copy the connection string. It looks like this:

        mongodb+srv://myuser:mypassword@cluster0.abc123.mongodb.net/

6. Paste it into `.env.local`, replacing the placeholder:

        MONGODB_URI=mongodb+srv://myuser:mypassword@cluster0.abc123.mongodb.net/pharma-leads?retryWrites=true&w=majority

   Make sure `/pharma-leads` appears before the `?` - that names the database.

**Network access:** In MongoDB Atlas, go to **Network Access** and add your server IP address (or `0.0.0.0/0` to allow all IPs during testing).

---

## Step 3 - Create Your Admin Account

The first person to log in becomes the admin. Set these two values in `.env.local`:

    ADMIN_EMAIL=you@yourcompany.com
    ADMIN_PASSWORD=ChooseAStrongPassword123!

These are only used to create your admin account on the **first login ever**. After that they can be left in place - they have no further effect once the account exists.

You also need a secret key for login sessions. Generate any long random string (32+ characters) and set:

    JWT_SECRET=paste-a-long-random-string-here

**Tip:** Visit any random string generator and generate a 32+ character alphanumeric string.

---

## Step 4 - Encryption Key (Required for Settings Page)

API keys you enter through the in-app Settings page are stored encrypted in the database. You must provide an encryption key:

    APP_ENCRYPTION_KEY=paste-a-32-character-random-string

This must be **exactly 32 characters** long. Use letters and numbers only.

**Important:** Never change this key after you have saved settings through the UI. Changing it will make previously saved API keys unreadable.

---

## Step 5 - Smartlead (Email Sending)

Smartlead sends your outreach emails.

1. Log in at https://app.smartlead.ai
2. Go to **Settings -> API Key** and copy your key
3. Create a **Campaign** in Smartlead - the campaign ID is in the URL when you open it:
   `https://app.smartlead.ai/app/campaigns/12345` - your ID is `12345`
4. Note the **sender email address** configured as a mailbox in your Smartlead account

Set these in `.env.local`:

    SMARTLEAD_API_KEY=your-api-key-here
    SMARTLEAD_CAMPAIGN_ID=12345
    SMARTLEAD_FROM_EMAIL=youremail@yourcompany.com
    SMARTLEAD_FROM_NAME=Your Name
    SMARTLEAD_DRY_RUN=true

**Dry run mode:** Leave `SMARTLEAD_DRY_RUN=true` while testing. Emails will be validated but **not actually sent**. Change to `false` only when you are ready to send real emails.

---

## Step 6 - Apollo.io (Contact Discovery)

Apollo lets you search for contacts like pharmacy buyers, procurement managers, etc.

1. Log in at https://app.apollo.io
2. Go to **Settings -> Integrations -> API** and copy your API key

Set it in `.env.local`:

    APOLLO_API_KEY=your-apollo-api-key

---

## Step 7 - Apify (Google Maps Scraping)

Apify scrapes Google Maps to find local pharmacies, clinics, and hospitals.

1. Create an account at https://console.apify.com
2. Go to **Account -> Integrations** and copy your API token

Set it in `.env.local`:

    APIFY_API_TOKEN=your-apify-token

**Optional - Website Email Enrichment:**

When enabled, the app will visit each business website and try to find a public contact email (useful for leads without an email listed on Google Maps):

    APIFY_WEBSITE_ENRICHMENT_ENABLED=false

Change to `true` to enable. This uses your server internet connection, not Apify credits.

---

## Step 8 - Claude AI (Optional - Email Personalisation)

Claude AI writes personalised email openers for high-scoring leads. It only runs when you manually click "Personalise with AI" on a lead - never automatically.

1. Sign up at https://console.anthropic.com
2. Go to **API Keys** and create a new key

Set it in `.env.local`:

    CLAUDE_API_KEY=sk-ant-api03-...

If you skip this, everything else still works - you just will not have AI personalisation.

---

## Step 9 - Gmail Sync (Optional - Reply Tracking)

Gmail sync lets the app read your Gmail inbox and automatically detect when a lead replies to one of your emails.

### Part A - Create Google OAuth Credentials

1. Go to https://console.cloud.google.com
2. Create a new **Project** (or select an existing one)
3. Go to **APIs and Services -> Enable APIs** and enable the **Gmail API**
4. Go to **APIs and Services -> Credentials -> Create Credentials -> OAuth 2.0 Client ID**
5. Choose **Web application** as the application type
6. Under **Authorised redirect URIs**, add:
   - For local testing: `http://localhost:3000/api/gmail/callback`
   - For your live site: `https://yourdomain.com/api/gmail/callback`
7. Click Create - copy the **Client ID** and **Client Secret**

### Part B - Set the Variables

    GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
    GOOGLE_CLIENT_SECRET=your-client-secret
    GOOGLE_REDIRECT_URI=http://localhost:3000/api/gmail/callback

### Part C - Connect Gmail in the App

Once the app is running, go to **Settings** in the sidebar and click **Connect Gmail**. You will be redirected to Google to approve access.

---

## Step 10 - IMAP Mailbox Sync (Optional - Alternative Reply Tracking)

If you use a custom sending mailbox rather than Gmail, IMAP sync can capture replies directly from that inbox. This is an alternative to Gmail sync - you do not need both.

    MAILBOX_SYNC_ENABLED=false
    MAILBOX_IMAP_HOST=imap.gmail.com
    MAILBOX_IMAP_PORT=993
    MAILBOX_IMAP_SECURE=true
    MAILBOX_USER=youremail@yourcompany.com
    MAILBOX_APP_PASSWORD=your-app-password
    MAILBOX_LOOKBACK_DAYS=14

**For Gmail:** Do not use your regular Google account password here. Go to **Google Account -> Security -> 2-Step Verification -> App passwords** and generate a dedicated app password for this app.

Change `MAILBOX_SYNC_ENABLED` to `true` when ready to use it.

---

## Step 11 - App URL

Set this to the address where the app is running:

    # Local development:
    APP_PUBLIC_URL=http://localhost:3000

    # Production:
    APP_PUBLIC_URL=https://yourdomain.com

---

## Running the App

Once your `.env.local` is filled in:

1. Open a terminal in the project folder
2. Run: `npm install`
3. Run: `npm run dev`
4. Open your browser and go to **http://localhost:3000**
5. Log in with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` you set in Step 3

---

## Adding More Users (Team Members)

Once you are logged in as admin:

1. Click **Admin -> Users** in the left sidebar
2. Click **Add User**
3. Enter their name, email address, and a temporary password
4. Share the app URL and temporary password with them

All users created through the UI have the **User** role (access to leads and campaigns). The **Admin** role - which also unlocks the User Management page - is set via `ADMIN_EMAIL` on first setup.

---

## Using the In-App Settings Page

After initial setup, you can update most API keys directly through the app at **Settings -> Integrations** - no need to edit `.env.local` again. Keys saved there are encrypted in the database.

The Settings page covers: Claude AI, Smartlead, Apollo, Apify, Mailbox, and Gmail credentials.

**Note:** `MONGODB_URI`, `JWT_SECRET`, `APP_ENCRYPTION_KEY`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` must always stay in `.env.local`. They cannot be set through the UI.

---

## Complete .env.local Reference

    # Required
    MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/pharma-leads?retryWrites=true&w=majority
    JWT_SECRET=your-long-random-secret-string
    APP_ENCRYPTION_KEY=exactly-32-characters-here!!

    # First admin account (used once, on first login only)
    ADMIN_EMAIL=you@yourcompany.com
    ADMIN_PASSWORD=YourStrongPassword123!

    # App URL
    APP_PUBLIC_URL=http://localhost:3000

    # Smartlead (email sending)
    SMARTLEAD_API_KEY=
    SMARTLEAD_CAMPAIGN_ID=
    SMARTLEAD_FROM_EMAIL=
    SMARTLEAD_FROM_NAME=
    SMARTLEAD_DRY_RUN=true

    # Apollo.io (contact discovery)
    APOLLO_API_KEY=

    # Apify (Google Maps scraping)
    APIFY_API_TOKEN=
    APIFY_WEBSITE_ENRICHMENT_ENABLED=false

    # Claude AI (optional - email personalisation)
    CLAUDE_API_KEY=

    # Gmail OAuth sync (optional)
    GOOGLE_CLIENT_ID=
    GOOGLE_CLIENT_SECRET=
    GOOGLE_REDIRECT_URI=http://localhost:3000/api/gmail/callback

    # IMAP mailbox sync (optional - alternative to Gmail sync)
    MAILBOX_SYNC_ENABLED=false
    MAILBOX_IMAP_HOST=imap.gmail.com
    MAILBOX_IMAP_PORT=993
    MAILBOX_IMAP_SECURE=true
    MAILBOX_USER=
    MAILBOX_APP_PASSWORD=
    MAILBOX_LOOKBACK_DAYS=14

---

## Troubleshooting

**Cannot log in after first setup**
Make sure `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set in `.env.local` before the very first login. Restart the server after editing `.env.local`.

**"Authentication is not configured" error**
Either `ADMIN_EMAIL`/`ADMIN_PASSWORD` or the legacy `APP_PASSWORD` must be set. Check your `.env.local` file exists and the server has restarted after editing it.

**Settings page shows "Encryption not available"**
`APP_ENCRYPTION_KEY` is missing or not exactly 32 characters. Fix it in `.env.local` and restart.

**Emails not sending**
Check that `SMARTLEAD_DRY_RUN=false` and that your Smartlead campaign ID and API key are correct.

**Gmail Connect button does not work**
Make sure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` are all set and the redirect URI exactly matches what is listed in your Google Cloud OAuth credentials.
