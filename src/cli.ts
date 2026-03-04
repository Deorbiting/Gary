import { Container, ProcessTerminal, Spacer, Text, TUI, CombinedAutocompleteProvider } from '@mariozechner/pi-tui';
import type {
  AgentEvent,
  ApprovalDecision,
  DoneEvent,
  ToolEndEvent,
  ToolErrorEvent,
  ToolStartEvent,
} from './agent/index.js';
import { getModelDisplayName } from './utils/model.js';
import { getApiKeyNameForProvider, getProviderDisplayName } from './utils/env.js';
import type { DisplayEvent } from './agent/types.js';
import { logger } from './utils/logger.js';
import {
  AgentRunnerController,
  InputHistoryController,
  ModelSelectionController,
} from './controllers/index.js';
import {
  ApiKeyInputComponent,
  ApprovalPromptComponent,
  ChatLogComponent,
  CustomEditor,
  DebugPanelComponent,
  IntroComponent,
  McpScreenComponent,
  StatusBarComponent,
  ShortcutsOverlayComponent,
  WorkingIndicatorComponent,
  createApiKeyConfirmSelector,
  createModelSelector,
  createProviderSelector,
  createMcpScreen,
  createInitScreen,
} from './components/index.js';
import { editorTheme, theme } from './theme.js';
import { shutdownMcp } from './tools/index.js';
import { isSlashCommand, executeCommand, getCommands } from './commands/index.js';
import { loadMcpConfig, saveMcpServerConfig, removeMcpServer, toggleMcpServer } from './mcp/config.js';

function truncateAtWord(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  const lastSpace = str.lastIndexOf(' ', maxLength);
  if (lastSpace > maxLength * 0.5) {
    return `${str.slice(0, lastSpace)}...`;
  }
  return `${str.slice(0, maxLength)}...`;
}

function summarizeToolResult(tool: string, args: Record<string, unknown>, result: string): string {
  if (tool === 'skill') {
    const skillName = args.skill as string;
    return `Loaded ${skillName} skill`;
  }
  try {
    const parsed = JSON.parse(result);
    if (parsed.data) {
      if (Array.isArray(parsed.data)) {
        return `Received ${parsed.data.length} items`;
      }
      if (typeof parsed.data === 'object') {
        const keys = Object.keys(parsed.data).filter((key) => !key.startsWith('_'));
        if (tool === 'marketing_search') {
          return keys.length === 1 ? 'Queried 1 source' : `Queried ${keys.length} sources`;
        }
        if (tool === 'web_search') {
          return 'Did 1 search';
        }
        return `Received ${keys.length} fields`;
      }
    }
  } catch {
    return truncateAtWord(result, 50);
  }
  return 'Received data';
}

function createScreen(
  title: string,
  description: string,
  body: any,
  footer?: string,
): Container {
  const container = new Container();
  if (title) {
    container.addChild(new Text(theme.bold(theme.primary(title)), 0, 0));
  }
  if (description) {
    container.addChild(new Text(theme.muted(description), 0, 0));
  }
  container.addChild(new Spacer(1));
  container.addChild(body);
  if (footer) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.muted(footer), 0, 0));
  }
  return container;
}

function renderHistory(chatLog: ChatLogComponent, history: AgentRunnerController['history']) {
  chatLog.clearAll();
  for (const item of history) {
    chatLog.addQuery(item.query);
    chatLog.resetToolGrouping();

    if (item.status === 'interrupted') {
      chatLog.addInterrupted();
    }

    for (const display of item.events) {
      const event = display.event;
      if (event.type === 'thinking') {
        const message = event.message.trim();
        if (message) {
          chatLog.addChild(
            new Text(message.length > 200 ? `${message.slice(0, 200)}...` : message, 0, 0),
          );
        }
        continue;
      }

      if (event.type === 'tool_start') {
        const toolStart = event as ToolStartEvent;
        const component = chatLog.startTool(display.id, toolStart.tool, toolStart.args);
        if (display.completed && display.endEvent?.type === 'tool_end') {
          const done = display.endEvent as ToolEndEvent;
          component.setComplete(
            summarizeToolResult(done.tool, toolStart.args, done.result),
            done.duration,
          );
        } else if (display.completed && display.endEvent?.type === 'tool_error') {
          const toolError = display.endEvent as ToolErrorEvent;
          component.setError(toolError.error);
        } else if (display.progressMessage) {
          component.setActive(display.progressMessage);
        }
        continue;
      }

      if (event.type === 'tool_approval') {
        const approval = chatLog.startTool(display.id, event.tool, event.args);
        approval.setApproval(event.approved);
        continue;
      }

      if (event.type === 'tool_denied') {
        const denied = chatLog.startTool(display.id, event.tool, event.args);
        const path = (event.args.path as string) ?? '';
        denied.setDenied(path, event.tool);
        continue;
      }

      if (event.type === 'tool_limit') {
        continue;
      }

      if (event.type === 'context_cleared') {
        chatLog.addContextCleared(event.clearedCount, event.keptCount);
      }
    }

    if (item.answer) {
      chatLog.finalizeAnswer(item.answer);
    }
    if (item.status === 'complete') {
      chatLog.addPerformanceStats(item.duration ?? 0, item.tokenUsage, item.tokensPerSecond);
    }
  }
}

export async function runCli() {
  const tui = new TUI(new ProcessTerminal());
  const root = new Container();
  const chatLog = new ChatLogComponent(tui);
  const inputHistory = new InputHistoryController(() => tui.requestRender());
  let lastError: string | null = null;

  const onError = (message: string) => {
    lastError = message;
    logger.error(message);
    tui.requestRender();
  };

  const modelSelection = new ModelSelectionController(onError, () => {
    intro.setModel(modelSelection.model);
    statusBar.setModel(modelSelection.model);
    renderSelectionOverlay();
    tui.requestRender();
  });

  const agentRunner = new AgentRunnerController(
    { model: modelSelection.model, modelProvider: modelSelection.provider, maxIterations: 10 },
    modelSelection.inMemoryChatHistory,
    () => {
      renderHistory(chatLog, agentRunner.history);
      workingIndicator.setState(agentRunner.workingState);
      renderSelectionOverlay();
      tui.requestRender();
    },
  );

  const intro = new IntroComponent(modelSelection.model);
  const errorText = new Text('', 0, 0);
  const workingIndicator = new WorkingIndicatorComponent(tui);

  // Overlay screen state
  let mcpScreenActive = false;
  let mcpAddMode = false; // sub-state: adding a server
  let initScreenActive = false;
  let shortcutsOverlayActive = false;
  let initScreen: ReturnType<typeof createInitScreen> | null = null;
  const editor = new CustomEditor(tui, editorTheme);

  // Set up slash command autocomplete
  const slashCommands = getCommands().map(cmd => ({
    name: cmd.name,
    description: cmd.description,
  }));
  editor.setAutocompleteProvider(new CombinedAutocompleteProvider(slashCommands));

  const statusBar = new StatusBarComponent(modelSelection.model);
  const debugPanel = new DebugPanelComponent(8, true);

  tui.addChild(root);

  const refreshError = () => {
    const message = lastError ?? agentRunner.error;
    errorText.setText(message ? theme.error(`Error: ${message}`) : '');
  };

  const handleSubmit = async (query: string) => {
    if (query.toLowerCase() === 'exit' || query.toLowerCase() === 'quit') {
      tui.stop();
      process.exit(0);
      return;
    }

    if (modelSelection.isInSelectionFlow() || agentRunner.pendingApproval || agentRunner.isProcessing) {
      return;
    }

    // Show keyboard shortcuts overlay on lone '?'
    if (query === '?') {
      shortcutsOverlayActive = true;
      renderSelectionOverlay();
      tui.requestRender();
      return;
    }

    // Route slash commands through the command system
    if (isSlashCommand(query)) {
      const cmdResult = await executeCommand(query);

      if (cmdResult) {
        if (cmdResult.type === 'ui-flow') {
          if (cmdResult.flow === 'model') {
            modelSelection.startSelection();
          } else if (cmdResult.flow === 'clear') {
            agentRunner.clearHistory();
            chatLog.clearAll();
            tui.requestRender();
          } else if (cmdResult.flow === 'mcp') {
            mcpScreenActive = true;
            renderSelectionOverlay();
            tui.requestRender();
          } else if (cmdResult.flow === 'init') {
            initScreenActive = true;
            initScreen = createInitScreen({
              onComplete: () => {
                initScreenActive = false;
                initScreen = null;
                renderSelectionOverlay();
                tui.requestRender();
              },
              onApiKeySave: (_provider, _key) => {
                // TODO: persist API key to .env
              },
              onFlowRequest: (flow) => {
                if (flow === 'init-context') {
                  // Close init, let user run the skill manually
                  initScreenActive = false;
                  initScreen = null;
                  renderSelectionOverlay();
                  tui.requestRender();
                }
              },
            });
            renderSelectionOverlay();
            tui.requestRender();
          }
          return;
        }

        if (cmdResult.type === 'agent-query' && cmdResult.query) {
          // Route directly to the agent with the generated query
          intro.showStarters(false);
          await inputHistory.saveMessage(query);
          inputHistory.resetNavigation();
          const result = await agentRunner.runQuery(cmdResult.query);
          if (result?.answer) {
            await inputHistory.updateAgentResponse(result.answer);
          }
          refreshError();
          tui.requestRender();
          return;
        }

        if (cmdResult.type === 'output' && cmdResult.lines) {
          chatLog.addQuery(query);
          for (const line of cmdResult.lines) {
            chatLog.addChild(new Text(line, 0, 0));
          }
          tui.requestRender();
          return;
        }

        // silent: do nothing
        return;
      }

      // Command not recognized — fall through to agent
    }

    intro.showStarters(false);
    await inputHistory.saveMessage(query);
    inputHistory.resetNavigation();
    const result = await agentRunner.runQuery(query);
    if (result?.answer) {
      await inputHistory.updateAgentResponse(result.answer);
    }
    refreshError();
    tui.requestRender();
  };

  editor.onSubmit = (text) => {
    const value = text.trim();
    if (!value) return;
    editor.setText('');
    editor.addToHistory(value);
    void handleSubmit(value);
  };

  editor.onEscape = () => {
    if (shortcutsOverlayActive) {
      shortcutsOverlayActive = false;
      renderSelectionOverlay();
      tui.requestRender();
      return;
    }
    if (initScreenActive) {
      initScreenActive = false;
      initScreen = null;
      renderSelectionOverlay();
      tui.requestRender();
      return;
    }
    if (mcpScreenActive) {
      mcpScreenActive = false;
      mcpAddMode = false;
      renderSelectionOverlay();
      tui.requestRender();
      return;
    }
    if (modelSelection.isInSelectionFlow()) {
      modelSelection.cancelSelection();
      return;
    }
    if (agentRunner.isProcessing || agentRunner.pendingApproval) {
      agentRunner.cancelExecution();
      return;
    }
  };

  editor.onCtrlC = () => {
    if (modelSelection.isInSelectionFlow()) {
      modelSelection.cancelSelection();
      return;
    }
    if (agentRunner.isProcessing || agentRunner.pendingApproval) {
      agentRunner.cancelExecution();
      return;
    }
    tui.stop();
    process.exit(0);
  };

  const renderMainView = () => {
    root.clear();
    root.addChild(intro);
    root.addChild(chatLog);
    if (lastError ?? agentRunner.error) {
      root.addChild(errorText);
    }
    if (agentRunner.workingState.status !== 'idle') {
      root.addChild(workingIndicator);
    }
    root.addChild(new Spacer(1));
    root.addChild(editor);
    root.addChild(statusBar);
    root.addChild(debugPanel);
    tui.setFocus(editor);
  };

  const renderScreenView = (
    title: string,
    description: string,
    body: any,
    footer?: string,
    focusTarget?: any,
  ) => {
    root.clear();
    root.addChild(createScreen(title, description, body, footer));
    if (focusTarget) {
      tui.setFocus(focusTarget);
    }
  };

  const showMcpScreen = () => {
    const screen = createMcpScreen((action, serverName) => {
      if (action === 'done') {
        mcpScreenActive = false;
        mcpAddMode = false;
        renderSelectionOverlay();
        tui.requestRender();
        return;
      }
      if (action === 'add') {
        mcpAddMode = true;
        renderSelectionOverlay();
        tui.requestRender();
        return;
      }
      if (action === 'remove' && serverName) {
        removeMcpServer(serverName);
        // Re-render MCP screen with updated config
        renderSelectionOverlay();
        tui.requestRender();
        return;
      }
      if (action === 'toggle' && serverName) {
        toggleMcpServer(serverName);
        renderSelectionOverlay();
        tui.requestRender();
        return;
      }
    });
    renderScreenView('', '', screen, undefined, screen.selector ?? screen);
  };

  const showMcpAddScreen = () => {
    const input = new ApiKeyInputComponent();
    input.onSubmit = (value) => {
      if (value) {
        // Parse "name command args..." format
        const parts = value.trim().split(/\s+/);
        if (parts.length >= 2) {
          const [name, command, ...args] = parts;
          saveMcpServerConfig(name, { command, ...(args.length > 0 ? { args } : {}) });
        }
      }
      mcpAddMode = false;
      renderSelectionOverlay();
      tui.requestRender();
    };
    input.onCancel = () => {
      mcpAddMode = false;
      renderSelectionOverlay();
      tui.requestRender();
    };
    renderScreenView(
      'Add MCP Server',
      'Format: <name> <command> [args...]',
      input,
      'Example: filesystem npx -y @modelcontextprotocol/server-filesystem /path\nEnter to confirm · esc to go back',
      input,
    );
  };

  const renderSelectionOverlay = () => {
    const state = modelSelection.state;

    // Keyboard shortcuts overlay
    if (shortcutsOverlayActive) {
      const overlay = new ShortcutsOverlayComponent();
      overlay.onDismiss = () => {
        shortcutsOverlayActive = false;
        renderSelectionOverlay();
        tui.requestRender();
      };
      renderScreenView('', '', overlay, undefined, overlay);
      return;
    }

    // Init screen
    if (initScreenActive && initScreen) {
      renderScreenView('', '', initScreen, undefined, initScreen);
      return;
    }

    // MCP screens take priority when active
    if (mcpScreenActive) {
      if (mcpAddMode) {
        showMcpAddScreen();
      } else {
        showMcpScreen();
      }
      return;
    }

    if (state.appState === 'idle' && !agentRunner.pendingApproval) {
      refreshError();
      renderMainView();
      return;
    }

    if (agentRunner.pendingApproval) {
      const prompt = new ApprovalPromptComponent(
        agentRunner.pendingApproval.tool,
        agentRunner.pendingApproval.args,
      );
      prompt.onSelect = (decision: ApprovalDecision) => {
        agentRunner.respondToApproval(decision);
      };
      renderScreenView('', '', prompt, undefined, prompt.selector);
      return;
    }

    if (state.appState === 'provider_select') {
      const selector = createProviderSelector(modelSelection.provider, (providerId) => {
        void modelSelection.handleProviderSelect(providerId);
      });
      renderScreenView(
        'Select provider',
        'Switch between LLM providers. Applies to this session and future sessions.',
        selector,
        'Enter to confirm · esc to exit',
        selector,
      );
      return;
    }

    if (state.appState === 'model_select' && state.pendingProvider) {
      const selector = createModelSelector(
        state.pendingModels,
        modelSelection.provider === state.pendingProvider ? modelSelection.model : undefined,
        (modelId) => modelSelection.handleModelSelect(modelId),
        state.pendingProvider,
      );
      renderScreenView(
        `Select model for ${getProviderDisplayName(state.pendingProvider)}`,
        '',
        selector,
        'Enter to confirm · esc to go back',
        selector,
      );
      return;
    }

    if (state.appState === 'model_input' && state.pendingProvider) {
      const input = new ApiKeyInputComponent();
      input.onSubmit = (value) => modelSelection.handleModelInputSubmit(value);
      input.onCancel = () => modelSelection.handleModelInputSubmit(null);
      renderScreenView(
        `Enter model name for ${getProviderDisplayName(state.pendingProvider)}`,
        'Type or paste the model name from openrouter.ai/models',
        input,
        'Examples: anthropic/claude-3.5-sonnet, openai/gpt-4-turbo, meta-llama/llama-3-70b\nEnter to confirm · esc to go back',
        input,
      );
      return;
    }

    if (state.appState === 'api_key_confirm' && state.pendingProvider) {
      const selector = createApiKeyConfirmSelector((wantsToSet) =>
        modelSelection.handleApiKeyConfirm(wantsToSet),
      );
      renderScreenView(
        'Set API Key',
        `Would you like to set your ${getProviderDisplayName(state.pendingProvider)} API key?`,
        selector,
        'Enter to confirm · esc to decline',
        selector,
      );
      return;
    }

    if (state.appState === 'api_key_input' && state.pendingProvider) {
      const input = new ApiKeyInputComponent(true);
      input.onSubmit = (apiKey) => modelSelection.handleApiKeySubmit(apiKey);
      input.onCancel = () => modelSelection.handleApiKeySubmit(null);
      const apiKeyName = getApiKeyNameForProvider(state.pendingProvider) ?? '';
      renderScreenView(
        `Enter ${getProviderDisplayName(state.pendingProvider)} API Key`,
        apiKeyName ? `(${apiKeyName})` : '',
        input,
        'Enter to confirm · Esc to cancel',
        input,
      );
    }
  };

  await inputHistory.init();
  const savedMessages = inputHistory.getMessages();
  for (const msg of savedMessages.reverse()) {
    editor.addToHistory(msg);
  }
  if (savedMessages.length > 0) {
    intro.showStarters(false);
  }
  renderSelectionOverlay();
  refreshError();

  tui.start();
  await new Promise<void>((resolve) => {
    const finish = () => resolve();
    process.once('exit', finish);
    process.once('SIGINT', finish);
    process.once('SIGTERM', finish);
  });

  workingIndicator.dispose();
  debugPanel.dispose();
  await shutdownMcp();
}
