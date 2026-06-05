export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({
    success: false,
    disabled: true,
    message: 'Automated follow-ups are disabled. Use No Reply Leads for manual follow-up campaigns.',
  });
}
