import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import Lead from '@/lib/models/Lead';
import Product from '@/lib/models/Product';
import EmailLog from '@/lib/models/EmailLog';
import mongoose from 'mongoose';
import { generatePersonalizedEmail } from '@/lib/services/claude';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid lead ID' }, { status: 400 });
    }

    await connectDB();
    const lead = await Lead.findById(id).lean();

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // ── Guard 1: score gate ──────────────────────────────────────────
    if (lead.score < 70) {
      return NextResponse.json(
        { error: 'Lead is not qualified enough for AI personalization. Score must be 70 or above.' },
        { status: 422 }
      );
    }

    // ── Guard 2: email required ──────────────────────────────────────
    if (!lead.email) {
      return NextResponse.json(
        { error: 'Lead has no email address. AI personalization requires a contact email.' },
        { status: 422 }
      );
    }

    // ── Guard 3: already processed ───────────────────────────────────
    if (lead.aiProcessed) {
      return NextResponse.json(
        { error: 'This lead has already been AI processed. Check the email drafts below.' },
        { status: 409 }
      );
    }

    // ── Fetch best matching product ──────────────────────────────────
    const products = await Product.find().lean();
    if (products.length === 0) {
      return NextResponse.json(
        { error: 'No products found. Add at least one product before personalizing.' },
        { status: 422 }
      );
    }

    // Pick first product for now — future: match by category
    const product = products[0];

    // ── Call Claude (only reaches here if all guards pass) ───────────
    const emailBody = await generatePersonalizedEmail({
      leadId: id,
      companyName: lead.companyName,
      country: lead.country,
      category: lead.category,
      productName: product.name,
      productDescription: product.description ?? '',
      approvedClaims: product.approvedClaims ?? [],
    });

    // ── Save draft to EmailLog ───────────────────────────────────────
    const subject = `Partnership Opportunity — ${product.name}`;
    const emailLog = await EmailLog.create({
      leadId: lead._id,
      type: 'initial',
      subject,
      body: emailBody,
      status: 'pending',
    });

    // ── Mark lead as AI processed ────────────────────────────────────
    await Lead.findByIdAndUpdate(id, { aiProcessed: true });

    return NextResponse.json({
      success: true,
      emailLog: {
        _id: emailLog._id,
        subject: emailLog.subject,
        body: emailLog.body,
        status: emailLog.status,
      },
    });
  } catch (err) {
    console.error('[POST /api/leads/[id]/personalize]', err);
    const message = err instanceof Error ? err.message : 'Failed to personalize';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
