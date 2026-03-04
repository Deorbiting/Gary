import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callLlm } from '../../model/llm.js';
import { extractTextContent } from '../../utils/ai-message.js';

/**
 * Rich description injected into the system prompt.
 */
export const MARKETING_SEARCH_DESCRIPTION = `Primary tool for marketing data queries. Use this for:
- SEO data: rankings, backlinks, domain authority, keyword research, site audits
- Analytics: traffic, pageviews, sessions, bounce rate, conversion data
- Ad performance: impressions, clicks, CTR, CPC, ROAS, spend
- Email metrics: open rates, click rates, deliverability, list health
- Social media: engagement, followers, reach, impressions
- CRM data: leads, pipeline, deal stages, customer lifecycle

Call marketing_search ONCE with the full natural language query - it handles multi-source requests internally.
Do NOT break up queries into multiple tool calls when one call can handle the request.

Examples:
- "Get SEO rankings for acme.com for the keyword 'project management software'"
- "What's the traffic trend for acme.com over the last 30 days?"
- "Show me Google Ads performance for campaign 'Spring Launch'"
- "Pull email open rates for last month's newsletter campaigns"`;

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
            message:
              'No marketing platform API keys are configured. To use marketing_search, add API keys to your .env file. See env.example for supported platforms.',
            supported_platforms: [
              'GA4 (GA4_ACCESS_TOKEN)',
              'Google Search Console (GSC_ACCESS_TOKEN)',
              'Google Ads (GOOGLE_ADS_API_KEY)',
              'Meta Ads (META_ADS_ACCESS_TOKEN)',
              'Ahrefs (AHREFS_API_KEY)',
              'SEMrush (SEMRUSH_API_KEY)',
              'Mailchimp (MAILCHIMP_API_KEY)',
              'HubSpot (HUBSPOT_API_KEY)',
              'PostHog (POSTHOG_API_KEY)',
              'Stripe (STRIPE_API_KEY)',
            ],
            tip: 'You can still use web_search and browser tools to research marketing topics, audit websites, and gather competitive intelligence without API keys.',
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
