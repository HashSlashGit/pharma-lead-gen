import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db/mongoose';
import Lead from '@/lib/models/Lead';
import { extractEmailsFromWebsite } from '@/lib/services/apify';
import { scoreLead } from '@/lib/utils/scoreLead';

const Schema = z.object({ leadId: z.string().min(1) });

/**
 * Per-lead website enrichment.
 * Fetches the business website (homepage → /contact → /about) and extracts
 * any public email addresses via regex. When found, updates the lead record.
 *
 * Guards:
 * - APIFY_WEBSITE_ENRICHMENT_ENABLED must be "true".
 * - Lead must have a website URL.
 * - No Claude calls — pure regex extraction on fetched HTML.
 * - Never logs APIFY_API_TOKEN.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'leadId is required' },
        { status: 400 }
      );
    }

    const enabled = process.env.APIFY_WEBSITE_ENRICHMENT_ENABLED === 'true';
    if (!enabled) {
      return NextResponse.json({
        status: 'disabled',
        message:
          'Website enrichment is disabled. Set APIFY_WEBSITE_ENRICHMENT_ENABLED=true to enable.',
      });
    }

    await connectDB();

    const lead = await Lead.findById(parsed.data.leadId);
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    if (!lead.website) {
      return NextResponse.json(
        { error: 'Lead has no website URL — enrichment skipped' },
        { status: 422 }
      );
    }

    if (lead.email) {
      return NextResponse.json({
        status: 'already_enriched',
        message: 'Lead already has an email address.',
        email: lead.email,
      });
    }

    console.log(
      `[Enrich Website] Checking ${lead.website} for ${lead.companyName}`
    );

    const emails = await extractEmailsFromWebsite(lead.website);

    if (emails.length === 0) {
      return NextResponse.json({
        status: 'not_found',
        message: `No email addresses found on ${lead.website}`,
        website: lead.website,
      });
    }

    const foundEmail = emails[0];

    // Recalculate score with the newly found email.
    const { score, status } = scoreLead({
      companyName: lead.companyName,
      country: lead.country,
      city: lead.city,
      category: lead.category,
      email: foundEmail,
      phone: lead.phone,
      website: lead.website,
      source: lead.source,
    });

    // Append enrichment note to existing notes.
    const enrichmentNote = `Email extracted from website on ${new Date().toISOString().slice(0, 10)}.`;
    const updatedNotes = lead.notes
      ? `${lead.notes} | ${enrichmentNote}`
      : enrichmentNote;

    await Lead.updateOne(
      { _id: lead._id },
      {
        $set: {
          email: foundEmail,
          score,
          status,
          notes: updatedNotes,
        },
      }
    );

    console.log(
      `[Enrich Website] Found email for ${lead.companyName}: ${foundEmail.replace(/@.*/, '@…')}`
    );

    return NextResponse.json({
      status: 'enriched',
      email: foundEmail,
      score,
      leadStatus: status,
      message: `Email found and lead updated.`,
    });
  } catch (err) {
    console.error('[POST /api/apify/enrich-website]', err);
    return NextResponse.json({ error: 'Enrichment failed' }, { status: 500 });
  }
}
