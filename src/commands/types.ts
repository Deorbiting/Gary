/**
 * Slash command definitions for Gary CLI.
 */

/**
 * Result of executing a slash command.
 * - 'output': Display text output in the chat log
 * - 'ui-flow': Command triggers a special UI flow (handled by CLI)
 * - 'silent': Command executed but no visible output
 */
export interface CommandResult {
  type: 'output' | 'ui-flow' | 'agent-query' | 'silent';
  /** Text lines to display (for 'output' type) */
  lines?: string[];
  /** Name of the UI flow to trigger (for 'ui-flow' type) */
  flow?: string;
  /** Query to pass directly to the agent (for 'agent-query' type) */
  query?: string;
}

/**
 * A registered slash command.
 */
export interface SlashCommand {
  /** Command name without the leading slash */
  name: string;
  /** Short description shown in /help */
  description: string;
  /** Whether this command accepts arguments */
  hasArgs?: boolean;
  /** Execute the command and return result */
  execute: (args: string) => Promise<CommandResult> | CommandResult;
}
