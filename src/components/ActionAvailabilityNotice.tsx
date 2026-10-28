import React from 'react';
import ContextualTutorialLink from './ContextualTutorialLink';

interface ActionAvailabilityNoticeProps {
  title: string;
  description: string;
  tutorialId?: string;
  tutorialLabel?: string;
}

// A quiet inline explanation; it informs without competing with the task content.
const ActionAvailabilityNotice: React.FC<ActionAvailabilityNoticeProps> = ({ title, description, tutorialId, tutorialLabel }) => (
  <div role="status" className="mt-2 text-sm leading-5 text-muted">
    <p><span className="font-semibold text-ink">{title}.</span> {description}</p>
    {tutorialId && tutorialLabel && <ContextualTutorialLink tutorialId={tutorialId} label={tutorialLabel} />}
  </div>
);

export default ActionAvailabilityNotice;
