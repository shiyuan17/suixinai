export const MainView = {
  Cowork: 'cowork',
  Skills: 'skills',
  ScheduledTasks: 'scheduledTasks',
  Kits: 'kits',
  AiBrowser: 'aiBrowser',
} as const;

export type MainView = typeof MainView[keyof typeof MainView];
