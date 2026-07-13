export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import mongoose from 'mongoose';
import InboxAccount from '@/lib/models/InboxAccount';
import { getSettings } from '@/lib/services/settingsCache';
import { DAILY_LIMIT } from '@/lib/services/mailboxRotation';

// 60-second in-memory cache. Health data changes only when settings are saved or
// the DB connection drops — checking more often than once per minute is wasteful.
let _healthCache: Record<string, unknown> | null = null;
let _healthCacheExpiry = 0;
const HEALTH_CACHE_TTL = 60_000;

export function invalidateHealthCache(): void {
  _healthCache = null;
  _healthCacheExpiry = 0;
}

function getSafeHost(uri: string): string {
  try {
    const withoutScheme = uri.replace(/^mongodb(\+srv)?:\/\//, '');
    const atIdx = withoutScheme.indexOf('@');
    const hostPart = atIdx !== -1 ? withoutScheme.slice(atIdx + 1) : withoutScheme;
    return hostPart.split('/')[0].split('?')[0];
  } catch {
    return 'unknown';
  }
}

function isToday(date: Date | undefined | null): boolean {
  if (!date) return false;
  const d = new Date(date);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth()    === now.getMonth() &&
    d.getDate()     === now.getDate()
  );
}

export async function GET() {
  if (_healthCache && Date.now() < _healthCacheExpiry) {
    return NextResponse.json(_healthCache);
  }

  const mongoUri = process.env.MONGODB_URI;
  const mongoUriSet = !!mongoUri;

  const isAtlas = mongoUri?.startsWith('mongodb+srv://') ?? false;
  const isLocal = mongoUri?.startsWith('mongodb://') ?? false;
  const mode: 'atlas' | 'local' | 'unknown' = isAtlas ? 'atlas' : isLocal ? 'local' : 'unknown';
  const host = mongoUri ? getSafeHost(mongoUri) : null;

  let canConnect = false;
  let ping: 'OK' | 'Failed' = 'Failed';
  let errorName: string | undefined;
  let errorCode: string | number | undefined;
  let message: string | undefined;

  if (mongoUri) {
    try {
      if (mongoose.connection.readyState === 1) {
        canConnect = true;
        ping = 'OK';
      } else {
        await connectDB();
        canConnect = true;
        ping = 'OK';
      }
    } catch (err) {
      const e = err as Error & { code?: string | number };
      errorName = e?.name ?? 'Error';
      errorCode = e?.code;
      message = e?.message
        ? String(e.message).replace(/mongodb(\+srv)?:\/\/[^@]*@/gi, 'mongodb+srv://***:***@')
        : String(err);
      console.error(`[health] MongoDB connection failed: ${errorName} ${errorCode ?? ''}: ${message}`);
    }
  }

  const s = await getSettings();

  const googleConfigured = !!(s.googleClientId && s.googleClientSecret);

  let gmailAccounts: Array<{
    email: string;
    isActive: boolean;
    accountType: string;
    dailySendCount: number;
    dailySendDate?: Date;
    limit: number;
  }> = [];

  try {
    const accounts = await InboxAccount.find({ provider: 'gmail' })
      .sort({ updatedAt: -1 })
      .select('email isActive accountType dailySendCount dailySendDate')
      .lean();

    gmailAccounts = accounts.map((a) => ({
      email:          a.email,
      isActive:       a.isActive,
      accountType:    a.accountType ?? 'personal',
      dailySendCount: isToday(a.dailySendDate) ? (a.dailySendCount ?? 0) : 0,
      limit:          DAILY_LIMIT[a.accountType ?? 'personal'],
    }));
  } catch {
    // DB may not be connected yet — non-fatal
  }

  const activeAccounts   = gmailAccounts.filter((a) => a.isActive);
  const connectedAccounts = gmailAccounts.length;
  const totalCapacity    = activeAccounts.reduce((sum, a) => sum + a.limit, 0);
  const dailyUsage       = activeAccounts.reduce((sum, a) => sum + a.dailySendCount, 0);

  // Backward-compat single-account fields
  const firstActive = activeAccounts[0] ?? null;

  const healthPayload: Record<string, unknown> = {
    mongoUriSet,
    mode,
    host,
    canConnect,
    ping,
    ...(errorName  !== undefined ? { errorName }  : {}),
    ...(errorCode  !== undefined ? { errorCode }  : {}),
    ...(message    !== undefined ? { message }    : {}),
    claude: s.claudeApiKey ? 'configured' : 'missing',
    apollo: s.apolloApiKey ? 'configured' : 'missing',
    apify:  s.apifyToken   ? 'configured' : 'missing',
    gmail: {
      oauthConfigured:  googleConfigured,
      connected:        activeAccounts.length > 0,
      email:            firstActive?.email ?? null,
      connectedAccounts,
      activeAccounts:   activeAccounts.length,
      totalCapacity,
      dailyUsage,
      accounts:         gmailAccounts,
    },
    mailbox: {
      enabled:    s.mailboxEnabled,
      configured: !!(s.mailboxImapHost && s.mailboxUser && s.mailboxPassword),
    },
    websiteEnrichment: s.apifyWebsiteEnrichment,
  };
  _healthCache = healthPayload;
  _healthCacheExpiry = Date.now() + HEALTH_CACHE_TTL;
  return NextResponse.json(healthPayload);
}
