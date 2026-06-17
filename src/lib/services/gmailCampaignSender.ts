import { sendCustomEmailViaGmail, type EmailSendResult } from '@/lib/services/gmailSender';
import { formatEmailBodyAsHtml } from '@/lib/utils/emailFormatting';

export interface CampaignSendParams {
  leadEmail: string;
  leadFirstName?: string;
  leadLastName?: string;
  companyName?: string;
  phone?: string;
  website?: string;
  emailSubject: string;
  emailBody: string;
  campaignId?: string;
  preferredMailboxId?: string;
}

/**
 * Send a campaign email via Gmail.
 * Passes campaignId so the rotation layer can honour campaign-level inbox assignment.
 */
export async function sendEmailViaGmail(params: CampaignSendParams): Promise<EmailSendResult> {
  return sendCustomEmailViaGmail({
    leadEmail:          params.leadEmail,
    emailSubject:       params.emailSubject,
    emailBody:          formatEmailBodyAsHtml(params.emailBody),
    campaignId:         params.campaignId,
    preferredMailboxId: params.preferredMailboxId,
  });
}
