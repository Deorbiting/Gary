# Gary

AI agent for marketing & go-to-market. Like Claude Code, but for growth.

```
 ██████╗  █████╗ ██████╗ ██╗   ██╗
██╔════╝ ██╔══██╗██╔══██╗╚██╗ ██╔╝
██║  ███╗███████║██████╔╝ ╚████╔╝
██║   ██║██╔══██║██╔══██╗  ╚██╔╝
╚██████╔╝██║  ██║██║  ██║   ██║
 ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝
```

## What is Gary?

Gary is an open-source CLI agent that helps you with marketing and go-to-market tasks. It connects to your marketing platforms, runs research, writes copy, audits funnels, and executes strategy -- all from your terminal.

Think of it as having a senior marketing hire that can:
- Audit your SEO and give prioritized fixes
- Write landing page copy grounded in your product context
- Analyze competitor positioning and find gaps
- Plan launch strategies with specific channel recommendations
- Optimize conversion funnels with data-backed suggestions
- Research market trends and benchmark data
- Connect to your analytics, ads, email, and CRM platforms

## Installation

### Prerequisites

- [Bun](https://bun.sh) v1.0+ (the JavaScript runtime)
- At least one LLM API key (OpenAI, Anthropic, Google, xAI, or use Ollama for free local models)

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/deorbiting/gary.git
cd gary

# 2. Install dependencies
bun install

# 3. Set up your API keys
cp env.example .env
```

Open `.env` and add at minimum one LLM key:

```bash
# Pick one (or more):
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AI...
```

Optionally add keys for your marketing platforms (analytics, SEO, ads, email, CRM, payments). See `env.example` for the full list.

### Run

```bash
bun run start
```

Or in watch mode during development:

```bash
bun run dev
```

## Usage

Gary is an interactive CLI agent. Type your marketing question or task and press Enter. Gary will use its tools and skills to research, analyze, and execute.

### Example prompts

```
Audit my landing page at https://example.com and suggest improvements
Write a cold email sequence for a B2B SaaS targeting CFOs
What are the top 10 keywords my competitor ranks for that I don't?
Create a launch strategy for a new feature targeting enterprise users
Analyze my signup funnel and find the biggest drop-off points
```

### Slash Commands

Type `/` to see autocomplete suggestions. Available commands:

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/model` | Switch LLM provider and model |
| `/tools` | List all available tools |
| `/skills` | List all loaded marketing skills |
| `/config` | Show current configuration |
| `/context` | Show conversation context stats |
| `/mcp` | Manage MCP (Model Context Protocol) servers |
| `/clear` | Clear conversation history |
| `/exit` | Exit Gary |

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Submit query |
| `Escape` | Cancel current operation / close overlay |
| `Ctrl+C` | Cancel or exit |
| `Up/Down` | Navigate input history |
| `Tab` | Accept autocomplete suggestion |

## Multi-Provider LLM Support

Gary supports 8 LLM providers. Switch anytime with `/model`:

| Provider | Models | Env Variable |
|----------|--------|-------------|
| OpenAI | gpt-5.2, gpt-4.1, etc. | `OPENAI_API_KEY` |
| Anthropic | claude-4.5-sonnet, claude-haiku, etc. | `ANTHROPIC_API_KEY` |
| Google | gemini-3-flash, gemini-2.5-pro, etc. | `GOOGLE_API_KEY` |
| xAI | grok-4-1, grok-4-1-fast, etc. | `XAI_API_KEY` |
| DeepSeek | deepseek-chat, deepseek-reasoner | `DEEPSEEK_API_KEY` |
| Moonshot | kimi-k2, etc. | `MOONSHOT_API_KEY` |
| OpenRouter | Any model on openrouter.ai | `OPENROUTER_API_KEY` |
| Ollama | Any local model | `OLLAMA_BASE_URL` |

## Marketing Skills (32 built-in)

Gary ships with 32 marketing skills that provide specialized workflows and best practices:

| Category | Skills |
|----------|--------|
| **SEO** | seo-audit, ai-seo, programmatic-seo, site-architecture, schema-markup |
| **Copy & Content** | copywriting, copy-editing, cold-email, email-sequence, social-content, content-strategy |
| **CRO** | page-cro, signup-flow-cro, onboarding-cro, form-cro, popup-cro, paywall-upgrade-cro |
| **Ads** | paid-ads, ad-creative |
| **Analytics** | analytics-tracking, ab-test-setup |
| **Strategy** | marketing-ideas, marketing-psychology, launch-strategy, pricing-strategy, competitor-alternatives, product-marketing-context |
| **Growth** | free-tool-strategy, referral-program, churn-prevention |
| **Sales** | revops, sales-enablement |

Skills are loaded automatically. Use `/skills` to see all available skills.

### Adding Custom Skills

Create a `SKILL.md` file in any of these locations:

```
.gary/skills/<skill-name>/SKILL.md        # Project-level
~/.gary/skills/<skill-name>/SKILL.md       # User-level (all projects)
.agents/skills/<skill-name>/SKILL.md       # Compatible with npx skills add
```

Each `SKILL.md` has YAML frontmatter with `name` and `description`, followed by markdown instructions that guide Gary's behavior when the skill is activated.

## Platform Integrations

Connect to your marketing stack via API keys in `.env`:

| Category | Platforms |
|----------|-----------|
| **Analytics** | GA4, PostHog, Mixpanel, Amplitude |
| **SEO** | Ahrefs, SEMrush, Google Search Console |
| **Ads** | Google Ads, Meta Ads, LinkedIn Ads, TikTok Ads |
| **Email** | Mailchimp, Klaviyo, Resend, SendGrid |
| **CRM** | HubSpot, Intercom |
| **Payments** | Stripe, Paddle |
| **Search** | Exa, Perplexity, Tavily |

## MCP (Model Context Protocol)

Gary supports MCP servers for extending its capabilities with external tools. Manage servers with `/mcp` or configure them in `.gary/mcp.json`:

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@some/mcp-server"],
      "env": { "API_KEY": "..." }
    }
  }
}
```

Config locations (project-level overrides user-level):
- `.gary/mcp.json` (project)
- `~/.gary/mcp.json` (user)

## Product Context

Gary reads your product marketing context from `.agents/product-marketing-context.md` to personalize all advice. Run the `product-marketing-context` skill to set this up -- it will interview you about your product, audience, positioning, and competitors, then generate the context file.

## Built-in Tools

| Tool | Description |
|------|-------------|
| `marketing_search` | Query connected marketing platforms (analytics, SEO, ads, email, CRM) |
| `web_search` | Research competitors, trends, benchmarks via Exa/Perplexity/Tavily |
| `web_fetch` | Read and analyze any web page (HTML to markdown) |
| `browser` | Audit live websites with Playwright (screenshots, interaction) |
| `read_file` | Read local files for analysis |
| `write_file` | Create marketing assets, reports, documents |
| `edit_file` | Modify existing files |
| `skill` | Run specialized marketing workflows |

## Architecture

```
src/
├── agent/          # Core agent loop, prompts, scratchpad
├── model/          # Multi-provider LLM abstraction
├── tools/
│   ├── marketing/  # Marketing platform integrations
│   ├── search/     # Web search (Exa/Tavily/Perplexity)
│   ├── browser/    # Playwright web scraping
│   ├── fetch/      # Web page reader
│   └── filesystem/ # File operations
├── skills/         # 32 built-in + custom skill discovery
├── mcp/            # MCP client and config management
├── commands/       # Slash command system
├── components/     # Terminal UI components
├── controllers/    # Agent runner, model selection, input history
└── utils/          # Config, caching, tokens, logging
```

## Configuration

| Path | Purpose |
|------|---------|
| `.env` | API keys for LLMs and marketing platforms |
| `.gary/settings.json` | Model preferences, tool limits |
| `.gary/mcp.json` | MCP server definitions |
| `.gary/messages/` | Persisted chat history |
| `.gary/cache/` | Tool result cache |
| `.agents/product-marketing-context.md` | Your product context |
| `SOUL.md` | Gary's personality and marketing philosophy |

## Development

```bash
bun run dev          # Watch mode
bun run typecheck    # Type checking
bun test             # Run tests
```

## License

MIT

## Credits

- Agent architecture adapted from [Dexter](https://github.com/virattt/dexter) by [Virat Singh](https://github.com/virattt) (MIT)
- Marketing skills by [Corey Haines](https://github.com/coreyhaines31/marketingskills) (MIT)
- TUI framework: [pi-tui](https://github.com/nicknisi/pi-tui) by Mario Zechner
