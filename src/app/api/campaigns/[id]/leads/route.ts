import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import CampaignLead from '@/lib/models/CampaignLead';
import Campaign from '@/lib/models/Campaign';
import mongoose from 'mongoose';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid campaign ID' }, { status: 400 });
  }
  try {
    await connectDB();
    const campaign = await Campaign.findById(id).lean();
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

    const campaignLeads = await CampaignLead.find({ campaignId: id, status: 'active' })
      .populate('leadId')
      .lean();

    const leads = campaignLeads
      .map((cl) => cl.leadId)
      .filter(Boolean);

    return NextResponse.json({ leads, total: leads.length });
  } catch (err) {
    console.error('[GET /api/campaigns/[id]/leads]', err);
    return NextResponse.json({ error: 'Failed to fetch campaign leads' }, { status: 500 });
  }
}
