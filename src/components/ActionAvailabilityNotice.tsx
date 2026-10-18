import React from 'react';
import { Info } from 'lucide-react';
import ContextualTutorialLink from './ContextualTutorialLink';

interface ActionAvailabilityNoticeProps {
  title: string;
  description: string;
  tutorialId?: string;
  tutorialLabel?: string;
}

const ActionAvailabilityNotice: React.FC<ActionAvailabilityNoticeProps> = ({ title, description, tutorialId, tutorialLabel }) => (
  <div role="status" className="mt-3 flex items-start gap-2 rounded-control border border-line/70 bg-inset/70 px-3 py-2.5 text-sm text-muted">
    <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
    <div className="min-w-0">
      <p className="font-semibold text-ink">{title}</p>
      <p className="mt-0.5 leading-5">{description}</p>
      {tutorialId && tutorialLabel && <ContextualTutorialLink tutorialId={tutorialId} label={tutorialLabel} />}
    </div>
  </div>
);

export default ActionAvailabilityNotice;
