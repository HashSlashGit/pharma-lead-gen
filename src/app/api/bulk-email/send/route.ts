import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import CampaignLead from '@/lib/models/CampaignLead';
import Campaign from '@/lib/models/Campaign';
import Lead from '@/lib/models/Lead';
import Product from '@/lib/models/Product';
import EmailLog from '@/lib/models/EmailLog';
import mongoose from 'mongoose';
import { z } from 'zod';
import { sendCustomEmailViaSmartlead } from '@/lib/services/smartlead';
import { formatEmailBodyAsHtml } from '@/lib/utils/emailFormatting';
import { markLeadWaitingForReply } from '@/lib/utils/noReplySync';

const MAX_PER_SEND = 50;
const SKIP_STATUSES = new Set(['do_not_contact', 'rejected', 'no_response']);

const BulkSendSchema = z.object({
  campaignId: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  leadIds: z.array(z.string()).min(1).max(MAX_PER_SEND),
  productId: z.string().optional(),
});

interface ProductShape {
  name?: string;
  moq?: string;
  pricing?: string;
  certifications?: string[];
  shippingDetails?: string;
}

interface LeadShape {
  companyName: string;
  country: string;
  category: string;
}

function renderVars(
  template: string,
  lead: LeadShape,
  product: ProductShape | null
): string {
  return template
    .replace(/\{\{companyName\}\}/g, lead.companyName ?? '')
    .replace(/\{\{country\}\}/g, lead.country ?? '')
    .replace(/\{\{category\}\}/g, lead.category ?? '')
    .replace(/\{\{productName\}\}/g, product?.name ?? '')
    .replace(/\{\{moq\}\}/g, product?.moq ?? '')
    .replace(/\{\{pricing\}\}/g, product?.pricing ?? '')
    .replace(/\{\{certifications\}\}/g, product?.certifications?.join(', ') ?? '')
    .replace(/\{\{shippingDetails\}\}/g, product?.shippingDetails ?? '');
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const reqBody = await req.json();
    const parsed = BulkSendSchema.safeParse(reqBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { campaignId, subject, body: emailBody, leadIds, productId } = parsed.data;

    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
      return NextResponse.json({ error: 'Invalid campaign ID' }, { status: 400 });
    }

    const campaign = await Campaign.findById(campaignId).lean();
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

    let product: ProductShape | null = null;
    if (productId) {
      if (!mongoose.Types.ObjectId.isValid(productId)) {
        return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 });
      }
      const productDoc = await Product.findById(productId)
        .select('name moq pricing certifications shippingDetails')
        .lean();
      if (productDoc) {
        product = productDoc as ProductShape;
      }
    }

    const validLeadIds = leadIds.filter((id) => mongoose.Types.ObjectId.isValid(id));

    // Verify leads belong to this campaign
    const campaignLeadDocs = await CampaignLead.find({
      campaignId,
      leadId: { $in: validLeadIds },
      status: 'active',
    }).lean();
    const campaignLeadSet = new Set(
      campaignLeadDocs.map((cl) => cl.leadId.toString())
    );

    const leadDocs = await Lead.find({ _id: { $in: [...campaignLeadSet] } }).lean();
    const leadMap = new Map(leadDocs.map((l) => [l._id.toString(), l]));

    type SendResult = {
      leadId: string;
      email: string;
      status: 'sent' | 'failed' | 'skipped';
      error?: string;
    };

    const results: SendResult[] = [];
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const leadId of validLeadIds) {
      if (!campaignLeadSet.has(leadId)) {
        results.push({ leadId, email: '', status: 'skipped', error: 'Not in campaign' });
        skipped++;
        continue;
      }

      const lead = leadMap.get(leadId);
      if (!lead) {
        results.push({ leadId, email: '', status: 'skipped', error: 'Lead not found' });
        skipped++;
        continue;
      }
      if (!lead.email) {
        results.push({ leadId, email: '', status: 'skipped', error: 'No email address' });
        skipped++;
        continue;
      }
      if (SKIP_STATUSES.has(lead.status)) {
        results.push({
          leadId,
          email: lead.email,
          status: 'skipped',
          error: `Status: ${lead.status}`,
        });
        skipped++;
        continue;
      }

      const renderedSubject = renderVars(subject, lead, product);
      const renderedBody = renderVars(emailBody, lead, product);

      const emailLog = await EmailLog.create({
        leadId: lead._id,
        campaignId,
        type: 'initial',
        subject: renderedSubject,
        body: renderedBody,
        status: 'pending',
        sendMode: 'custom',
        leadEmail: lead.email,
      });

      const result = await sendCustomEmailViaSmartlead({
        leadEmail: lead.email,
        companyName: lead.companyName,
        phone: lead.phone,
        website: lead.website,
        emailSubject: renderedSubject,
        emailBody: formatEmailBodyAsHtml(renderedBody),
      });

      if (result.status === 'sent' || result.status === 'ready_to_send_test') {
        const logUpdate: Record<string, unknown> = {
          status: result.status === 'sent' ? 'sent' : 'ready_to_send_test',
          sentAt: new Date(),
        };
        if (result.status === 'sent' && result.data) {
          const d = result.data as Record<string, unknown>;
          const trackId = d['trackId'] ?? d['track_id'];
          if (trackId) logUpdate['smartleadTrackId'] = String(trackId);
        }
        await EmailLog.findByIdAndUpdate(emailLog._id, logUpdate);
        if (result.status === 'sent') {
          await Lead.findByIdAndUpdate(lead._id, {
            lastContactedAt: new Date(),
            status: 'contacted',
          });
        }
        // ── NoReply tracking: upsert for both live and test sends ────────
        await markLeadWaitingForReply({
          leadId: lead._id,
          emailLogId: emailLog._id as mongoose.Types.ObjectId,
          sentAt: new Date(),
        });
        results.push({ leadId, email: lead.email, status: 'sent' });
        sent++;
      } else {
        await EmailLog.findByIdAndUpdate(emailLog._id, { status: 'failed' });
        results.push({ leadId, email: lead.email, status: 'failed', error: result.message });
        failed++;
      }
    }

    return NextResponse.json({ sent, failed, skipped, total: validLeadIds.length, results });
  } catch (err) {
    console.error('[POST /api/bulk-email/send]', err);
    return NextResponse.json({ error: 'Failed to process bulk send' }, { status: 500 });
  }
}
