import { NextResponse } from 'next/server';

// Smartlead webhooks are no longer part of the architecture.
// Test reply ingestion by sending a real email and using Gmail Sync in Settings.
export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  return NextResponse.json(
    {
      error: 'Smartlead webhooks have been removed. Use Gmail Sync to test reply ingestion.',
      hint: 'Settings → Gmail Inbox Sync → Sync Now',
    },
    { status: 410 }
  );
}
