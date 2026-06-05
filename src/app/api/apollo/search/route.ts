import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db/mongoose';
import Lead from '@/lib/models/Lead';
import { searchApolloLeads, normalizeApolloLead } from '@/lib/services/apollo';
import { scoreLead } from '@/lib/utils/scoreLead';
import { type ApolloLeadPreview } from '@/types';

// Server-enforced plan cap — raise by setting APOLLO_MAX_RESULTS_LIMIT in .env
const APOLLO_PLAN_LIMIT = Math.max(1, parseInt(process.env.APOLLO_MAX_RESULTS_LIMIT ?? '25', 10) || 25);

const SearchSchema = z.object({
  keyword: z.string().optional(),
  country: z.string().optional(),
  jobTitle: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(25),
});

function apolloStatusError(status: number | undefined): NextResponse | null {
  if (status === 401) return NextResponse.json({ error: 'Apollo API key invalid or not loaded.' }, { status: 401 });
  if (status === 403) return NextResponse.json({ error: 'Apollo plan or key does not allow this request.' }, { status: 403 });
  if (status === 422) return NextResponse.json({ error: 'Apollo rejected the search filters.' }, { status: 422 });
  if (status === 429) return NextResponse.json({ error: 'Apollo rate limit or credits reached — try again later.' }, { status: 429 });
  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = SearchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const { keyword, country, jobTitle, limit } = parsed.data;

    if (!keyword && !country && !jobTitle) {
      return NextResponse.json({ error: 'Provide at least one of: keyword, country, jobTitle' }, { status: 400 });
    }

    if (limit > APOLLO_PLAN_LIMIT) {
      return NextResponse.json({
        error: `Your current Apollo plan limit is ${APOLLO_PLAN_LIMIT} results. To scrape up to ${limit}, upgrade your Apollo plan and set APOLLO_MAX_RESULTS_LIMIT=${limit} in your environment.`,
        limitExceeded: true,
        planLimit: APOLLO_PLAN_LIMIT,
      }, { status: 400 });
    }

    if (!process.env.APOLLO_API_KEY) {
      return NextResponse.json(
        { error: 'Apollo API key not configured — set APOLLO_API_KEY in .env.local' },
        { status: 401 }
      );
    }

    console.log(`[Apollo Search] keyword="${keyword}" country="${country}" title="${jobTitle}" limit=${limit}`);

    let rawPeople;
    try {
      rawPeople = await searchApolloLeads({ keyword, country, jobTitle, limit });
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      const errRes = apolloStatusError(status);
      if (errRes) return errRes;
      throw err;
    }

    console.log(`[Apollo Search] ${rawPeople.length} candidates returned`);

    const candidates = rawPeople.map(normalizeApolloLead);

    if (candidates.length === 0) {
      return NextResponse.json({ leads: [], total: 0 });
    }

    await connectDB();

    const leadsWithEmail = candidates.filter((l) => l.email);
    const emails = leadsWithEmail.map((l) => l.email!.toLowerCase());

    const [emailDupes, nameDupes] = await Promise.all([
      emails.length > 0
        ? Lead.find({ email: { $in: emails } }).select('email').lean()
        : Promise.resolve([]),
      Lead.find({ $or: candidates.map((l) => ({ companyName: l.companyName, country: l.country })) })
        .select('companyName country')
        .lean(),
    ]);

    const dupEmailSet = new Set(
      (emailDupes as { email?: string }[]).map((d) => d.email?.toLowerCase()).filter(Boolean)
    );
    const dupKeySet = new Set(
      (nameDupes as { companyName: string; country: string }[]).map(
        (d) => `${d.companyName.toLowerCase()}::${d.country.toLowerCase()}`
      )
    );

    const leads: ApolloLeadPreview[] = candidates.map((lead) => {
      const { score, status } = scoreLead({
        companyName: lead.companyName,
        title: lead.title,
        country: lead.country,
        city: lead.city,
        category: lead.category,
        email: lead.email,
        phone: lead.phone,
        website: lead.website,
        source: lead.source,
      });

      const emailDupe = lead.email ? dupEmailSet.has(lead.email.toLowerCase()) : false;
      const nameDupe = dupKeySet.has(`${lead.companyName.toLowerCase()}::${lead.country.toLowerCase()}`);

      return {
        ...lead,
        score,
        scoreStatus: status,
        isDuplicate: emailDupe || nameDupe,
        needsEnrichment: !lead.email,
      };
    });

    return NextResponse.json({ leads, total: leads.length, planLimit: APOLLO_PLAN_LIMIT });
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } }).response?.status;
    const errRes = apolloStatusError(status);
    if (errRes) return errRes;
    console.error('[Apollo Search] failed:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
