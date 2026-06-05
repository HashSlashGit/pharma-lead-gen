import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import Product from '@/lib/models/Product';
import Campaign from '@/lib/models/Campaign';
import Lead from '@/lib/models/Lead';
import EmailLog from '@/lib/models/EmailLog';
import Reply from '@/lib/models/Reply';
import NoReplyLead from '@/lib/models/NoReplyLead';

// All sample records are identified by source: 'sample' (leads)
// or name prefix '[SAMPLE]' (products, campaigns).
// The reset route uses these same markers — never touches real data.

export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  await connectDB();

  // Idempotency — require explicit reset before re-seeding
  const existing = await Lead.countDocuments({ source: 'sample' });
  if (existing > 0) {
    return NextResponse.json({
      alreadySeeded: true,
      message: `Found ${existing} sample lead(s). Use "Reset sample data" first before re-seeding.`,
    });
  }

  // ── Products (3) ──────────────────────────────────────────────────────
  const products = await Product.insertMany([
    {
      name: '[SAMPLE] Paracetamol 500mg Tablets',
      category: 'Analgesic',
      description: 'Fast-acting pain relief tablet. WHO-GMP certified. OTC.',
      pricing: '$12.00 / box of 100 tablets',
      moq: '100 boxes',
      certifications: ['WHO-GMP', 'ISO 9001'],
      shippingDetails: 'Ships within 5–7 business days. No cold chain required.',
      approvedClaims: ['Relieves mild to moderate pain', 'Reduces fever'],
      restrictedClaims: ['Do not claim treatment for chronic conditions'],
    },
    {
      name: '[SAMPLE] Amoxicillin 250mg Capsules',
      category: 'Antibiotic',
      description: 'Broad-spectrum penicillin antibiotic. Prescription only.',
      pricing: '$25.00 / box of 50 capsules',
      moq: '50 boxes',
      certifications: ['WHO-GMP', 'FDA Registered'],
      shippingDetails: 'Ships within 7–10 business days. Temperature-controlled packaging.',
      approvedClaims: ['Treats bacterial infections', 'For use under physician prescription'],
      restrictedClaims: ['Do not claim effectiveness against viral infections'],
    },
    {
      name: '[SAMPLE] Vitamin C 1000mg Effervescent',
      category: 'Supplement',
      description: 'High-dose effervescent Vitamin C tablets. OTC. Halal certified.',
      pricing: '$8.00 / tube of 20 tablets',
      moq: '200 tubes',
      certifications: ['ISO 22000', 'Halal Certified'],
      shippingDetails: 'Ships within 3–5 business days. Keep in dry storage.',
      approvedClaims: ['Supports immune function', 'Antioxidant'],
      restrictedClaims: ['Do not claim treatment or cure of any disease'],
    },
  ]);

  // ── Campaign (1) ──────────────────────────────────────────────────────
  const [campaign] = await Campaign.insertMany([
    {
      name: '[SAMPLE] Southeast Asia Pharma Outreach',
      targetCountry: 'Malaysia',
      targetCategory: 'Pharmacy',
      status: 'active',
      emailsSent: 0,
      replies: 0,
    },
  ]);

  // ── Leads (5) — covering all meaningful UI states ────────────────────
  const leads = await Lead.insertMany([
    {
      // Qualified: ready for outreach, high score
      companyName: '[SAMPLE] Al-Shifa Pharmacy LLC',
      country: 'UAE',
      city: 'Dubai',
      category: 'Pharmacy',
      email: 'procurement@alshifa-sample.com',
      phone: '+971-4-000-0001',
      website: 'https://alshifa-sample.com',
      source: 'sample',
      status: 'qualified',
      score: 90,
      aiProcessed: false,
      followUpCount: 0,
      notes: '[SAMPLE_DATA] High-score pharmacy in UAE. Draft email ready to review.',
    },
    {
      // Contacted: email sent, reply received with pricing query
      companyName: '[SAMPLE] MediGlobe Distribution',
      country: 'Pakistan',
      city: 'Karachi',
      category: 'Pharmaceutical Distributor',
      email: 'orders@mediglobe-sample.com',
      website: 'https://mediglobe-sample.com',
      source: 'sample',
      status: 'contacted',
      score: 80,
      aiProcessed: false,
      followUpCount: 1,
      lastContactedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      notes: '[SAMPLE_DATA] Distributor — replied with pricing query. AI draft awaiting approval.',
    },
    {
      // Needs review: low score, no website/phone, manual review needed
      companyName: '[SAMPLE] HealthFirst Medical Centre',
      country: 'Malaysia',
      city: 'Kuala Lumpur',
      category: 'Clinic',
      email: 'supply@healthfirst-sample.com',
      source: 'sample',
      status: 'needs_review',
      score: 55,
      aiProcessed: false,
      followUpCount: 0,
      notes: '[SAMPLE_DATA] Clinic with email only — score 55, pending manual review.',
    },
    {
      // No response: 3 follow-ups exhausted, archived
      companyName: '[SAMPLE] Generic Pharma Supplies',
      country: 'India',
      city: 'Mumbai',
      category: 'Wholesale',
      phone: '+91-22-0000-0004',
      source: 'sample',
      status: 'no_response',
      score: 30,
      aiProcessed: false,
      followUpCount: 3,
      lastContactedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      notes: '[SAMPLE_DATA] Low-score wholesale lead — no email, no reply, archived.',
    },
    {
      // Warm: interested reply received, awaiting draft generation
      companyName: '[SAMPLE] CarePoint Hospital Group',
      country: 'Saudi Arabia',
      city: 'Riyadh',
      category: 'Hospital',
      email: 'pharma@carepoint-sample.com',
      phone: '+966-11-000-0005',
      website: 'https://carepoint-sample.com',
      source: 'sample',
      status: 'warm',
      score: 85,
      aiProcessed: true,
      followUpCount: 1,
      lastContactedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      notes: '[SAMPLE_DATA] Warm hospital group — replied with interest.',
    },
  ]);

  const [lead1, lead2, lead3, lead4, lead5] = leads;

  // ── Email Logs ────────────────────────────────────────────────────────

  // 2 pending initial drafts (the "draft emails" from the spec)
  await EmailLog.insertMany([
    {
      leadId: lead1._id,
      campaignId: campaign._id,
      type: 'initial',
      subject: '[SAMPLE] Premium Pharmaceutical Products — Partnership Opportunity',
      body: `Dear Procurement Team,\n\nI hope this message finds you well. We are a GMP-certified pharmaceutical manufacturer specialising in analgesics, antibiotics, and health supplements.\n\nOur flagship product, Paracetamol 500mg, is available from 100 boxes MOQ at $12.00/box. We hold WHO-GMP and ISO 9001 certifications.\n\nWould you be open to a brief call this week to discuss your supply requirements?\n\nBest regards,\nSales Team\n\n[SAMPLE_DATA]`,
      status: 'pending',
    },
    {
      leadId: lead3._id,
      type: 'initial',
      subject: '[SAMPLE] Healthcare Supply Partnership — HealthFirst Medical Centre',
      body: `Dear Supply Team,\n\nWe specialise in supplying clinics and medical centres with essential pharmaceuticals and OTC supplements.\n\nOur Vitamin C 1000mg Effervescent (Halal certified) and Paracetamol lines are widely used across Southeast Asian clinics.\n\nI would love to share our product catalogue. Would next week work for a quick call?\n\nBest regards,\nSales Team\n\n[SAMPLE_DATA]`,
      status: 'pending',
    },
  ]);

  // Sent email for lead2 (contextual — the email the pricing reply is linked to)
  const [sentLog] = await EmailLog.insertMany([
    {
      leadId: lead2._id,
      type: 'initial',
      subject: '[SAMPLE] Pharmaceutical Distributor Partnership — MediGlobe',
      body: `Dear Orders Team,\n\nWe supply pharmaceutical distributors across South Asia with WHO-GMP certified products.\n\nOur Amoxicillin 250mg Capsules (MOQ 50 boxes) and Paracetamol 500mg are in active demand across the region.\n\nOpen to discussing pricing and volume terms at your convenience.\n\nBest regards,\nSales Team\n\n[SAMPLE_DATA]`,
      status: 'sent',
      sentAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    },
  ]);

  // ── Replies (2) ───────────────────────────────────────────────────────

  // Reply 1: pricing query from lead2 with an AI draft ready for approval
  const aiDraftText = `Thank you for your interest in our Amoxicillin 250mg Capsules.\n\nWe would be happy to prepare a formal price list tailored to your quarterly order volume. To send you the most accurate quotation, could you confirm your expected units per shipment?\n\nI will have a formal quote to you within 24 hours of receiving your volume requirements.\n\nBest regards,\nSales Team`;

  const [reply1] = await Reply.insertMany([
    {
      leadId: lead2._id,
      emailLogId: sentLog._id,
      body: 'Hello, thank you for reaching out. We are interested in your Amoxicillin line. Could you please provide a formal price list and MOQ details? We typically order in large quantities on a quarterly basis.',
      classification: 'pricing_query',
      aiDraft: aiDraftText,
      needsApproval: true,
      status: 'draft_generated',
      aiDraftGenerated: true,
    },
  ]);

  // Draft reply email log linked back to reply1
  const [draftReplyLog] = await EmailLog.insertMany([
    {
      leadId: lead2._id,
      replyId: reply1._id,
      type: 'reply',
      subject: '[SAMPLE] Re: Amoxicillin Pricing — MediGlobe Distribution',
      body: aiDraftText,
      status: 'pending',
    },
  ]);
  await Reply.findByIdAndUpdate(reply1._id, { draftEmailLogId: draftReplyLog._id });

  // Reply 2: interested reply from lead5, no draft yet
  await Reply.insertMany([
    {
      leadId: lead5._id,
      body: 'We received your email and are very interested in establishing a supply partnership. We are particularly looking for analgesics and supplements for our hospital group. What is the next step?',
      classification: 'interested',
      needsApproval: true,
      status: 'pending',
      aiDraftGenerated: false,
    },
  ]);

  // ── No-Reply Lead (1) ─────────────────────────────────────────────────
  await NoReplyLead.create({
    leadId: lead4._id,
    companyName: lead4.companyName,
    email: lead4.email,
    country: lead4.country,
    category: lead4.category,
    originalStatus: 'contacted',
    finalStatus: 'no_response',
    followUpCount: 3,
    reason: 'No reply after 3 follow-ups over 14 days. [SAMPLE_DATA]',
    archivedAt: new Date(),
  });

  return NextResponse.json(
    {
      success: true,
      created: {
        products: products.length,
        campaigns: 1,
        leads: leads.length,
        emailLogs: 4,
        replies: 2,
        noReplyLeads: 1,
      },
    },
    { status: 201 }
  );
}
