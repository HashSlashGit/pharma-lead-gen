export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';

// 30-second in-memory cache — keeps the 30-query Promise.all from firing on every request.
// In dev with React StrictMode (double-invoke), the first request populates this cache;
// the second useEffect fire is served instantly with 0 DB queries.
let _statsCache: Record<string, unknown> | null = null;
let _statsCacheExpiry = 0;
const STATS_CACHE_TTL = 30_000;
import Lead from '@/lib/models/Lead';
import EmailLog from '@/lib/models/EmailLog';
import Reply from '@/lib/models/Reply';
import ClaudeUsageLog from '@/lib/models/ClaudeUsageLog';
import NoReplyLead from '@/lib/models/NoReplyLead';
import InboxAccount from '@/lib/models/InboxAccount';
import Product from '@/lib/models/Product';
import Campaign from '@/lib/models/Campaign';
import { DAILY_LIMIT } from '@/lib/services/mailboxRotation';

function isToday(date: Date | undefined | null): boolean {
  if (!date) return false;
  const d = new Date(date);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth()    === now.getMonth() &&
    d.getDate()     === now.getDate()
  );
}

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
  if (_statsCache && Date.now() < _statsCacheExpiry) {
    return NextResponse.json(_statsCache);
  }

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

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const now = new Date();

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
      rejectedLeads,
      needsReviewLeads,
      pricingReplies,
      interestedReplies,
      notInterestedReplies,
      productCount,
      campaignCount,
      gmailAccounts,
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
      safeStat('rejectedLeads', () => Lead.countDocuments({ status: { $in: ['rejected', 'do_not_contact'] as ('rejected' | 'do_not_contact')[] } }), 0),
      safeStat('needsReviewLeads', () => Lead.countDocuments({ status: 'needs_review' }), 0),
      safeStat('pricingReplies', () => Reply.countDocuments({ classification: 'pricing_query' }), 0),
      safeStat('interestedReplies', () => Reply.countDocuments({ classification: 'interested' }), 0),
      safeStat('notInterestedReplies', () => Reply.countDocuments({ classification: { $in: ['not_interested', 'do_not_contact'] } }), 0),
      safeStat('productCount', () => Product.countDocuments(), 0),
      safeStat('campaignCount', () => Campaign.countDocuments(), 0),
      safeStat(
        'gmailAccounts',
        () => InboxAccount.find({ provider: 'gmail', isActive: true })
          .select('email accountType dailySendCount dailySendDate')
          .lean(),
        [] as Array<{ email: string; accountType?: string; dailySendCount?: number; dailySendDate?: Date }>
      ),
    ]);

    const estimatedCostToday = claudeCostToday[0]?.total ?? 0;

    const gmailConnectedAccounts = gmailAccounts.length;
    const gmailTotalCapacity = gmailAccounts.reduce(
      (sum, a) => sum + DAILY_LIMIT[a.accountType as 'workspace' | 'personal' ?? 'personal'],
      0
    );
    const gmailDailyUsage = gmailAccounts.reduce(
      (sum, a) => sum + (isToday(a.dailySendDate) ? (a.dailySendCount ?? 0) : 0),
      0
    );

    const payload: Record<string, unknown> = {
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
      gmailConfigured:         gmailConnectedAccounts > 0,
      gmailEmail:              gmailAccounts[0]?.email ?? null,
      gmailConnectedAccounts,
      gmailTotalCapacity,
      gmailDailyUsage,
      apolloLeadsToday,
      apolloLeadsTotal,
      apifyLeadsToday,
      apifyLeadsTotal,
      aiDraftsPending,
      unhandledReplies,
      pendingFollowUpDrafts,
      gmailRepliesToday,
      rejectedLeads,
      needsReviewLeads,
      pricingReplies,
      interestedReplies,
      notInterestedReplies,
      productCount,
      campaignCount,
      lastUpdated: new Date().toISOString(),
    };
    _statsCache = payload;
    _statsCacheExpiry = Date.now() + STATS_CACHE_TTL;
    return NextResponse.json(payload);
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
