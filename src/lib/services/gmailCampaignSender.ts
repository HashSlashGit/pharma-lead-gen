import { sendCustomEmailViaGmail, type EmailSendResult } from '@/lib/services/gmailSender';

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
 * emailBody must already be HTML-formatted before calling this function.
 */
export async function sendEmailViaGmail(params: CampaignSendParams): Promise<EmailSendResult> {
  return sendCustomEmailViaGmail({
    leadEmail:          params.leadEmail,
    emailSubject:       params.emailSubject,
    emailBody:          params.emailBody,
    campaignId:         params.campaignId,
    preferredMailboxId: params.preferredMailboxId,
  });
}
