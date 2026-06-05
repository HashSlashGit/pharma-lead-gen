import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import CampaignLead from '@/lib/models/CampaignLead';
import Lead from '@/lib/models/Lead';
import EmailLog from '@/lib/models/EmailLog';
import Reply from '@/lib/models/Reply';
import NoReplyLead from '@/lib/models/NoReplyLead';
import mongoose from 'mongoose';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;

  if (!mongoose.Types.ObjectId.isValid(campaignId)) {
    return NextResponse.json({ error: 'Invalid campaign ID' }, { status: 400 });
  }

  try {
    await connectDB();
    console.log(`[Campaign Activity] loading campaign activity for ${campaignId}`);

    const campaignLeads = await CampaignLead.find({
      campaignId,
      status: 'active',
    }).lean();

    const leadIds = campaignLeads.map((cl) => cl.leadId);
    console.log(`[Campaign Activity] leadIds found: ${leadIds.length}`);

    if (leadIds.length === 0) {
      return NextResponse.json({
        leads: [],
        emails: [],
        replies: [],
        noReplyLeadIds: [],
        noReplyLeads: [],
        counts: { leadCount: 0, sentEmailCount: 0, replyCount: 0, noReplyCount: 0 },
      });
    }

    const [leads, emails, replies, noReplyDocs] = await Promise.all([
      Lead.find({ _id: { $in: leadIds } }).lean(),
      EmailLog.find({ leadId: { $in: leadIds }, type: { $in: ['initial', 'follow_up'] } })
        .sort({ createdAt: -1 })
        .lean(),
      Reply.find({ leadId: { $in: leadIds } })
        .sort({ createdAt: -1 })
        .lean(),
      NoReplyLead.find({ leadId: { $in: leadIds }, status: 'active' })
        .select('leadId')
        .lean(),
    ]);

    console.log(`[Campaign Activity] emailLogs found: ${emails.length}`);
    console.log(`[Campaign Activity] replies found: ${replies.length}`);
    console.log(`[Campaign Activity] noReply found: ${noReplyDocs.length}`);

    const leadMap = new Map(leads.map((l) => [String(l._id), l]));
    const noReplyLeadIds = noReplyDocs.map((r) => String(r.leadId));

    const noReplyLeads = noReplyDocs.map((doc) => {
      const lead = leadMap.get(String(doc.leadId));
      return {
        leadId: String(doc.leadId),
        companyName: doc.companyName || lead?.companyName || '',
        email: doc.email || lead?.email,
        country: doc.country || lead?.country || '',
        lastSentAt: doc.lastSentAt?.toISOString(),
        status: doc.status,
      };
    });

    const shapedLeads = leads.map((l) => ({
      _id: String(l._id),
      companyName: l.companyName,
      country: l.country,
      city: l.city,
      category: l.category,
      email: l.email,
      status: l.status,
      score: l.score,
      followUpCount: l.followUpCount,
      aiProcessed: l.aiProcessed,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
    }));

    const shapedEmails = emails.map((e) => {
      const lead = leadMap.get(String(e.leadId));
      return {
        _id: String(e._id),
        leadId: String(e.leadId),
        campaignId: e.campaignId ? String(e.campaignId) : undefined,
        type: e.type,
        subject: e.subject,
        body: e.body,
        status: e.status,
        sentAt: e.sentAt?.toISOString(),
        createdAt: e.createdAt.toISOString(),
        lead: lead
          ? { companyName: lead.companyName, email: lead.email, country: lead.country }
          : undefined,
      };
    });

    const shapedReplies = replies.map((r) => {
      const lead = leadMap.get(String(r.leadId));
      return {
        _id: String(r._id),
        leadId: String(r.leadId),
        body: r.body,
        classification: r.classification,
        needsApproval: r.needsApproval,
        status: r.status,
        aiDraftGenerated: r.aiDraftGenerated,
        receivedAt: r.receivedAt?.toISOString(),
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        source: r.source,
        lead: lead
          ? {
              companyName: lead.companyName,
              email: lead.email,
              country: lead.country,
              status: lead.status,
              score: lead.score,
            }
          : undefined,
      };
    });

    const counts = {
      leadCount: leads.length,
      sentEmailCount: emails.filter(
        (e) => e.status === 'sent' || e.status === 'ready_to_send_test'
      ).length,
      replyCount: replies.length,
      noReplyCount: noReplyLeadIds.length,
    };

    return NextResponse.json({
      leads: shapedLeads,
      emails: shapedEmails,
      replies: shapedReplies,
      noReplyLeadIds,
      noReplyLeads,
      counts,
    });
  } catch (err) {
    console.error('[GET /api/campaigns/[id]/activity]', err);
    return NextResponse.json({ error: 'Failed to fetch campaign activity' }, { status: 500 });
  }
}
