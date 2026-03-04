/**
 * MCP Client Manager.
 *
 * Connects to configured MCP servers via stdio transport,
 * discovers their tools, and converts them to LangChain-compatible
 * DynamicStructuredTool instances.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { jsonSchemaToZod } from './schema.js';
import type { McpServerConfig } from './config.js';
import type { RegisteredTool } from '../tools/registry.js';

// ============================================================================
// Types
// ============================================================================

interface ConnectedServer {
  name: string;
  client: Client;
  transport: StdioClientTransport;
}

// ============================================================================
// MCP Client Manager
// ============================================================================

export class McpClientManager {
  private servers: ConnectedServer[] = [];

  /**
   * Connect to all configured MCP servers.
   * Failures are logged but don't block other servers from connecting.
   */
  async connect(serverConfigs: Record<string, McpServerConfig>): Promise<void> {
    const entries = Object.entries(serverConfigs);
    if (entries.length === 0) return;

    const results = await Promise.allSettled(
      entries.map(([name, config]) => this.connectServer(name, config))
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const name = entries[i][0];
      if (result.status === 'rejected') {
        logger.warn(`MCP server "${name}" failed to connect: ${result.reason}`);
      }
    }
  }

  /**
   * Get all tools from all connected MCP servers as LangChain tools.
   */
  async getTools(): Promise<RegisteredTool[]> {
    const allTools: RegisteredTool[] = [];

    for (const server of this.servers) {
      try {
        const { tools } = await server.client.listTools();

        for (const mcpTool of tools) {
          const langchainTool = this.convertTool(server.name, mcpTool, server.client);
          allTools.push(langchainTool);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`Failed to list tools from MCP server "${server.name}": ${message}`);
      }
    }

    return allTools;
  }

  /**
   * Disconnect all MCP servers and clean up child processes.
   */
  async disconnect(): Promise<void> {
    const results = await Promise.allSettled(
      this.servers.map(async (server) => {
        try {
          await server.client.close();
        } catch {
          // Best-effort cleanup
        }
        try {
          await server.transport.close();
        } catch {
          // Best-effort cleanup
        }
      })
    );
    this.servers = [];
  }

  /**
   * Get a summary of connected servers for display.
   */
  getServerSummary(): { name: string; toolCount: number }[] {
    return this.servers.map((s) => ({ name: s.name, toolCount: 0 }));
  }

  get connectedCount(): number {
    return this.servers.length;
  }

  // ============================================================================
  // Private
  // ============================================================================

  private async connectServer(name: string, config: McpServerConfig): Promise<void> {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: {
        ...process.env,
        ...(config.env ?? {}),
      } as Record<string, string>,
      cwd: config.cwd,
    });

    const client = new Client(
      { name: `gary-${name}`, version: '1.0.0' },
      { capabilities: {} }
    );

    await client.connect(transport);

    this.servers.push({ name, client, transport });
    logger.info(`Connected to MCP server: ${name}`);
  }

  /**
   * Convert an MCP tool definition to a LangChain RegisteredTool.
   * Routes tool calls through the MCP client.
   */
  private convertTool(
    serverName: string,
    mcpTool: { name: string; description?: string; inputSchema?: Record<string, unknown> },
    client: Client
  ): RegisteredTool {
    const toolName = `${serverName}_${mcpTool.name}`;
    const description = mcpTool.description ?? `Tool from MCP server "${serverName}"`;

    // Convert JSON Schema to Zod, falling back to a permissive schema
    let schema: z.ZodTypeAny;
    try {
      if (mcpTool.inputSchema && typeof mcpTool.inputSchema === 'object') {
        schema = jsonSchemaToZod(mcpTool.inputSchema as any);
      } else {
        schema = z.object({});
      }
    } catch {
      schema = z.record(z.string(), z.any()).describe(description);
    }

    const tool = new DynamicStructuredTool({
      name: toolName,
      description,
      schema: schema as any,
      func: async (input: Record<string, unknown>) => {
        try {
          const result = await client.callTool({
            name: mcpTool.name,
            arguments: input,
          });

          // MCP tool results have a `content` array
          if (result.content && Array.isArray(result.content)) {
            const textParts = result.content
              .filter((c: any) => c.type === 'text')
              .map((c: any) => c.text);
            return textParts.join('\n') || JSON.stringify(result.content);
          }

          return typeof result === 'string' ? result : JSON.stringify(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return `MCP tool error (${serverName}/${mcpTool.name}): ${message}`;
        }
      },
    });

    // Build a rich description for the system prompt
    const richDescription = [
      `MCP tool from server "${serverName}".`,
      description,
    ].join('\n');

    return {
      name: toolName,
      tool,
      description: richDescription,
    };
  }
}
