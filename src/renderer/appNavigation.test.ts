import { expect, test } from 'vitest';

import { getSettingsTabForGlobalShortcut } from './appNavigation';
import { ShortcutAction } from './config';

test('maps the MCP navigation shortcut to the MCP settings tab', () => {
  expect(getSettingsTabForGlobalShortcut(ShortcutAction.OpenMcp)).toBe('mcp');
});

test('does not remap the task search shortcut into settings navigation', () => {
  expect(getSettingsTabForGlobalShortcut(ShortcutAction.Search)).toBeNull();
});
