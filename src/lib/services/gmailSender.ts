import { connectDB } from '@/lib/db/mongoose';
import { sendGmailMessage } from '@/lib/services/gmail';
import { getMailboxForSend, recordSend } from '@/lib/services/mailboxRotation';

export interface EmailSendResult {
  success: boolean;
  mode: 'live' | 'dry_run' | 'no_key';
  status: 'sent' | 'ready_to_send_test' | 'failed';
  message: string;
  sendMode?: 'campaign' | 'custom';
  preview?: { to: string; subject: string; campaignId: string };
  data?: unknown;
  rawResponse?: unknown;
}

export interface GmailSendParams {
  leadEmail: string;
  emailSubject: string;
  emailBody: string;
  campaignId?: string;
  preferredMailboxId?: string;
}

export async function sendCustomEmailViaGmail(
  params: GmailSendParams
): Promise<EmailSendResult> {
  const { leadEmail, emailSubject, emailBody, campaignId, preferredMailboxId } = params;

  await connectDB();

  const selected = await getMailboxForSend({ campaignId, preferredMailboxId });

  if (!selected) {
    return {
      success: false,
      mode: 'no_key',
      status: 'ready_to_send_test',
      sendMode: 'custom',
      message:
        'No active Gmail inbox available. All accounts may be disconnected or over their daily send limit. Connect a Gmail account in Settings → Integrations.',
    };
  }

  const { account, accessToken } = selected;

  try {
    const sent = await sendGmailMessage({
      accessToken,
      to:      leadEmail,
      subject: emailSubject,
      body:    emailBody,
      from:    account.email,
    });

    await recordSend(account._id);

    return {
      success: true,
      mode: 'live',
      status: 'sent',
      sendMode: 'custom',
      message: `Email sent via Gmail (${account.email})`,
      data: {
        messageId: sent.messageId,
        threadId:  sent.threadId,
        mailboxId: account._id.toString(),
        from:      account.email,
        success:   true,
        message:   'Email sent via Gmail',
      },
    };
  } catch (err) {
    console.error('[gmailSender] Send failed:', String(err));
    return {
      success: false,
      mode: 'live',
      status: 'failed',
      sendMode: 'custom',
      message: `Gmail send failed: ${String(err)}`,
    };
  }
}
