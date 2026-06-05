import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db/mongoose';
import Lead from '@/lib/models/Lead';
import { searchGoogleMapsBusinesses } from '@/lib/services/apify';
import { scoreGoogleMapsLead } from '@/lib/utils/scoreLead';
import { type ApifyLeadPreview } from '@/types';

// Apify actor runs take 30–90 s for small batches; allow extra for website enrichment.
export const maxDuration = 120;

// Server-enforced plan cap — raise by setting APIFY_GOOGLE_MAPS_MAX_RESULTS_LIMIT in .env
const APIFY_PLAN_LIMIT = Math.max(1, parseInt(process.env.APIFY_GOOGLE_MAPS_MAX_RESULTS_LIMIT ?? '50', 10) || 50);

const SearchSchema = z.object({
  keyword: z.string().min(1, 'keyword is required'),
  city: z.string().optional(),
  country: z.string().min(1, 'country is required'),
  limit: z.number().int().min(1).max(100).default(50),
});

function stripWebsite(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = SearchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    if (!process.env.APIFY_API_TOKEN && !process.env.APIFY_TOKEN) {
      return NextResponse.json({
        error: 'Apify API token not configured — set APIFY_API_TOKEN in .env.local',
        leads: [],
      });
    }

    const { keyword, city, country, limit } = parsed.data;

    if (limit > APIFY_PLAN_LIMIT) {
      return NextResponse.json({
        error: `Your current Apify plan limit is ${APIFY_PLAN_LIMIT} results. To scrape up to ${limit}, upgrade your Apify plan and set APIFY_GOOGLE_MAPS_MAX_RESULTS_LIMIT=${limit} in your environment.`,
        limitExceeded: true,
        planLimit: APIFY_PLAN_LIMIT,
      }, { status: 400 });
    }

    // Run Google Maps actor (+ website email enrichment when enabled).
    const places = await searchGoogleMapsBusinesses({ keyword, city, country, limit });

    // Safe summary log — never includes the API token.
    const websitesChecked = places.filter(
      (p) => p.emailEnrichmentStatus && p.emailEnrichmentStatus !== 'not_checked'
    ).length;
    const emailsFound = places.filter((p) => p.emailEnrichmentStatus === 'enriched').length;
    console.log(
      `[Maps Search] Results: ${places.length} | Websites checked: ${websitesChecked} | Emails found: ${emailsFound}`
    );

    await connectDB();

    // Collect identifiers for a batch duplicate check.
    const emails = places.filter((p) => p.email).map((p) => p.email!.toLowerCase());
    const websites = places.filter((p) => p.website).map((p) => stripWebsite(p.website!));

    const [emailDupes, nameDupes, allWebsites] = await Promise.all([
      emails.length > 0
        ? Lead.find({ email: { $in: emails } }).select('email').lean()
        : Promise.resolve([]),
      places.length > 0
        ? Lead.find({
            $or: places.map((p) => ({ companyName: p.companyName, country: p.country })),
          })
            .select('companyName country')
            .lean()
        : Promise.resolve([]),
      websites.length > 0
        ? Lead.find({ website: { $exists: true, $ne: '' } }).select('website').lean()
        : Promise.resolve([]),
    ]);

    const dupEmailSet = new Set(
      (emailDupes as { email?: string }[]).map((d) => d.email?.toLowerCase()).filter(Boolean)
    );
    const dupKeySet = new Set(
      (nameDupes as { companyName: string; country: string }[]).map(
        (d) => `${d.companyName.toLowerCase()}::${d.country.toLowerCase()}`
      )
    );
    const existingWebsiteSet = new Set(
      (allWebsites as { website?: string }[])
        .map((d) => (d.website ? stripWebsite(d.website) : ''))
        .filter(Boolean)
    );

    const leads: ApifyLeadPreview[] = places.map((place) => {
      const { score, status } = scoreGoogleMapsLead({
        companyName: place.companyName,
        category: place.category,
        email: place.email,
        phone: place.phone,
        website: place.website,
        rating: place.rating,
        reviewsCount: place.reviewsCount,
      });

      const emailDupe = !!(place.email && dupEmailSet.has(place.email.toLowerCase()));
      const nameDupe = dupKeySet.has(
        `${place.companyName.toLowerCase()}::${place.country.toLowerCase()}`
      );
      const websiteDupe = !!(
        place.website && existingWebsiteSet.has(stripWebsite(place.website))
      );

      return {
        companyName: place.companyName,
        country: place.country,
        city: place.city,
        category: place.category,
        email: place.email,
        phone: place.phone,
        website: place.website,
        source: place.source,
        notes: place.notes,
        address: place.address,
        mapsUrl: place.mapsUrl,
        rating: place.rating,
        reviewsCount: place.reviewsCount,
        emailEnrichmentStatus: place.emailEnrichmentStatus,
        score,
        scoreStatus: status,
        isDuplicate: emailDupe || nameDupe || websiteDupe,
      };
    });

    return NextResponse.json({ leads, total: leads.length, planLimit: APIFY_PLAN_LIMIT });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Search failed';
    console.error('[POST /api/apify/maps-search]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
