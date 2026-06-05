export interface LeadInput {
  companyName?: string;
  title?: string;
  country?: string;
  city?: string;
  category?: string;
  email?: string;
  phone?: string;
  website?: string;
  source?: string;
}

export interface ScoreResult {
  score: number;
  status: 'qualified' | 'needs_review' | 'low_priority';
  reasons: string[];
  needsEnrichment: boolean;
}

const TARGET_CATEGORIES = [
  'pharmacy', 'pharmacist', 'distributor', 'wholesaler', 'clinic',
  'hospital', 'healthcare', 'pharmaceutical', 'drugstore', 'medical',
  'health center', 'chain pharmacy', 'retail pharmacy',
];

const RELEVANT_TITLE_KEYWORDS = [
  'purchasing', 'procurement', 'manager', 'director', 'officer', 'head',
  'owner', 'ceo', 'vp', 'president', 'pharmacist', 'pharmacy', 'medical',
  'health', 'supply chain', 'import', 'export', 'logistics', 'buyer',
];

/** Original scoring formula — used for Apollo / CSV / manual leads. */
export function scoreLead(lead: LeadInput): ScoreResult {
  let score = 0;
  const reasons: string[] = [];
  const needsEnrichment = !lead.email;

  if (lead.email && lead.email.includes('@')) {
    score += 40;
    reasons.push('+40 email present');
  } else {
    reasons.push('0 no email — needs enrichment');
  }

  if (lead.title && lead.title.trim().length > 0) {
    const titleLower = lead.title.toLowerCase();
    const relevant = RELEVANT_TITLE_KEYWORDS.some((k) => titleLower.includes(k));
    if (relevant) {
      score += 20;
      reasons.push('+20 relevant title');
    }
  }

  if (lead.companyName && lead.companyName.trim().length > 0 && lead.companyName !== 'Unknown') {
    score += 15;
    reasons.push('+15 company present');
  }

  if (lead.website && lead.website.length > 4) {
    score += 10;
    reasons.push('+10 website/domain present');
  }

  if (lead.country && lead.country.trim().length > 0) {
    score += 10;
    reasons.push('+10 country present');
  }

  if (lead.category) {
    const catLower = lead.category.toLowerCase();
    const matched = TARGET_CATEGORIES.some((t) => catLower.includes(t));
    if (matched) {
      score += 10;
      reasons.push('+10 pharma/healthcare keyword match');
    }
  }

  if (needsEnrichment) score = Math.min(score, 40);

  let status: ScoreResult['status'];
  if (score >= 80) {
    status = 'qualified';
  } else if (score >= 40) {
    status = 'needs_review';
  } else {
    status = 'low_priority';
  }

  return { score, status, reasons, needsEnrichment };
}

// ─── Google Maps–specific scoring ────────────────────────────────────────────

/**
 * Input shape for Google Maps / Apify leads.
 * Includes Maps-native fields (rating, reviewsCount) that Apollo/CSV leads lack.
 */
export interface GoogleMapsLeadInput {
  companyName?: string;
  category?: string;
  email?: string;
  phone?: string;
  website?: string;
  /** Google Maps star rating (1–5). Awarded +10 when >= 4. */
  rating?: number;
  /** Total Google Maps review count. Awarded +10 when >= 20. */
  reviewsCount?: number;
}

/**
 * Scoring formula for Google Maps / Apify leads.
 *
 * | Signal              | Points |
 * |---------------------|--------|
 * | Email found         |  +35   |
 * | Phone found         |  +20   |
 * | Website found       |  +15   |
 * | Category match      |  +10   |
 * | Rating >= 4 stars   |  +10   |
 * | Reviews >= 20       |  +10   |
 * | Max                 |  100   |
 *
 * Thresholds:  qualified ≥ 80 · needs_review ≥ 40 · low_priority < 40
 */
export function scoreGoogleMapsLead(lead: GoogleMapsLeadInput): ScoreResult {
  let score = 0;
  const reasons: string[] = [];
  const needsEnrichment = !lead.email;

  // +35 — email found (native from Maps actor or extracted from website)
  if (lead.email && lead.email.includes('@')) {
    score += 35;
    reasons.push('+35 email found');
  } else {
    reasons.push('0 no email — needs enrichment');
  }

  // +20 — phone number present
  if (lead.phone && lead.phone.trim().length > 3) {
    score += 20;
    reasons.push('+20 phone found');
  }

  // +15 — website / domain present
  if (lead.website && lead.website.length > 4) {
    score += 15;
    reasons.push('+15 website found');
  }

  // +10 — pharma / healthcare category match
  if (lead.category) {
    const catLower = lead.category.toLowerCase();
    const matched = TARGET_CATEGORIES.some((t) => catLower.includes(t));
    if (matched) {
      score += 10;
      reasons.push('+10 category match');
    }
  }

  // +10 — Google Maps rating ≥ 4 stars
  if (lead.rating != null && lead.rating >= 4) {
    score += 10;
    reasons.push(`+10 rating ${lead.rating.toFixed(1)} ≥ 4.0`);
  }

  // +10 — at least 20 Google Maps reviews
  if (lead.reviewsCount != null && lead.reviewsCount >= 20) {
    score += 10;
    reasons.push(`+10 reviews ${lead.reviewsCount} ≥ 20`);
  }

  let status: ScoreResult['status'];
  if (score >= 80) {
    status = 'qualified';
  } else if (score >= 40) {
    status = 'needs_review';
  } else {
    status = 'low_priority';
  }

  return { score, status, reasons, needsEnrichment };
}
