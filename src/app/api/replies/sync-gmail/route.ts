export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { runGmailReplySync } from '@/lib/services/gmailReplySync';
import { runMailboxSync, type MailboxSyncResult } from '@/lib/services/mailboxReplySync';
import { getSettings } from '@/lib/services/settingsCache';

export async function POST(req: NextRequest) {
  try {
    const reqBody = await req.json().catch(() => ({})) as Record<string, unknown>;
    const maxResults = typeof reqBody['maxResults'] === 'number'
      ? Math.min(Math.max(1, reqBody['maxResults']), 100)
      : 50;

    const gmailResult = await runGmailReplySync(maxResults);

    const settings = await getSettings();
    let mailboxResult: MailboxSyncResult = { enabled: false };

    if (settings.mailboxEnabled) {
      try {
        mailboxResult = await runMailboxSync();
      } catch (err) {
        console.error('[sync-gmail] mailbox sync error:', err);
        mailboxResult = {
          enabled: true, checked: 0, matched: 0, synced: 0,
          duplicates: 0, unmatched: 0, errors: [String(err)],
        };
      }
    }

    const totalSynced = gmailResult.synced + (mailboxResult.synced ?? 0);

    return NextResponse.json({
      success: true,
      checked:       gmailResult.checked,
      created:       gmailResult.synced,
      synced:        gmailResult.synced,
      duplicates:    gmailResult.duplicates,
      skippedNoLead: gmailResult.skippedNoLead,
      errors:        gmailResult.errors,
      message:       gmailResult.message,
      gmail:         gmailResult,
      mailbox:       mailboxResult,
      totalSynced,
    });
  } catch (err) {
    console.error('[POST /api/replies/sync-gmail]', err);
    return NextResponse.json(
      { success: false, message: 'Sync failed', error: String(err) },
      { status: 500 }
    );
  }
}
