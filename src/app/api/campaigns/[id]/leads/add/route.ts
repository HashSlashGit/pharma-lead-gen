import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import CampaignLead from '@/lib/models/CampaignLead';
import Campaign from '@/lib/models/Campaign';
import Lead from '@/lib/models/Lead';
import mongoose from 'mongoose';
import { z } from 'zod';

const AddLeadsSchema = z.object({
  leadIds: z.array(z.string()).min(1).max(200),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid campaign ID' }, { status: 400 });
  }
  try {
    await connectDB();
    const raw = await req.json();
    const parsed = AddLeadsSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const campaign = await Campaign.findById(id).lean();
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

    const validLeadIds = parsed.data.leadIds.filter((lid) =>
      mongoose.Types.ObjectId.isValid(lid)
    );
    if (validLeadIds.length === 0) {
      return NextResponse.json({ error: 'No valid lead IDs provided' }, { status: 400 });
    }

    const existingLeads = await Lead.find({ _id: { $in: validLeadIds } })
      .select('_id')
      .lean();
    const existingLeadIdSet = new Set(existingLeads.map((l) => l._id.toString()));

    const toInsert = validLeadIds
      .filter((lid) => existingLeadIdSet.has(lid))
      .map((lid) => ({
        campaignId: id,
        leadId: lid,
        status: 'active' as const,
        addedAt: new Date(),
      }));

    const notFound = validLeadIds.length - toInsert.length;
    let added = 0;
    let duplicates = 0;

    if (toInsert.length > 0) {
      try {
        const result = await CampaignLead.insertMany(toInsert, { ordered: false });
        added = result.length;
      } catch (err: unknown) {
        // ordered:false commits successful inserts even when some fail.
        // If every failure is a duplicate-key error, count successes and move on.
        const e = err as {
          writeErrors?: Array<{ code?: number }>;
          result?: { insertedCount?: number };
        };
        const writeErrors = e.writeErrors ?? [];
        if (writeErrors.length > 0 && writeErrors.every((we) => we.code === 11000)) {
          added = e.result?.insertedCount ?? (toInsert.length - writeErrors.length);
          duplicates = writeErrors.length;
        } else {
          throw err;
        }
      }
    }

    const skipped = notFound + duplicates;
    return NextResponse.json({ added, skipped, total: validLeadIds.length });
  } catch (err) {
    console.error('[POST /api/campaigns/[id]/leads/add]', err);
    return NextResponse.json({ error: 'Failed to add leads to campaign' }, { status: 500 });
  }
}
