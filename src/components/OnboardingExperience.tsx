import React from 'react';
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, CircleHelp, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { useI18n } from './I18nProvider';
import {
  ONBOARDING_START_EVENT,
  getOnboardingPersona,
  getOnboardingSteps,
  getOnboardingUi,
  getOnboardingWelcome,
  markTutorialCompleted,
  markTutorialStarted,
  markTutorialViewed,
  shouldAutoOpenOnboarding,
  setOnboardingStatus,
  clearOnboardingStatus,
  type OnboardingStep,
} from '../lib/onboarding';
import { getLocalizedCopy, getTutorialById, getVisibleTutorials, TUTORIAL_GUIDE_START_EVENT, type TutorialGuideStep } from '../lib/tutorials';
import { cn } from '../lib/utils';

type ExperienceMode = 'welcome' | 'tour' | null;

const isVisibleTarget = (element: HTMLElement) => {
  if (element.getClientRects().length === 0) return false;
  if (element.closest('[hidden], [aria-hidden="true"]')) return false;
  return true;
};

const OnboardingExperience: React.FC = () => {
  const { locale } = useI18n();
  const currentUser = useStore(state => state.currentUser);
  const rolePermissions = useStore(state => state.rolePermissions);
  const location = useLocation();
  const navigate = useNavigate();
  const [mode, setMode] = React.useState<ExperienceMode>(null);
  const [stepIndex, setStepIndex] = React.useState(0);
  const [targetRect, setTargetRect] = React.useState<DOMRect | null>(null);
  const [guidedTutorial, setGuidedTutorial] = React.useState<{ id: string; steps: TutorialGuideStep[] } | null>(null);
  const actionRef = React.useRef<HTMLButtonElement>(null);
  const previousUserId = React.useRef<string | null>(null);

  const persona = React.useMemo(() => getOnboardingPersona(currentUser, rolePermissions), [currentUser, rolePermissions]);
  const visibleTutorialIds = React.useMemo(() => new Set(getVisibleTutorials(persona).map(tutorial => tutorial.id)), [persona]);
  const steps = React.useMemo(() => getOnboardingSteps(persona, locale), [locale, persona]);
  const ui = React.useMemo(() => getOnboardingUi(locale), [locale]);
  const welcome = React.useMemo(() => getOnboardingWelcome(persona, locale), [locale, persona]);
  const activeSteps = guidedTutorial?.steps || steps;
  const activeStep: OnboardingStep | TutorialGuideStep | undefined = activeSteps[stepIndex];
  const activeStepTitle = activeStep ? typeof activeStep.title === 'string' ? activeStep.title : getLocalizedCopy(activeStep.title, locale) : '';
  const activeStepBody = activeStep ? typeof activeStep.body === 'string' ? activeStep.body : getLocalizedCopy(activeStep.body, locale) : '';

  const closeAndRemember = React.useCallback((status: 'skipped' | 'completed') => {
    if (currentUser?.id && guidedTutorial) {
      if (status === 'completed') markTutorialCompleted(currentUser.id, guidedTutorial.id, stepIndex);
      else markTutorialViewed(currentUser.id, guidedTutorial.id, stepIndex);
    } else if (currentUser?.id) {
      setOnboardingStatus(currentUser.id, status);
    }
    setMode(null);
    setTargetRect(null);
    setGuidedTutorial(null);
  }, [currentUser?.id, guidedTutorial, stepIndex]);

  const startTour = React.useCallback(() => {
    if (!currentUser?.id) return;
    clearOnboardingStatus(currentUser.id);
    setGuidedTutorial(null);
    setStepIndex(0);
    setMode('tour');
  }, [currentUser?.id]);

  const startGuidedTutorial = React.useCallback((tutorialId?: string) => {
    const tutorial = tutorialId ? getTutorialById(tutorialId) : null;
    if (!currentUser?.id || !tutorial?.guide?.length || !visibleTutorialIds.has(tutorial.id)) return;
    markTutorialStarted(currentUser.id, tutorial.id);
    setStepIndex(0);
    setGuidedTutorial({ id: tutorial.id, steps: tutorial.guide });
    setMode('tour');
  }, [currentUser?.id, visibleTutorialIds]);

  React.useEffect(() => {
    if (!currentUser?.id) {
      previousUserId.current = null;
      setMode(null);
      setGuidedTutorial(null);
      return;
    }
    if (previousUserId.current === currentUser.id) return;
    previousUserId.current = currentUser.id;
    if (shouldAutoOpenOnboarding(currentUser.id)) {
      setStepIndex(0);
      setMode('welcome');
    }
  }, [currentUser?.id]);

  React.useEffect(() => {
    const handleRestart = () => startTour();
    const handleGuide = (event: Event) => {
      const detail = (event as CustomEvent<{ tutorialId?: string }>).detail;
      startGuidedTutorial(detail?.tutorialId);
    };
    window.addEventListener(ONBOARDING_START_EVENT, handleRestart);
    window.addEventListener(TUTORIAL_GUIDE_START_EVENT, handleGuide);
    return () => {
      window.removeEventListener(ONBOARDING_START_EVENT, handleRestart);
      window.removeEventListener(TUTORIAL_GUIDE_START_EVENT, handleGuide);
    };
  }, [startGuidedTutorial, startTour]);

  React.useEffect(() => {
    if (mode !== 'tour' || !activeStep.path) return;
    const nextPath = activeStep.path;
    const currentPath = `${location.pathname}${location.search}`;
    if (currentPath !== nextPath) navigate(nextPath);
  }, [activeStep, guidedTutorial, location.pathname, location.search, mode, navigate]);

  React.useEffect(() => {
    if (mode !== 'tour' || !activeStep) return;
    let frame = 0;
    const refresh = () => {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(`[data-onboarding-target="${activeStep.target}"]`));
      const target = candidates.find(isVisibleTarget);
      if (!target) {
        setTargetRect(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      setTargetRect(rect);
      const outsideViewport = rect.top < 80 || rect.bottom > window.innerHeight - 120;
      if (outsideViewport) target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    frame = window.requestAnimationFrame(refresh);
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
    };
  }, [activeStep, location.pathname, location.search, mode]);

  React.useEffect(() => {
    if (!mode) return;
    const timer = window.setTimeout(() => actionRef.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeAndRemember('skipped');
      } else if (mode === 'tour' && event.key === 'ArrowRight') {
        event.preventDefault();
        if (stepIndex >= activeSteps.length - 1) closeAndRemember('completed');
        else setStepIndex(value => value + 1);
      } else if (mode === 'tour' && event.key === 'ArrowLeft' && stepIndex > 0) {
        event.preventDefault();
        setStepIndex(value => value - 1);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeSteps.length, closeAndRemember, mode, stepIndex]);

  if (!mode || !currentUser) return null;

  const isTour = mode === 'tour';
  const progress = isTour && activeSteps.length > 0 ? ((stepIndex + 1) / activeSteps.length) * 100 : 0;
  const isCompactViewport = typeof window !== 'undefined' && window.innerWidth < 768;
  const cardPosition = targetRect && !isCompactViewport
    ? {
        top: Math.min(Math.max(targetRect.bottom + 16, 20), Math.max(20, window.innerHeight - 360)),
        left: Math.min(Math.max(targetRect.left, 16), Math.max(16, window.innerWidth - 420)),
      }
    : undefined;

  return (
    <div className="pointer-events-none fixed inset-0 z-[90]" aria-live="polite">
      {isTour && targetRect && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-control border-2 border-accent shadow-[0_0_0_9999px_rgb(var(--calm-scrim)/0.28),0_0_0_6px_rgb(var(--calm-accent)/0.18)]"
          style={{ top: targetRect.top - 5, left: targetRect.left - 5, width: targetRect.width + 10, height: targetRect.height + 10 }}
        />
      )}

      <section
        role="dialog"
        aria-modal="false"
            aria-label={isTour ? `${ui.progress}: ${activeStepTitle}` : welcome.title}
        className={cn(
          'onboarding-tour-card pointer-events-auto fixed max-h-[calc(100dvh-10rem-env(safe-area-inset-bottom))] w-[calc(100%-2rem)] max-w-[25rem] overflow-y-auto rounded-panel border border-line bg-surface text-ink shadow-float',
          targetRect && !isCompactViewport ? 'md:w-[25rem]' : 'bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 md:bottom-6 md:left-1/2 md:-translate-x-1/2',
        )}
        style={cardPosition}
      >
        <div className="h-1 bg-inset" aria-hidden="true"><div className="h-full bg-accent transition-[width] duration-160" style={{ width: isTour ? `${progress}%` : '100%' }} /></div>
        <div className="flex items-start gap-3 p-5 pb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent">
            {isTour ? <BookOpen className="h-5 w-5" aria-hidden="true" /> : <CircleHelp className="h-5 w-5" aria-hidden="true" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="calm-eyebrow">{isTour ? `${ui.step} ${stepIndex + 1} ${ui.of} ${activeSteps.length}` : welcome.eyebrow}</p>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.025em] text-ink">{isTour ? activeStepTitle : welcome.title}</h2>
          </div>
          <button type="button" onClick={() => closeAndRemember('skipped')} aria-label={ui.close} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-inset hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="px-5 pb-5">
          <p className="text-sm leading-6 text-muted">{isTour ? activeStepBody : welcome.body}</p>
          {isTour && !targetRect && <p className="mt-3 rounded-control bg-inset px-3 py-2 text-xs leading-5 text-muted">{ui.fallback}</p>}

          {isTour ? (
            <>
              <div className="mt-5 flex items-center justify-between gap-3">
                <button type="button" onClick={() => closeAndRemember('skipped')} className="min-h-11 rounded-control px-2 text-sm font-semibold text-muted transition-colors hover:bg-inset hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">{ui.skip}</button>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setStepIndex(value => Math.max(0, value - 1))} disabled={stepIndex === 0} className="inline-flex min-h-11 items-center gap-1.5 rounded-control border border-line px-3 text-sm font-semibold text-ink transition-colors hover:bg-inset disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />{ui.back}
                  </button>
                  <button ref={actionRef} type="button" onClick={() => { if (stepIndex >= activeSteps.length - 1) closeAndRemember('completed'); else setStepIndex(value => value + 1); }} className="inline-flex min-h-11 items-center gap-1.5 rounded-control bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 dark:text-[rgb(var(--calm-accent-ink))]">
                    {stepIndex >= activeSteps.length - 1 ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                    {stepIndex >= activeSteps.length - 1 ? ui.finish : ui.next}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => closeAndRemember('skipped')} className="min-h-11 rounded-control px-3 text-sm font-semibold text-muted transition-colors hover:bg-inset hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">{welcome.explore}</button>
              <button ref={actionRef} type="button" onClick={startTour} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 dark:text-[rgb(var(--calm-accent-ink))]">
                <BookOpen className="h-4 w-4" aria-hidden="true" />{welcome.start}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default OnboardingExperience;
