import { Container, Text, Spacer, SelectList, getEditorKeybindings, type SelectItem } from '@mariozechner/pi-tui';
import { selectListTheme, theme } from '../theme.js';
import { loadMcpConfig } from '../mcp/config.js';
import type { McpConfig, McpServerConfig } from '../mcp/config.js';

// ============================================================================
// VimSelectList - adds j/k navigation
// ============================================================================

class VimSelectList extends SelectList {
  handleInput(keyData: string): void {
    if (keyData === 'j') {
      super.handleInput('\u001b[B');
      return;
    }
    if (keyData === 'k') {
      super.handleInput('\u001b[A');
      return;
    }
    super.handleInput(keyData);
  }
}

// ============================================================================
// McpServerList - extends VimSelectList with a/d/t hotkeys
// ============================================================================

export class McpServerList extends VimSelectList {
  onAdd?: () => void;
  onRemove?: (serverName: string) => void;
  onToggle?: (serverName: string) => void;

  handleInput(keyData: string): void {
    if (keyData === 'a') {
      this.onAdd?.();
      return;
    }
    if (keyData === 'd') {
      const selected = this.getSelectedItem();
      if (selected) this.onRemove?.(selected.value);
      return;
    }
    if (keyData === 't') {
      const selected = this.getSelectedItem();
      if (selected) this.onToggle?.(selected.value);
      return;
    }
    super.handleInput(keyData);
  }
}

// ============================================================================
// McpScreenComponent - full screen container for MCP server management
// ============================================================================

export class McpScreenComponent extends Container {
  readonly selector: McpServerList | null;
  onDone?: () => void;
  onAdd?: () => void;
  onRemove?: (serverName: string) => void;
  onToggle?: (serverName: string) => void;

  constructor() {
    super();

    const config = loadMcpConfig();
    const entries = Object.entries(config.mcpServers);
    const serverCount = entries.length;

    // ── Header ──────────────────────────────────────────────────────────
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.bold(theme.primary('Manage MCP Servers')), 0, 0));
    this.addChild(
      new Text(
        theme.muted(
          serverCount === 0
            ? 'No servers configured'
            : `${serverCount} server${serverCount === 1 ? '' : 's'} configured`,
        ),
        0,
        0,
      ),
    );
    this.addChild(new Spacer(1));

    // ── Server list (or empty state) ────────────────────────────────────
    if (serverCount === 0) {
      this.selector = null;
      this.addChild(
        new Text(theme.muted('  No MCP servers found. Press ') + theme.primary('a') + theme.muted(' to add one.'), 0, 0),
      );
    } else {
      const items: SelectItem[] = entries.map(([name, cfg]) => {
        const status = cfg.disabled
          ? theme.error('\u2717 disabled')
          : theme.success('\u2713 enabled');
        const cmd = formatCommand(cfg);
        return {
          value: name,
          label: name,
          description: `${status}  ${theme.dim(cmd)}`,
        };
      });

      this.selector = new McpServerList(items, Math.min(items.length, 10), selectListTheme);
      this.selector.onCancel = () => this.onDone?.();
      this.selector.onAdd = () => this.onAdd?.();
      this.selector.onRemove = (name) => this.onRemove?.(name);
      this.selector.onToggle = (name) => this.onToggle?.(name);

      this.addChild(this.selector);
    }

    // ── Config file locations ───────────────────────────────────────────
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.muted('Config files:'), 0, 0));
    this.addChild(new Text(`  ${theme.muted('Project:')} ${theme.dim('.gary/mcp.json')}`, 0, 0));
    this.addChild(new Text(`  ${theme.muted('User:   ')} ${theme.dim('~/.gary/mcp.json')}`, 0, 0));

    // ── Footer with keyboard shortcuts ──────────────────────────────────
    this.addChild(new Spacer(1));
    this.addChild(
      new Text(
        theme.muted('a') +
          theme.dim(' add') +
          theme.muted('  d') +
          theme.dim(' delete') +
          theme.muted('  t') +
          theme.dim(' toggle') +
          theme.muted('  esc') +
          theme.dim(' close'),
        0,
        0,
      ),
    );
  }

  handleInput(keyData: string): void {
    const kb = getEditorKeybindings();

    // Global escape handler for empty state (when no selector)
    if (!this.selector && kb.matches(keyData, 'selectCancel')) {
      this.onDone?.();
      return;
    }

    // In empty state, still handle 'a' to add
    if (!this.selector && keyData === 'a') {
      this.onAdd?.();
      return;
    }

    // Delegate to the server list selector
    if (this.selector) {
      this.selector.handleInput(keyData);
    }
  }
}

// ============================================================================
// Factory function
// ============================================================================

/**
 * Creates an MCP screen component wired to a single action callback.
 *
 * @param onAction - Called with the action type and optionally the server name.
 *   Actions: 'add', 'remove', 'toggle', 'done'
 */
export function createMcpScreen(
  onAction: (action: 'add' | 'remove' | 'toggle' | 'done', serverName?: string) => void,
): McpScreenComponent {
  const screen = new McpScreenComponent();
  screen.onDone = () => onAction('done');
  screen.onAdd = () => onAction('add');
  screen.onRemove = (name) => onAction('remove', name);
  screen.onToggle = (name) => onAction('toggle', name);
  return screen;
}

// ============================================================================
// Helpers
// ============================================================================

function formatCommand(cfg: McpServerConfig): string {
  const parts = [cfg.command, ...(cfg.args ?? [])];
  return parts.join(' ');
}
