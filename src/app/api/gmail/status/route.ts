export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import InboxAccount, { type IInboxAccount } from '@/lib/models/InboxAccount';
import EmailLog from '@/lib/models/EmailLog';
import { getSettings } from '@/lib/services/settingsCache';
import { DAILY_LIMIT, getDailyCount, isUnderLimit, getRotationSnapshot } from '@/lib/services/mailboxRotation';

type LeanAccount = Pick<
  IInboxAccount,
  'email' | 'displayName' | 'isActive' | 'accountType' | 'dailySendCount' | 'dailySendDate' |
  'lastSyncedAt' | 'tokenExpiry' | 'refreshToken' | 'lastRotationSelectedAt' | 'createdAt' | 'updatedAt'
> & { _id: unknown };

type AccountStatus = 'active' | 'rate_limited' | 'disabled' | 'auth_error';

function computeStatus(account: LeanAccount): AccountStatus {
  if (!account.isActive) return 'disabled';
  if (!account.refreshToken) return 'auth_error';
  if (!isUnderLimit(account)) return 'rate_limited';
  return 'active';
}

export async function GET() {
  const s = await getSettings();
  const configured = !!(s.googleClientId && s.googleClientSecret && s.googleRedirectUri);

  const emptyRotation = {
    enabled: false,
    connectedAccounts: 0,
    availableAccounts: 0,
    totalDailyCapacity: 0,
    emailsSentToday: 0,
    remainingCapacity: 0,
    nextMailbox: null as string | null,
  };

  if (!configured) {
    return NextResponse.json({ configured: false, connected: false, accounts: [], rotation: emptyRotation });
  }

  try {
    await connectDB();

    // Multiple Gmail accounts can be active at once (mailbox rotation). This
    // single query returns every account — active or disabled — so the
    // Settings dashboard never has to make one request per mailbox
    // (avoids N+1). Active accounts sort first, newest-connected within
    // that, so `email`/`lastSyncedAt`/`displayName` (kept as top-level
    // fields for backward compatibility) always mirror the newest active
    // account rather than an arbitrary one.
    const accounts = (await InboxAccount.find({ provider: 'gmail' })
      .sort({ isActive: -1, updatedAt: -1 })
      .select('email displayName isActive accountType dailySendCount dailySendDate lastSyncedAt tokenExpiry refreshToken lastRotationSelectedAt createdAt updatedAt')
      .lean()) as unknown as LeanAccount[];

    if (accounts.length === 0) {
      return NextResponse.json({ configured: true, connected: false, accounts: [], rotation: emptyRotation });
    }

    // One aggregation for "last email sent" across every mailbox instead of
    // a per-mailbox query.
    const lastSentRows = await EmailLog.aggregate<{ _id: unknown; lastSentAt: Date }>([
      { $match: { mailboxId: { $exists: true, $ne: null }, status: 'sent' } },
      { $group: { _id: '$mailboxId', lastSentAt: { $max: '$sentAt' } } },
    ]);
    const lastSentByMailbox = new Map(lastSentRows.map((r) => [String(r._id), r.lastSentAt]));

    // Read-only rotation order — does not select or mutate anything, so
    // viewing the dashboard never affects which mailbox actually sends next.
    const rotationOrder = await getRotationSnapshot();
    const rotationPositionByEmail = new Map(rotationOrder.map((r, i) => [r.email, i + 1]));
    const nextMailbox = rotationOrder.find((r) => r.underLimit)?.email ?? null;

    const activeAccounts = accounts.filter((a) => a.isActive);
    const totalDailyCapacity = activeAccounts.reduce((sum, a) => sum + DAILY_LIMIT[a.accountType ?? 'personal'], 0);
    const emailsSentToday = activeAccounts.reduce((sum, a) => sum + getDailyCount(a), 0);

    const newest = activeAccounts[0] ?? accounts[0];

    return NextResponse.json({
      configured: true,
      connected: activeAccounts.length > 0,
      email: newest.email,
      lastSyncedAt: newest.lastSyncedAt ?? null,
      displayName: newest.displayName ?? null,
      accounts: accounts.map((a) => {
        const dailyLimit = DAILY_LIMIT[a.accountType ?? 'personal'];
        const emailsToday = getDailyCount(a);
        return {
          id: String(a._id),
          email: a.email,
          displayName: a.displayName ?? null,
          isActive: a.isActive,
          accountType: a.accountType ?? 'personal',
          isNewest: a.isActive && a.email === newest.email,
          status: computeStatus(a),
          connectedSince: a.createdAt,
          lastSyncedAt: a.lastSyncedAt ?? null,
          lastEmailSentAt: lastSentByMailbox.get(String(a._id)) ?? null,
          emailsSentToday: emailsToday,
          dailyLimit,
          remainingQuota: Math.max(0, dailyLimit - emailsToday),
          rotationPosition: a.isActive ? rotationPositionByEmail.get(a.email) ?? null : null,
          diagnostics: {
            mailboxId: String(a._id),
            tokenExpiry: a.tokenExpiry ?? null,
            hasRefreshToken: !!a.refreshToken,
            lastRotationSelectedAt: a.lastRotationSelectedAt ?? null,
          },
        };
      }),
      rotation: {
        enabled: activeAccounts.length > 0,
        connectedAccounts: activeAccounts.length,
        availableAccounts: rotationOrder.filter((r) => r.underLimit).length,
        totalDailyCapacity,
        emailsSentToday,
        remainingCapacity: Math.max(0, totalDailyCapacity - emailsSentToday),
        nextMailbox,
      },
    });
  } catch (err) {
    console.error('[gmail/status]', err);
    return NextResponse.json({ configured, connected: false, accounts: [], rotation: emptyRotation, error: String(err) });
  }
}
