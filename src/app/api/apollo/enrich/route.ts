import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enrichApolloPerson } from '@/lib/services/apollo';

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

    if (!process.env.APOLLO_API_KEY) {
      return NextResponse.json(
        { error: 'Apollo API key not configured — set APOLLO_API_KEY in .env.local', found: false },
        { status: 503 }
      );
    }

    const result = await enrichApolloPerson(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[POST /api/apollo/enrich]', err);
    return NextResponse.json({ error: 'Enrichment failed', found: false }, { status: 500 });
  }
}
