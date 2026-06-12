import mongoose from 'mongoose';
import dns from "node:dns";

const MONGODB_URI = process.env.MONGODB_URI;

const isAtlas = MONGODB_URI?.startsWith('mongodb+srv://') ?? false;
const isLocal = MONGODB_URI?.startsWith('mongodb://') ?? false;
const dbMode: 'atlas' | 'local' | 'unknown' = isAtlas ? 'atlas' : isLocal ? 'local' : 'unknown';

// Only apply SRV-specific DNS overrides for Atlas URIs
if (isAtlas) {
  dns.setServers(['8.8.8.8', '1.1.1.1', '[2001:4860:4860::8888]', '[2606:4700:4700::1111]']);
  dns.setDefaultResultOrder('ipv4first');
}

if (!MONGODB_URI) {
  throw new Error('MONGODB_URI environment variable is not set');
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongooseCache: MongooseCache;
}

const cached: MongooseCache = global.mongooseCache ?? { conn: null, promise: null };
global.mongooseCache = cached;

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn && mongoose.connection.readyState === 1) return cached.conn;

  // Connection dropped — allow a fresh attempt
  if (cached.conn && mongoose.connection.readyState !== 1) {
    cached.conn = null;
    cached.promise = null;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI!, { bufferCommands: false })
      .then((m) => {
        console.log('[db] MongoDB connected');
        return m;
      })
      .catch((err) => {
        const e = err as Error & { code?: string | number };
        console.error(
          `[db] MongoDB connection failed: ${e?.name ?? 'Error'} ${e?.code != null ? String(e.code) : ''} ${e?.message ?? String(err)}`
        );
        cached.promise = null;
        throw err;
      });
  }

  await cached.promise;

  // Guarantee readyState === 1 before returning; mongoose.connect() resolves
  // slightly before the driver marks itself connected in some edge cases.
  if (mongoose.connection.readyState !== 1) {
    await new Promise<void>((resolve, reject) => {
      const onConnected = () => { cleanup(); resolve(); };
      const onError = (err: Error) => { cleanup(); reject(err); };
      const cleanup = () => {
        mongoose.connection.removeListener('connected', onConnected);
        mongoose.connection.removeListener('error', onError);
      };
      mongoose.connection.once('connected', onConnected);
      mongoose.connection.once('error', onError);
    });
  }

  cached.conn = mongoose;
  return cached.conn;
}
