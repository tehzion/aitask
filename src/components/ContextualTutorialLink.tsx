import React from 'react';
import { BookOpen } from 'lucide-react';
import { getTutorialById, TUTORIAL_GUIDE_START_EVENT } from '../lib/tutorials';
import { getOnboardingPersona } from '../lib/onboarding';
import { getVisibleTutorials } from '../lib/tutorials';
import { useStore } from '../store';

interface ContextualTutorialLinkProps {
  tutorialId: string;
  label: string;
}

const ContextualTutorialLink: React.FC<ContextualTutorialLinkProps> = ({ tutorialId, label }) => {
  const currentUser = useStore(state => state.currentUser);
  const rolePermissions = useStore(state => state.rolePermissions);
  const tutorial = getTutorialById(tutorialId);
  const persona = getOnboardingPersona(currentUser, rolePermissions);
  if (!tutorial?.guide?.length || !getVisibleTutorials(persona).some(item => item.id === tutorial.id)) return null;

  const open = () => {
    window.dispatchEvent(new CustomEvent(TUTORIAL_GUIDE_START_EVENT, {
      detail: { tutorialId: tutorial.id },
    }));
  };

  return (
    <button type="button" onClick={open} className="inline-flex min-h-10 items-center gap-1.5 rounded-control px-2 text-xs font-semibold text-accent transition hover:bg-surface hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
      <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </button>
  );
};

export default ContextualTutorialLink;
