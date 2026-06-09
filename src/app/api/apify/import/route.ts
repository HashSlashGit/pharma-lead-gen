import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db/mongoose';
import Lead from '@/lib/models/Lead';
import { scoreGoogleMapsLead } from '@/lib/utils/scoreLead';
import { writeAuditLog } from '@/lib/utils/auditLog';
import { getRequestActor } from '@/lib/utils/requestActor';

const LeadItemSchema = z.object({
  companyName: z.string().min(1),
  country: z.string().default(''),
  city: z.string().optional(),
  category: z.string().default(''),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  website: z.string().optional(),
  source: z.literal('apify'),
  notes: z.string().optional(),
  address: z.string().optional(),
  mapsUrl: z.string().optional(),
  /** Google Maps star rating — passed through from the search preview. */
  rating: z.number().optional(),
  /** Google Maps review count. */
  reviewsCount: z.number().optional(),
  /** Enrichment status from the search run — used to compose the import note. */
  emailEnrichmentStatus: z
    .enum(['enriched', 'not_found', 'not_checked', 'skipped'])
    .optional(),
});

const ImportSchema = z.object({
  leads: z.array(LeadItemSchema).min(1).max(50),
});

function stripWebsite(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = ImportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await connectDB();

    const { leads } = parsed.data;

    const emails = leads.filter((l) => l.email).map((l) => l.email!.toLowerCase());
    const websites = leads.filter((l) => l.website).map((l) => stripWebsite(l.website!));

    const [emailDupes, nameDupes, existingWebsiteDocs] = await Promise.all([
      emails.length > 0
        ? Lead.find({ email: { $in: emails } }).select('email').lean()
        : Promise.resolve([]),
      leads.length > 0
        ? Lead.find({
            $or: leads.map((l) => ({ companyName: l.companyName, country: l.country })),
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
      (existingWebsiteDocs as { website?: string }[])
        .map((d) => (d.website ? stripWebsite(d.website) : ''))
        .filter(Boolean)
    );

    let skipped = 0;
    const errors: string[] = [];
    const toInsert: object[] = [];

    for (const lead of leads) {
      const emailDupe = !!(lead.email && dupEmailSet.has(lead.email.toLowerCase()));
      const nameDupe = dupKeySet.has(
        `${lead.companyName.toLowerCase()}::${(lead.country ?? '').toLowerCase()}`
      );
      const websiteDupe = !!(
        lead.website && existingWebsiteSet.has(stripWebsite(lead.website))
      );

      if (emailDupe || nameDupe || websiteDupe) {
        skipped++;
        continue;
      }

      const { score, status } = scoreGoogleMapsLead({
        companyName: lead.companyName,
        category: lead.category,
        email: lead.email || undefined,
        phone: lead.phone,
        website: lead.website,
        rating: lead.rating,
        reviewsCount: lead.reviewsCount,
      });

      // Compose notes: address, mapsUrl, then no-email warning when applicable.
      const noteParts: string[] = [];
      if (lead.address) noteParts.push(`Address: ${lead.address}`);
      if (lead.mapsUrl) noteParts.push(`Maps: ${lead.mapsUrl}`);

      // Warn on import when there is no email — Smartlead outreach requires one.
      if (!lead.email) {
        noteParts.push(
          'No email found. Needs email enrichment before outreach.'
        );
      }

      toInsert.push({
        companyName: lead.companyName,
        country: lead.country ?? '',
        city: lead.city,
        category: lead.category ?? '',
        email: lead.email || undefined,
        phone: lead.phone,
        website: lead.website,
        source: 'apify',
        notes: noteParts.length > 0 ? noteParts.join(' | ') : undefined,
        status,
        score,
        aiProcessed: false,
        followUpCount: 0,
      });
    }

    let imported = 0;
    if (toInsert.length > 0) {
      try {
        const result = await Lead.insertMany(toInsert, { ordered: false });
        imported = result.length;
      } catch (insertErr: unknown) {
        const e = insertErr as { insertedDocs?: unknown[]; message?: string };
        imported = e.insertedDocs?.length ?? 0;
        if (e.message) errors.push(`Partial insert: ${e.message}`);
      }
    }

    if (imported > 0) {
      const actor = await getRequestActor(req);
      void writeAuditLog({
        action: 'lead_imported',
        ...actor,
        meta: { source: 'apify', imported, skipped, total: leads.length },
      });
    }

    return NextResponse.json({ imported, skipped, errors, total: leads.length });
  } catch (err) {
    console.error('[POST /api/apify/import]', err);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}
