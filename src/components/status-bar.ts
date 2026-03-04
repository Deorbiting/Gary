import { Container, Text } from '@mariozechner/pi-tui';
import { theme } from '../theme.js';
import { getModelDisplayName } from '../utils/model.js';

export class StatusBarComponent extends Container {
  private readonly statusText: Text;
  private model: string;
  private tokenCount = 0;

  constructor(model: string) {
    super();
    this.model = model;
    this.statusText = new Text('', 0, 0);
    this.addChild(this.statusText);
    this.refresh();
  }

  setModel(model: string) {
    this.model = model;
    this.refresh();
  }

  setTokens(count: number) {
    this.tokenCount = count;
    this.refresh();
  }

  private refresh() {
    const parts: string[] = [];
    parts.push(theme.primary(getModelDisplayName(this.model)));
    if (this.tokenCount > 0) {
      parts.push(theme.muted(`${this.tokenCount.toLocaleString()} tokens`));
    }
    parts.push(theme.muted('? for shortcuts · /help for commands'));
    this.statusText.setText(parts.join(theme.muted(' · ')));
  }
}
