/**
 * Keyword-based reply classifier — zero Claude credits.
 * Used by Gmail sync and the Smartlead manual sync endpoint.
 *
 * Priority order (highest wins):
 *   1. do_not_contact  — unsubscribe / remove me from list
 *   2. not_interested  — explicit rejection
 *   3. out_of_office   — auto-reply / absence
 *   4. pricing_query   — pricing / buying intent
 *   5. certificate_query / shipping_query
 *   6. interested      — warm / action intent
 *   7. needs_review    — unclear (fallback)
 */

export type ReplyClassification =
  | 'interested'
  | 'not_interested'
  | 'do_not_contact'
  | 'pricing_query'
  | 'certificate_query'
  | 'shipping_query'
  | 'out_of_office'
  | 'needs_review'
  | 'unclassified';

export interface ClassifyResult {
  classification: ReplyClassification;
  updateLeadStatus: string | null;
  needsApproval: boolean;
}

// ── Keyword lists ─────────────────────────────────────────────────────────────

// Priority 1: do_not_contact — unsubscribe / remove me
const doNotContactKeywords = [
  'unsubscribe',
  'remove me',
  'stop emailing',
  'please stop',
  'do not contact',
  "don't contact",
  'opt out',
];

// Priority 2: not_interested — explicit rejection
const notInterestedKeywords = [
  'not interested',
  'not looking',
  'no requirement',
  'no requirements',
  'no need',
  'no thanks',
  'no thank you',
  'not needed',
  'we do not need',
  "we don't need",
  'not relevant',
  'not a fit',
  'not suitable',
  'not required',
  'already have supplier',
  'already have a vendor',
  'already have vendor',
  'already sourced',
  'not buying',
  'maybe later',
  'not now',
  'no longer interested',
  'wrong person',
];

// Priority 3: out of office
const oooKeywords = [
  'out of office',
  'on leave',
  'on vacation',
  'annual leave',
  'away from office',
  'currently unavailable',
  'will be back',
  'returning on',
  'auto reply',
  'automatic reply',
  'vacation',
  'ooo',
  'not available',
];

// Priority 4: pricing / buying intent
const pricingKeywords = [
  'price',
  'pricing',
  'quotation',
  'quote',
  'cost',
  'rate',
  'send pricing',
  'share pricing',
  'send quote',
  'send quotation',
  'best price',
  'price list',
  'catalogue',
  'catalog',
  'send catalogue',
  'share catalogue',
  'product list',
  'moq',
  'minimum order',
  'payment terms',
  'how much',
];

// Priority 5 (supplementary warm): certificate / shipping queries
const certKeywords = [
  'certificate',
  'certification',
  'gmp',
  'fda',
  'halal',
  'iso',
  'approved',
  'registration',
];

const shippingKeywords = [
  'shipping',
  'delivery',
  'freight',
  'lead time',
  'dhl',
  'fedex',
  'transit',
];

// Priority 6: interested / warm
// Note: bare "great" is intentionally excluded — "great, thanks" alone is needs_review.
// Use "that's great" or action-intent phrases for warm classification.
const interestedKeywords = [
  'interested',
  'we are interested',
  'i am interested',
  'sounds good',
  'looks good',
  'that sounds good',
  "that's great",
  'good to know',
  'please share details',
  'send more details',
  'share more details',
  'when can we connect',
  'can we connect',
  "let's connect",
  'let us connect',
  'schedule a call',
  'book a call',
  'arrange a call',
  'available for a call',
  'can we discuss',
  "let's discuss",
  'meeting',
  'can we meet',
  'talk further',
  'discuss further',
  'please call',
  'call me',
  'whatsapp me',
  'send details',
  'tell me more',
  'please share',
  'would like to know',
  "let's talk",
];

// ── Classifier ────────────────────────────────────────────────────────────────

export function classifyReply(body: string): ClassifyResult {
  const text = body.toLowerCase();

  if (doNotContactKeywords.some((k) => text.includes(k))) {
    console.log('[reply-classifier] classification: do_not_contact');
    return { classification: 'do_not_contact', updateLeadStatus: 'rejected', needsApproval: false };
  }
  if (notInterestedKeywords.some((k) => text.includes(k))) {
    console.log('[reply-classifier] classification: not_interested');
    return { classification: 'not_interested', updateLeadStatus: 'rejected', needsApproval: false };
  }
  if (oooKeywords.some((k) => text.includes(k))) {
    console.log('[reply-classifier] classification: out_of_office');
    return { classification: 'out_of_office', updateLeadStatus: 'needs_review', needsApproval: false };
  }
  if (pricingKeywords.some((k) => text.includes(k))) {
    console.log('[reply-classifier] classification: pricing_query');
    return { classification: 'pricing_query', updateLeadStatus: 'warm', needsApproval: true };
  }
  if (certKeywords.some((k) => text.includes(k))) {
    console.log('[reply-classifier] classification: certificate_query');
    return { classification: 'certificate_query', updateLeadStatus: 'warm', needsApproval: true };
  }
  if (shippingKeywords.some((k) => text.includes(k))) {
    console.log('[reply-classifier] classification: shipping_query');
    return { classification: 'shipping_query', updateLeadStatus: 'warm', needsApproval: true };
  }
  if (interestedKeywords.some((k) => text.includes(k))) {
    console.log('[reply-classifier] classification: interested');
    return { classification: 'interested', updateLeadStatus: 'warm', needsApproval: true };
  }

  console.log('[reply-classifier] classification: needs_review');
  return { classification: 'needs_review', updateLeadStatus: 'needs_review', needsApproval: true };
}
