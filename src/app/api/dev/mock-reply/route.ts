import { NextRequest, NextResponse } from 'next/server';

// Only available outside production
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  try {
    const { email, body, messageId } = await req.json();

    if (!email || !body) {
      return NextResponse.json({ error: 'email and body are required' }, { status: 400 });
    }

    // Forward to the real webhook handler
    const webhookUrl = new URL('/api/webhooks/smartlead/reply', req.url);
    const webhookRes = await fetch(webhookUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_email: email,
        text: body,
        message_id: messageId ?? `mock-${Date.now()}`,
      }),
    });

    const result = await webhookRes.json();
    return NextResponse.json({ mock: true, ...result }, { status: webhookRes.status });
  } catch (err) {
    console.error('[POST /api/dev/mock-reply]', err);
    return NextResponse.json({ error: 'Mock reply failed' }, { status: 500 });
  }
}
