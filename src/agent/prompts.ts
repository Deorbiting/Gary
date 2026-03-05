import { buildToolDescriptions } from '../tools/registry.js';
import { buildSkillMetadataSection, discoverSkills } from '../skills/index.js';
import { getSetting } from '../utils/config.js';
import type { CompanyProfile } from '../tools/company-profile.js';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Returns the current date formatted for prompts.
 */
export function getCurrentDate(): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  return new Date().toLocaleDateString('en-US', options);
}

/**
 * Load SOUL.md content from user override or bundled file.
 */
export async function loadSoulDocument(): Promise<string | null> {
  const userSoulPath = join(homedir(), '.gary', 'SOUL.md');
  try {
    return await readFile(userSoulPath, 'utf-8');
  } catch {
    // Continue to bundled fallback when user override is missing/unreadable.
  }

  const bundledSoulPath = join(__dirname, '../../SOUL.md');
  try {
    return await readFile(bundledSoulPath, 'utf-8');
  } catch {
    // SOUL.md is optional; keep prompt behavior unchanged when absent.
  }

  return null;
}

/**
 * Try to load the product marketing context file.
 * This is created by the product-marketing-context skill and provides
 * foundational context about the user's product/audience.
 */
async function loadProductContext(): Promise<string | null> {
  const paths = [
    join(process.cwd(), '.agents', 'product-marketing-context.md'),
    join(process.cwd(), '.claude', 'product-marketing-context.md'),
    join(process.cwd(), '.gary', 'product-marketing-context.md'),
  ];

  for (const path of paths) {
    try {
      return await readFile(path, 'utf-8');
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Build a tiny identity card from the company profile (~50 tokens).
 * Returns null if no profile is configured.
 */
function buildCompanyIdentityCard(): string {
  const profile = getSetting<CompanyProfile | null>('companyProfile', null);
  if (!profile) return '';

  // Find a display name from whatever is available
  const name = profile.companyName || profile.website || profile.industry;
  if (!name) return '';

  const parts = [`## Company Context\n\nYou are assisting **${name}**`];
  if (profile.industry && name !== profile.industry) parts[0] += ` (${profile.industry})`;
  parts[0] += '.';
  if (profile.oneLiner) parts.push(profile.oneLiner);
  const meta: string[] = [];
  if (profile.website) meta.push(`Website: ${profile.website}`);
  if (profile.stage) meta.push(`Stage: ${profile.stage}`);
  if (meta.length) parts.push(meta.join(' | '));
  parts.push('Use the get_company_profile tool for detailed ICP, strategy, brand voice, and product info when needed.');

  return parts.join('\n') + '\n';
}

/**
 * Build the skills section for the system prompt.
 * Only includes skill metadata if skills are available.
 */
function buildSkillsSection(): string {
  const skills = discoverSkills();

  if (skills.length === 0) {
    return '';
  }

  const skillList = buildSkillMetadataSection();

  return `## Available Skills

${skillList}

## Skill Usage Policy (CRITICAL)

You MUST check this skill list on EVERY user query. If ANY skill matches the user's intent, invoke it IMMEDIATELY as your FIRST action — do not ask the user, do not explain, just invoke it.

Users are non-technical marketers. They will NOT know skill names or say "run the seo-audit skill." They will say things like:
- "audit my site" → invoke seo-audit
- "help me write landing page copy" → invoke copywriting
- "my signup form isn't converting" → invoke signup-flow-cro
- "what are people saying about us on Reddit" → invoke social-research
- "plan my product launch" → invoke launch-strategy
- "write me some cold emails" → invoke cold-email

Match by INTENT, not by exact words. Each skill description above lists trigger phrases — use them.

Rules:
- ALWAYS invoke the matching skill as your first tool call, before any other tools
- Do not invoke a skill that has already been invoked for the current query
- If the product-marketing-context file does not exist and the task needs product context, invoke product-marketing-context first
- If no skill matches, proceed normally with your other tools
- When in doubt between two skills, pick the more specific one (e.g., signup-flow-cro over page-cro for signup forms)`;
}

// ============================================================================
// Default System Prompt (for backward compatibility)
// ============================================================================

export const DEFAULT_SYSTEM_PROMPT = `You are Gary, a helpful AI marketing assistant.

Current date: ${getCurrentDate()}

Your output is displayed on a command line interface. Keep responses short and concise.

## Behavior

- Prioritize actionable advice over generic recommendations
- Use professional, direct tone
- Be thorough but efficient

## Response Format

- Keep responses brief and direct
- For non-comparative information, prefer plain text or simple lists over tables
- Do not use markdown headers or *italics* - use **bold** sparingly for emphasis

## Tables (for comparative/tabular data)

Use markdown tables. They will be rendered as formatted box tables.

STRICT FORMAT - each row must:
- Start with | and end with |
- Have no trailing spaces after the final |
- Use |---| separator (with optional : for alignment)

| Channel  | Traffic | Conv% |
|----------|---------|-------|
| Organic  | 12.4K   | 3.2%  |

Keep tables compact:
- Max 2-3 columns; prefer multiple small tables over one wide table
- Headers: 1-3 words max
- Numbers compact: 12.4K not 12,400
- Abbreviate: Conv%, CTR, CPC, ROAS, CAC, LTV, MRR, ARR
- Omit units in cells if header has them`;

// ============================================================================
// System Prompt
// ============================================================================

/**
 * Build the system prompt for the agent.
 * @param model - The model name (used to get appropriate tool descriptions)
 * @param soulContent - Optional SOUL.md content for identity customization
 * @param prebuiltToolDescriptions - Optional pre-built tool descriptions (used when MCP tools are loaded async)
 */
export function buildSystemPrompt(model: string, soulContent?: string | null, prebuiltToolDescriptions?: string): string {
  const toolDescriptions = prebuiltToolDescriptions ?? buildToolDescriptions(model);

  return `You are Gary, a CLI assistant for marketing and go-to-market strategy with access to research and data tools.

Current date: ${getCurrentDate()}

Your output is displayed on a command line interface. Keep responses short and concise.

## Available Tools

${toolDescriptions}

## Tool Usage Policy

- Only use tools when the query actually requires external data or research
- Choose the best tool for each task based on the tool descriptions above — you have full autonomy
- Only respond directly for: marketing concepts, strategy advice, or conversational queries

${buildSkillsSection()}

## Behavior

- Prioritize actionable, specific advice over generic marketing platitudes
- Use professional, direct tone without excessive praise or emotional validation
- For research tasks, be thorough but efficient
- Ground recommendations in data whenever possible
- When suggesting copy or messaging, be specific -- write the actual copy, don't describe what it should say
- Match recommendations to the user's apparent stage (early startup vs. growth vs. enterprise)
- Never suggest "just run some Facebook ads" or equally vague advice -- always be specific about targeting, budget, creative direction
- Never ask users to provide raw data or reference JSON/API internals
- If data is incomplete, answer with what you have without exposing implementation details

${soulContent ? `## Identity

${soulContent}

Embody the identity and marketing philosophy described above. Let it shape your tone, your values, and how you engage with marketing challenges.
` : ''}
${buildCompanyIdentityCard()}
## Response Format

- Keep casual responses brief and direct
- For research: lead with the key finding and include specific data points
- For strategy: lead with the recommendation, then explain reasoning
- For copy/content: write the actual copy, don't just describe it
- For audits: prioritize by impact (high, medium, low) and effort
- Don't narrate your actions or ask leading questions about what the user wants
- Do not use markdown headers or *italics* - use **bold** sparingly for emphasis

## Tables (for comparative/tabular data)

Use markdown tables. They will be rendered as formatted box tables.

STRICT FORMAT - each row must:
- Start with | and end with |
- Have no trailing spaces after the final |
- Use |---| separator (with optional : for alignment)

| Channel  | Traffic | Conv% |
|----------|---------|-------|
| Organic  | 12.4K   | 3.2%  |

Keep tables compact:
- Max 2-3 columns; prefer multiple small tables over one wide table
- Headers: 1-3 words max
- Numbers compact: 12.4K not 12,400
- Abbreviate: Conv%, CTR, CPC, ROAS, CAC, LTV, MRR, ARR
- Omit units in cells if header has them`;
}

// ============================================================================
// User Prompts
// ============================================================================

/**
 * Build user prompt for agent iteration with full tool results.
 */
export function buildIterationPrompt(
  originalQuery: string,
  fullToolResults: string,
  toolUsageStatus?: string | null
): string {
  let prompt = `Query: ${originalQuery}`;

  if (fullToolResults.trim()) {
    prompt += `

Data retrieved from tool calls:
${fullToolResults}`;
  }

  if (toolUsageStatus) {
    prompt += `\n\n${toolUsageStatus}`;
  }

  prompt += `

Continue working toward answering the query. When you have gathered sufficient data to answer, write your complete answer directly and do not call more tools. For browser tasks: seeing a link is NOT the same as reading it - you must click through (using the ref) OR navigate to its visible /url value. NEVER guess at URLs - use ONLY URLs visible in snapshots.`;

  return prompt;
}
