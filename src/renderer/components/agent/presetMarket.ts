import type { PresetAgent } from '../../types/agent';

export const ALL_PRESET_DIVISION_FILTER = 'all';

export interface PresetDivisionOption {
  value: string;
  label: string;
}

export function getPresetDivisionLabel(preset: Pick<PresetAgent, 'divisionLabel' | 'divisionLabelEn'>, isEn: boolean): string {
  return isEn ? preset.divisionLabelEn : preset.divisionLabel;
}

export function buildPresetDivisionOptions(presets: PresetAgent[], isEn: boolean): PresetDivisionOption[] {
  const seen = new Set<string>();
  const options: PresetDivisionOption[] = [];

  for (const preset of presets) {
    if (seen.has(preset.division)) continue;
    seen.add(preset.division);
    options.push({
      value: preset.division,
      label: getPresetDivisionLabel(preset, isEn),
    });
  }

  return options.sort((a, b) => a.label.localeCompare(b.label, isEn ? 'en' : 'zh-Hans'));
}

export function buildPresetDivisionFilterOptions(
  presets: PresetAgent[],
  isEn: boolean,
  allLabel: string,
): PresetDivisionOption[] {
  return [
    { value: ALL_PRESET_DIVISION_FILTER, label: allLabel },
    ...buildPresetDivisionOptions(presets, isEn),
  ];
}

export function filterPresetMarket(
  presets: PresetAgent[],
  searchQuery: string,
  division: string,
  isEn: boolean,
): PresetAgent[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();

  return presets.filter((preset) => {
    if (division !== ALL_PRESET_DIVISION_FILTER && preset.division !== division) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const haystack = [
      preset.name,
      preset.nameEn,
      preset.description,
      preset.descriptionEn,
      preset.divisionLabel,
      preset.divisionLabelEn,
    ]
      .join('\n')
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  }).sort((a, b) => {
    if (a.installed !== b.installed) {
      return a.installed ? 1 : -1;
    }

    const labelA = isEn ? a.nameEn || a.name : a.name;
    const labelB = isEn ? b.nameEn || b.name : b.name;
    return labelA.localeCompare(labelB, isEn ? 'en' : 'zh-Hans');
  });
}
