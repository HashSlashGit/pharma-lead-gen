import { connectDB } from '@/lib/db/mongoose';
import InboxAccount, { type IInboxAccount } from '@/lib/models/InboxAccount';
import Campaign from '@/lib/models/Campaign';
import { refreshGmailAccessToken } from '@/lib/services/gmail';
import mongoose from 'mongoose';

export const DAILY_LIMIT: Record<IInboxAccount['accountType'], number> = {
  workspace: 1800,
  personal:  450,
};

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

function getDailyCount(account: IInboxAccount): number {
  return isToday(account.dailySendDate) ? account.dailySendCount : 0;
}

function isUnderLimit(account: IInboxAccount): boolean {
  return getDailyCount(account) < DAILY_LIMIT[account.accountType ?? 'personal'];
}

/** Refresh token if expiring within 5 minutes. Persists updated tokens to DB. */
export async function ensureFreshToken(
  account: IInboxAccount
): Promise<string> {
  const fiveMin = 5 * 60 * 1000;
  const needsRefresh =
    !account.tokenExpiry ||
    account.tokenExpiry.getTime() - Date.now() < fiveMin;

  if (!needsRefresh) return account.accessToken;

  const refreshed = await refreshGmailAccessToken({
    refreshToken: account.refreshToken,
    email:        account.email,
  });

  await InboxAccount.findByIdAndUpdate(account._id, {
    accessToken:  refreshed.accessToken,
    tokenExpiry:  refreshed.tokenExpiry,
  });

  return refreshed.accessToken;
}

/**
 * Increment the daily send counter for a mailbox.
 * Must be called after a successful send.
 */
export async function recordSend(accountId: mongoose.Types.ObjectId | string): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await InboxAccount.findByIdAndUpdate(accountId, [
    {
      $set: {
        dailySendCount: {
          $cond: {
            if: {
              $and: [
                { $ifNull: ['$dailySendDate', false] },
                {
                  $eq: [
                    { $dateToString: { format: '%Y-%m-%d', date: '$dailySendDate' } },
                    { $dateToString: { format: '%Y-%m-%d', date: new Date() } },
                  ],
                },
              ],
            },
            then: { $add: ['$dailySendCount', 1] },
            else: 1,
          },
        },
        dailySendDate: new Date(),
      },
    },
  ], { updatePipeline: true });
}

export interface SelectedMailbox {
  account: IInboxAccount;
  accessToken: string;
}

interface GetMailboxOptions {
  campaignId?: string;
  preferredMailboxId?: string;
}

/**
 * Select the best available mailbox for sending.
 *
 * Priority:
 *  1. preferredMailboxId  — follow-ups/reply threads must use the same inbox
 *  2. campaign assignedInboxId — campaign-level assignment
 *  3. round-robin rotation across all active inboxes under their daily limit
 */
export async function getMailboxForSend(
  opts: GetMailboxOptions = {}
): Promise<SelectedMailbox | null> {
  await connectDB();

  const { campaignId, preferredMailboxId } = opts;

  // --- 1. Preferred mailbox (follow-ups / reply continuity) ---
  if (preferredMailboxId && mongoose.Types.ObjectId.isValid(preferredMailboxId)) {
    const preferred = await InboxAccount.findOne({
      _id: preferredMailboxId,
      provider: 'gmail',
      isActive: true,
    });
    if (preferred && isUnderLimit(preferred)) {
      const accessToken = await ensureFreshToken(preferred);
      await InboxAccount.findByIdAndUpdate(preferred._id, {
        lastRotationSelectedAt: new Date(),
      });
      return { account: preferred, accessToken };
    }
    // preferred is over-limit or inactive — fall through to rotation
  }

  // --- 2. Campaign-assigned mailbox ---
  if (campaignId && mongoose.Types.ObjectId.isValid(campaignId)) {
    const campaign = await Campaign.findById(campaignId).select('assignedInboxId').lean();
    if (campaign?.assignedInboxId) {
      const assigned = await InboxAccount.findOne({
        _id: campaign.assignedInboxId,
        provider: 'gmail',
        isActive: true,
      });
      if (assigned && isUnderLimit(assigned)) {
        const accessToken = await ensureFreshToken(assigned);
        await InboxAccount.findByIdAndUpdate(assigned._id, {
          lastRotationSelectedAt: new Date(),
        });
        return { account: assigned, accessToken };
      }
      // assigned inbox over-limit or inactive — fall through to rotation
    }
  }

  // --- 3. Round-robin rotation ---
  const allActive = await InboxAccount.find({
    provider: 'gmail',
    isActive: true,
  }).sort({ lastRotationSelectedAt: 1 }); // null/oldest first

  for (const candidate of allActive) {
    if (!isUnderLimit(candidate)) continue;
    const accessToken = await ensureFreshToken(candidate);
    await InboxAccount.findByIdAndUpdate(candidate._id, {
      lastRotationSelectedAt: new Date(),
    });
    return { account: candidate, accessToken };
  }

  return null; // all inboxes exhausted or none connected
}
