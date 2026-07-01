import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';

vi.mock('react-redux', () => ({
  useSelector: (selector: (state: unknown) => unknown) => selector({
    agent: {
      currentAgentId: 'main',
      agents: [],
    },
    cowork: {
      sessions: [],
      currentSessionId: null,
    },
  }),
}));

vi.mock('./agentSidebar/MyAgentSidebarTree', () => ({
  default: () => React.createElement('div', null, 'mock-agent-tree'),
}));

vi.mock('./cowork/CoworkSearchModal', () => ({
  default: () => null,
}));

vi.mock('./LoginButton', () => ({
  default: () => React.createElement('div', null, 'mock-login-button'),
}));

import Sidebar from './Sidebar';

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

test('renders the cleaned primary nav with header new task and without scheduled tasks entry', () => {
  (globalThis as unknown as {
    window: {
      electron: { platform: string };
    };
  }).window = {
    electron: {
      platform: 'darwin',
    },
  };

  const html = renderToStaticMarkup(React.createElement(Sidebar, {
    onShowSettings: vi.fn(),
    onShowSkills: vi.fn(),
    onShowCowork: vi.fn(),
    onShowKits: vi.fn(),
    onNewChat: vi.fn(),
    activeView: 'cowork',
    isCollapsed: false,
    onToggleCollapse: vi.fn(),
  }));

  expect(html).toContain('新建任务');
  expect(html).toContain('随心 AI');
  expect(html).toContain('桌面版');
  expect(html).toContain('工作台');
  expect(html).not.toContain('定时任务');
  expect(html).toContain('专家套件');
  expect(html).toContain('技能');
  expect(html).not.toContain('搜索任务');
  expect(html).not.toContain('>MCP<');
});
