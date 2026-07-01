import { describe, expect, test } from 'vitest';

import type { PresetAgent } from '../../types/agent';
import {
  ALL_PRESET_DIVISION_FILTER,
  buildPresetDivisionFilterOptions,
  buildPresetDivisionOptions,
  filterPresetMarket,
} from './presetMarket';

const makePreset = (overrides: Partial<PresetAgent> = {}): PresetAgent => ({
  id: 'frontend',
  name: '前端开发者',
  nameEn: 'Frontend Developer',
  icon: 'agent-avatar-svg:code',
  description: '构建现代 Web 应用',
  descriptionEn: 'Build modern web apps',
  identity: '你是前端开发者',
  identityEn: 'You are a frontend developer',
  systemPrompt: '# prompt',
  systemPromptEn: '# prompt',
  skillIds: [],
  division: 'engineering',
  divisionLabel: '工程',
  divisionLabelEn: 'Engineering',
  origin: 'agency-agents-zh',
  installed: false,
  ...overrides,
});

describe('preset market filtering', () => {
  test('filters presets by search query', () => {
    const presets = [
      makePreset(),
      makePreset({
        id: 'xiaohongshu',
        name: '小红书运营专家',
        nameEn: 'Xiaohongshu Specialist',
        description: '做小红书增长',
        descriptionEn: 'Drive Xiaohongshu growth',
        division: 'marketing',
        divisionLabel: '营销',
        divisionLabelEn: 'Marketing',
      }),
    ];

    expect(filterPresetMarket(presets, '小红书', ALL_PRESET_DIVISION_FILTER, false)).toHaveLength(1);
    expect(filterPresetMarket(presets, 'frontend', ALL_PRESET_DIVISION_FILTER, true)).toHaveLength(1);
  });

  test('filters presets by division', () => {
    const presets = [
      makePreset(),
      makePreset({
        id: 'security',
        name: '安全工程师',
        nameEn: 'Security Engineer',
        division: 'security',
        divisionLabel: '安全',
        divisionLabelEn: 'Security',
      }),
    ];

    const filtered = filterPresetMarket(presets, '', 'security', false);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('security');
  });

  test('sorts uninstalled presets before installed ones', () => {
    const presets = [
      makePreset({ id: 'installed', installed: true }),
      makePreset({ id: 'available', installed: false }),
    ];

    const filtered = filterPresetMarket(presets, '', ALL_PRESET_DIVISION_FILTER, false);
    expect(filtered.map(item => item.id)).toEqual(['available', 'installed']);
  });

  test('builds unique division options', () => {
    const options = buildPresetDivisionOptions([
      makePreset(),
      makePreset({ id: 'frontend-2' }),
      makePreset({
        id: 'marketing',
        division: 'marketing',
        divisionLabel: '营销',
        divisionLabelEn: 'Marketing',
      }),
    ], false);

    expect(options).toEqual([
      { value: 'engineering', label: '工程' },
      { value: 'marketing', label: '营销' },
    ]);
  });

  test('builds division filter options with all option first', () => {
    const options = buildPresetDivisionFilterOptions([
      makePreset(),
      makePreset({
        id: 'marketing',
        division: 'marketing',
        divisionLabel: '营销',
        divisionLabelEn: 'Marketing',
      }),
    ], false, '全部分组');

    expect(options).toEqual([
      { value: 'all', label: '全部分组' },
      { value: 'engineering', label: '工程' },
      { value: 'marketing', label: '营销' },
    ]);
  });

  test('builds english division filter options with localized labels', () => {
    const options = buildPresetDivisionFilterOptions([
      makePreset(),
      makePreset({
        id: 'marketing',
        division: 'marketing',
        divisionLabel: '营销',
        divisionLabelEn: 'Marketing',
      }),
    ], true, 'All divisions');

    expect(options).toEqual([
      { value: 'all', label: 'All divisions' },
      { value: 'engineering', label: 'Engineering' },
      { value: 'marketing', label: 'Marketing' },
    ]);
  });
});
