# Repository Guidelines

- Repo: https://github.com/yourusername/gary
- Gary is a CLI-based AI agent for marketing and go-to-market, built with TypeScript, pi-tui (React for CLI), and LangChain.

## Project Structure

- Source code: `src/`
  - Agent core: `src/agent/` (agent loop, prompts, scratchpad, token counting, types)
  - CLI interface: `src/cli.ts` (pi-tui/React), entry point: `src/index.tsx`
  - Components: `src/components/` (TUI components)
  - Hooks: `src/hooks/` (React hooks for agent runner, model selection, input history)
  - Model/LLM: `src/model/llm.ts` (multi-provider LLM abstraction)
  - Tools: `src/tools/` (marketing tools, web search, browser, skill tool)
  - Marketing tools: `src/tools/marketing/` (SEO, analytics, ads, email, CRM meta-tools)
  - Search tools: `src/tools/search/` (Exa preferred, Tavily fallback)
  - Browser: `src/tools/browser/` (Playwright-based web scraping)
  - Skills: `src/skills/` (SKILL.md-based extensible marketing workflows)
  - Utils: `src/utils/` (env, config, caching, token estimation, markdown tables)
  - Evals: `src/evals/` (evaluation runner)
- Config: `.gary/settings.json` (persisted model/provider selection)
- Environment: `.env` (API keys; see `env.example`)
- Scripts: `scripts/release.sh`

## Build, Test, and Development Commands

- Runtime: Bun (primary). Use `bun` for all commands.
- Install deps: `bun install`
- Run: `bun run start` or `bun run src/index.tsx`
- Dev (watch mode): `bun run dev`
- Type-check: `bun run typecheck`
- Tests: `bun test`
- CI runs `bun run typecheck` and `bun test` on push/PR.

## Coding Style & Conventions

- Language: TypeScript (ESM, strict mode). JSX via React (pi-tui for CLI rendering).
- Prefer strict typing; avoid `any`.
- Keep files concise; extract helpers rather than duplicating code.
- Add brief comments for tricky or non-obvious logic.
- Do not add logging unless explicitly asked.
- Do not create README or documentation files unless explicitly asked.

## LLM Providers

- Supported: OpenAI (default), Anthropic, Google, xAI (Grok), OpenRouter, Ollama (local).
- Default model: `gpt-5.2`. Provider detection is prefix-based (`claude-` -> Anthropic, `gemini-` -> Google, etc.).
- Fast models for lightweight tasks: see `FAST_MODELS` map in `src/model/llm.ts`.
- Users switch providers/models via `/model` command in the CLI.

## Tools

- `marketing_search`: primary tool for marketing data queries (analytics, SEO, ad performance). Delegates to configured platform APIs.
- `web_search`: general web search (Exa if `EXASEARCH_API_KEY` set, else Tavily if `TAVILY_API_KEY` set).
- `web_fetch`: fetch and parse web pages for analysis.
- `browser`: Playwright-based web scraping for auditing pages, checking competitors, etc.
- `skill`: invokes SKILL.md-defined workflows (e.g., SEO audit, funnel CRO, copywriting).
- `read_file` / `write_file` / `edit_file`: file operations for creating marketing assets.
- Tool registry: `src/tools/registry.ts`. Tools are conditionally included based on env vars.

## Skills

- Skills live as `SKILL.md` files with YAML frontmatter (`name`, `description`) and markdown body (instructions).
- Built-in skills loaded from `src/skills/`.
- User skills from `~/.gary/skills/`.
- Project skills from `./.gary/skills/`.
- Compatible with skills from skills.sh (e.g., `npx skills add coreyhaines31/marketingskills`).
- Skills are exposed to the LLM as metadata in the system prompt; the LLM invokes them via the `skill` tool.

## Agent Architecture

- Agent loop: `src/agent/agent.ts`. Iterative tool-calling loop with configurable max iterations (default 10).
- Scratchpad: `src/agent/scratchpad.ts`. Single source of truth for all tool results within a query.
- Context management: Anthropic-style. Full tool results kept in context; oldest results cleared when token threshold exceeded.
- Final answer: generated directly when the agent has sufficient data (no tools bound).
- Events: agent yields typed events for real-time UI updates.

## Environment Variables

- LLM keys: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `XAI_API_KEY`, `OPENROUTER_API_KEY`
- Ollama: `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434`)
- Search: `EXASEARCH_API_KEY` (preferred), `TAVILY_API_KEY` (fallback)
- Tracing: `LANGSMITH_API_KEY`, `LANGSMITH_ENDPOINT`, `LANGSMITH_PROJECT`, `LANGSMITH_TRACING`
- Marketing platforms: See `env.example` for the full list of supported integrations.
- Never commit `.env` files or real API keys.

## Version & Release

- Version format: CalVer `YYYY.M.D` (no zero-padding). Tag prefix: `v`.
- Release script: `bash scripts/release.sh [version]` (defaults to today's date).
- Do not push or publish without user confirmation.

## Security

- API keys stored in `.env` (gitignored). Users can also enter keys interactively via the CLI.
- Config stored in `.gary/settings.json` (gitignored).
- Never commit or expose real API keys, tokens, or credentials.
