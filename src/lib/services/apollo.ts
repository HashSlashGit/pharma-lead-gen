import axios from 'axios';
import { getSettings } from '@/lib/services/settingsCache';

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

export interface ApolloSearchParams {
  keyword?: string;
  country?: string;
  jobTitle?: string;
  limit?: number;
}

export interface ApolloPersonRaw {
  id: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  email?: string;
  linkedin_url?: string;
  phone_numbers?: { sanitized_number?: string }[];
  organization?: {
    name?: string;
    website_url?: string;
    domain?: string;
    country?: string;
    city?: string;
    industry?: string;
  };
}

export interface NormalizedApolloLead {
  apolloId: string;
  firstName?: string;
  lastName?: string;
  contactName: string;
  title: string;
  companyName: string;
  country: string;
  city?: string;
  category: string;
  email?: string;
  phone?: string;
  website?: string;
  linkedinUrl?: string;
  organizationDomain?: string;
  source: 'apollo';
}

export interface ApolloEnrichResult {
  email: string | null;
  phone: string | null;
  found: boolean;
  message: string;
}

function isValidEmail(email: unknown): email is string {
  return typeof email === 'string' && email.includes('@') && email.length > 5;
}

function extractDomain(website: string): string | undefined {
  if (!website) return undefined;
  try {
    const url = new URL(website.startsWith('http') ? website : `https://${website}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

export function normalizeApolloLead(person: ApolloPersonRaw): NormalizedApolloLead {
  const org = person.organization ?? {};
  const phone = person.phone_numbers?.[0]?.sanitized_number;

  return {
    apolloId: person.id,
    firstName: person.first_name,
    lastName: person.last_name,
    contactName: [person.first_name, person.last_name].filter(Boolean).join(' ') || 'Unknown',
    title: person.title ?? '',
    companyName: org.name ?? 'Unknown',
    country: org.country ?? '',
    city: org.city,
    category: org.industry ?? '',
    email: person.email,
    phone,
    website: org.website_url,
    linkedinUrl: person.linkedin_url,
    organizationDomain: org.domain,
    source: 'apollo',
  };
}

export async function searchApolloLeads(params: ApolloSearchParams): Promise<ApolloPersonRaw[]> {
  const { apolloApiKey: apiKey } = await getSettings();
  if (!apiKey) {
    console.warn('[Apollo] Apollo API key not configured — returning empty results');
    return [];
  }

  const limit = Math.min(params.limit ?? 10, 50);

  const body: Record<string, unknown> = {
    per_page: limit,
    page: 1,
  };

  if (params.keyword) body.q_keywords = params.keyword;
  if (params.country) body.person_locations = [params.country];
  if (params.jobTitle) body.person_titles = [params.jobTitle];

  const response = await axios.post(
    `${APOLLO_BASE_URL}/mixed_people/api_search`,
    body,
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'x-api-key': apiKey,
      },
    }
  );

  return (response.data?.people ?? []) as ApolloPersonRaw[];
}

export async function enrichApolloPerson(params: {
  apolloId?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  website?: string;
  organizationDomain?: string;
  linkedinUrl?: string;
  title?: string;
}): Promise<ApolloEnrichResult> {
  const { apolloApiKey: apiKey } = await getSettings();
  if (!apiKey) {
    return { email: null, phone: null, found: false, message: 'Apollo API key not configured.' };
  }

  const body: Record<string, unknown> = { reveal_personal_emails: true, reveal_phone_number: false };

  if (params.apolloId) body.id = params.apolloId;
  if (params.firstName) body.first_name = params.firstName;
  if (params.lastName) body.last_name = params.lastName;
  if (params.companyName) body.organization_name = params.companyName;
  if (params.organizationDomain) {
    body.domain = params.organizationDomain;
  } else if (params.website) {
    body.domain = extractDomain(params.website) ?? params.website;
  }
  if (params.linkedinUrl) body.linkedin_url = params.linkedinUrl;
  if (params.title) body.title = params.title;

  try {
    const response = await axios.post(
      `${APOLLO_BASE_URL}/people/match`,
      body,
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'x-api-key': apiKey,
        },
      }
    );

    const person = response.data?.person;
    const email: string | null = person?.email ?? null;
    const phone: string | null = person?.phone_numbers?.[0]?.sanitized_number ?? null;

    if (email) {
      return { email, phone, found: true, message: 'Email found via enrichment.' };
    }
    return { email: null, phone, found: false, message: 'Apollo matched this person but found no email.' };
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } }).response?.status;
    if (status === 401) return { email: null, phone: null, found: false, message: 'Apollo API key invalid or not loaded.' };
    if (status === 403) return { email: null, phone: null, found: false, message: 'Apollo plan or key does not allow enrichment.' };
    if (status === 422) return { email: null, phone: null, found: false, message: 'Apollo could not match this person — try adding more identifiers.' };
    if (status === 429) return { email: null, phone: null, found: false, message: 'Apollo rate limit or credits exhausted — try again later.' };
    throw err;
  }
}
