import { StructuredToolInterface } from '@langchain/core/tools';
import { exaSearch, perplexitySearch, tavilySearch, WEB_SEARCH_DESCRIPTION } from './search/index.js';
import { skillTool, SKILL_TOOL_DESCRIPTION } from './skill.js';
import { webFetchTool, WEB_FETCH_DESCRIPTION } from './fetch/web-fetch.js';
import { browserTool, BROWSER_DESCRIPTION } from './browser/browser.js';
import { readFileTool, READ_FILE_DESCRIPTION } from './filesystem/read-file.js';
import { writeFileTool, WRITE_FILE_DESCRIPTION } from './filesystem/write-file.js';
import { editFileTool, EDIT_FILE_DESCRIPTION } from './filesystem/edit-file.js';
import { companyProfileTool, COMPANY_PROFILE_DESCRIPTION } from './company-profile.js';
import { discoverSkills } from '../skills/index.js';
import { McpClientManager, loadMcpConfig, getEnabledServers } from '../mcp/index.js';
import { logger } from '../utils/logger.js';

/**
 * A registered tool with its rich description for system prompt injection.
 */
export interface RegisteredTool {
  /** Tool name (must match the tool's name property) */
  name: string;
  /** The actual tool instance */
  tool: StructuredToolInterface;
  /** Rich description for system prompt (includes when to use, when not to use, etc.) */
  description: string;
}

// Singleton MCP client manager — lives for the process lifetime
let mcpManager: McpClientManager | null = null;

/**
 * Get the MCP client manager, connecting on first call.
 * Returns null if no MCP servers are configured.
 */
async function getMcpManager(): Promise<McpClientManager | null> {
  if (mcpManager) return mcpManager;

  const config = loadMcpConfig();
  const servers = getEnabledServers(config);

  if (Object.keys(servers).length === 0) return null;

  mcpManager = new McpClientManager();
  await mcpManager.connect(servers);

  if (mcpManager.connectedCount === 0) {
    mcpManager = null;
    return null;
  }

  return mcpManager;
}

/**
 * Clean up MCP connections on process exit.
 */
export async function shutdownMcp(): Promise<void> {
  if (mcpManager) {
    await mcpManager.disconnect();
    mcpManager = null;
  }
}

/**
 * Get all registered built-in tools with their descriptions.
 * Conditionally includes tools based on environment configuration.
 *
 * @param model - The model name (needed for tools that require model-specific configuration)
 * @returns Array of registered tools
 */
export function getToolRegistry(model: string): RegisteredTool[] {
  const tools: RegisteredTool[] = [
    {
      name: 'web_fetch',
      tool: webFetchTool,
      description: WEB_FETCH_DESCRIPTION,
    },
    {
      name: 'browser',
      tool: browserTool,
      description: BROWSER_DESCRIPTION,
    },
    {
      name: 'read_file',
      tool: readFileTool,
      description: READ_FILE_DESCRIPTION,
    },
    {
      name: 'write_file',
      tool: writeFileTool,
      description: WRITE_FILE_DESCRIPTION,
    },
    {
      name: 'edit_file',
      tool: editFileTool,
      description: EDIT_FILE_DESCRIPTION,
    },
    {
      name: 'get_company_profile',
      tool: companyProfileTool,
      description: COMPANY_PROFILE_DESCRIPTION,
    },
  ];

  // Include web_search if Exa, Perplexity, or Tavily API key is configured (Exa → Perplexity → Tavily)
  if (process.env.EXASEARCH_API_KEY) {
    tools.push({
      name: 'web_search',
      tool: exaSearch,
      description: WEB_SEARCH_DESCRIPTION,
    });
  } else if (process.env.PERPLEXITY_API_KEY) {
    tools.push({
      name: 'web_search',
      tool: perplexitySearch,
      description: WEB_SEARCH_DESCRIPTION,
    });
  } else if (process.env.TAVILY_API_KEY) {
    tools.push({
      name: 'web_search',
      tool: tavilySearch,
      description: WEB_SEARCH_DESCRIPTION,
    });
  }

  // Include skill tool if any skills are available
  const availableSkills = discoverSkills();
  if (availableSkills.length > 0) {
    tools.push({
      name: 'skill',
      tool: skillTool,
      description: SKILL_TOOL_DESCRIPTION,
    });
  }

  return tools;
}

/**
 * Get all registered tools including MCP server tools.
 * Built-in tools are loaded synchronously; MCP tools require async connection.
 *
 * @param model - The model name
 * @returns Array of all registered tools (built-in + MCP)
 */
export async function getToolRegistryAsync(model: string): Promise<RegisteredTool[]> {
  const builtinTools = getToolRegistry(model);

  try {
    const manager = await getMcpManager();
    if (manager) {
      const mcpTools = await manager.getTools();
      logger.info(`Loaded ${mcpTools.length} MCP tool(s) from ${manager.connectedCount} server(s)`);
      return [...builtinTools, ...mcpTools];
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`MCP tool loading failed (continuing with built-in tools): ${message}`);
  }

  return builtinTools;
}

/**
 * Get just the tool instances for binding to the LLM.
 *
 * @param model - The model name
 * @returns Array of tool instances
 */
export function getTools(model: string): StructuredToolInterface[] {
  return getToolRegistry(model).map((t) => t.tool);
}

/**
 * Get all tool instances including MCP tools.
 *
 * @param model - The model name
 * @returns Array of tool instances
 */
export async function getToolsAsync(model: string): Promise<StructuredToolInterface[]> {
  const registry = await getToolRegistryAsync(model);
  return registry.map((t) => t.tool);
}

/**
 * Build the tool descriptions section for the system prompt.
 * Formats each tool's rich description with a header.
 *
 * @param model - The model name
 * @returns Formatted string with all tool descriptions
 */
export function buildToolDescriptions(model: string): string {
  return getToolRegistry(model)
    .map((t) => `### ${t.name}\n\n${t.description}`)
    .join('\n\n');
}

/**
 * Build tool descriptions from a pre-loaded registry (used with async MCP loading).
 */
export function buildToolDescriptionsFromRegistry(registry: RegisteredTool[]): string {
  return registry
    .map((t) => `### ${t.name}\n\n${t.description}`)
    .join('\n\n');
}
