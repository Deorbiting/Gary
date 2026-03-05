import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getSetting } from '../utils/config.js';

export interface CompanyProfile {
  companyName: string;
  website: string;
  industry: string;
  oneLiner: string;
  stage: string;
  targetAudience: string;
  companySize: string;
  painPoints: string;
  buyerPersonas: string;
  productDescription: string;
  differentiators: string;
  pricingModel: string;
  competitors: string;
  toneOfVoice: string;
  brandValues: string;
  thingsToAvoid: string;
  currentFocus: string;
  activeChannels: string[];
  keyMetrics: string;
  socialLinks: Record<string, string>;
}

function formatSection(profile: CompanyProfile, section: string): string {
  switch (section) {
    case 'basics':
      return [
        `**Company:** ${profile.companyName || 'Not set'}`,
        profile.website ? `**Website:** ${profile.website}` : null,
        profile.industry ? `**Industry:** ${profile.industry}` : null,
        profile.oneLiner ? `**Description:** ${profile.oneLiner}` : null,
        profile.stage ? `**Stage:** ${profile.stage}` : null,
      ].filter(Boolean).join('\n');

    case 'icp':
      return [
        '**Ideal Customer Profile**',
        profile.targetAudience ? `Target audience: ${profile.targetAudience}` : null,
        profile.companySize ? `Company size/range: ${profile.companySize}` : null,
        profile.painPoints ? `Pain points: ${profile.painPoints}` : null,
        profile.buyerPersonas ? `Buyer personas: ${profile.buyerPersonas}` : null,
      ].filter(Boolean).join('\n');

    case 'product':
      return [
        '**Product / Offering**',
        profile.productDescription ? `Description: ${profile.productDescription}` : null,
        profile.differentiators ? `Differentiators: ${profile.differentiators}` : null,
        profile.pricingModel ? `Pricing model: ${profile.pricingModel}` : null,
        profile.competitors ? `Competitors: ${profile.competitors}` : null,
      ].filter(Boolean).join('\n');

    case 'brand':
      return [
        '**Brand & Voice**',
        profile.toneOfVoice ? `Tone of voice: ${profile.toneOfVoice}` : null,
        profile.brandValues ? `Brand values: ${profile.brandValues}` : null,
        profile.thingsToAvoid ? `Things to avoid: ${profile.thingsToAvoid}` : null,
      ].filter(Boolean).join('\n');

    case 'strategy':
      return [
        '**Strategy**',
        profile.currentFocus ? `Current focus: ${profile.currentFocus}` : null,
        profile.activeChannels?.length ? `Active channels: ${profile.activeChannels.join(', ')}` : null,
        profile.keyMetrics ? `Key metrics: ${profile.keyMetrics}` : null,
      ].filter(Boolean).join('\n');

    case 'links': {
      const links = profile.socialLinks || {};
      const entries = Object.entries(links).filter(([, v]) => v);
      if (entries.length === 0) return '**Links:** None configured';
      return ['**Links**', ...entries.map(([k, v]) => `${k}: ${v}`)].join('\n');
    }

    default:
      return '';
  }
}

export const companyProfileTool = new DynamicStructuredTool({
  name: 'get_company_profile',
  description: 'Retrieve the company profile with ICP, product info, brand voice, strategy, and links.',
  schema: z.object({
    section: z
      .enum(['all', 'basics', 'icp', 'product', 'brand', 'strategy', 'links'])
      .default('all')
      .describe('Which section of the profile to retrieve. Use "all" for the complete profile.'),
  }),
  func: async ({ section }) => {
    const profile = getSetting<CompanyProfile | null>('companyProfile', null);

    if (!profile || !profile.companyName) {
      return 'No company profile configured. Ask the user for the details you need, or suggest they fill in their profile under Settings → Company.';
    }

    if (section === 'all') {
      const sections = ['basics', 'icp', 'product', 'brand', 'strategy', 'links'];
      return sections
        .map((s) => formatSection(profile, s))
        .filter((s) => s && !s.endsWith('Not set'))
        .join('\n\n');
    }

    return formatSection(profile, section);
  },
});

export const COMPANY_PROFILE_DESCRIPTION = `Retrieve the user's company profile containing their ICP, product info, brand voice, strategy, and social links.

**When to use:**
- Before writing copy, ad creative, emails, or content that should reflect the company's voice and positioning
- When the user asks about their ICP, target audience, or buyer personas
- When you need to tailor recommendations to their specific product, competitors, or pricing model
- When creating strategy recommendations and you need to know their current channels and goals

**When NOT to use:**
- For generic marketing questions that don't need company-specific context
- When the user has already provided the relevant context in their message

**Parameters:**
- section: "all" | "basics" | "icp" | "product" | "brand" | "strategy" | "links" — fetch specific sections to save tokens`;
