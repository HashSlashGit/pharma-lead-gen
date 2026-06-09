import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import Campaign from '@/lib/models/Campaign';
import { writeAuditLog } from '@/lib/utils/auditLog';
import { getRequestActor } from '@/lib/utils/requestActor';
import CampaignLead from '@/lib/models/CampaignLead';
import EmailLog from '@/lib/models/EmailLog';
import Reply from '@/lib/models/Reply';
import NoReplyLead from '@/lib/models/NoReplyLead';
import { z } from 'zod';

const CampaignSchema = z.object({
  name: z.string().min(1),
  targetCountry: z.string().optional(),
  targetCategory: z.string().optional(),
  status: z.enum(['draft', 'active', 'paused', 'completed']).optional(),
});

export async function GET() {
  try {
    await connectDB();
    const campaigns = await Campaign.find().sort({ createdAt: -1 }).lean();

    if (campaigns.length === 0) {
      return NextResponse.json({ campaigns: [] });
    }

    const campaignIds = campaigns.map((c) => c._id);

    // Lead counts per campaign
    const leadCountsAgg = await CampaignLead.aggregate<{ _id: unknown; count: number }>([
      { $match: { campaignId: { $in: campaignIds }, status: 'active' } },
      { $group: { _id: '$campaignId', count: { $sum: 1 } } },
    ]);
    const leadCountMap = new Map<string, number>(
      leadCountsAgg.map(({ _id, count }) => [String(_id), count])
    );

    // For live email/reply/no-reply counts: need leadIds per campaign
    const allCampaignLeads = await CampaignLead.find({
      campaignId: { $in: campaignIds },
      status: 'active',
    })
      .select('campaignId leadId')
      .lean();

    // Build campaignId → [leadId] map
    const campaignLeadMap = new Map<string, string[]>();
    for (const cl of allCampaignLeads) {
      const cid = String(cl.campaignId);
      if (!campaignLeadMap.has(cid)) campaignLeadMap.set(cid, []);
      campaignLeadMap.get(cid)!.push(String(cl.leadId));
    }

    const allLeadIds = allCampaignLeads.map((cl) => cl.leadId);

    // Aggregate email counts per leadId
    const emailCountsAgg = await EmailLog.aggregate<{ _id: unknown; count: number }>([
      { $match: { leadId: { $in: allLeadIds }, status: { $in: ['sent', 'ready_to_send_test'] } } },
      { $group: { _id: '$leadId', count: { $sum: 1 } } },
    ]);
    const emailCountByLead = new Map<string, number>(
      emailCountsAgg.map(({ _id, count }) => [String(_id), count])
    );

    // Aggregate reply counts per leadId
    const replyCountsAgg = await Reply.aggregate<{ _id: unknown; count: number }>([
      { $match: { leadId: { $in: allLeadIds } } },
      { $group: { _id: '$leadId', count: { $sum: 1 } } },
    ]);
    const replyCountByLead = new Map<string, number>(
      replyCountsAgg.map(({ _id, count }) => [String(_id), count])
    );

    // Active no-reply lead ids (via CampaignLead linkage)
    const activeNoReply = await NoReplyLead.find({
      leadId: { $in: allLeadIds },
      status: 'active',
    })
      .select('leadId')
      .lean();
    const activeNoReplySet = new Set(activeNoReply.map((r) => String(r.leadId)));

    // Count NoReplyLead docs directly assigned to each campaign via campaignIds field
    const noReplyAssignedAgg = await NoReplyLead.aggregate<{ _id: unknown; count: number }>([
      { $match: { campaignIds: { $in: campaignIds } } },
      { $unwind: '$campaignIds' },
      { $match: { campaignIds: { $in: campaignIds } } },
      { $group: { _id: '$campaignIds', count: { $sum: 1 } } },
    ]);
    const noReplyAssignedMap = new Map<string, number>(
      noReplyAssignedAgg.map(({ _id, count }) => [String(_id), count])
    );

    // Build per-campaign live counts
    const campaignsWithCounts = campaigns.map((c) => {
      const cid = c._id.toString();
      const leadIds = campaignLeadMap.get(cid) ?? [];

      const sentEmailCount = leadIds.reduce(
        (sum, lid) => sum + (emailCountByLead.get(lid) ?? 0),
        0
      );
      const replyCount = leadIds.reduce(
        (sum, lid) => sum + (replyCountByLead.get(lid) ?? 0),
        0
      );
      const noReplyCount = leadIds.filter((lid) => activeNoReplySet.has(lid)).length;
      const noReplyAssignedCount = noReplyAssignedMap.get(cid) ?? 0;

      return {
        ...c,
        leadCount: leadCountMap.get(cid) ?? 0,
        emailsSent: sentEmailCount,
        replies: replyCount,
        noReplyCount,
        noReplyAssignedCount,
      };
    });

    return NextResponse.json({ campaigns: campaignsWithCounts });
  } catch (err) {
    console.error('[GET /api/campaigns]', err);
    return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();
    const parsed = CampaignSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }

    const campaign = await Campaign.create(parsed.data);
    const actor = await getRequestActor(req);
    void writeAuditLog({
      action: 'campaign_created',
      ...actor,
      targetId: String(campaign._id),
      targetLabel: parsed.data.name,
    });
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/campaigns]', err);
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 });
  }
}
