import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import NoReplyLead from '@/lib/models/NoReplyLead';
import CampaignLead from '@/lib/models/CampaignLead';
import Campaign from '@/lib/models/Campaign';
import mongoose from 'mongoose';

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const body = await req.json() as { leadIds?: unknown; campaignId?: unknown };
    const { leadIds, campaignId } = body;

    if (!campaignId || typeof campaignId !== 'string' || !mongoose.Types.ObjectId.isValid(campaignId)) {
      return NextResponse.json(
        { error: 'campaignId is required and must be a valid ID' },
        { status: 400 }
      );
    }

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json(
        { error: 'leadIds must be a non-empty array' },
        { status: 400 }
      );
    }

    const campaign = await Campaign.findById(campaignId).select('name').lean();
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const campaignOid = new mongoose.Types.ObjectId(campaignId);
    const validIds = (leadIds as unknown[])
      .filter((id): id is string => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    if (validIds.length === 0) {
      return NextResponse.json({ error: 'No valid lead IDs provided' }, { status: 400 });
    }

    // $addToSet prevents duplicate campaign IDs on the same lead
    const result = await NoReplyLead.updateMany(
      { _id: { $in: validIds } },
      { $addToSet: { campaignIds: campaignOid } }
    );

    // Also upsert CampaignLead records so leads appear in campaign lead count
    const noReplyDocs = await NoReplyLead.find(
      { _id: { $in: validIds } },
      { leadId: 1 }
    ).lean();

    if (noReplyDocs.length > 0) {
      const now = new Date();
      await CampaignLead.bulkWrite(
        noReplyDocs.map((doc) => ({
          updateOne: {
            filter: { campaignId: campaignOid, leadId: doc.leadId },
            update: {
              $setOnInsert: {
                campaignId: campaignOid,
                leadId: doc.leadId,
                status: 'active',
                addedAt: now,
              },
            },
            upsert: true,
          },
        }))
      );
    }

    const updated = result.modifiedCount;
    const skipped = validIds.length - updated;

    return NextResponse.json({
      success: true,
      updated,
      skipped,
      campaignId,
      campaignName: campaign.name,
      message: `Added ${updated} no-reply lead${updated !== 1 ? 's' : ''} to "${campaign.name}"`,
    });
  } catch (err) {
    console.error('[POST /api/leads/no-reply/assign-campaign]', err);
    return NextResponse.json(
      { error: 'Failed to assign no-reply leads to campaign' },
      { status: 500 }
    );
  }
}
