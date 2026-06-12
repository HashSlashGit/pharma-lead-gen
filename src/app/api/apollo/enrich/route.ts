import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enrichApolloPerson } from '@/lib/services/apollo';
import { getSettings } from '@/lib/services/settingsCache';

const EnrichSchema = z.object({
  apolloId: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  companyName: z.string().optional(),
  website: z.string().optional(),
  organizationDomain: z.string().optional(),
  linkedinUrl: z.string().optional(),
  title: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = EnrichSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const settings = await getSettings();
    if (!settings.apolloApiKey) {
      return NextResponse.json(
        { error: 'Apollo API key not configured. Add your Apollo API key in Settings.', found: false },
        { status: 503 },
      );
    }

    const result = await enrichApolloPerson(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[POST /api/apollo/enrich]', err);
    return NextResponse.json({ error: 'Enrichment failed', found: false }, { status: 500 });
  }
}
