export type SettingsTabKey =
  | 'general'
  | 'appearance'
  | 'coworkAgentEngine'
  | 'model'
  | 'browserWebAccess'
  | 'coworkMemory'
  | 'coworkDreaming'
  | 'shortcuts'
  | 'im'
  | 'email'
  | 'plugins'
  | 'mcp'
  | 'about';

type SettingsEnterpriseConfig = {
  ui?: Record<string, 'hide' | 'disable' | 'readonly'>;
} | null | undefined;

const ALL_SETTINGS_TAB_KEYS: readonly SettingsTabKey[] = [
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
];

export const getVisibleSettingsTabKeys = (
  enterpriseConfig?: SettingsEnterpriseConfig,
): SettingsTabKey[] => {
  const ui = enterpriseConfig?.ui;
  if (!ui) {
    return [...ALL_SETTINGS_TAB_KEYS];
  }
  return ALL_SETTINGS_TAB_KEYS.filter((tabKey) => ui[`settings.${tabKey}`] !== 'hide');
};

export const usesSettingsGlobalSave = (tabKey: SettingsTabKey): boolean => tabKey !== 'mcp';
