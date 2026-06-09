/**
 * Gmail OAuth2 + Gmail REST API service.
 * No external SDK — uses native fetch only.
 * No tokens are ever logged or returned to the browser.
 */

import { getSettings } from '@/lib/services/settingsCache';

export interface GmailReply {
  gmailMessageId: string;
  gmailThreadId: string;
  senderEmail: string;
  senderName: string;
  subject: string;
  body: string;
  receivedAt: Date;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  error?: string;
  error_description?: string;
}

interface GmailProfile {
  emailAddress: string;
  historyId?: string;
}

interface GmailPart {
  mimeType: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
  headers?: { name: string; value: string }[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  payload?: GmailPart;
  internalDate?: string;
}

interface GmailMessageListResponse {
  messages?: { id: string; threadId: string }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function decodeBase64Url(encoded: string): string {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

function findPartByMimeType(part: GmailPart, mimeType: string): GmailPart | null {
  if (part.mimeType === mimeType) return part;
  if (part.parts) {
    for (const p of part.parts) {
      const found = findPartByMimeType(p, mimeType);
      if (found) return found;
    }
  }
  return null;
}

function extractBodyText(payload: GmailPart): string {
  const textPart = findPartByMimeType(payload, 'text/plain');
  if (textPart?.body?.data) return decodeBase64Url(textPart.body.data);

  const htmlPart = findPartByMimeType(payload, 'text/html');
  if (htmlPart?.body?.data) {
    const html = decodeBase64Url(htmlPart.body.data);
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  return '';
}

function getHeader(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function parseSender(fromHeader: string): { email: string; name: string } {
  const angleMatch = fromHeader.match(/<([^>]+)>/);
  if (angleMatch) {
    const email = angleMatch[1].toLowerCase().trim();
    const name = fromHeader.replace(/<[^>]+>/, '').replace(/"/g, '').trim();
    return { email, name };
  }
  return { email: fromHeader.toLowerCase().trim(), name: '' };
}

// ── Public functions ──────────────────────────────────────────────────────────

export async function getGmailOAuthUrl(): Promise<string> {
  const s = await getSettings();
  const clientId = s.googleClientId;
  const redirectUri = s.googleRedirectUri;

  if (!clientId || !redirectUri) {
    throw new Error('Google OAuth credentials not configured. Add Client ID and Redirect URI in Settings → Integrations.');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    access_type: 'offline',
    prompt: 'consent',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  tokenExpiry: Date;
  email: string;
}> {
  const s = await getSettings();
  const clientId = s.googleClientId;
  const clientSecret = s.googleClientSecret;
  const redirectUri = s.googleRedirectUri;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth credentials not configured. Add them in Settings → Integrations.');
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const tokens: TokenResponse = await tokenRes.json();

  if (!tokenRes.ok || tokens.error) {
    throw new Error(`Token exchange failed: ${tokens.error_description ?? tokenRes.status}`);
  }

  if (!tokens.refresh_token) {
    throw new Error(
      'No refresh_token received. Revoke app access at myaccount.google.com/permissions and reconnect.'
    );
  }

  const tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000);

  const profileRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!profileRes.ok) {
    throw new Error(`Gmail profile fetch failed: ${profileRes.status}`);
  }

  const profile: GmailProfile = await profileRes.json();

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenExpiry,
    email: profile.emailAddress.toLowerCase(),
  };
}

export async function refreshGmailAccessToken(
  account: { refreshToken: string; email: string }
): Promise<{ accessToken: string; tokenExpiry: Date }> {
  const s = await getSettings();
  const clientId = s.googleClientId;
  const clientSecret = s.googleClientSecret;

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured. Add them in Settings → Integrations.');
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: account.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });

  const tokens: TokenResponse = await tokenRes.json();

  if (!tokenRes.ok || tokens.error) {
    throw new Error(
      `Token refresh failed for ${account.email}: ${tokens.error_description ?? tokenRes.status}`
    );
  }

  return {
    accessToken: tokens.access_token,
    tokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
  };
}

/**
 * Fetch up to `maxResults` recent inbox messages (excluding sent).
 * Skips messages with no extractable body.
 */
export async function fetchRecentGmailReplies(
  accessToken: string,
  maxResults = 50
): Promise<GmailReply[]> {
  const listParams = new URLSearchParams({
    q: 'in:inbox -in:sent',
    maxResults: String(Math.min(maxResults, 50)),
  });

  const listRes = await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages?${listParams}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!listRes.ok) {
    const errText = await listRes.text();
    throw new Error(`Gmail messages list failed: ${listRes.status} ${errText}`);
  }

  const listData: GmailMessageListResponse = await listRes.json();
  const messageIds = listData.messages ?? [];
  const replies: GmailReply[] = [];

  for (const { id } of messageIds) {
    try {
      const msgRes = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!msgRes.ok) continue;

      const msg: GmailMessage = await msgRes.json();
      if (!msg.payload) continue;

      const headers = msg.payload.headers ?? [];
      const fromHeader = getHeader(headers, 'From');
      if (!fromHeader) continue;

      const { email: senderEmail, name: senderName } = parseSender(fromHeader);
      if (!senderEmail) continue;

      const subject = getHeader(headers, 'Subject');
      const dateHeader = getHeader(headers, 'Date');
      const body = extractBodyText(msg.payload);
      if (!body.trim()) continue;

      const parsedDate = dateHeader ? new Date(dateHeader) : null;
      const internalDate = msg.internalDate ? new Date(Number(msg.internalDate)) : null;
      const receivedAt =
        parsedDate && !isNaN(parsedDate.getTime())
          ? parsedDate
          : internalDate && !isNaN(internalDate.getTime())
          ? internalDate
          : new Date();

      replies.push({
        gmailMessageId: msg.id,
        gmailThreadId: msg.threadId,
        senderEmail,
        senderName,
        subject,
        body,
        receivedAt,
      });
    } catch (err) {
      console.warn(`[gmail] Failed to fetch message ${id}:`, String(err));
    }
  }

  return replies;
}
