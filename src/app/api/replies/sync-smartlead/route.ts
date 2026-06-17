export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

/**
 * Deprecated — Smartlead has been removed. Reply sync now runs through Gmail.
 * Use POST /api/replies/sync-gmail or POST /api/gmail/sync instead.
 */
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      message: 'Smartlead has been removed. Use POST /api/replies/sync-gmail for Gmail-based reply sync.',
      deprecated: true,
    },
    { status: 410 }
  );
}
