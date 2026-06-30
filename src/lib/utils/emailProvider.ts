export type EmailProvider = 'gmail' | 'yahoo' | 'outlook' | 'hotmail' | 'aol' | 'custom' | 'unknown';

export function getEmailProvider(email?: string | null): EmailProvider {
  if (!email) return 'unknown';
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  if (!domain) return 'unknown';
  if (domain === 'gmail.com') return 'gmail';
  if (domain === 'yahoo.com' || domain.startsWith('yahoo.co') || domain.startsWith('yahoo.')) return 'yahoo';
  if (domain === 'outlook.com' || domain === 'live.com' || domain === 'msn.com') return 'outlook';
  if (domain === 'hotmail.com' || domain.startsWith('hotmail.')) return 'hotmail';
  if (domain === 'aol.com') return 'aol';
  return 'custom';
}

// MongoDB regex patterns for each provider (used in filter queries)
export const PROVIDER_EMAIL_FILTER: Record<string, { $regex: string; $options: string }> = {
  gmail:   { $regex: '@gmail\\.com$',              $options: 'i' },
  yahoo:   { $regex: '@yahoo\\.',                  $options: 'i' },
  outlook: { $regex: '@(outlook|live|msn)\\.com$', $options: 'i' },
  hotmail: { $regex: '@hotmail\\.',                $options: 'i' },
  aol:     { $regex: '@aol\\.com$',               $options: 'i' },
};

// Regex that matches any of the known free-email providers
export const KNOWN_PROVIDERS_REGEX = '@(gmail\\.com|yahoo\\.|outlook\\.com|live\\.com|msn\\.com|hotmail\\.|aol\\.com)';
