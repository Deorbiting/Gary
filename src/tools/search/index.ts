/**
 * Rich description for the web_search tool.
 * Used in the system prompt to guide the LLM on when and how to use this tool.
 */
export const WEB_SEARCH_DESCRIPTION = `
Search the web for current information on any topic. Returns relevant search results with URLs and content snippets.

## When to Use

- Competitor research and analysis
- Industry trends, market sizing, benchmark data
- Factual questions about companies, products, or people
- Current events, product launches, funding announcements
- Technology updates, platform changes, algorithm updates
- Verifying claims about market state (pricing, features, availability)
- Research on topics outside of structured marketing platform data

## When NOT to Use

- Pure conceptual/definitional questions ("What is CRO?")

## Usage Notes

- Provide specific, well-formed search queries for best results
- Returns up to 5 results with URLs and content snippets
`.trim();

export { tavilySearch } from './tavily.js';
export { exaSearch } from './exa.js';
export { perplexitySearch } from './perplexity.js';
