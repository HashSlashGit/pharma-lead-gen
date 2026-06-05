/**
 * POST /api/replies/sync-mailbox
 *
 * Standalone mailbox inbox sync — captures custom/single-send replies via IMAP.
 * Zero Claude credits. No AI calls.
 *
 * Env vars required:
 *   MAILBOX_SYNC_ENABLED = "true"
 *   MAILBOX_IMAP_HOST, MAILBOX_IMAP_PORT, MAILBOX_IMAP_SECURE
 *   MAILBOX_USER, MAILBOX_APP_PASSWORD
 *   MAILBOX_LOOKBACK_DAYS
 */

import { NextRequest, NextResponse }               from 'next/server';
import { connectDB }                               from '@/lib/db/mongoose';
import { runMailboxSync, type MailboxSyncResult }  from '@/lib/services/mailboxReplySync';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest): Promise<NextResponse> {
  if (process.env.MAILBOX_SYNC_ENABLED !== 'true') {
    return NextResponse.json({
      success: true,
      mailbox: { enabled: false } as MailboxSyncResult,
      message: 'Mailbox sync is disabled. Set MAILBOX_SYNC_ENABLED=true to enable.',
    });
  }

  try {
    await connectDB();
    const result = await runMailboxSync();

    let message: string;
    if (result.synced && result.synced > 0) {
      message = `Mailbox sync complete. Synced ${result.synced} ${result.synced === 1 ? 'reply' : 'replies'}.`;
    } else if ((result.checked ?? 0) === 0) {
      message = 'No messages found in inbox for the lookback window.';
    } else if ((result.matched ?? 0) === 0) {
      message = 'No inbox messages matched custom sent emails.';
    } else if (result.duplicates && result.duplicates > 0) {
      message = 'All matched replies were already synced (duplicates).';
    } else {
      message = 'No new replies to sync.';
    }

    return NextResponse.json({
      success: true,
      mailbox: result,
      message,
    });
  } catch (err) {
    console.error('[sync-mailbox] Fatal error:', err);
    return NextResponse.json(
      {
        success: false,
        mailbox: { enabled: true, errors: [String(err)] } as MailboxSyncResult,
        message: 'Mailbox sync failed with an internal error.',
      },
      { status: 500 }
    );
  }
}
