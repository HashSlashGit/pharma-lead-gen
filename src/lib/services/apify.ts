import axios from 'axios';
import { getSettings } from '@/lib/services/settingsCache';

const APIFY_BASE_URL = 'https://api.apify.com/v2';
const DEFAULT_ACTOR_ID = 'compass/crawler-google-places';

/** Max websites enriched per single Maps search run (keeps costs/time bounded). */
const MAX_ENRICH_PER_SEARCH = 5;

/** Per-page HTTP fetch timeout in milliseconds. */
const PAGE_FETCH_TIMEOUT_MS = 4000;

/** Regex that matches candidate email-like strings inside raw HTML. */
const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

/** File-extension suffixes that should never appear in a real email address domain. */
const BINARY_EXT_RE =
  /\.(png|jpg|jpeg|gif|svg|webp|ico|bmp|pdf|docx?|xlsx?|pptx?|zip|rar|mp4|mov|avi|woff2?|ttf|eot)$/i;

/** Generic placeholder domains that show up in template HTML and are never real contacts. */
const PLACEHOLDER_DOMAINS = new Set([
  'example.com',
  'domain.com',
  'yourdomain.com',
  'email.com',
  'test.com',
  'yoursite.com',
  'website.com',
  'sentry.io', // error-tracking endpoint, not a contact
]);

// ─── Public types ─────────────────────────────────────────────────────────────

export type EmailEnrichmentStatus =
  | 'enriched'    // email extracted from website during this search
  | 'not_found'   // website was fetched but no email discovered
  | 'not_checked' // enrichment disabled or lead has no website
  | 'skipped';    // over the per-search enrichment limit

export interface ApifyGoogleMapsInput {
  keyword: string;
  city?: string;
  country: string;
  limit: number;
}

export interface ApifyPlaceRaw {
  title?: string;
  address?: string;
  city?: string;
  country?: string;
  countryCode?: string;
  phone?: string;
  website?: string;
  categoryName?: string;
  url?: string;
  emails?: string[];
  totalScore?: number;   // Google Maps star rating (1–5)
  reviewsCount?: number;
}

export interface NormalizedApifyLead {
  companyName: string;
  country: string;
  city?: string;
  category: string;
  email?: string;
  phone?: string;
  website?: string;
  source: 'apify';
  notes?: string;
  address?: string;
  mapsUrl?: string;
  /** Star rating from Google Maps (1–5). Used for scoring. */
  rating?: number;
  /** Review count from Google Maps. Used for scoring. */
  reviewsCount?: number;
  /** Set after website enrichment attempt. Undefined when email was native (from Maps actor). */
  emailEnrichmentStatus?: EmailEnrichmentStatus;
}

// ─── Email validation & normalisation ────────────────────────────────────────

/**
 * Returns true when the string looks like a genuine deliverable email address.
 * Rejects image file paths, placeholder domains, and malformed strings.
 */
export function isValidEmail(email: string): boolean {
  if (!email.includes('@')) return false;
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || !domain) return false;
  if (!domain.includes('.')) return false;
  // Reject domains that end in a binary/image file extension
  if (BINARY_EXT_RE.test(domain)) return false;
  // Reject full strings that end in a binary extension (e.g. image@2x.png)
  if (BINARY_EXT_RE.test(email)) return false;
  // Reject known placeholder domains
  if (PLACEHOLDER_DOMAINS.has(domain.toLowerCase())) return false;
  // Basic RFC-like format check
  if (!/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email)) return false;
  return true;
}

/**
 * Lowercase, trim, deduplicate, and filter invalid emails from a raw list.
 */
export function normalizeEmails(raw: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const e of raw) {
    const normalized = e.toLowerCase().trim();
    if (isValidEmail(normalized) && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

// ─── Web-page email extraction ────────────────────────────────────────────────

/**
 * Fetches a single URL and returns any email addresses found in the HTML body.
 * Times out at PAGE_FETCH_TIMEOUT_MS. Returns [] on any error so callers never throw.
 */
async function fetchEmailsFromPage(url: string): Promise<string[]> {
  try {
    const response = await axios.get<string>(url, {
      timeout: PAGE_FETCH_TIMEOUT_MS,
      maxRedirects: 3,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; LeadEnricher/1.0; +https://pharma-lead-gen)',
        Accept: 'text/html,application/xhtml+xml',
      },
      validateStatus: (status) => status < 400,
      maxContentLength: 500_000, // 500 KB — enough for any contact page
    });
    const html =
      typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data);
    const matches = html.match(EMAIL_REGEX) ?? [];
    return matches;
  } catch {
    // Timeout, DNS failure, TLS error, non-2xx etc. — silently skip.
    return [];
  }
}

/**
 * Attempts to extract at least one email from a business website.
 * Checks the homepage, /contact, and /about paths in order, stopping as soon as
 * valid emails are found on any page.
 *
 * Exported so the per-lead enrich-website API route can reuse it.
 */
export async function extractEmailsFromWebsite(website: string): Promise<string[]> {
  const base = (
    website.startsWith('http') ? website : `https://${website}`
  ).replace(/\/$/, '');

  const paths = ['', '/contact', '/about'];
  for (const path of paths) {
    const raw = await fetchEmailsFromPage(`${base}${path}`);
    const emails = normalizeEmails(raw);
    if (emails.length > 0) return emails;
  }
  return [];
}

// ─── Bulk email enrichment ────────────────────────────────────────────────────

/**
 * Enriches a set of normalised Apify leads by extracting emails from their
 * business websites when APIFY_WEBSITE_ENRICHMENT_ENABLED=true.
 *
 * Rules:
 * - Only leads that have a website URL but no email are candidates.
 * - At most MAX_ENRICH_PER_SEARCH websites are fetched per call.
 * - All candidate websites are fetched concurrently.
 * - Each lead's emailEnrichmentStatus is set on every lead in the output.
 * - Never logs APIFY_API_TOKEN.
 */
export async function enrichLeadsWithEmails(
  leads: NormalizedApifyLead[]
): Promise<NormalizedApifyLead[]> {
  const { apifyWebsiteEnrichment: enrichmentEnabled } = await getSettings();

  // Leads that already have a native email from the Maps actor need no enrichment.
  // All others get a default status of 'not_checked'.
  const initialised: NormalizedApifyLead[] = leads.map((l) => ({
    ...l,
    emailEnrichmentStatus: l.email ? undefined : ('not_checked' as EmailEnrichmentStatus),
  }));

  if (!enrichmentEnabled) return initialised;

  // Candidates: website present, no email, within per-search limit.
  const candidates = initialised
    .filter((l) => l.website && !l.email)
    .slice(0, MAX_ENRICH_PER_SEARCH);

  const candidateWebsites = new Set(candidates.map((l) => l.website!));

  console.log(
    `[Apify Enrichment] Maps results: ${leads.length} | Websites to check: ${candidates.length}`
  );

  // Fetch all candidate websites concurrently.
  const settled = await Promise.allSettled(
    candidates.map(async (lead) => ({
      website: lead.website!,
      emails: await extractEmailsFromWebsite(lead.website!),
    }))
  );

  const emailMap = new Map<string, string>(); // website → best email
  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value.emails.length > 0) {
      emailMap.set(r.value.website, r.value.emails[0]);
    }
  }

  const emailsFoundCount = emailMap.size;
  console.log(
    `[Apify Enrichment] Websites checked: ${candidates.length} | Emails found: ${emailsFoundCount}`
  );

  return initialised.map((lead) => {
    // Lead already had a native email — leave untouched (status stays undefined).
    if (!lead.emailEnrichmentStatus) return lead;

    // No website — stays 'not_checked'.
    if (!lead.website) return lead;

    // Website was beyond the per-search limit — mark as skipped.
    if (!candidateWebsites.has(lead.website)) {
      return { ...lead, emailEnrichmentStatus: 'skipped' };
    }

    // Website was checked — did we find an email?
    const foundEmail = emailMap.get(lead.website);
    if (foundEmail) {
      return {
        ...lead,
        email: foundEmail,
        emailEnrichmentStatus: 'enriched',
      };
    }

    return { ...lead, emailEnrichmentStatus: 'not_found' };
  });
}

// ─── Apify actor helpers ──────────────────────────────────────────────────────

export async function runApifyActor(
  actorId: string,
  input: Record<string, unknown>
): Promise<string> {
  const { apifyToken: token } = await getSettings();
  if (!token) throw new Error('Apify token not configured — add it in Settings → Integrations.');

  const response = await axios.post(
    `${APIFY_BASE_URL}/acts/${encodeURIComponent(actorId)}/runs?token=${token}&waitForFinish=90`,
    input,
    { headers: { 'Content-Type': 'application/json' } }
  );

  const run = response.data?.data;
  if (!run?.defaultDatasetId) {
    throw new Error(
      `Apify run did not return a dataset. Status: ${run?.status ?? 'unknown'}`
    );
  }
  if (run.status !== 'SUCCEEDED') {
    throw new Error(
      `Apify run status: ${run.status}. Try a smaller limit.`
    );
  }

  return run.defaultDatasetId as string;
}

export async function getApifyDatasetItems(
  datasetId: string,
  limit: number
): Promise<unknown[]> {
  const { apifyToken: token } = await getSettings();
  if (!token) throw new Error('Apify token not configured — add it in Settings → Integrations.');

  const response = await axios.get(
    `${APIFY_BASE_URL}/datasets/${datasetId}/items?token=${token}&limit=${limit}`
  );

  return Array.isArray(response.data) ? response.data : [];
}

// ─── Normalisation ────────────────────────────────────────────────────────────

export function normalizeApifyBusiness(
  place: ApifyPlaceRaw,
  fallbackCountry: string
): NormalizedApifyLead {
  // Use any email the Maps actor itself returned (already normalised).
  const nativeEmail =
    place.emails && place.emails.length > 0
      ? normalizeEmails(place.emails)[0]
      : undefined;

  return {
    companyName: place.title ?? 'Unknown',
    country: place.country ?? fallbackCountry,
    city: place.city ?? undefined,
    category: place.categoryName ?? '',
    email: nativeEmail,
    phone: place.phone ?? undefined,
    website: place.website ?? undefined,
    source: 'apify',
    notes: place.address ? `Address: ${place.address}` : undefined,
    address: place.address ?? undefined,
    mapsUrl: place.url ?? undefined,
    rating: place.totalScore ?? undefined,
    reviewsCount: place.reviewsCount ?? undefined,
    emailEnrichmentStatus: undefined,
  };
}

// ─── Main search function ─────────────────────────────────────────────────────

export async function searchGoogleMapsBusinesses(
  params: ApifyGoogleMapsInput
): Promise<NormalizedApifyLead[]> {
  const s = await getSettings();
  const token = s.apifyToken;
  if (!token) {
    console.warn('[Apify] Apify token not configured — returning empty results');
    return [];
  }

  const actorId = s.apifyActorId ?? DEFAULT_ACTOR_ID;
  const limit = Math.min(params.limit, s.apifyMaxResults);

  const searchQuery = [params.keyword, params.city, params.country]
    .filter(Boolean)
    .join(' ');

  const input: Record<string, unknown> = {
    searchStringsArray: [searchQuery],
    maxCrawledPlaces: limit,
    language: 'en',
    maxImages: 0,
    includeHistogram: false,
    includeOpeningHours: false,
    includePeopleAlsoSearch: false,
    scrapeDirectories: false,
    deeperCityScrape: false,
  };

  const datasetId = await runApifyActor(actorId, input);
  const rawItems = await getApifyDatasetItems(datasetId, limit);

  const normalised = (rawItems as ApifyPlaceRaw[]).map((item) =>
    normalizeApifyBusiness(item, params.country)
  );

  // Enrich with emails extracted from business websites.
  // Respects APIFY_WEBSITE_ENRICHMENT_ENABLED — no-op when disabled.
  return enrichLeadsWithEmails(normalised);
}
