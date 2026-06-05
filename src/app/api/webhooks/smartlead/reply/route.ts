import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import type { HydratedDocument } from 'mongoose';
import { connectDB } from '@/lib/db/mongoose';
import Lead from '@/lib/models/Lead';
import Reply from '@/lib/models/Reply';
import CampaignLead from '@/lib/models/CampaignLead';
import WebhookEvent, { type IWebhookEvent } from '@/lib/models/WebhookEvent';
import { classifyReply } from '@/lib/services/reply-classifier';
import { syncLeadStatusFromReply } from '@/lib/services/syncLeadStatusFromReply';
import { removeNoReplyOnReply } from '@/lib/services/removeNoReplyOnReply';

export const dynamic = 'force-dynamic';

function isReplyEvent(normalized: string): boolean {
  return (
    normalized === 'reply' ||
    normalized === 'replied' ||
    normalized === 'reply_received' ||
    normalized === 'lead_replied' ||
    normalized === 'email_replied' ||
    normalized.includes('reply')
  );
}

function extractStr(raw: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const val = raw[key];
    if (val && typeof val === 'string' && val.trim()) return val.trim();
  }
  return '';
}

function extractNested(raw: Record<string, unknown>, path: string): string {
  const parts = path.split('.');
  let cur: unknown = raw;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return '';
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur && typeof cur === 'string' ? cur.trim() : '';
}

function bodyHash(text: string): string {
  return createHash('sha256')
    .update(text.replace(/\s+/g, ' ').trim())
    .digest('hex')
    .slice(0, 16);
}

export async function POST(req: NextRequest) {
  console.log('[Smartlead Webhook] received');

  let rawEvent: HydratedDocument<IWebhookEvent> | null = null;

  try {
    await connectDB();

    const rawBody = await req.json() as Record<string, unknown>;
    console.log('[Smartlead Webhook] keys:', Object.keys(rawBody ?? {}).join(', '));

    // ── Persist raw event immediately ─────────────────────────────────────
    const originalEvent: string = extractStr(rawBody, 'event', 'event_type', 'type') || 'UNKNOWN';
    const eventType: string = originalEvent.toUpperCase();
    const normalizedEvent = String(originalEvent || '').toLowerCase();

    const senderEmail =
      extractStr(rawBody, 'from_email', 'fromEmail', 'sender_email', 'senderEmail', 'email', 'lead_email', 'leadEmail', 'from') ||
      extractNested(rawBody, 'lead.email') ||
      extractNested(rawBody, 'data.lead.email');

    const recipientEmail =
      extractStr(rawBody, 'to_email', 'toEmail', 'recipient_email', 'recipientEmail', 'to') ||
      extractNested(rawBody, 'data.to_email');

    const messageId =
      extractStr(rawBody, 'message_id', 'messageId', 'thread_id', 'threadId');

    rawEvent = await new WebhookEvent({
      provider:       'smartlead',
      eventType,
      payload:        rawBody,
      senderEmail:    senderEmail.toLowerCase() || undefined,
      recipientEmail: recipientEmail.toLowerCase() || undefined,
      messageId:      messageId || undefined,
      status:         'received',
      receivedAt:     new Date(),
    }).save();

    console.log('[Smartlead Webhook] saved raw event', rawEvent._id);

    // ── Extract reply body early (needed for fallback detection) ─────────
    const replyTextEarly =
      extractStr(rawBody, 'body', 'text', 'reply_text', 'reply_body', 'replyText', 'replyBody', 'email_body', 'message') ||
      extractNested(rawBody, 'reply.body') ||
      extractNested(rawBody, 'data.reply_body') ||
      extractNested(rawBody, 'data.message') ||
      extractNested(rawBody, 'data.reply.body');

    // Treat as reply if event type is missing but payload looks like one
    const missingEventButHasPayload =
      normalizedEvent === 'unknown' && !!senderEmail && !!replyTextEarly;

    // ── Skip non-reply events (but always return 200 so Smartlead stops retrying) ──
    if (!isReplyEvent(normalizedEvent) && !missingEventButHasPayload) {
      console.log('[Smartlead Webhook] non-reply event, skipping:', originalEvent);
      await WebhookEvent.findByIdAndUpdate(rawEvent._id, { status: 'processed' });
      return NextResponse.json({
        received: true,
        skipped: true,
        reason: 'unsupported_event_type',
        event: originalEvent,
        normalizedEvent,
      });
    }

    // ── Use already-extracted reply body ─────────────────────────────────
    const replyText = replyTextEarly;

    if (!senderEmail || !replyText) {
      const reason = !senderEmail ? 'missing sender email' : 'missing reply body';
      console.warn('[Smartlead Webhook] failed —', reason);
      await WebhookEvent.findByIdAndUpdate(rawEvent._id, { status: 'failed', error: reason });
      return NextResponse.json({ received: true, error: reason }, { status: 400 });
    }

    // ── Match lead case-insensitively ─────────────────────────────────────
    const lead = await Lead.findOne({
      email: { $regex: new RegExp(`^${senderEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    }).lean();

    if (!lead) {
      const reason = `no lead found for email: ${senderEmail}`;
      console.warn('[Smartlead Webhook] failed —', reason);
      await WebhookEvent.findByIdAndUpdate(rawEvent._id, { status: 'failed', error: reason });
      return NextResponse.json({ received: true, matched: false, note: reason });
    }

    console.log('[Smartlead Webhook] matched lead', String(lead._id), lead.companyName);

    // ── Dedup ─────────────────────────────────────────────────────────────
    const hash = bodyHash(replyText);

    const dupQuery = [
      messageId ? { messageId }                                          : null,
      messageId ? { smartleadMessageId: messageId }                      : null,
      messageId ? { mailboxMessageId:   messageId }                      : null,
      { bodyHash: hash, leadId: lead._id },
    ].filter(Boolean) as Record<string, unknown>[];

    const existing = await Reply.findOne({ $or: dupQuery }).lean();
    if (existing) {
      console.log('[Smartlead Webhook] duplicate reply — skipped, existing:', existing._id);
      await WebhookEvent.findByIdAndUpdate(rawEvent._id, {
        status: 'duplicate',
        processedReplyId: existing._id,
      });
      return NextResponse.json({ received: true, duplicate: true, replyId: existing._id });
    }

    // ── Classify ──────────────────────────────────────────────────────────
    const { classification, needsApproval } = classifyReply(replyText);
    console.log('[Smartlead Webhook] classification:', classification);

    // ── Create Reply ──────────────────────────────────────────────────────
    const reply = await Reply.create({
      leadId:              lead._id,
      messageId:           messageId || undefined,
      smartleadMessageId:  messageId || undefined,
      body:                replyText,
      bodyHash:            hash,
      classification,
      needsApproval,
      source:              'webhook',
      receivedAt:          new Date(),
    });

    console.log('[Smartlead Webhook] reply created', reply._id);

    // ── Sync lead status from reply classification ────────────────────────
    await syncLeadStatusFromReply({ leadId: lead._id, classification, replyId: reply._id, receivedAt: reply.receivedAt ?? new Date() });

    // ── Remove from No Reply ──────────────────────────────────────────────
    await removeNoReplyOnReply({ leadId: lead._id, replyId: reply._id, source: 'webhook', receivedAt: reply.receivedAt ?? new Date() });

    // ── Update CampaignLead records ───────────────────────────────────────
    await CampaignLead.updateMany(
      { leadId: lead._id, status: 'active' },
      { $set: { lastReplyAt: reply.receivedAt ?? new Date() } }
    );

    // ── Mark event processed ──────────────────────────────────────────────
    await WebhookEvent.findByIdAndUpdate(rawEvent._id, {
      status: 'processed',
      processedReplyId: reply._id,
    });

    return NextResponse.json({
      received:       true,
      processed:      true,
      replyId:        reply._id,
      leadId:         lead._id,
      classification,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Smartlead Webhook] failed —', message, err);
    if (rawEvent) {
      await WebhookEvent.findByIdAndUpdate(rawEvent._id, {
        status: 'failed',
        error:  message,
      }).catch(() => {});
    }
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
