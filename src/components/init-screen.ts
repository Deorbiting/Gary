import {
  Container,
  Input,
  SelectList,
  Spacer,
  Text,
  getEditorKeybindings,
  type SelectItem,
} from '@mariozechner/pi-tui';
import { selectListTheme, theme } from '../theme.js';

// ============================================================================
// VimSelectList - adds j/k navigation (local copy matching other components)
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
// ApiKeyInput - masked password input for API keys (inline version)
// ============================================================================

class ApiKeyInput {
  private readonly input = new Input();
  onSubmit?: (apiKey: string | null) => void;
  onCancel?: () => void;

  invalidate() {
    this.input.invalidate();
  }

  render(width: number): string[] {
    const lines = this.input.render(Math.max(10, width - 4));
    const value = this.input.getValue();
    const display = `${'*'.repeat(value.length)}${value.length === 0 ? '\u2588' : ''}`;
    return [
      `${theme.primary('> ')}${display}`,
      theme.muted('Enter to confirm \u00b7 Esc to go back'),
    ];
  }

  handleInput(keyData: string): void {
    const kb = getEditorKeybindings();
    if (kb.matches(keyData, 'submit')) {
      this.onSubmit?.(this.input.getValue().trim() || null);
      return;
    }
    if (kb.matches(keyData, 'selectCancel')) {
      this.onCancel?.();
      return;
    }
    this.input.handleInput(keyData);
  }

  getValue(): string {
    return this.input.getValue();
  }
}

// ============================================================================
// Constants
// ============================================================================

const LLM_PROVIDERS: { id: string; label: string }[] = [
  { id: 'openai', label: 'OpenAI (recommended)' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'google', label: 'Google' },
  { id: 'xai', label: 'xAI' },
  { id: 'ollama', label: 'Ollama (free, local)' },
];

const PLATFORM_CATEGORIES: { id: string; label: string; keyName: string }[] = [
  { id: 'analytics', label: 'Analytics (Google Analytics, Mixpanel, etc.)', keyName: 'ANALYTICS_API_KEY' },
  { id: 'seo', label: 'SEO (Ahrefs, Semrush, etc.)', keyName: 'SEO_API_KEY' },
  { id: 'ads', label: 'Ads (Google Ads, Meta Ads, etc.)', keyName: 'ADS_API_KEY' },
  { id: 'email', label: 'Email (Mailchimp, Sendgrid, etc.)', keyName: 'EMAIL_API_KEY' },
  { id: 'crm', label: 'CRM (HubSpot, Salesforce, etc.)', keyName: 'CRM_API_KEY' },
  { id: 'payments', label: 'Payments (Stripe, Paddle, etc.)', keyName: 'PAYMENTS_API_KEY' },
];

const EXAMPLE_PROMPTS = [
  'Audit my landing page for conversion rate issues',
  'Write a cold outreach email sequence for SaaS',
  'Build a 90-day GTM plan for my product launch',
  'Analyze my competitors\' positioning and messaging',
];

// ============================================================================
// Callbacks interface
// ============================================================================

export interface InitScreenCallbacks {
  onComplete: () => void;
  onApiKeySave: (provider: string, key: string) => void;
  onFlowRequest: (flow: string) => void;
}

// ============================================================================
// InitScreenComponent
// ============================================================================

export class InitScreenComponent extends Container {
  private currentStep = 0;
  private subState: 'main' | 'api-key' | 'platform-list' | 'platform-key' = 'main';
  private selectedProvider: string | null = null;
  private selectedPlatform: string | null = null;

  private readonly callbacks: InitScreenCallbacks;
  private activeChild: VimSelectList | ApiKeyInput | null = null;

  constructor(callbacks: InitScreenCallbacks) {
    super();
    this.callbacks = callbacks;
    this.rebuildUI();
  }

  // --------------------------------------------------------------------------
  // UI Building
  // --------------------------------------------------------------------------

  private rebuildUI(): void {
    this.clear();
    this.activeChild = null;

    switch (this.currentStep) {
      case 0:
        this.buildWelcomeStep();
        break;
      case 1:
        this.buildLLMStep();
        break;
      case 2:
        this.buildPlatformsStep();
        break;
      case 3:
        this.buildContextStep();
        break;
      case 4:
        this.buildDoneStep();
        break;
    }
  }

  private buildStepHeader(stepNum: number, total: number, title: string): void {
    this.addChild(new Spacer(1));
    this.addChild(
      new Text(
        theme.muted(`Step ${stepNum} of ${total}`) + '  ' + theme.bold(theme.primary(title)),
        0,
        0,
      ),
    );
    this.addChild(new Spacer(1));
  }

  // Step 0: Welcome
  private buildWelcomeStep(): void {
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.bold(theme.primary('Welcome to Gary')), 0, 0));
    this.addChild(new Spacer(1));
    this.addChild(
      new Text(
        'Gary is your AI-powered marketing and go-to-market assistant.',
        0,
        0,
      ),
    );
    this.addChild(
      new Text(
        'He helps you with strategy, copy, analytics, and execution — right from your terminal.',
        0,
        0,
      ),
    );
    this.addChild(
      new Text(
        'Let\'s get you set up in a few quick steps.',
        0,
        0,
      ),
    );
    this.addChild(new Spacer(2));
    this.addChild(new Text(theme.muted('Press Enter to get started'), 0, 0));
  }

  // Step 1: LLM Provider
  private buildLLMStep(): void {
    this.buildStepHeader(1, 4, 'Pick your LLM provider');

    if (this.subState === 'api-key' && this.selectedProvider) {
      // Show API key input
      const providerLabel = LLM_PROVIDERS.find((p) => p.id === this.selectedProvider)?.label ?? this.selectedProvider;
      this.addChild(
        new Text(
          theme.muted(`Enter your API key for `) + theme.primary(providerLabel),
          0,
          0,
        ),
      );
      this.addChild(new Spacer(1));

      const keyInput = new ApiKeyInput();
      keyInput.onSubmit = (key) => {
        if (key && this.selectedProvider) {
          this.callbacks.onApiKeySave(this.selectedProvider, key);
        }
        this.subState = 'main';
        this.currentStep = 2;
        this.rebuildUI();
        this.invalidate();
      };
      keyInput.onCancel = () => {
        this.subState = 'main';
        this.selectedProvider = null;
        this.rebuildUI();
        this.invalidate();
      };
      this.activeChild = keyInput;
      // ApiKeyInput renders itself; we add a placeholder text that will be replaced
      // Since ApiKeyInput isn't a Container child, we handle it in render/handleInput
      return;
    }

    this.addChild(
      new Text(theme.muted('Choose which AI model provider to use:'), 0, 0),
    );
    this.addChild(new Spacer(1));

    const items: SelectItem[] = LLM_PROVIDERS.map((p, i) => ({
      value: p.id,
      label: `${i + 1}. ${p.label}`,
    }));

    const list = new VimSelectList(items, 7, selectListTheme);
    list.onSelect = (item) => {
      this.selectedProvider = item.value;
      if (item.value === 'ollama') {
        // Ollama doesn't need an API key
        this.subState = 'main';
        this.currentStep = 2;
        this.rebuildUI();
        this.invalidate();
      } else {
        this.subState = 'api-key';
        this.rebuildUI();
        this.invalidate();
      }
    };
    list.onCancel = () => {
      // Go back to welcome
      this.currentStep = 0;
      this.subState = 'main';
      this.rebuildUI();
      this.invalidate();
    };
    this.activeChild = list;
    this.addChild(list);

    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.muted('Enter to select \u00b7 Esc to go back'), 0, 0));
  }

  // Step 2: Marketing Platforms
  private buildPlatformsStep(): void {
    this.buildStepHeader(2, 4, 'Connect marketing platforms');

    if (this.subState === 'platform-list') {
      this.addChild(
        new Text(
          theme.muted('Select a platform category to configure, or press Esc to continue.'),
          0,
          0,
        ),
      );
      this.addChild(new Spacer(1));

      const items: SelectItem[] = PLATFORM_CATEGORIES.map((p, i) => ({
        value: p.id,
        label: `${i + 1}. ${p.label}`,
      }));

      const list = new VimSelectList(items, 8, selectListTheme);
      list.onSelect = (item) => {
        this.selectedPlatform = item.value;
        this.subState = 'platform-key';
        this.rebuildUI();
        this.invalidate();
      };
      list.onCancel = () => {
        this.subState = 'main';
        this.currentStep = 3;
        this.rebuildUI();
        this.invalidate();
      };
      this.activeChild = list;
      this.addChild(list);

      this.addChild(new Spacer(1));
      this.addChild(new Text(theme.muted('Enter to select \u00b7 Esc to continue to next step'), 0, 0));
      return;
    }

    if (this.subState === 'platform-key' && this.selectedPlatform) {
      const platform = PLATFORM_CATEGORIES.find((p) => p.id === this.selectedPlatform);
      this.addChild(
        new Text(
          theme.muted('Enter API key for ') + theme.primary(platform?.label ?? this.selectedPlatform),
          0,
          0,
        ),
      );
      this.addChild(new Spacer(1));

      const keyInput = new ApiKeyInput();
      keyInput.onSubmit = (key) => {
        if (key && this.selectedPlatform) {
          const platform = PLATFORM_CATEGORIES.find((p) => p.id === this.selectedPlatform);
          if (platform) {
            this.callbacks.onApiKeySave(this.selectedPlatform, key);
          }
        }
        // Return to platform list
        this.subState = 'platform-list';
        this.selectedPlatform = null;
        this.rebuildUI();
        this.invalidate();
      };
      keyInput.onCancel = () => {
        this.subState = 'platform-list';
        this.selectedPlatform = null;
        this.rebuildUI();
        this.invalidate();
      };
      this.activeChild = keyInput;
      return;
    }

    // Default: show skip/connect choice
    this.addChild(
      new Text(
        'Gary can connect to your marketing platforms. You can skip this and add them later.',
        0,
        0,
      ),
    );
    this.addChild(new Spacer(1));

    const items: SelectItem[] = [
      { value: 'skip', label: '1. Skip for now (recommended)' },
      { value: 'connect', label: '2. Connect platforms' },
    ];

    const list = new VimSelectList(items, 4, selectListTheme);
    list.onSelect = (item) => {
      if (item.value === 'skip') {
        this.currentStep = 3;
        this.subState = 'main';
        this.rebuildUI();
        this.invalidate();
      } else {
        this.subState = 'platform-list';
        this.rebuildUI();
        this.invalidate();
      }
    };
    list.onCancel = () => {
      // Go back to LLM step
      this.currentStep = 1;
      this.subState = 'main';
      this.selectedProvider = null;
      this.rebuildUI();
      this.invalidate();
    };
    this.activeChild = list;
    this.addChild(list);

    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.muted('Enter to select \u00b7 Esc to go back'), 0, 0));
  }

  // Step 3: Product Context
  private buildContextStep(): void {
    this.buildStepHeader(3, 4, 'Product context');

    this.addChild(
      new Text(
        'For personalized advice, Gary can learn about your product.',
        0,
        0,
      ),
    );
    this.addChild(
      new Text(
        theme.muted('You can set this up anytime by saying "Run the product-marketing-context skill"'),
        0,
        0,
      ),
    );
    this.addChild(new Spacer(1));

    const items: SelectItem[] = [
      { value: 'skip', label: '1. Skip for now' },
      { value: 'setup', label: '2. Set up product context' },
    ];

    const list = new VimSelectList(items, 4, selectListTheme);
    list.onSelect = (item) => {
      if (item.value === 'setup') {
        this.callbacks.onFlowRequest('init-context');
        return;
      }
      this.currentStep = 4;
      this.subState = 'main';
      this.rebuildUI();
      this.invalidate();
    };
    list.onCancel = () => {
      // Go back to platforms step
      this.currentStep = 2;
      this.subState = 'main';
      this.rebuildUI();
      this.invalidate();
    };
    this.activeChild = list;
    this.addChild(list);

    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.muted('Enter to select \u00b7 Esc to go back'), 0, 0));
  }

  // Step 4: Done
  private buildDoneStep(): void {
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.bold(theme.primary('You\'re all set!')), 0, 0));
    this.addChild(new Spacer(1));
    this.addChild(new Text('Here are some things to try:', 0, 0));
    this.addChild(new Spacer(1));

    for (const prompt of EXAMPLE_PROMPTS) {
      this.addChild(
        new Text(`  ${theme.primary('\u2022')} ${theme.accent(prompt)}`, 0, 0),
      );
    }

    this.addChild(new Spacer(2));
    this.addChild(new Text(theme.muted('Press Enter to start using Gary'), 0, 0));
  }

  // --------------------------------------------------------------------------
  // Rendering (override for ApiKeyInput which isn't a Container child)
  // --------------------------------------------------------------------------

  render(width: number): string[] {
    if (this.activeChild instanceof ApiKeyInput) {
      // Render the container children (header text etc.) then append the key input
      const baseLines = super.render(width);
      const inputLines = this.activeChild.render(width);
      return [...baseLines, ...inputLines];
    }
    return super.render(width);
  }

  // --------------------------------------------------------------------------
  // Input handling
  // --------------------------------------------------------------------------

  handleInput(keyData: string): void {
    const kb = getEditorKeybindings();

    // If we have an active ApiKeyInput, delegate to it
    if (this.activeChild instanceof ApiKeyInput) {
      this.activeChild.handleInput(keyData);
      return;
    }

    // If we have an active select list, delegate to it
    if (this.activeChild instanceof VimSelectList) {
      this.activeChild.handleInput(keyData);
      return;
    }

    // Steps with no interactive widget — just Enter to proceed
    if (this.currentStep === 0) {
      if (kb.matches(keyData, 'submit')) {
        this.currentStep = 1;
        this.subState = 'main';
        this.rebuildUI();
        this.invalidate();
      }
      return;
    }

    if (this.currentStep === 4) {
      if (kb.matches(keyData, 'submit')) {
        this.callbacks.onComplete();
      }
      return;
    }
  }
}

// ============================================================================
// Factory function
// ============================================================================

/**
 * Creates an InitScreenComponent wired to the given callbacks.
 */
export function createInitScreen(callbacks: InitScreenCallbacks): InitScreenComponent {
  return new InitScreenComponent(callbacks);
}
