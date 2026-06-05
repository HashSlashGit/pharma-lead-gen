/**
 * Claude API service — only called for high-value tasks.
 * Rule-based scoring happens first. Claude is invoked only when:
 *   1. Lead score >= 70 (qualified)
 *   2. User explicitly triggers personalization
 *   3. A reply needs classification/drafting
 */

import Anthropic from '@anthropic-ai/sdk';
import { connectDB } from '@/lib/db/mongoose';
import ClaudeUsageLog, { type IClaudeUsageLog } from '@/lib/models/ClaudeUsageLog';
import { Types } from 'mongoose';
import { getSettings } from '@/lib/services/settingsCache';

// Cost per token (Claude Haiku — cheapest option for non-critical tasks)
const COST_PER_INPUT_TOKEN = 0.00000025;   // $0.25 / 1M tokens
const COST_PER_OUTPUT_TOKEN = 0.00000125;  // $1.25 / 1M tokens

async function getClient(): Promise<Anthropic> {
  const { claudeApiKey: apiKey } = await getSettings();
  if (!apiKey) throw new Error('Claude API key is not configured. Add it in Settings → Integrations.');
  return new Anthropic({ apiKey });
}

async function logUsage(
  actionType: IClaudeUsageLog['actionType'],
  leadId: string | undefined,
  promptTokens: number,
  completionTokens: number
) {
  await connectDB();
  const estimatedCost =
    promptTokens * COST_PER_INPUT_TOKEN + completionTokens * COST_PER_OUTPUT_TOKEN;
  await ClaudeUsageLog.create({
    actionType,
    leadId: leadId ? new Types.ObjectId(leadId) : undefined,
    promptTokens,
    completionTokens,
    estimatedCost,
  });
}

// ─── Public Functions ───────────────────────────────────────────────

/**
 * Generate a personalized outbound email for a qualified lead.
 * Only call this when lead.score >= 70.
 */
export async function generatePersonalizedEmail(params: {
  leadId: string;
  companyName: string;
  country: string;
  category: string;
  productName: string;
  productDescription: string;
  approvedClaims: string[];
}): Promise<string> {
  const client = await getClient();

  const prompt = `You are a professional pharmaceutical sales executive writing a cold outreach email.

Company: ${params.companyName}
Country: ${params.country}
Business Type: ${params.category}
Product: ${params.productName}
Product Description: ${params.productDescription}
Approved Claims: ${params.approvedClaims.join(', ')}

Write a concise, professional outbound email (under 200 words).
- Be specific to their business type
- Mention 1-2 relevant product benefits
- Include a clear call to action
- Do NOT make medical claims beyond the approved list
- Tone: professional, warm, direct`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  await logUsage('personalized_email', params.leadId, response.usage.input_tokens, response.usage.output_tokens);
  return text;
}

/**
 * Classify an inbound reply and suggest a draft response.
 * Use this when a lead replies to an email.
 */
export async function analyzeReply(params: {
  leadId: string;
  replyBody: string;
  companyName: string;
}): Promise<{ classification: string; draft: string; needsApproval: boolean }> {
  const client = await getClient();

  const prompt = `You are analyzing a reply from a pharmaceutical lead.

Company: ${params.companyName}
Reply: """${params.replyBody}"""

1. Classify the reply as ONE of: interested | not_interested | pricing_query | certificate_query | shipping_query | unclassified
2. Write a short professional response draft (under 150 words)
3. Does this reply need human approval before sending? (yes/no)

Respond in this exact JSON format:
{
  "classification": "...",
  "draft": "...",
  "needsApproval": true/false
}`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  await logUsage('analyze_reply', params.leadId, response.usage.input_tokens, response.usage.output_tokens);

  try {
    const parsed = JSON.parse(text);
    return {
      classification: parsed.classification ?? 'unclassified',
      draft: parsed.draft ?? '',
      needsApproval: parsed.needsApproval ?? true,
    };
  } catch {
    return { classification: 'unclassified', draft: '', needsApproval: true };
  }
}

/**
 * Improve a manually composed email draft.
 * Called ONLY when user clicks "Improve with AI". Never automatic.
 * Preserves {{variable}} placeholders. Max 400 tokens.
 */
export async function improveEmailDraft(params: {
  leadId: string;
  body: string;
  companyName: string;
  country: string;
  category: string;
}): Promise<string> {
  const client = await getClient();

  const prompt = `Improve this pharmaceutical sales email. Keep it under 180 words. Preserve all {{variable}} placeholders exactly as-is — do not change or remove them.

Lead: ${params.companyName}, ${params.country} — ${params.category}

Original email:
${params.body}

Return ONLY the improved email body. No preamble, no explanation, no sign-off label.`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  await logUsage('personalized_email', params.leadId, response.usage.input_tokens, response.usage.output_tokens);
  return text;
}

/**
 * Draft a reply to an inbound lead email.
 * Only call when classification is interested / pricing_query / cert_query / shipping_query / unclassified.
 * NEVER call for not_interested.
 */
export async function draftReplyEmail(params: {
  leadId: string;
  replyBody: string;
  classification: string;
  companyName: string;
  country: string;
  category: string;
  productContext?: string;
}): Promise<string> {
  const client = await getClient();

  const hints: Record<string, string> = {
    interested: 'They expressed interest — offer to schedule a call or send a product catalog.',
    pricing_query: 'They asked about pricing — acknowledge and offer to send a formal quote.',
    certificate_query: 'They asked about certifications/compliance — acknowledge and offer relevant documentation.',
    shipping_query: 'They asked about shipping/delivery — acknowledge and offer to share logistics details.',
    unclassified: 'Respond professionally and ask how you can help them specifically.',
  };
  const hint = hints[params.classification] ?? 'Respond professionally and offer a clear next step.';

  const productSection = params.productContext
    ? `\nProduct context: ${params.productContext}`
    : '';

  const prompt = `You are a pharmaceutical sales executive replying to an inbound inquiry.

Lead: ${params.companyName} (${params.country}) — ${params.category}
Their message: "${params.replyBody.slice(0, 600)}"${productSection}

Task: ${hint}

Write a professional reply (under 120 words):
- Acknowledge their specific message directly
- Provide the appropriate next step
- Be concise and direct — no filler phrases
- Do NOT invent pricing, specs, or certifications
- End with one clear call to action`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  await logUsage('draft_response', params.leadId, response.usage.input_tokens, response.usage.output_tokens);
  return text;
}

/**
 * Draft a response to a specific question (pricing, MOQ, certificates, shipping).
 * Only call when the reply is classified as a query type.
 */
export async function draftLeadResponse(params: {
  leadId: string;
  question: string;
  context: string;
}): Promise<string> {
  const client = await getClient();

  const prompt = `You are a pharmaceutical sales executive responding to a lead inquiry.

Context: ${params.context}
Question from lead: "${params.question}"

Write a professional, concise response (under 150 words). Be specific. Do not guess pricing or technical details not provided.`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  await logUsage('draft_response', params.leadId, response.usage.input_tokens, response.usage.output_tokens);
  return text;
}
