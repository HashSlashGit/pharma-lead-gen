export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import mongoose from 'mongoose';

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

export async function GET() {
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

  return NextResponse.json({
    mongoUriSet,
    mode,
    host,
    canConnect,
    ping,
    ...(errorName !== undefined ? { errorName } : {}),
    ...(errorCode !== undefined ? { errorCode } : {}),
    ...(message !== undefined ? { message } : {}),
    claude: process.env.CLAUDE_API_KEY ? 'configured' : 'missing',
    apollo: process.env.APOLLO_API_KEY ? 'configured' : 'missing',
    apify: (process.env.APIFY_API_TOKEN ?? process.env.APIFY_TOKEN) ? 'configured' : 'missing',
    smartlead: {
      configured: !!process.env.SMARTLEAD_API_KEY,
      dryRun: process.env.SMARTLEAD_DRY_RUN !== 'false',
      campaignIdPresent: !!process.env.SMARTLEAD_CAMPAIGN_ID,
    },
    mailbox: {
      enabled: process.env.MAILBOX_SYNC_ENABLED === 'true',
      configured: !!(process.env.MAILBOX_IMAP_HOST && process.env.MAILBOX_USER && process.env.MAILBOX_APP_PASSWORD),
    },
    websiteEnrichment: process.env.APIFY_WEBSITE_ENRICHMENT_ENABLED === 'true',
  });
}
