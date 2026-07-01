import { ShortcutAction, type ShortcutAction as ShortcutActionType } from './config';

export const getSettingsTabForGlobalShortcut = (
  action: ShortcutActionType,
): 'mcp' | null => {
  if (action === ShortcutAction.OpenMcp) {
    return 'mcp';
  }
  return null;
};
