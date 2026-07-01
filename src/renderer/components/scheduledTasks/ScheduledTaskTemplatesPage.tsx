import {
  BriefcaseIcon,
  CalendarDaysIcon,
  ChartBarSquareIcon,
  ClipboardDocumentCheckIcon,
  NewspaperIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import React from 'react';

import { i18nService } from '../../services/i18n';
import {
  SCHEDULED_TASK_TEMPLATES,
  type ScheduledTaskTemplate,
  ScheduledTaskTemplateIcon,
} from './taskTemplates';

const templateIconComponents: Record<string, React.ElementType<{ className?: string }>> = {
  [ScheduledTaskTemplateIcon.Newspaper]: NewspaperIcon,
  [ScheduledTaskTemplateIcon.Briefcase]: BriefcaseIcon,
  [ScheduledTaskTemplateIcon.Calendar]: CalendarDaysIcon,
  [ScheduledTaskTemplateIcon.Report]: ChartBarSquareIcon,
  [ScheduledTaskTemplateIcon.Code]: ClipboardDocumentCheckIcon,
  [ScheduledTaskTemplateIcon.Reminder]: SparklesIcon,
};

interface ScheduledTaskTemplatesPageProps {
  onSelectTemplate: (template: ScheduledTaskTemplate) => void;
}

const ScheduledTaskTemplatesPage: React.FC<ScheduledTaskTemplatesPageProps> = ({
  onSelectTemplate,
}) => {
  return (
    <div className="px-6 py-5 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6">
        <div>
          <h2 className="text-[32px] font-semibold tracking-tight text-foreground">
            {i18nService.t('scheduledTasksTemplateTitle')}
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {SCHEDULED_TASK_TEMPLATES.map((template) => {
            const Icon = templateIconComponents[template.icon];
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => onSelectTemplate(template)}
                className="group flex min-h-[132px] flex-col items-start rounded-[28px] border border-border-subtle bg-surface/70 px-6 py-5 text-left transition-all hover:border-white/10 hover:bg-surface-raised/80"
              >
                <div className="flex w-full items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/[0.04] text-secondary">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[18px] font-semibold text-foreground">
                      {i18nService.t(template.titleKey)}
                    </div>
                    <div className="mt-2 text-base leading-7 text-secondary">
                      {i18nService.t(template.descriptionKey)}
                    </div>
                    <div className="mt-3 text-sm text-secondary/80">
                      {i18nService.t(template.scheduleLabelKey)}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ScheduledTaskTemplatesPage;
