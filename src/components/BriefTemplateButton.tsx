import React from 'react';
import { ListChecks } from 'lucide-react';
import '../lib/pageCopy';
import { applyBriefPrompts, getBriefPrompts } from '../lib/briefTemplates';
import { useI18n } from './I18nProvider';

interface BriefTemplateButtonProps {
  serviceType?: string;
  value: string;
  onChange: (next: string) => void;
}

/** One tap adds the service's requirement prompts to the brief without touching what is already written. */
const BriefTemplateButton: React.FC<BriefTemplateButtonProps> = ({ serviceType, value, onChange }) => {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={() => onChange(applyBriefPrompts(value, getBriefPrompts(serviceType).map(label => t(label))))}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-line px-3 text-sm font-medium text-ink transition-colors duration-160 hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
    >
      <ListChecks aria-hidden="true" className="h-4 w-4" />{t('Add checklist for this service')}
    </button>
  );
};

export default BriefTemplateButton;
