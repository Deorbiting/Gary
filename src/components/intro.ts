import { Container, Spacer, Text } from '@mariozechner/pi-tui';
import packageJson from '../../package.json';
import { getModelDisplayName } from '../utils/model.js';
import { theme } from '../theme.js';

const INTRO_WIDTH = 50;

export class IntroComponent extends Container {
  private readonly modelText: Text;
  private starterHeader: Text | null = null;
  private starterTexts: Text[] = [];

  constructor(model: string) {
    super();

    const welcomeText = 'Welcome to Gary';
    const versionText = ` v${packageJson.version}`;
    const fullText = welcomeText + versionText;
    const padding = Math.floor((INTRO_WIDTH - fullText.length - 2) / 2);
    const trailing = INTRO_WIDTH - fullText.length - padding - 2;

    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.primary('═'.repeat(INTRO_WIDTH)), 0, 0));
    this.addChild(
      new Text(
        theme.primary(
          `║${' '.repeat(padding)}${theme.bold(welcomeText)}${theme.muted(versionText)}${' '.repeat(
            trailing,
          )}║`,
        ),
        0,
        0,
      ),
    );
    this.addChild(new Text(theme.primary('═'.repeat(INTRO_WIDTH)), 0, 0));
    this.addChild(new Spacer(1));

    this.addChild(
      new Text(
        theme.bold(
          theme.primary(
            `
 ██████╗  █████╗ ██████╗ ██╗   ██╗
██╔════╝ ██╔══██╗██╔══██╗╚██╗ ██╔╝
██║  ███╗███████║██████╔╝ ╚████╔╝
██║   ██║██╔══██║██╔══██╗  ╚██╔╝
╚██████╔╝██║  ██║██║  ██║   ██║
 ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝`,
          ),
        ),
        0,
        0,
      ),
    );

    this.addChild(new Spacer(1));
    this.addChild(new Text('Your AI agent for marketing & go-to-market.', 0, 0));
    this.modelText = new Text('', 0, 0);
    this.addChild(this.modelText);
    this.setModel(model);

    this.addStarterPrompts();
  }

  setModel(model: string) {
    this.modelText.setText(
      `${theme.muted('Model: ')}${theme.primary(getModelDisplayName(model))}${theme.muted(
        '. Type /model to change.',
      )}`,
    );
  }

  showStarters(visible: boolean) {
    if (visible) {
      this.addStarterPrompts();
    } else {
      this.removeStarterPrompts();
    }
  }

  private addStarterPrompts() {
    if (this.starterHeader) return;

    this.starterHeader = new Text(theme.muted('Try asking:'), 0, 0);
    this.addChild(this.starterHeader);

    const prompts = [
      'Audit my landing page at [url]',
      'Write a cold email sequence for [audience]',
      'What SEO keywords should I target?',
      'Create a launch plan for my new feature',
    ];

    for (const prompt of prompts) {
      const text = new Text(`  ${theme.primary('→')} ${prompt}`, 0, 0);
      this.starterTexts.push(text);
      this.addChild(text);
    }
  }

  private removeStarterPrompts() {
    if (this.starterHeader) {
      this.removeChild(this.starterHeader);
      this.starterHeader = null;
    }
    for (const text of this.starterTexts) {
      this.removeChild(text);
    }
    this.starterTexts = [];
  }
}
