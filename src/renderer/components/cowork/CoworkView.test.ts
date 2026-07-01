import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

let mockState: any;
let useStateCallCount = 0;
let useStateOverrides: Record<number, [unknown, ReturnType<typeof vi.fn>]> = {};

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useState: (initialState: unknown) => {
      useStateCallCount += 1;
      const override = useStateOverrides[useStateCallCount];
      if (override) {
        return override;
      }
      return actual.useState(initialState as never);
    },
  };
});

vi.mock('react-redux', () => ({
  useDispatch: () => vi.fn(),
  useSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));

vi.mock('../../services/agent', () => ({
  agentService: {
    updateAgent: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../services/cowork', () => ({
  coworkService: {
    init: vi.fn().mockResolvedValue(undefined),
    getOpenClawEngineStatus: vi.fn().mockResolvedValue({
      phase: 'running',
      version: '2026.6.1',
      canRetry: false,
    }),
    onOpenClawEngineStatus: vi.fn().mockImplementation(() => () => {}),
    checkApiConfig: vi.fn().mockResolvedValue({ hasConfig: true }),
  },
}));

vi.mock('../../services/quickAction', () => ({
  quickActionService: {
    initialize: vi.fn(),
    getLocalizedActions: vi.fn().mockResolvedValue([]),
    subscribe: vi.fn().mockImplementation(() => () => {}),
  },
}));

vi.mock('../../services/i18n', () => ({
  i18nService: {
    t: (key: string) => {
      const messages: Record<string, string> = {
        coworkWelcome: '随心 AI',
        coworkDescription: '你的职场',
        coworkHeroHeadline: '超能力',
        coworkPlaceholder: '今天想让随心 AI 帮你做什么？试试一句任务、一个问题，或引用文件开始',
        scheduledTasksTitle: '定时任务',
        loading: '加载中',
      };
      return messages[key] ?? key;
    },
  },
}));

vi.mock('../CreditsResetCampaignFloat', () => ({
  default: () => React.createElement('div', null, 'mock-credits-float'),
}));

vi.mock('../quick-actions', () => ({
  QuickActionBar: (props: { actions: Array<{ label: string }>; variant?: string }) => React.createElement(
    'div',
    { 'data-testid': 'quick-action-bar', 'data-variant': props.variant ?? 'default' },
    props.actions.map((action) => action.label).join('|'),
  ),
  PromptPanel: () => React.createElement('div', null, 'mock-prompt-panel'),
}));

vi.mock('./CoworkPromptInput', () => ({
  __esModule: true,
  default: React.forwardRef<HTMLDivElement, { placeholder?: string }>((props, ref) => (
    React.createElement('div', { ref, 'data-testid': 'cowork-prompt-input' }, props.placeholder)
  )),
}));

vi.mock('./CoworkSessionDetail', () => ({
  __esModule: true,
  default: () => React.createElement('div', null, 'mock-session-detail'),
}));

vi.mock('./SubagentSessionDetail', () => ({
  __esModule: true,
  default: () => React.createElement('div', null, 'mock-subagent-detail'),
}));

vi.mock('../window/WindowTitleBar', () => ({
  __esModule: true,
  default: () => React.createElement('div', null, 'mock-window-title-bar'),
}));

import CoworkView from './CoworkView';

const baseState = {
  cowork: {
    currentSession: null,
    isStreaming: false,
    config: {
      workingDirectory: '',
      executionMode: 'local',
    },
    draftCollaborationModes: {},
    mediaSelection: {},
  },
  skill: {
    activeSkillIds: [],
    skills: [],
  },
  kit: {
    activeKitIds: [],
    installedKits: {},
    marketplaceKits: [],
  },
  quickAction: {
    actions: [
      { id: 'office', label: '文档处理', icon: 'PresentationChartBarIcon', color: '#2563eb', skillMapping: 'skill.office', prompts: [] },
      { id: 'finance', label: '金融服务', icon: 'ChartBarIcon', color: '#0f766e', skillMapping: 'skill.finance', prompts: [] },
    ],
    selectedActionId: null,
  },
  agent: {
    currentAgentId: 'main',
    agents: [
      {
        id: 'main',
        name: '主 Agent',
        workingDirectory: '',
        model: '',
      },
    ],
  },
  model: {
    defaultSelectedModel: {
      id: 'gpt-test',
      name: 'GPT Test',
      providerKey: 'openai',
    },
    selectedModelByAgent: {},
    availableModels: [
      {
        id: 'gpt-test',
        name: 'GPT Test',
        providerKey: 'openai',
      },
    ],
  },
};

beforeEach(() => {
  useStateCallCount = 0;
  useStateOverrides = {
    1: [true, vi.fn()],
    2: [{
      phase: 'running',
      version: '2026.6.1',
      canRetry: false,
    }, vi.fn()],
  };

  (globalThis as unknown as { window: { electron: any } }).window = {
    electron: {
      platform: 'darwin',
      log: { fromRenderer: vi.fn() },
    },
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  mockState = undefined;
  useStateCallCount = 0;
  useStateOverrides = {};
  delete (globalThis as { window?: unknown }).window;
});

test('renders the redesigned empty home state with hero image, quick actions, and prompt input', () => {
  mockState = structuredClone(baseState);

  const html = renderToStaticMarkup(React.createElement(CoworkView, {
    onShowSkills: vi.fn(),
    onShowKits: vi.fn(),
    onNewChat: vi.fn(),
  }));

  expect(html).toContain('你的职场');
  expect(html).toContain('超能力');
  expect(html).toContain('data-testid="cowork-prompt-input"');
  expect(html).toContain('data-testid="quick-action-bar"');
  expect(html).toContain('data-variant="hero"');
  expect(html).toContain('文档处理|金融服务');
});

test('shows the session detail instead of the home hero when a session is active', () => {
  mockState = structuredClone(baseState);
  mockState.cowork.currentSession = {
    id: 'session-1',
    status: 'completed',
  };

  const html = renderToStaticMarkup(React.createElement(CoworkView, {
    onShowSkills: vi.fn(),
    onShowKits: vi.fn(),
    onNewChat: vi.fn(),
  }));

  expect(html).toContain('mock-session-detail');
  expect(html).not.toContain('你的职场');
});
