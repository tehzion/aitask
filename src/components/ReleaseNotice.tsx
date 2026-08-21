import React from 'react';
import { useLocation } from 'react-router-dom';
import { CheckCircle2, Sparkles } from 'lucide-react';
import type { User } from '../types';
import { hasPasswordResetBypass } from '../lib/auth';
import { shouldUseSecureSupabase } from '../lib/supabaseClient';
import {
  RELEASE_NOTICE_ID,
  acknowledgeLocalReleaseNotice,
  getReleaseNoticeCopy,
  hasLocalReleaseNoticeAcknowledgement,
} from '../lib/releaseNotice';
import {
  acknowledgeSecureReleaseNotice,
  getSecureReleaseNoticeAcknowledgement,
} from '../lib/secureWorkspace';
import { useI18n } from './I18nProvider';
import ModalShell from './ModalShell';
import { Button } from './ui';

interface ReleaseNoticeProps {
  currentUser: User | null;
  isReady: boolean;
}

const ReleaseNotice: React.FC<ReleaseNoticeProps> = ({ currentUser, isReady }) => {
  const { locale } = useI18n();
  const location = useLocation();
  const [isOpen, setIsOpen] = React.useState(false);
  const dismissedThisSession = React.useRef(new Set<string>());

  React.useEffect(() => {
    const requiresPasswordSetup = Boolean(
      currentUser?.mustResetPassword && !hasPasswordResetBypass(currentUser.id),
    );
    if (!currentUser || !isReady || requiresPasswordSetup) {
      setIsOpen(false);
      return;
    }
    if (dismissedThisSession.current.has(currentUser.id)) return;

    let active = true;
    const loadAcknowledgement = async () => {
      if (!shouldUseSecureSupabase()) {
        if (active) setIsOpen(!hasLocalReleaseNoticeAcknowledgement(currentUser.id));
        return;
      }

      const result = await getSecureReleaseNoticeAcknowledgement(RELEASE_NOTICE_ID);
      if (!active) return;
      // A failed lookup must never block work. Showing the update again is safer
      // than treating an unverified acknowledgement as read.
      setIsOpen(result.ok ? !result.acknowledged : true);
    };

    void loadAcknowledgement();
    return () => { active = false; };
  // Choosing "Continue for now" changes the password-setup bypass in session
  // storage, then routes the user away from Settings. Re-check on that route
  // change so the release note appears only after the required gate is passed.
  }, [currentUser, isReady, location.pathname]);

  const dismiss = React.useCallback(() => {
    if (!currentUser || dismissedThisSession.current.has(currentUser.id)) return;
    dismissedThisSession.current.add(currentUser.id);
    setIsOpen(false);

    if (shouldUseSecureSupabase()) {
      // The notice is already closed for this session if the network request
      // fails; the acknowledgement is checked again on the next sign-in.
      void acknowledgeSecureReleaseNotice(RELEASE_NOTICE_ID);
      return;
    }
    acknowledgeLocalReleaseNotice(currentUser.id);
  }, [currentUser]);

  if (!currentUser || !isOpen) return null;
  const copy = getReleaseNoticeCopy(currentUser, locale);

  return (
    <ModalShell
      labelledBy="service-operations-update-title"
      describedBy="service-operations-update-description"
      onClose={dismiss}
      panelClassName="max-w-2xl"
    >
      <div className="overflow-y-auto px-5 pb-5 pt-6 sm:px-7 sm:pb-7 sm:pt-8">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="calm-eyebrow">{copy.eyebrow}</p>
            <h2 id="service-operations-update-title" className="mt-2 text-balance text-2xl font-semibold tracking-[-0.035em] text-ink sm:text-[1.75rem]">
              {copy.title}
            </h2>
            <p id="service-operations-update-description" className="mt-3 max-w-[62ch] text-sm leading-6 text-ink/85">
              {copy.description}
            </p>
          </div>
        </div>

        <ul className="mt-7 divide-y divide-line border-y border-line" aria-label={copy.eyebrow}>
          {copy.highlights.map((highlight) => (
            <li key={highlight.title} className="flex gap-3 py-4 first:pt-4 last:pb-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-semibold text-ink">{highlight.title}</h3>
                <p className="mt-1 text-sm leading-6 text-ink/85">{highlight.description}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex justify-end">
          <Button data-autofocus onClick={dismiss} className="min-w-36">
            {copy.acknowledgeLabel}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
};

export default ReleaseNotice;
