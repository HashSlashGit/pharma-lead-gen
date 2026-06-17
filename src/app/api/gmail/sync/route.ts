/**
 * POST /api/gmail/sync
 *
 * Manual Gmail inbox sync — fetches recent inbox messages, matches senders to
 * Lead.email, deduplicates, classifies with the existing rule-based classifier,
 * and saves into the Reply collection with source: 'gmail'.
 *
 * No Claude calls. No auto-send.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { runGmailReplySync } from '@/lib/services/gmailReplySync';

export async function POST(): Promise<NextResponse> {
  const result = await runGmailReplySync(50);

  if (!result.enabled) {
    return NextResponse.json(
      {
        success: false,
        message: result.message,
        checked: 0, created: 0, duplicates: 0, skippedNoLead: 0, errors: [],
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: result.errors.length === 0 || result.synced > 0,
    message:      result.message,
    checked:      result.checked,
    created:      result.synced,
    duplicates:   result.duplicates,
    skippedNoLead: result.skippedNoLead,
    errors:       result.errors,
  });
}
