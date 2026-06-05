import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import Product from '@/lib/models/Product';
import Campaign from '@/lib/models/Campaign';
import Lead from '@/lib/models/Lead';
import EmailLog from '@/lib/models/EmailLog';
import Reply from '@/lib/models/Reply';
import NoReplyLead from '@/lib/models/NoReplyLead';

// Safety: only deletes records marked as sample data.
// Leads: source === 'sample'
// Products / Campaigns: name starts with '[SAMPLE]'
// EmailLogs / Replies / NoReplyLeads: leadId in the sample leads set

export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  await connectDB();

  // Fetch sample lead IDs first so we can cascade-delete linked records
  const sampleLeads = await Lead.find({ source: 'sample' }, '_id').lean();
  const sampleLeadIds = sampleLeads.map((l) => l._id);

  // Phase 1: delete linked records (safe to run in parallel)
  const [emailLogsResult, repliesResult, noReplyResult] = await Promise.all([
    sampleLeadIds.length > 0
      ? EmailLog.deleteMany({ leadId: { $in: sampleLeadIds } })
      : Promise.resolve({ deletedCount: 0 }),
    sampleLeadIds.length > 0
      ? Reply.deleteMany({ leadId: { $in: sampleLeadIds } })
      : Promise.resolve({ deletedCount: 0 }),
    sampleLeadIds.length > 0
      ? NoReplyLead.deleteMany({ leadId: { $in: sampleLeadIds } })
      : Promise.resolve({ deletedCount: 0 }),
  ]);

  // Phase 2: delete parent records
  const [leadsResult, productsResult, campaignsResult] = await Promise.all([
    Lead.deleteMany({ source: 'sample' }),
    Product.deleteMany({ name: /^\[SAMPLE\]/ }),
    Campaign.deleteMany({ name: /^\[SAMPLE\]/ }),
  ]);

  return NextResponse.json({
    success: true,
    deleted: {
      emailLogs: emailLogsResult.deletedCount,
      replies: repliesResult.deletedCount,
      noReplyLeads: noReplyResult.deletedCount,
      leads: leadsResult.deletedCount,
      products: productsResult.deletedCount,
      campaigns: campaignsResult.deletedCount,
    },
  });
}
