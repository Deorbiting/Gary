/**
 * Slash command system for Gary CLI.
 *
 * Provides a registry of / commands similar to Claude Code.
 * Commands are executed before agent processing when user input starts with /.
 */
import { existsSync, readFileSync } from 'fs';
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

const helpCommand: SlashCommand = {
  name: 'help',
  description: 'Show available commands',
  execute: () => {
    const lines = [
      'Available commands:',
      '',
      ...commands.map((cmd) => `  /${cmd.name.padEnd(14)} ${cmd.description}`),
      '',
      'Type a message without / to chat with Gary.',
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
  helpCommand,
  clearCommand,
  modelCommand,
  toolsCommand,
  skillsCommand,
  configCommand,
  contextCommand,
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
