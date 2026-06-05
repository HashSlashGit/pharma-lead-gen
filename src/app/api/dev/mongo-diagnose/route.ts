import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dns from 'dns/promises';

function serializeMongoError(err: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = err as any;
  const name: string = e?.name ?? 'UnknownError';
  const code: number | string | null = e?.code ?? null;
  const codeName: string | null = e?.codeName ?? null;

  // Scrub credentials from message before returning / logging
  const rawMessage: string = e?.message ? String(e.message) : String(err);
  const message = rawMessage.replace(/mongodb(\+srv)?:\/\/[^@]*@/gi, 'mongodb+srv://***:***@');

  // reason is a TopologyDescription on MongoServerSelectionError; grab its error if present
  const reasonErr = e?.reason?.error ?? e?.reason;
  const reason: string | null = reasonErr
    ? String(reasonErr?.message ?? reasonErr)
    : null;

  const causeErr = e?.cause;
  const cause: string | null = causeErr
    ? String(causeErr?.message ?? causeErr)
    : null;

  return { name, code, codeName, message, reason, cause };
}

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  const rawUri = process.env.MONGODB_URI;
  const envLoaded = !!rawUri;

  let uriHost: string | null = null;
  let uriPort: string | null = null;
  let uriProtocol: string | null = null;
  let uriPathname: string | null = null;
  let uriParseError: string | null = null;
  if (rawUri) {
    try {
      const url = new URL(rawUri);
      uriHost = url.hostname;
      uriPort = url.port || null;          // empty string → null when no port
      uriProtocol = url.protocol;          // e.g. "mongodb+srv:" or "mongodb:"
      uriPathname = url.pathname || null;  // database name after the host
    } catch (e) {
      uriParseError = (e as Error).message;
      uriHost = 'invalid_uri_format';
    }
  }

  // ── DNS sanity checks ────────────────────────────────────────────────
  let dnsALookup: string | null = null;
  let dnsAError: string | null = null;
  let dnsSrvLookup: string | null = null;
  let dnsSrvError: string | null = null;
  let dnsSrvPublicLookup: string | null = null;
  let dnsSrvPublicError: string | null = null;

  if (uriHost && uriHost !== 'invalid_uri_format') {
    try {
      const addrs = await dns.lookup(uriHost);
      dnsALookup = addrs.address;
    } catch (e) {
      dnsAError = (e as NodeJS.ErrnoException).code ?? (e as Error).message;
    }
    try {
      const recs = await dns.resolveSrv(`_mongodb._tcp.${uriHost}`);
      dnsSrvLookup = recs.length > 0 ? `${recs.length} SRV record(s) found` : 'no records';
    } catch (e) {
      dnsSrvError = (e as NodeJS.ErrnoException).code ?? (e as Error).message;
    }
    // Retry SRV using a public resolver to test if the system DNS is the blocker
    try {
      const publicResolver = new dns.Resolver();
      publicResolver.setServers(['8.8.8.8', '1.1.1.1']);
      const recs = await publicResolver.resolveSrv(`_mongodb._tcp.${uriHost}`);
      dnsSrvPublicLookup = recs.length > 0 ? `${recs.length} SRV record(s) found` : 'no records';
    } catch (e) {
      dnsSrvPublicError = (e as NodeJS.ErrnoException).code ?? (e as Error).message;
    }
  }

  let canConnect = false;
  let canPing = false;
  let databaseName: string | null = null;
  let collections: string[] = [];
  let errorName: string | null = null;
  let errorCode: number | string | null = null;
  let errorCodeName: string | null = null;
  let errorMessage: string | null = null;
  let errorReason: string | null = null;
  let errorCause: string | null = null;

  if (rawUri) {
    // Use an isolated connection so we never disturb the shared cached connection
    // and always get a clean attempt even if the global mongoose state is broken.
    let conn: mongoose.Connection | null = null;
    try {
      conn = await mongoose
        .createConnection(rawUri, {
          bufferCommands: false,
          serverSelectionTimeoutMS: 8000,
          connectTimeoutMS: 8000,
        })
        .asPromise();

      canConnect = true;

      if (conn.db) {
        await conn.db.command({ ping: 1 });
        canPing = true;
        databaseName = conn.db.databaseName;
        const cols = await conn.db.listCollections().toArray();
        collections = cols.map((c: { name: string }) => c.name);
      }
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = err as any;
      // Full server-side log so the error is visible in the terminal
      console.error('[mongo-diagnose] connection failed');
      console.error('[mongo-diagnose] name      :', e?.name);
      console.error('[mongo-diagnose] code      :', e?.code);
      console.error('[mongo-diagnose] codeName  :', e?.codeName);
      console.error('[mongo-diagnose] message   :', e?.message);
      console.error('[mongo-diagnose] reason    :', e?.reason?.error ?? e?.reason);
      console.error('[mongo-diagnose] cause     :', e?.cause);
      console.error('[mongo-diagnose] stack     :', e?.stack);

      const s = serializeMongoError(err);
      errorName = s.name;
      errorCode = s.code;
      errorCodeName = s.codeName;
      errorMessage = s.message;
      errorReason = s.reason;
      errorCause = s.cause;
    } finally {
      try { await conn?.close(); } catch { /* ignore */ }
    }
  }

  return NextResponse.json({
    envLoaded,
    // URI structure (no password, no username)
    uriProtocol,
    uriHost,
    uriPort,
    uriPathname,
    uriParseError,
    // DNS checks
    dnsALookup,
    dnsAError,
    dnsSrvLookup,
    dnsSrvError,
    dnsSrvPublicLookup,   // SRV via 8.8.8.8 — if this succeeds, system DNS is the blocker
    dnsSrvPublicError,
    // Connection result
    databaseName,
    canConnect,
    canPing,
    collections,
    // Required safe fields (no credentials)
    errorName,
    errorCode,
    errorMessage,
    errorReason,
    // Extra fields useful for debugging
    errorCodeName,
    errorCause,
  });
}
