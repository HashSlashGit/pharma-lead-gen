export type LeadStatus =
  | 'new'
  | 'qualified'
  | 'needs_review'
  | 'low_priority'
  | 'contacted'
  | 'warm'
  | 'cold'
  | 'rejected'
  | 'no_response'
  | 'do_not_contact';

export interface NoReplyLeadRow {
  _id: string;
  leadId: string;
  companyName: string;
  email?: string;
  country: string;
  category: string;
  lastSentAt?: string;
  archivedAt?: string;
  campaignNames?: string;
  lastEmailSubject?: string;
  lastEmailBody?: string;
}

export interface LeadRow {
  _id: string;
  companyName: string;
  country: string;
  city?: string;
  category: string;
  email?: string;
  phone?: string;
  website?: string;
  source?: string;
  status: LeadStatus;
  score: number;
  aiProcessed: boolean;
  followUpCount: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductRow {
  _id: string;
  name: string;
  category: string;
  description?: string;
  pricing?: string;
  moq?: string;
  certifications?: string[];
  shippingDetails?: string;
  approvedClaims?: string[];
  restrictedClaims?: string[];
  createdAt: string;
}

export interface CampaignRow {
  _id: string;
  name: string;
  targetCountry?: string;
  targetCategory?: string;
  status: 'draft' | 'active' | 'paused' | 'completed';
  emailsSent: number;
  replies: number;
  leadCount?: number;
  noReplyCount?: number;
  /** Count of NoReplyLead docs directly assigned to this campaign via the assign-campaign feature */
  noReplyAssignedCount?: number;
  createdAt: string;
}

export interface ActivityEmailRow {
  _id: string;
  leadId: string;
  campaignId?: string;
  type: 'initial' | 'follow_up' | 'reply';
  subject: string;
  body: string;
  status: 'pending' | 'ready_to_send_test' | 'sent' | 'failed' | 'opened' | 'clicked';
  sentAt?: string;
  createdAt: string;
  lead?: { companyName: string; email?: string; country: string };
}

export interface NoReplyActivityRow {
  leadId: string;
  companyName: string;
  email?: string;
  country: string;
  lastSentAt?: string;
  status: string;
}

export interface CampaignActivityData {
  leads: LeadRow[];
  emails: ActivityEmailRow[];
  replies: ReplyRow[];
  /** @deprecated Use noReplyLeads instead; kept for backward compat. */
  noReplyLeadIds: string[];
  noReplyLeads: NoReplyActivityRow[];
  counts: {
    leadCount: number;
    sentEmailCount: number;
    replyCount: number;
    noReplyCount: number;
  };
}

export interface DashboardStats {
  totalLeads: number;
  qualifiedLeads: number;
  warmLeads: number;
  aiProcessedLeads: number;
  noReplyLeads: number;
  followUpsDue: number;
  repliesNeedingApproval: number;
  emailsDraft: number;
  emailsTestSent: number;
  emailsSent: number;
  emailsFailed: number;
  replies: number;
  claudeCallsToday: number;
  estimatedCostToday: number;
  smartleadDryRun: boolean;
  smartleadConfigured: boolean;
  apolloLeadsToday: number;
  apolloLeadsTotal: number;
  apifyLeadsToday: number;
  apifyLeadsTotal: number;
  aiDraftsPending: number;
  unhandledReplies: number;
  pendingFollowUpDrafts: number;
  gmailRepliesToday?: number;
  rejectedLeads: number;
  needsReviewLeads: number;
  pricingReplies: number;
  interestedReplies: number;
  notInterestedReplies: number;
  productCount: number;
  campaignCount: number;
  lastUpdated?: string;
}

export interface ApifyLeadPreview {
  companyName: string;
  country: string;
  city?: string;
  category: string;
  email?: string;
  phone?: string;
  website?: string;
  source: 'apify';
  notes?: string;
  address?: string;
  mapsUrl?: string;
  /** Google Maps star rating (1–5). Used for display and scoring. */
  rating?: number;
  /** Total Google Maps review count. */
  reviewsCount?: number;
  /**
   * Set after website enrichment attempt.
   * - 'enriched'    — email was extracted from the business website this run
   * - 'not_found'   — website was fetched but yielded no email
   * - 'not_checked' — enrichment disabled, or lead has no website
   * - 'skipped'     — over the per-search website limit
   * - undefined     — email came from the Maps actor directly (no enrichment needed)
   */
  emailEnrichmentStatus?: 'enriched' | 'not_found' | 'not_checked' | 'skipped';
  score: number;
  scoreStatus: 'qualified' | 'needs_review' | 'low_priority';
  isDuplicate: boolean;
}

export interface ApolloLeadPreview {
  apolloId: string;
  firstName?: string;
  lastName?: string;
  contactName: string;
  title: string;
  companyName: string;
  country: string;
  city?: string;
  category: string;
  email?: string;
  phone?: string;
  website?: string;
  linkedinUrl?: string;
  organizationDomain?: string;
  source: 'apollo';
  score: number;
  scoreStatus: 'qualified' | 'needs_review' | 'low_priority';
  isDuplicate: boolean;
  needsEnrichment: boolean;
}

export interface EmailLogRow {
  _id: string;
  leadId: string;
  campaignId?: string;
  type: 'initial' | 'follow_up' | 'reply';
  subject: string;
  body: string;
  status: 'pending' | 'ready_to_send_test' | 'sent' | 'failed' | 'opened' | 'clicked';
  sentAt?: string;
  createdAt: string;
}

export type ReplyStatus = 'pending' | 'draft_generated' | 'draft_approved' | 'draft_rejected' | 'handled';

export interface EmailTemplateRow {
  _id: string;
  name: string;
  type: 'initial' | 'follow_up' | 'warm_reply' | 'cold_reply' | 'pricing' | 'custom';
  subject: string;
  body: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignLeadRow {
  _id: string;
  campaignId: string;
  leadId: string;
  status: 'active' | 'removed';
  addedAt: string;
  createdAt: string;
  lead?: LeadRow;
}

export interface ReplyRow {
  _id: string;
  leadId: string;
  body: string;
  classification?: string;
  aiDraft?: string;
  needsApproval: boolean;
  status: ReplyStatus;
  aiDraftGenerated: boolean;
  draftEmailLogId?: string;
  approvedAt?: string;
  rejectedAt?: string;
  receivedAt?: string;
  createdAt: string;
  updatedAt: string;
  source?: 'webhook' | 'smartlead_sync' | 'mailbox_sync' | 'manual' | 'gmail';
  gmailMessageId?: string;
  gmailThreadId?: string;
  lead?: {
    companyName: string;
    email?: string;
    country: string;
    status: string;
    score: number;
  };
}
