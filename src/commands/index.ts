/**
 * Slash command system for Gary CLI.
 *
 * Provides a registry of / commands similar to Claude Code.
 * Commands are executed before agent processing when user input starts with /.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { SlashCommand, CommandResult } from './types.js';
import { loadConfig, getSetting } from '../utils/config.js';
import { discoverSkills } from '../skills/registry.js';
import { getToolRegistry } from '../tools/registry.js';
import { loadMcpConfig, getEnabledServers } from '../mcp/config.js';
import { DEFAULT_MODEL } from '../model/llm.js';
import { getProviderById } from '../providers.js';

// ============================================================================
// Command implementations
// ============================================================================

// Detailed help entries for /help <command>
const commandHelp = new Map<string, string[]>([
  [
    'help',
    [
      '/help - Show available commands',
      '',
      'Displays a list of all slash commands with descriptions.',
      'Use /help <command> to see detailed usage and examples for a specific command.',
      '',
      'Examples:',
      '  /help',
      '  /help skills',
      '  /help model',
    ],
  ],
  [
    'skills',
    [
      '/skills - List installed marketing skills',
      '',
      'Gary ships with 32 built-in marketing skills covering SEO, copywriting,',
      'CRO, ads, analytics, and strategy. Skills provide specialized workflows.',
      '',
      'Examples:',
      '  Tell Gary: "Run the seo-audit skill on example.com"',
      '  Tell Gary: "Use the copywriting skill for my landing page"',
      '  Tell Gary: "Run product-marketing-context to set up my profile"',
    ],
  ],
  [
    'model',
    [
      '/model - Switch LLM provider and model',
      '',
      'Opens an interactive menu to select your AI provider and model.',
      'Gary supports OpenAI, Anthropic, Google, and other providers.',
      'Your selection is saved to .gary/settings.json.',
      '',
      'Examples:',
      '  /model                 Opens the provider selection menu',
      '  After selecting:       Choose from available models for that provider',
      '',
      'Supported providers include OpenAI (GPT-4o), Anthropic (Claude),',
      'Google (Gemini), and any OpenAI-compatible endpoint.',
    ],
  ],
  [
    'tools',
    [
      '/tools - List all loaded tools',
      '',
      'Shows built-in tools available to Gary and any MCP server tools.',
      'Tools are functions Gary can call to perform actions like web search,',
      'file operations, and API calls.',
      '',
      'Examples:',
      '  /tools                 List all available tools',
      '  Tell Gary: "Search the web for competitor analysis frameworks"',
      '  Tell Gary: "Read the file at ./landing-page.html"',
    ],
  ],
  [
    'mcp',
    [
      '/mcp - Manage MCP servers',
      '',
      'Opens the MCP (Model Context Protocol) server management menu.',
      'MCP servers extend Gary with additional tools and capabilities.',
      'Configuration is stored in .gary/mcp.json.',
      '',
      'Examples:',
      '  /mcp                   Opens the MCP server management menu',
      '  Add servers for:       Browser automation, database access, APIs',
      '  Tell Gary: "Use the browser tool to screenshot my landing page"',
    ],
  ],
  [
    'config',
    [
      '/config - Show current configuration',
      '',
      'Displays your current Gary settings including provider, model,',
      'and any custom configuration. Settings are stored in .gary/settings.json.',
      '',
      'Examples:',
      '  /config                Show all current settings',
      '  Edit .gary/settings.json directly for advanced configuration',
    ],
  ],
  [
    'init',
    [
      '/init - Run onboarding setup',
      '',
      'Launches the interactive onboarding flow to configure Gary.',
      'Sets up your provider, API keys, and initial preferences.',
      '',
      'Examples:',
      '  /init                  Start the onboarding wizard',
    ],
  ],
  [
    'context',
    [
      '/context - Show product marketing context status',
      '',
      'Displays whether a product marketing context file exists and its contents.',
      'The context file helps Gary understand your product, audience, and goals.',
      'Stored at .agents/product-marketing-context.md.',
      '',
      'Examples:',
      '  /context               Check if context is set up',
      '  Tell Gary: "Run the product-marketing-context skill"  to create one',
    ],
  ],
  [
    'clear',
    [
      '/clear - Clear conversation history',
      '',
      'Resets the current conversation, giving you a fresh chat session.',
      'This does not delete your long-term chat history file.',
    ],
  ],
  [
    'exit',
    [
      '/exit - Exit Gary',
      '',
      'Closes the Gary CLI session immediately.',
    ],
  ],
  [
    'history',
    [
      '/history - Browse past conversations',
      '',
      'Shows the last 10 conversations from your chat history.',
      'Displays the timestamp and a preview of each user message.',
      'History is stored in .gary/messages/chat_history.json.',
    ],
  ],
  [
    'export',
    [
      '/export - Save last response to a markdown file',
      '',
      'Exports the most recent agent response to a markdown file.',
      'Optionally provide a custom filename.',
      '',
      'Examples:',
      '  /export                Save to gary-export-YYYY-MM-DD.md',
      '  /export my-audit.md   Save to my-audit.md',
    ],
  ],
  [
    'skill',
    [
      '/skill - Run a specific marketing skill',
      '',
      'Directly invoke a marketing skill by name with optional arguments.',
      'Without arguments, lists all available skills.',
      '',
      'Examples:',
      '  /skill                          List all skills',
      '  /skill seo-audit example.com    Audit SEO on example.com',
      '  /skill copywriting              Run the copywriting skill',
      '  /skill cold-email B2B CFOs      Write cold emails for B2B CFOs',
      '  /skill launch-strategy          Plan a product launch',
    ],
  ],
  [
    'tool',
    [
      '/tool - Run a specific tool directly',
      '',
      'Directly invoke a tool by name with optional arguments.',
      'Without arguments, lists all available tools.',
      '',
      'Examples:',
      '  /tool                                    List all tools',
      '  /tool web_search competitor analysis      Search the web',
      '  /tool web_fetch https://example.com       Fetch a web page',
      '  /tool browser https://example.com         Screenshot a site',
      '  /tool marketing_search GA4 traffic        Query analytics',
    ],
  ],
]);

const initCommand: SlashCommand = {
  name: 'init',
  description: 'Set up Gary (API keys, platforms, context)',
  execute: () => {
    return { type: 'ui-flow', flow: 'init' };
  },
};

const helpCommand: SlashCommand = {
  name: 'help',
  description: 'Show available commands',
  hasArgs: true,
  execute: (args) => {
    const trimmed = args.trim().toLowerCase().replace(/^\//, '');

    // If a specific command was requested, show detailed help
    if (trimmed) {
      const detail = commandHelp.get(trimmed);
      if (detail) {
        return { type: 'output', lines: detail };
      }
      return {
        type: 'output',
        lines: [
          `Unknown command: ${trimmed}`,
          '',
          'Type /help to see all available commands.',
        ],
      };
    }

    // Default: show command list with hint
    const lines = [
      'Available commands:',
      '',
      ...commands.map((cmd) => `  /${cmd.name.padEnd(14)} ${cmd.description}`),
      '',
      'Type a message without / to chat with Gary.',
      '',
      'Type /help <command> for detailed usage and examples.',
    ];
    return { type: 'output', lines };
  },
};

const clearCommand: SlashCommand = {
  name: 'clear',
  description: 'Clear conversation history',
  execute: () => {
    return { type: 'ui-flow', flow: 'clear' };
  },
};

const modelCommand: SlashCommand = {
  name: 'model',
  description: 'Switch LLM provider and model',
  execute: () => {
    return { type: 'ui-flow', flow: 'model' };
  },
};

const toolsCommand: SlashCommand = {
  name: 'tools',
  description: 'List all loaded tools',
  execute: () => {
    const model = getSetting('modelId', DEFAULT_MODEL);
    const registry = getToolRegistry(model);

    const lines = [
      `Built-in tools (${registry.length}):`,
      '',
      ...registry.map((t) => `  ${t.name.padEnd(20)} ${t.tool.description?.slice(0, 60) ?? ''}`),
    ];

    // Show MCP tools info
    const config = loadMcpConfig();
    const servers = getEnabledServers(config);
    const serverCount = Object.keys(servers).length;

    if (serverCount > 0) {
      lines.push('', `MCP servers configured: ${serverCount} (tools loaded at runtime)`);
      for (const [name, cfg] of Object.entries(servers)) {
        lines.push(`  ${name.padEnd(20)} ${cfg.command} ${(cfg.args ?? []).join(' ')}`);
      }
    }

    return { type: 'output', lines };
  },
};

const skillsCommand: SlashCommand = {
  name: 'skills',
  description: 'List installed marketing skills',
  execute: () => {
    const skills = discoverSkills();

    if (skills.length === 0) {
      return {
        type: 'output',
        lines: [
          'No skills installed.',
          '',
          'Install marketing skills:',
          '  npx skills add coreyhaines31/marketingskills',
        ],
      };
    }

    const lines = [
      `Installed skills (${skills.length}):`,
      '',
      ...skills.map((s) => `  ${s.name.padEnd(28)} ${s.description.slice(0, 50)}`),
    ];

    return { type: 'output', lines };
  },
};

const configCommand: SlashCommand = {
  name: 'config',
  description: 'Show current configuration',
  execute: () => {
    const config = loadConfig();
    const provider = getSetting('provider', 'openai');
    const modelId = getSetting('modelId', DEFAULT_MODEL);
    const providerDef = getProviderById(provider);

    const lines = [
      'Current configuration:',
      '',
      `  Provider:    ${providerDef?.displayName ?? provider}`,
      `  Model:       ${modelId}`,
      `  Config dir:  .gary/`,
      `  Settings:    .gary/settings.json`,
    ];

    // Show any extra settings
    const extraKeys = Object.keys(config).filter(
      (k) => !['provider', 'modelId', 'model'].includes(k)
    );
    if (extraKeys.length > 0) {
      lines.push('', '  Additional settings:');
      for (const key of extraKeys) {
        lines.push(`    ${key}: ${JSON.stringify(config[key])}`);
      }
    }

    return { type: 'output', lines };
  },
};

const contextCommand: SlashCommand = {
  name: 'context',
  description: 'Show product marketing context status',
  execute: () => {
    const contextPath = join(process.cwd(), '.agents', 'product-marketing-context.md');
    const exists = existsSync(contextPath);

    if (!exists) {
      return {
        type: 'output',
        lines: [
          'No product marketing context found.',
          '',
          'Create one by running the product-marketing-context skill:',
          '  Tell Gary: "Run the product-marketing-context skill"',
          '',
          `Expected location: ${contextPath}`,
        ],
      };
    }

    const content = readFileSync(contextPath, 'utf-8');
    const lineCount = content.split('\n').length;
    const wordCount = content.split(/\s+/).filter(Boolean).length;

    return {
      type: 'output',
      lines: [
        'Product marketing context:',
        '',
        `  File:    ${contextPath}`,
        `  Size:    ${lineCount} lines, ${wordCount} words`,
        '',
        'First 5 lines:',
        ...content.split('\n').slice(0, 5).map((l) => `  ${l}`),
      ],
    };
  },
};

const historyCommand: SlashCommand = {
  name: 'history',
  description: 'Browse past conversations',
  execute: () => {
    const historyPath = join(process.cwd(), '.gary', 'messages', 'chat_history.json');

    if (!existsSync(historyPath)) {
      return {
        type: 'output',
        lines: [
          'No conversation history found.',
          '',
          'Chat history will appear here after your first conversation.',
        ],
      };
    }

    try {
      const raw = readFileSync(historyPath, 'utf-8');
      const data: { messages: Array<{ timestamp: string; userMessage: string; agentResponse: string | null }> } =
        JSON.parse(raw);
      const entries = data.messages ?? [];

      if (entries.length === 0) {
        return {
          type: 'output',
          lines: ['No conversations yet. Start chatting with Gary!'],
        };
      }

      // Show last 10 entries (messages are stored newest-first)
      const recent = entries.slice(0, 10);

      const lines = [
        `Recent conversations (${Math.min(entries.length, 10)} of ${entries.length}):`,
        '',
      ];

      for (const entry of recent) {
        const date = new Date(entry.timestamp);
        const month = date.toLocaleString('en-US', { month: 'short' });
        const day = date.getDate();
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const ts = `${month} ${day}, ${hours}:${minutes}`;

        const preview =
          entry.userMessage.length > 60
            ? entry.userMessage.slice(0, 57) + '...'
            : entry.userMessage;

        lines.push(`  ${ts.padEnd(16)} ${preview}`);
      }

      return { type: 'output', lines };
    } catch {
      return {
        type: 'output',
        lines: ['Failed to read chat history. The file may be corrupted.'],
      };
    }
  },
};

const exportCommand: SlashCommand = {
  name: 'export',
  description: 'Save last response to a markdown file',
  hasArgs: true,
  execute: (args) => {
    const historyPath = join(process.cwd(), '.gary', 'messages', 'chat_history.json');

    if (!existsSync(historyPath)) {
      return {
        type: 'output',
        lines: ['No conversation history found. Nothing to export.'],
      };
    }

    try {
      const raw = readFileSync(historyPath, 'utf-8');
      const data: { messages: Array<{ timestamp: string; userMessage: string; agentResponse: string | null }> } =
        JSON.parse(raw);
      const entries = data.messages ?? [];

      if (entries.length === 0) {
        return {
          type: 'output',
          lines: ['No conversations to export.'],
        };
      }

      // Find the most recent entry with an agent response
      const lastWithResponse = entries.find((e) => e.agentResponse !== null);

      if (!lastWithResponse) {
        return {
          type: 'output',
          lines: ['No agent responses found to export.'],
        };
      }

      // Determine filename
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = (now.getMonth() + 1).toString().padStart(2, '0');
      const dd = now.getDate().toString().padStart(2, '0');
      const defaultName = `gary-export-${yyyy}-${mm}-${dd}.md`;

      const trimmedArgs = args.trim();
      const filename = trimmedArgs || defaultName;
      const filepath = join(process.cwd(), filename);

      // Build markdown content
      const dateStr = new Date(lastWithResponse.timestamp).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const content = [
        `# Gary Export - ${dateStr}`,
        '',
        `**Prompt:** ${lastWithResponse.userMessage}`,
        '',
        '---',
        '',
        lastWithResponse.agentResponse,
        '',
      ].join('\n');

      writeFileSync(filepath, content, 'utf-8');

      return {
        type: 'output',
        lines: [
          `Exported to ${filepath}`,
          '',
          `  Prompt:  ${lastWithResponse.userMessage.slice(0, 60)}${lastWithResponse.userMessage.length > 60 ? '...' : ''}`,
          `  Length:  ${lastWithResponse.agentResponse!.split(/\s+/).filter(Boolean).length} words`,
        ],
      };
    } catch {
      return {
        type: 'output',
        lines: ['Failed to export. Check file permissions and try again.'],
      };
    }
  },
};

const skillCommand: SlashCommand = {
  name: 'skill',
  description: 'Run a specific marketing skill',
  hasArgs: true,
  execute: (args) => {
    const trimmed = args.trim();

    // No args: list available skills
    if (!trimmed) {
      return skillsCommand.execute('');
    }

    // Parse skill name and optional arguments
    const spaceIdx = trimmed.indexOf(' ');
    const skillName = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
    const skillArgs = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();

    // Verify the skill exists
    const skills = discoverSkills();
    const match = skills.find(
      (s) => s.name === skillName || s.name === skillName.toLowerCase()
    );

    if (!match) {
      return {
        type: 'output',
        lines: [
          `Unknown skill: ${skillName}`,
          '',
          'Available skills:',
          ...skills.map((s) => `  ${s.name.padEnd(28)} ${s.description.slice(0, 50)}`),
          '',
          'Usage: /skill <name> [args]',
        ],
      };
    }

    // Build a targeted agent query
    const query = skillArgs
      ? `Run the ${match.name} skill on: ${skillArgs}`
      : `Run the ${match.name} skill`;

    return { type: 'agent-query', query };
  },
};

const toolCommand: SlashCommand = {
  name: 'tool',
  description: 'Run a specific tool directly',
  hasArgs: true,
  execute: (args) => {
    const trimmed = args.trim();

    // No args: list available tools
    if (!trimmed) {
      return toolsCommand.execute('');
    }

    // Parse tool name and arguments
    const spaceIdx = trimmed.indexOf(' ');
    const toolName = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
    const toolArgs = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();

    // Verify the tool exists
    const model = getSetting('modelId', DEFAULT_MODEL);
    const registry = getToolRegistry(model);
    const match = registry.find((t) => t.name === toolName);

    if (!match) {
      return {
        type: 'output',
        lines: [
          `Unknown tool: ${toolName}`,
          '',
          'Available tools:',
          ...registry.map((t) => `  ${t.name.padEnd(20)} ${t.tool.description?.slice(0, 60) ?? ''}`),
          '',
          'Usage: /tool <name> [args]',
        ],
      };
    }

    // Build a targeted agent query
    const query = toolArgs
      ? `Use the ${match.name} tool to: ${toolArgs}`
      : `Use the ${match.name} tool`;

    return { type: 'agent-query', query };
  },
};

const mcpCommand: SlashCommand = {
  name: 'mcp',
  description: 'Manage MCP servers',
  execute: () => {
    return { type: 'ui-flow', flow: 'mcp' };
  },
};

const exitCommand: SlashCommand = {
  name: 'exit',
  description: 'Exit Gary',
  execute: () => {
    process.exit(0);
  },
};

// ============================================================================
// Command registry
// ============================================================================

const commands: SlashCommand[] = [
  initCommand,
  helpCommand,
  clearCommand,
  modelCommand,
  skillCommand,
  toolCommand,
  toolsCommand,
  skillsCommand,
  configCommand,
  contextCommand,
  historyCommand,
  exportCommand,
  mcpCommand,
  exitCommand,
];

const commandMap = new Map(commands.map((cmd) => [cmd.name, cmd]));

/**
 * Check if input is a slash command.
 */
export function isSlashCommand(input: string): boolean {
  return input.startsWith('/');
}

/**
 * Parse and execute a slash command.
 * Returns null if the command is not recognized (falls through to agent).
 */
export async function executeCommand(input: string): Promise<CommandResult | null> {
  if (!input.startsWith('/')) return null;

  const withoutSlash = input.slice(1);
  const spaceIdx = withoutSlash.indexOf(' ');
  const name = spaceIdx === -1 ? withoutSlash : withoutSlash.slice(0, spaceIdx);
  const args = spaceIdx === -1 ? '' : withoutSlash.slice(spaceIdx + 1);

  const command = commandMap.get(name);
  if (!command) return null;

  return await command.execute(args);
}

/**
 * Get all registered commands (for autocomplete, etc.)
 */
export function getCommands(): SlashCommand[] {
  return [...commands];
}
