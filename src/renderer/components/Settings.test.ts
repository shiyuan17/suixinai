import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';

vi.mock('react-redux', () => ({
  useDispatch: () => vi.fn(),
  useSelector: (selector: (state: unknown) => unknown) => selector({
    auth: {
      user: null,
    },
    cowork: {
      config: {
        agentEngine: 'openclaw',
      },
    },
  }),
}));

vi.mock('./common/Modal', () => ({
  default: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
}));

vi.mock('./mcp/McpManager', () => ({
  default: () => React.createElement('div', null, 'mock-mcp-manager'),
}));

vi.mock('./im/IMSettings', () => ({
  default: () => React.createElement('div', null, 'mock-im-settings'),
}));

vi.mock('./settings/BrowserWebAccessSettings', () => ({
  default: () => React.createElement('div', null, 'mock-browser-settings'),
}));

vi.mock('./cowork/DreamingSettingsSection', () => ({
  default: () => React.createElement('div', null, 'mock-dreaming-settings'),
}));

vi.mock('./cowork/EmbeddingSettingsSection', () => ({
  default: () => React.createElement('div', null, 'mock-embedding-settings'),
}));

vi.mock('./skills/EmailSkillConfig', () => ({
  default: () => React.createElement('div', null, 'mock-email-settings'),
}));

vi.mock('./settings/ModelSettingsSection', () => ({
  default: () => React.createElement('div', null, 'mock-model-settings'),
  ModelEditorDialog: () => null,
}));

import Settings from './Settings';

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

test('renders the MCP manager in the MCP tab and hides the global save button', () => {
  (globalThis as unknown as {
    window: {
      requestAnimationFrame: (cb: FrameRequestCallback) => number;
      matchMedia: (query: string) => MediaQueryList;
    };
    localStorage: {
      getItem: (key: string) => string | null;
      setItem: (key: string, value: string) => void;
      removeItem: (key: string) => void;
    };
  }).window = {
    requestAnimationFrame: (cb) => {
      cb(0);
      return 0;
    },
    matchMedia: () => ({
      matches: false,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  };
  (globalThis as unknown as {
    localStorage: {
      getItem: (key: string) => string | null;
      setItem: (key: string, value: string) => void;
      removeItem: (key: string) => void;
    };
  }).localStorage = {
    getItem: () => null,
    setItem: vi.fn(),
    removeItem: vi.fn(),
  };

  const html = renderToStaticMarkup(React.createElement(Settings, {
    onClose: vi.fn(),
    initialTab: 'mcp',
  }));

  expect(html).toContain('mock-mcp-manager');
  expect(html).toContain('MCP');
  expect(html).toContain('取消');
  expect(html).not.toContain('保存');
});
