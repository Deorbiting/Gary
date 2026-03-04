import { Container, Spacer, Text } from '@mariozechner/pi-tui';
import { theme } from '../theme.js';

export class ShortcutsOverlayComponent extends Container {
  onDismiss?: () => void;

  constructor() {
    super();

    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.bold(theme.primary('Keyboard Shortcuts')), 0, 0));
    this.addChild(new Spacer(1));

    const shortcuts = [
      ['Enter', 'Submit query'],
      ['Escape', 'Cancel / close overlay'],
      ['Ctrl+C', 'Exit Gary'],
      ['Up / Down', 'Navigate input history'],
      ['Tab', 'Accept autocomplete suggestion'],
      ['?', 'Show this help'],
    ];

    const slashCommands = [
      ['/init', 'Set up Gary (first-time setup)'],
      ['/help', 'Show commands (/help <cmd> for details)'],
      ['/model', 'Switch LLM provider'],
      ['/skill <name>', 'Run a skill (e.g. /skill seo-audit)'],
      ['/tool <name>', 'Run a tool (e.g. /tool web_search)'],
      ['/skills', 'List marketing skills'],
      ['/tools', 'List available tools'],
      ['/mcp', 'Manage MCP servers'],
      ['/history', 'Browse past conversations'],
      ['/export', 'Save last response to file'],
      ['/config', 'Show configuration'],
      ['/context', 'Product marketing context'],
      ['/clear', 'Clear conversation'],
      ['/exit', 'Exit Gary'],
    ];

    // Calculate max key width for alignment
    const maxKeyWidth = Math.max(...shortcuts.map(s => s[0].length));

    this.addChild(new Text(theme.bold('  Keys'), 0, 0));
    this.addChild(new Spacer(1));

    for (const [key, desc] of shortcuts) {
      const paddedKey = key.padEnd(maxKeyWidth + 2);
      this.addChild(new Text(`  ${theme.primary(paddedKey)} ${theme.muted(desc)}`, 0, 0));
    }

    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.bold('  Commands'), 0, 0));
    this.addChild(new Spacer(1));

    const maxCmdWidth = Math.max(...slashCommands.map(s => s[0].length));

    for (const [cmd, desc] of slashCommands) {
      const paddedCmd = cmd.padEnd(maxCmdWidth + 2);
      this.addChild(new Text(`  ${theme.accent(paddedCmd)} ${theme.muted(desc)}`, 0, 0));
    }

    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.muted('  Press any key to dismiss'), 0, 0));
  }

  handleInput(_keyData: string): void {
    // Any key dismisses the overlay
    this.onDismiss?.();
  }
}
