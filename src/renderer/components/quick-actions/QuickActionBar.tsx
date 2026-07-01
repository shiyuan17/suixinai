import React from 'react';

import type { LocalizedQuickAction } from '../../types/quickAction';
import AcademicCapIcon from '../icons/AcademicCapIcon';
import ChartBarIcon from '../icons/ChartBarIcon';
import DevicePhoneMobileIcon from '../icons/DevicePhoneMobileIcon';
import GlobeAltIcon from '../icons/GlobeAltIcon';
import PresentationChartBarIcon from '../icons/PresentationChartBarIcon';

interface QuickActionBarProps {
  actions: LocalizedQuickAction[];
  onActionSelect: (actionId: string) => void;
  variant?: 'default' | 'hero';
}

// 图标映射
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  PresentationChartBarIcon,
  GlobeAltIcon,
  DevicePhoneMobileIcon,
  ChartBarIcon,
  AcademicCapIcon,
};

const QuickActionBar: React.FC<QuickActionBarProps> = ({
  actions,
  onActionSelect,
  variant = 'default',
}) => {
  if (actions.length === 0) {
    return null;
  }

  const isHero = variant === 'hero';

  return (
    <div className={`flex flex-wrap items-center justify-center ${isHero ? 'gap-2' : 'gap-2'}`}>
      {actions.map((action) => {
        const IconComponent = iconMap[action.icon];

        return (
          <button
            key={action.id}
            type="button"
            onClick={() => onActionSelect(action.id)}
            className={isHero
              ? 'group inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-[13px] font-medium leading-5 text-foreground transition-colors duration-150 hover:bg-surface-raised'
              : 'flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface px-3 py-1.5 text-[13px] font-normal leading-5 text-secondary transition-all duration-200 ease-out hover:bg-surface-raised hover:border-primary/30 hover:text-foreground'}
            style={isHero
              ? {
                borderColor: 'color-mix(in srgb, var(--lobster-border) 78%, transparent)',
                background: 'var(--lobster-surface)',
              }
              : undefined}
          >
            {IconComponent && (isHero ? (
              <span
                className="inline-flex h-6 w-6 items-center justify-center rounded-lg transition-colors duration-150"
                style={{
                  background: `color-mix(in srgb, ${action.color} 16%, white)`,
                  color: action.color,
                }}
              >
                <IconComponent className="h-4 w-4" />
              </span>
            ) : (
              <IconComponent className="h-3.5 w-3.5 text-secondary" />
            ))}
            <span>{action.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default QuickActionBar;
