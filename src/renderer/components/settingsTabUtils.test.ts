import { expect, test } from 'vitest';

import { getVisibleSettingsTabKeys, usesSettingsGlobalSave } from './settingsTabUtils';

test('includes the MCP settings tab between plugins and shortcuts', () => {
  expect(getVisibleSettingsTabKeys()).toEqual([
    'general',
    'appearance',
    'coworkAgentEngine',
    'model',
    'im',
    'browserWebAccess',
    'email',
    'coworkMemory',
    'coworkDreaming',
    'plugins',
    'mcp',
    'shortcuts',
    'about',
  ]);
});

test('hides the MCP settings tab when enterprise config marks it hidden', () => {
  expect(getVisibleSettingsTabKeys({
    ui: {
      'settings.mcp': 'hide',
    },
  })).not.toContain('mcp');
});

test('disables the global settings save action on the MCP tab only', () => {
  expect(usesSettingsGlobalSave('mcp')).toBe(false);
  expect(usesSettingsGlobalSave('plugins')).toBe(true);
});
