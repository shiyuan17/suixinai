import { describe, expect, test } from 'vitest';

import {
  SCHEDULED_TASK_TEMPLATES,
  ScheduledTaskTemplateIcon,
  ScheduledTaskTemplateId,
  ScheduledTaskTemplatePlanType,
} from './taskTemplates';

describe('scheduled task templates', () => {
  test('every template uses a supported icon', () => {
    const validIcons = new Set(Object.values(ScheduledTaskTemplateIcon));

    for (const template of SCHEDULED_TASK_TEMPLATES) {
      expect(validIcons.has(template.icon)).toBe(true);
    }
  });

  test('tech briefing keeps the expected weekday schedule', () => {
    const template = SCHEDULED_TASK_TEMPLATES.find(
      item => item.id === ScheduledTaskTemplateId.TechBriefing,
    );

    expect(template).toBeDefined();
    expect(template?.schedule.planType).toBe(ScheduledTaskTemplatePlanType.Weekly);
    expect(template?.schedule.hour).toBe(8);
    expect(template?.schedule.minute).toBe(30);
    expect(template?.schedule.weekdays).toEqual([1, 2, 3, 4, 5]);
  });

  test('project health keeps the expected daily schedule', () => {
    const template = SCHEDULED_TASK_TEMPLATES.find(
      item => item.id === ScheduledTaskTemplateId.ProjectHealth,
    );

    expect(template).toBeDefined();
    expect(template?.schedule.planType).toBe(ScheduledTaskTemplatePlanType.Daily);
    expect(template?.schedule.hour).toBe(10);
    expect(template?.schedule.minute).toBe(0);
  });
});
