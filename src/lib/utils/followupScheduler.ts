/**
 * Follow-up scheduler — pure rule-based logic, zero Claude usage.
 *
 * Sequence (days from initial email):
 *   Day 0  → Initial email sent (handled by personalize endpoint)
 *   Day 1  → Follow-up 1  (gap: 1 day after initial)
 *   Day 3  → Follow-up 2  (gap: 2 days after FU1)
 *   Day 7  → Final follow-up  (gap: 4 days after FU2)
 *   Day 7+ no reply → Archive to NoReplyLead, status = no_response
 */

export const FOLLOWUP_GAPS_DAYS = [1, 2, 4] as const; // gaps between emails (index = followUpCount)
export const MAX_FOLLOWUPS = 3; // 3 follow-ups after initial = 4 total touches

export type FollowUpAction =
  | { action: 'send_followup'; followUpNumber: number; templateKey: FollowUpTemplateKey }
  | { action: 'archive'; reason: string }
  | { action: 'none'; reason: string };

export type FollowUpTemplateKey = 'followup_1' | 'followup_2' | 'followup_final';

// Statuses that permanently stop all follow-ups
export const STOP_STATUSES = new Set([
  'warm',
  'cold',
  'rejected',
  'no_response',
  'do_not_contact',
]);

// EmailLog or Reply status that means "they replied"
export const REPLY_CLASSIFICATIONS_STOP = new Set([
  'interested',
  'not_interested',
  'pricing_query',
  'certificate_query',
  'shipping_query',
]);

interface SchedulerInput {
  followUpCount: number;        // how many follow-ups already sent (0 = only initial sent)
  lastContactedAt: Date | null; // when the last email was sent
  status: string;               // current lead status
  hasAnyReply: boolean;         // true if lead has any Reply record
  lastEmailBounced: boolean;    // true if the latest email log status = 'failed'
  isUnsubscribed: boolean;      // true if any reply classified as not_interested via unsubscribe
}

/**
 * Returns what action to take for a given lead's follow-up state.
 * Call this from your cron/process endpoint — do NOT call Claude anywhere in this flow.
 */
export function getFollowUpAction(input: SchedulerInput): FollowUpAction {
  const {
    followUpCount,
    lastContactedAt,
    status,
    hasAnyReply,
    lastEmailBounced,
    isUnsubscribed,
  } = input;

  // Hard stops
  if (STOP_STATUSES.has(status)) {
    return { action: 'none', reason: `Lead status is "${status}" — follow-ups stopped` };
  }
  if (hasAnyReply) {
    return { action: 'none', reason: 'Lead has replied — follow-ups stopped' };
  }
  if (lastEmailBounced) {
    return { action: 'none', reason: 'Last email bounced — invalid address' };
  }
  if (isUnsubscribed) {
    return { action: 'none', reason: 'Lead unsubscribed — follow-ups stopped' };
  }
  if (!lastContactedAt) {
    return { action: 'none', reason: 'No contact date recorded — cannot schedule follow-up' };
  }

  const daysSinceLast = daysBetween(lastContactedAt, new Date());

  // Completed all follow-ups → archive
  if (followUpCount >= MAX_FOLLOWUPS) {
    return {
      action: 'archive',
      reason: 'No reply after complete follow-up sequence (Day 0 initial → Day 1 → Day 3 → Day 7)',
    };
  }

  // Check if enough days have passed for the next follow-up
  const requiredGap = FOLLOWUP_GAPS_DAYS[followUpCount] ?? 1;
  if (daysSinceLast < requiredGap) {
    const daysLeft = requiredGap - daysSinceLast;
    return {
      action: 'none',
      reason: `Next follow-up in ${daysLeft} day(s) (gap: ${requiredGap}d, elapsed: ${daysSinceLast}d)`,
    };
  }

  const templateKey = getTemplateKey(followUpCount);
  return {
    action: 'send_followup',
    followUpNumber: followUpCount + 1,
    templateKey,
  };
}

function getTemplateKey(currentFollowUpCount: number): FollowUpTemplateKey {
  if (currentFollowUpCount === 0) return 'followup_1';
  if (currentFollowUpCount === 1) return 'followup_2';
  return 'followup_final';
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

// ── Template generator — rule-based, no AI ────────────────────────────

interface TemplateParams {
  companyName: string;
  category: string;
  country: string;
  productName: string;
}

export interface EmailTemplate {
  subject: string;
  body: string;
}

export function buildFollowUpTemplate(
  key: FollowUpTemplateKey,
  params: TemplateParams
): EmailTemplate {
  const { companyName, category, country, productName } = params;

  switch (key) {
    case 'followup_1':
      return {
        subject: `Following up — ${productName} for ${companyName}`,
        body: `Dear ${companyName} Team,

I wanted to follow up on my previous message regarding ${productName}.

As a ${category} in ${country}, I believe there's a strong fit for our product in your business.

Would you have 10 minutes this week for a quick call? I'd love to share more details about how we can support your needs.

Looking forward to hearing from you.

Best regards`,
      };

    case 'followup_2':
      return {
        subject: `Quick check-in — ${productName} partnership`,
        body: `Dear ${companyName} Team,

I'm reaching out one more time regarding ${productName}.

I understand you're busy, so I'll be brief: we offer competitive pricing, reliable supply, and full documentation to make the import process smooth for you.

If this is of interest, simply reply to this email and I'll send over our complete product catalog and pricing details right away.

Best regards`,
      };

    case 'followup_final':
      return {
        subject: `Last message — ${productName} (${companyName})`,
        body: `Dear ${companyName} Team,

This will be my final message regarding ${productName}.

If the timing isn't right at the moment, I completely understand. Please keep us in mind for the future — we're always ready to discuss partnership opportunities when you're ready.

You can reach out to us at any time. We wish you continued success.

Best regards`,
      };
  }
}
