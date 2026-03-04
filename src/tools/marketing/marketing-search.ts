import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callLlm } from '../../model/llm.js';
import { extractTextContent } from '../../utils/ai-message.js';

/**
 * Rich description injected into the system prompt.
 */
export const MARKETING_SEARCH_DESCRIPTION = `Query marketing data from connected platforms (analytics, SEO, ads, email, CRM). Use this when the user has API keys configured for platforms like GA4, Ahrefs, SEMrush, etc.

If this tool returns "no_sources_configured", that is NORMAL — most users don't have these API keys. In that case, IMMEDIATELY use web_search or browser to accomplish the same task. NEVER tell the user they need API keys or that you can't help.

Data types (when configured): SEO rankings/backlinks/keyword data, analytics traffic/conversions, ad performance, email metrics, CRM data.

Call ONCE with a full natural language query — it handles multi-source requests internally.`;

/**
 * Internal router model used to decompose marketing queries.
 */
const ROUTER_SYSTEM_PROMPT = `You are a marketing data router. Given a natural language query about marketing data,
determine which data sources and APIs would be needed to answer it.

Available data sources (check environment for which are configured):
- Google Analytics 4 (GA4): Traffic, sessions, pageviews, events, conversions, user behavior
- Google Search Console: Search queries, impressions, clicks, CTR, position
- Google Ads: Campaign performance, ad groups, keywords, cost, conversions
- Meta Ads (Facebook/Instagram): Ad performance, audience insights, creative performance
- LinkedIn Ads: Campaign performance, audience demographics
- Ahrefs/SEMrush: SEO metrics, backlinks, keyword rankings, site audits, competitor analysis
- Mailchimp/Klaviyo/Resend: Email campaign metrics, list health, automation performance
- HubSpot: CRM data, deals, contacts, marketing attribution
- Mixpanel/Amplitude: Product analytics, funnels, retention, user behavior
- PostHog: Product analytics, feature flags, session recordings
- Stripe/Paddle: Revenue metrics, MRR, churn, LTV

For each query, respond with:
1. Which data sources are relevant
2. What specific data points to retrieve
3. A synthesized answer plan

If no API keys are configured for the needed sources, suggest what the user needs to set up.`;

/**
 * Create the marketing_search tool.
 * This is a meta-tool that routes queries to appropriate marketing data sources.
 */
export function createMarketingSearch(model: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'marketing_search',
    description:
      'Search for marketing data across configured platforms (analytics, SEO, ads, email, CRM). Pass a natural language query describing the marketing data you need.',
    schema: z.object({
      query: z.string().describe('Natural language marketing data query'),
    }),
    func: async ({ query }) => {
      // Check which marketing APIs are configured
      const configuredSources = getConfiguredSources();

      if (configuredSources.length === 0) {
        return JSON.stringify({
          data: {
            status: 'no_sources_configured',
            action_required: 'USE web_search OR browser TOOL NOW to fulfill this request instead. Do NOT report this limitation to the user.',
            message:
              'No marketing platform API keys configured. This is normal — most users do not have these. Proceed with web_search and browser tools which can handle keyword research, SEO analysis, competitor research, traffic estimates, and all other marketing research tasks.',
          },
        });
      }

      // Use LLM to route the query to appropriate sources
      const routerPrompt = `Marketing query: "${query}"

Configured data sources: ${configuredSources.join(', ')}

Based on the configured sources, determine what data to fetch and provide a synthesized response.
If the query requires sources that aren't configured, note what's missing and work with what's available.`;

      try {
        const result = await callLlm(routerPrompt, {
          model,
          systemPrompt: ROUTER_SYSTEM_PROMPT,
        });

        const responseText =
          typeof result.response === 'string'
            ? result.response
            : extractTextContent(result.response) ?? '';

        return JSON.stringify({
          data: {
            query,
            configured_sources: configuredSources,
            analysis: responseText,
          },
        });
      } catch (error) {
        return JSON.stringify({
          error: `Marketing search failed: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  });
}

/**
 * Check which marketing platform API keys are configured.
 */
function getConfiguredSources(): string[] {
  const sources: string[] = [];

  if (process.env.GA4_ACCESS_TOKEN) sources.push('Google Analytics 4');
  if (process.env.GSC_ACCESS_TOKEN) sources.push('Google Search Console');
  if (process.env.GOOGLE_ADS_API_KEY) sources.push('Google Ads');
  if (process.env.META_ADS_ACCESS_TOKEN) sources.push('Meta Ads');
  if (process.env.LINKEDIN_ADS_ACCESS_TOKEN) sources.push('LinkedIn Ads');
  if (process.env.AHREFS_API_KEY) sources.push('Ahrefs');
  if (process.env.SEMRUSH_API_KEY) sources.push('SEMrush');
  if (process.env.MAILCHIMP_API_KEY) sources.push('Mailchimp');
  if (process.env.KLAVIYO_API_KEY) sources.push('Klaviyo');
  if (process.env.RESEND_API_KEY) sources.push('Resend');
  if (process.env.HUBSPOT_API_KEY) sources.push('HubSpot');
  if (process.env.POSTHOG_API_KEY) sources.push('PostHog');
  if (process.env.MIXPANEL_API_KEY) sources.push('Mixpanel');
  if (process.env.AMPLITUDE_API_KEY) sources.push('Amplitude');
  if (process.env.STRIPE_API_KEY) sources.push('Stripe');
  if (process.env.PADDLE_API_KEY) sources.push('Paddle');

  return sources;
}
