/**
 * MCP (Model Context Protocol) configuration loader.
 *
 * Reads server definitions from .gary/mcp.json, matching the format
 * used by Claude Code's .mcp.json:
 *
 * {
 *   "mcpServers": {
 *     "server-name": {
 *       "command": "npx",
 *       "args": ["-y", "@some/mcp-server"],
 *       "env": { "API_KEY": "..." }
 *     }
 *   }
 * }
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { logger } from '../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface McpServerConfig {
  /** Command to spawn the MCP server process */
  command: string;
  /** Arguments for the command */
  args?: string[];
  /** Environment variables to set for the server process */
  env?: Record<string, string>;
  /** Working directory for the server process */
  cwd?: string;
  /** Whether this server is disabled */
  disabled?: boolean;
}

export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

// ============================================================================
// Config paths (project-level, then user-level)
// ============================================================================

const CONFIG_PATHS = [
  join(process.cwd(), '.gary', 'mcp.json'),
  join(homedir(), '.gary', 'mcp.json'),
];

// ============================================================================
// Public API
// ============================================================================

/**
 * Load MCP configuration by merging project-level and user-level configs.
 * Project-level servers take precedence over user-level servers with the same name.
 */
export function loadMcpConfig(): McpConfig {
  const merged: McpConfig = { mcpServers: {} };

  // Load in reverse order so project-level overrides user-level
  for (const configPath of [...CONFIG_PATHS].reverse()) {
    if (!existsSync(configPath)) continue;

    try {
      const raw = readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<McpConfig>;

      if (parsed.mcpServers && typeof parsed.mcpServers === 'object') {
        for (const [name, config] of Object.entries(parsed.mcpServers)) {
          if (isValidServerConfig(config)) {
            merged.mcpServers[name] = config;
          } else {
            logger.warn(`Invalid MCP server config "${name}" in ${configPath}`);
          }
        }
      }

      logger.info(`Loaded MCP config from ${configPath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to parse MCP config at ${configPath}: ${message}`);
    }
  }

  return merged;
}

/**
 * Get only the enabled (non-disabled) servers from config.
 */
export function getEnabledServers(config: McpConfig): Record<string, McpServerConfig> {
  return Object.fromEntries(
    Object.entries(config.mcpServers).filter(([, cfg]) => !cfg.disabled)
  );
}

// ============================================================================
// Config mutations (project-level .gary/mcp.json)
// ============================================================================

const PROJECT_CONFIG_PATH = join(process.cwd(), '.gary', 'mcp.json');

function loadProjectConfig(): McpConfig {
  if (!existsSync(PROJECT_CONFIG_PATH)) {
    return { mcpServers: {} };
  }
  try {
    const raw = readFileSync(PROJECT_CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<McpConfig>;
    return { mcpServers: parsed.mcpServers ?? {} };
  } catch {
    return { mcpServers: {} };
  }
}

function saveProjectConfig(config: McpConfig): void {
  const dir = dirname(PROJECT_CONFIG_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(PROJECT_CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Add or update an MCP server in the project config.
 */
export function saveMcpServerConfig(name: string, serverConfig: McpServerConfig): void {
  const config = loadProjectConfig();
  config.mcpServers[name] = serverConfig;
  saveProjectConfig(config);
}

/**
 * Remove an MCP server from the project config.
 */
export function removeMcpServer(name: string): boolean {
  const config = loadProjectConfig();
  if (!(name in config.mcpServers)) return false;
  delete config.mcpServers[name];
  saveProjectConfig(config);
  return true;
}

/**
 * Toggle an MCP server's disabled state in the project config.
 */
export function toggleMcpServer(name: string): boolean {
  const config = loadProjectConfig();
  const server = config.mcpServers[name];
  if (!server) return false;
  server.disabled = !server.disabled;
  saveProjectConfig(config);
  return true;
}

// ============================================================================
// Helpers
// ============================================================================

function isValidServerConfig(value: unknown): value is McpServerConfig {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.command === 'string' && obj.command.length > 0;
}
