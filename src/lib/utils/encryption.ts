import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALG = 'aes-256-gcm';

export interface EncryptedField {
  ct: string;  // ciphertext hex
  iv: string;  // 16-byte IV hex
  tag: string; // 16-byte auth tag hex
}

export function isEncryptionConfigured(): boolean {
  return (process.env.APP_ENCRYPTION_KEY?.length ?? 0) === 64;
}

function getKey(): Buffer {
  const hex = process.env.APP_ENCRYPTION_KEY ?? '';
  if (hex.length !== 64) {
    throw new Error('APP_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }
  return Buffer.from(hex, 'hex');
}

export function encrypt(plaintext: string): EncryptedField {
  const key = getKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ct: ct.toString('hex'),
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
  };
}

export function decrypt({ ct, iv, tag }: EncryptedField): string {
  const key = getKey();
  const decipher = createDecipheriv(ALG, key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(ct, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

/** Returns a safely masked display string — never the full value. */
export function maskSecret(value: string): string {
  if (!value || value.length === 0) return '';
  if (value.length <= 8) return '••••••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
