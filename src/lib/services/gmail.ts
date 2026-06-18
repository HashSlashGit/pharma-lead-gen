/**
 * Gmail OAuth2 + Gmail REST API service.
 * No external SDK — uses native fetch only.
 * No tokens are ever logged or returned to the browser.
 */

import { randomBytes } from 'crypto';
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

function resolveRedirectUri(
  s: { googleRedirectUri?: string },
  requestOrigin?: string,
): { redirectUri: string; source: 'env' | 'db' | 'request' } | { redirectUri: undefined; source: 'none' } {
  if (process.env.GOOGLE_REDIRECT_URI) {
    return { redirectUri: process.env.GOOGLE_REDIRECT_URI, source: 'env' };
  }
  if (s.googleRedirectUri) {
    return { redirectUri: s.googleRedirectUri, source: 'db' };
  }
  if (requestOrigin) {
    return { redirectUri: `${requestOrigin}/api/gmail/callback`, source: 'request' };
  }
  return { redirectUri: undefined, source: 'none' };
}

export async function getGmailOAuthUrl(requestOrigin?: string): Promise<string> {
  const s = await getSettings();
  const clientId = s.googleClientId;
  const { redirectUri, source } = resolveRedirectUri(s, requestOrigin);

  if (!clientId || !redirectUri) {
    throw new Error('Google OAuth credentials not configured. Add Client ID and Redirect URI in Settings → Integrations.');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string, requestOrigin?: string): Promise<{
  accessToken: string;
  refreshToken: string;
  tokenExpiry: Date;
  email: string;
}> {
  const s = await getSettings();
  const clientId = s.googleClientId;
  const clientSecret = s.googleClientSecret;
  const { redirectUri } = resolveRedirectUri(s, requestOrigin);

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

// ── Send ──────────────────────────────────────────────────────────────────────

export interface GmailSendResult {
  messageId: string;
  threadId: string;
}

// ── MIME / RFC helpers ────────────────────────────────────────────────────────

/** RFC 2047 Base64 encoding for non-ASCII header values. */
function encodeHeaderValue(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf-8').toString('base64')}?=`;
}

/** Strip CRLF to prevent header injection. */
function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

/** RFC 2822 Message-ID using the sender domain. */
function generateMessageId(fromEmail?: string): string {
  const domain = fromEmail?.split('@')[1] ?? 'mail.local';
  return `<${Date.now()}.${randomBytes(8).toString('hex')}@${domain}>`;
}

/**
 * Base64-encode a MIME part body.
 * Lines are wrapped at 76 chars per RFC 2045 §6.8.
 */
function encodeMimePart(content: string): string {
  const b64 = Buffer.from(content, 'utf-8').toString('base64');
  return (b64.match(/.{1,76}/g) ?? []).join('\r\n');
}

/** Strip HTML tags and decode entities to produce a plain-text fallback. */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Build a multipart/alternative body with text/plain and text/html parts.
 * Parts are ordered plain → html so clients prefer the HTML version.
 */
function buildMultipartAlternative(htmlBody: string, plainBody: string, boundary: string): string {
  const plainPart =
    `--${boundary}\r\n` +
    `Content-Type: text/plain; charset=utf-8\r\n` +
    `Content-Transfer-Encoding: base64\r\n` +
    `\r\n` +
    encodeMimePart(plainBody);

  const htmlPart =
    `--${boundary}\r\n` +
    `Content-Type: text/html; charset=utf-8\r\n` +
    `Content-Transfer-Encoding: base64\r\n` +
    `\r\n` +
    encodeMimePart(htmlBody);

  return `${plainPart}\r\n${htmlPart}\r\n--${boundary}--`;
}

/**
 * Send a single email via the Gmail REST API.
 * Constructs a RFC 2822 multipart/alternative message, base64url-encodes it,
 * and POSTs to /gmail/v1/users/me/messages/send using the supplied access token.
 *
 * Requires the token to carry the gmail.send scope.
 */
export async function sendGmailMessage(params: {
  accessToken: string;
  to: string;
  subject: string;
  body: string;
  from?: string;
  fromName?: string;
}): Promise<GmailSendResult> {
  const { accessToken, to, subject, body, from, fromName } = params;

  const safeFrom    = from    ? sanitizeHeaderValue(from)    : undefined;
  const safeTo      = sanitizeHeaderValue(to);
  const safeSubject = sanitizeHeaderValue(subject);
  const boundary    = `----=_Part_${randomBytes(12).toString('hex')}`;
  const plainBody   = htmlToPlainText(body);

  const headerLines: string[] = [];

  if (safeFrom) {
    const safeName   = fromName ? sanitizeHeaderValue(fromName).replace(/"/g, '') : '';
    const fromHeader = safeName ? `"${safeName}" <${safeFrom}>` : safeFrom;
    headerLines.push(`From: ${fromHeader}`);
  }

  headerLines.push(
    `Message-ID: ${generateMessageId(safeFrom)}`,
    `Date: ${new Date().toUTCString()}`,
    `To: ${safeTo}`,
    `Subject: ${encodeHeaderValue(safeSubject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  );

  const raw = `${headerLines.join('\r\n')}\r\n\r\n${buildMultipartAlternative(body, plainBody, boundary)}`;
  const encoded = Buffer.from(raw, 'utf-8').toString('base64url');

  const res = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encoded }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gmail send failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { id: string; threadId: string };
  return { messageId: data.id, threadId: data.threadId };
}
