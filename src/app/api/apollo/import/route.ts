import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import Lead from '@/lib/models/Lead';
import { scoreLead } from '@/lib/utils/scoreLead';

export async function POST(req: Request) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = await req.json();

    // Normalize email from multiple possible fields
    const rawEmail =
      body.email ||
      body.enrichedEmail ||
      body.work_email ||
      body.primary_email ||
      body.person?.email ||
      (Array.isArray(body.emails)
        ? (body.emails[0]?.email ?? body.emails[0])
        : undefined);

    const normalizedEmail =
      typeof rawEmail === 'string' && rawEmail.includes('@')
        ? rawEmail.toLowerCase().trim()
        : null;

    console.log('[Apollo Import] request received', {
      email: normalizedEmail,
      companyName: body.companyName,
      contactName: body.contactName,
      apolloId: body.apolloId,
      source: body.source,
    });

    if (!normalizedEmail) {
      return NextResponse.json(
        {
          success: false,
          imported: false,
          error: 'Cannot import Apollo lead without email. Enrich first.',
        },
        { status: 400 }
      );
    }

    await connectDB();

    const existingLead = await Lead.findOne({ email: normalizedEmail }).lean();
    if (existingLead) {
      return NextResponse.json({
        success: true,
        imported: false,
        duplicate: true,
        message: 'Lead already exists',
        leadId: existingLead._id,
        email: normalizedEmail,
      });
    }

    const companyName =
      body.companyName ||
      body.company ||
      body.organizationName ||
      body.organization?.name ||
      'Unknown Company';
    const country =
      body.country ||
      body.searchCountry ||
      body.organization?.country ||
      body.person?.organization?.country ||
      'Unknown';
    const city = body.city || body.organization?.city || '';
    const category =
      body.category || body.industry || body.organization?.industry || 'Apollo Lead';
    const phone = body.phone || '';
    const website = body.website || body.organization?.website_url || '';

    const noteParts: string[] = [];
    if (body.contactName) noteParts.push(`Contact: ${body.contactName}`);
    if (body.title) noteParts.push(`Title: ${body.title}`);
    if (body.apolloId) noteParts.push(`Apollo ID: ${body.apolloId}`);
    const notes = noteParts.length > 0 ? noteParts.join(' | ') : undefined;

    const { score } = scoreLead({
      companyName,
      country,
      city,
      category,
      email: normalizedEmail,
      phone,
      website,
      source: 'apollo',
    });

    await Lead.create({
      companyName,
      country,
      city: city || undefined,
      category,
      email: normalizedEmail,
      phone: phone || undefined,
      website: website || undefined,
      source: 'apollo',
      status: 'new',
      score,
      notes,
      aiProcessed: false,
      followUpCount: 0,
    });

    const savedLead = await Lead.findOne({ email: normalizedEmail }).lean();

    if (!savedLead) {
      return NextResponse.json(
        {
          success: false,
          imported: false,
          error: 'Lead create returned but verification failed',
          email: normalizedEmail,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      imported: true,
      duplicate: false,
      message: 'Apollo lead imported successfully',
      leadId: savedLead._id,
      lead: savedLead,
      email: normalizedEmail,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[POST /api/apollo/import]', message);
    return NextResponse.json(
      { success: false, imported: false, error: message },
      { status: 500 }
    );
  }
}
