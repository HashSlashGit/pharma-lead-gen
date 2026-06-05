export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import Lead from '@/lib/models/Lead';
import EmailLog from '@/lib/models/EmailLog';
import Reply from '@/lib/models/Reply';
import ClaudeUsageLog from '@/lib/models/ClaudeUsageLog';
import NoReplyLead from '@/lib/models/NoReplyLead';
import { getSmartleadMode } from '@/lib/services/smartlead';

// Takes a factory fn so synchronous throws during query creation are also caught.
async function safeStat<T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const e = err as Error;
    console.error(
      `[dashboard/stats] ${name} failed: ${e?.name ?? 'Error'}: ${e?.message ?? String(err)}`
    );
    if (e?.stack) console.error(e.stack);
    return fallback;
  }
}

export async function GET() {
  // Must complete before any model query — bufferCommands is false
  try {
    await connectDB();
  } catch (err) {
    const e = err as Error;
    console.error('[dashboard/stats] connectDB failed:', e?.message ?? String(err));
    return NextResponse.json(
      { error: 'MongoDB connection failed', details: e?.message ?? String(err) },
      { status: 500 }
    );
  }

  console.log('[dashboard/stats] MongoDB connected before stats queries');

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const now = new Date();

    const { isDryRun, isConfigured } = getSmartleadMode();

    const [
      totalLeads,
      qualifiedLeads,
      warmLeads,
      aiProcessedLeads,
      noReplyLeads,
      followUpsDue,
      repliesNeedingApproval,
      emailsDraft,
      emailsTestSent,
      emailsSent,
      emailsFailed,
      replies,
      claudeCallsToday,
      claudeCostToday,
      apolloLeadsToday,
      apolloLeadsTotal,
      apifyLeadsToday,
      apifyLeadsTotal,
      aiDraftsPending,
      unhandledReplies,
      pendingFollowUpDrafts,
      gmailRepliesToday,
      webhookRepliesToday,
      rejectedLeads,
      needsReviewLeads,
      pricingReplies,
      interestedReplies,
      notInterestedReplies,
    ] = await Promise.all([
      safeStat('totalLeads', () => Lead.countDocuments(), 0),
      safeStat('qualifiedLeads', () => Lead.countDocuments({ status: 'qualified' }), 0),
      safeStat('warmLeads', () => Lead.countDocuments({ status: { $in: ['warm'] } }), 0),
      safeStat('aiProcessedLeads', () => Lead.countDocuments({ aiProcessed: true }), 0),
      safeStat('noReplyLeads', () => NoReplyLead.countDocuments({ isActive: { $ne: false } }), 0),
      safeStat(
        'followUpsDue',
        () => Lead.countDocuments({
          status: 'contacted',
          nextFollowUpAt: { $lte: now, $ne: null },
        }),
        0
      ),
      safeStat('repliesNeedingApproval', () => Reply.countDocuments({ needsApproval: true }), 0),
      safeStat('emailsDraft', () => EmailLog.countDocuments({ status: 'pending' }), 0),
      safeStat('emailsTestSent', () => EmailLog.countDocuments({ status: 'ready_to_send_test' }), 0),
      safeStat('emailsSent', () => EmailLog.countDocuments({ status: 'sent' }), 0),
      safeStat('emailsFailed', () => EmailLog.countDocuments({ status: 'failed' }), 0),
      safeStat('replies', () => Reply.countDocuments(), 0),
      safeStat('claudeCallsToday', () => ClaudeUsageLog.countDocuments({ createdAt: { $gte: todayStart } }), 0),
      safeStat(
        'claudeCostToday',
        () => ClaudeUsageLog.aggregate([
          { $match: { createdAt: { $gte: todayStart } } },
          { $group: { _id: null, total: { $sum: '$estimatedCost' } } },
        ]) as Promise<{ _id: null; total: number }[]>,
        [] as { _id: null; total: number }[]
      ),
      safeStat('apolloLeadsToday', () => Lead.countDocuments({ source: 'apollo', createdAt: { $gte: todayStart } }), 0),
      safeStat('apolloLeadsTotal', () => Lead.countDocuments({ source: 'apollo' }), 0),
      safeStat('apifyLeadsToday', () => Lead.countDocuments({ source: 'apify', createdAt: { $gte: todayStart } }), 0),
      safeStat('apifyLeadsTotal', () => Lead.countDocuments({ source: 'apify' }), 0),
      safeStat('aiDraftsPending', () => EmailLog.countDocuments({ type: 'reply', status: 'pending' }), 0),
      safeStat('unhandledReplies', () => Reply.countDocuments({ needsApproval: true, status: 'pending' }), 0),
      safeStat('pendingFollowUpDrafts', () => EmailLog.countDocuments({ type: 'follow_up', status: 'pending' }), 0),
      safeStat('gmailRepliesToday', () => Reply.countDocuments({ source: 'gmail', createdAt: { $gte: todayStart } }), 0),
      safeStat('webhookRepliesToday', () => Reply.countDocuments({ source: 'webhook', createdAt: { $gte: todayStart } }), 0),
      safeStat('rejectedLeads', () => Lead.countDocuments({ status: { $in: ['rejected', 'do_not_contact'] as ('rejected' | 'do_not_contact')[] } }), 0),
      safeStat('needsReviewLeads', () => Lead.countDocuments({ status: 'needs_review' }), 0),
      safeStat('pricingReplies', () => Reply.countDocuments({ classification: 'pricing_query' }), 0),
      safeStat('interestedReplies', () => Reply.countDocuments({ classification: 'interested' }), 0),
      safeStat('notInterestedReplies', () => Reply.countDocuments({ classification: { $in: ['not_interested', 'do_not_contact'] } }), 0),
    ]);

    console.log('[dashboard/stats] all queries complete');

    const estimatedCostToday = claudeCostToday[0]?.total ?? 0;

    return NextResponse.json({
      totalLeads,
      qualifiedLeads,
      warmLeads,
      aiProcessedLeads,
      noReplyLeads,
      followUpsDue,
      repliesNeedingApproval,
      emailsDraft,
      emailsTestSent,
      emailsSent,
      emailsFailed,
      replies,
      claudeCallsToday,
      estimatedCostToday: parseFloat(estimatedCostToday.toFixed(4)),
      smartleadDryRun: isDryRun,
      smartleadConfigured: isConfigured,
      apolloLeadsToday,
      apolloLeadsTotal,
      apifyLeadsToday,
      apifyLeadsTotal,
      aiDraftsPending,
      unhandledReplies,
      pendingFollowUpDrafts,
      gmailRepliesToday,
      webhookRepliesToday,
      rejectedLeads,
      needsReviewLeads,
      pricingReplies,
      interestedReplies,
      notInterestedReplies,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyErr = err as any;
    const errorName: string = anyErr?.name ?? 'Error';
    const errorCode: number | string | null = anyErr?.code ?? null;
    const errorCodeName: string | null = anyErr?.codeName ?? null;
    const errorMessage: string = anyErr?.message
      ? String(anyErr.message).replace(/mongodb(\+srv)?:\/\/[^@]*@/gi, 'mongodb+srv://***:***@')
      : String(err);
    const errorReason: string | null = anyErr?.reason?.message ?? null;
    console.error('[dashboard/stats] stat queries failed:', err);
    return NextResponse.json({
      error: 'Failed to fetch stats',
      type: 'query_failed',
      errorName,
      errorCode,
      errorCodeName,
      errorMessage,
      errorReason,
    }, { status: 500 });
  }
}
