import { CheckCircle2, Megaphone } from 'lucide-react';
import React from 'react';
import { useLocation } from 'react-router-dom';
import { acknowledgeSecureReleaseNotice, getSecureReleaseNoticeAcknowledgement } from '../../infrastructure/api/secureWorkspace';
import { shouldUseSecureSupabase } from '../../infrastructure/database/supabaseClient';
import { hasPasswordResetBypass } from '../../modules/authentication/domain/auth';
import { useI18n } from '../../shared/components/I18nProvider';
import ModalShell from '../../shared/components/ModalShell';
import { Button } from '../../shared/components/ui';
import { getEffectivePermissions } from '../../shared/authorization/access';
import type { User } from '../../shared/types/index';
import {
  OPEN_RELEASE_NOTICE_EVENT,
	RELEASE_NOTICE_ID,
	acknowledgeLocalReleaseNotice,
	getReleaseNoticeCopy,
	hasLocalReleaseNoticeAcknowledgement,
} from '../lifecycle/releaseNotice';
import { useStore } from '../store/workspaceStore';

interface ReleaseNoticeProps {
  currentUser: User | null;
  isReady: boolean;
}

const ReleaseNotice: React.FC<ReleaseNoticeProps> = ({ currentUser, isReady }) => {
  const { locale } = useI18n();
  const location = useLocation();
  const [isOpen, setIsOpen] = React.useState(false);
  const [showDetails, setShowDetails] = React.useState(false);
  const dismissedThisSession = React.useRef(new Set<string>());
  const upgradeRequired = useStore(state => state.backend.upgradeRequired === true);
  const rolePermissions = useStore(state => state.rolePermissions);
  const effectivePermissions = React.useMemo(
    () => getEffectivePermissions(currentUser, rolePermissions),
    [currentUser, rolePermissions],
  );

  React.useEffect(() => {
    const requiresPasswordSetup = Boolean(
      currentUser?.mustResetPassword && !hasPasswordResetBypass(currentUser.id),
    );
    if (!currentUser || !isReady || requiresPasswordSetup || upgradeRequired) {
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
  }, [currentUser, isReady, location.pathname, upgradeRequired]);

  React.useEffect(() => {
    const reopen = () => {
      const requiresPasswordSetup = Boolean(
        currentUser?.mustResetPassword && !hasPasswordResetBypass(currentUser.id),
      );
      if (!currentUser || !isReady || requiresPasswordSetup || upgradeRequired) return;
      setShowDetails(false);
      setIsOpen(true);
    };
    window.addEventListener(OPEN_RELEASE_NOTICE_EVENT, reopen);
    return () => window.removeEventListener(OPEN_RELEASE_NOTICE_EVENT, reopen);
  }, [currentUser, isReady, upgradeRequired]);

  const dismiss = React.useCallback(() => {
    if (!currentUser) return;
    setIsOpen(false);
    setShowDetails(false);
    if (dismissedThisSession.current.has(currentUser.id)) return;
    dismissedThisSession.current.add(currentUser.id);

    if (shouldUseSecureSupabase()) {
      if (!upgradeRequired) {
        // The notice is already closed for this session if the network request
        // fails; the acknowledgement is checked again on the next sign-in.
        void acknowledgeSecureReleaseNotice(RELEASE_NOTICE_ID);
      }
      return;
    }
    acknowledgeLocalReleaseNotice(currentUser.id);
  }, [currentUser, upgradeRequired]);

  if (!currentUser || !isOpen) return null;
  const copy = getReleaseNoticeCopy(currentUser, locale, effectivePermissions, rolePermissions);

  return (
    <ModalShell
      labelledBy="aitask-update-title"
      describedBy="aitask-update-description"
      onClose={dismiss}
      closeOnBackdrop
      panelClassName="max-w-2xl"
    >
      <div className="overflow-y-auto px-5 pb-5 pt-6 sm:px-7 sm:pb-7 sm:pt-8">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent">
            <Megaphone className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="calm-eyebrow">{copy.eyebrow}</p>
            <h2 id="aitask-update-title" className="mt-2 text-balance text-2xl font-semibold tracking-[-0.035em] text-ink sm:text-[1.75rem]">
              {copy.title}
            </h2>
            <p id="aitask-update-description" className="mt-3 max-w-[62ch] text-sm leading-6 text-ink/85">
              {copy.description}
            </p>
          </div>
        </div>

        {showDetails ? (
          <section className="mt-6" aria-labelledby="release-notice-details-title">
            <button type="button" onClick={() => setShowDetails(false)} className="min-h-11 rounded-control px-2 text-sm font-semibold text-accent hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
              {copy.backLabel}
            </button>
            <h3 id="release-notice-details-title" className="mt-3 text-lg font-semibold text-ink">{copy.detailsTitle}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{copy.detailsDescription}</p>
            <ul className="mt-4 divide-y divide-line border-y border-line" aria-label={copy.detailsTitle}>
              {copy.detailedHighlights.map(highlight => (
                <li key={highlight.title} className="flex gap-3 py-4 first:pt-4 last:pb-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                  <div>
                    <h4 className="text-sm font-semibold text-ink">{highlight.title}</h4>
                    <p className="mt-1 text-sm leading-6 text-ink/85">{highlight.description}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex justify-end">
              <Button data-autofocus onClick={dismiss} className="min-w-36">{copy.acknowledgeLabel}</Button>
            </div>
          </section>
        ) : (
          <>
            <ul className="mt-7 divide-y divide-line border-y border-line" aria-label={copy.eyebrow}>
              {copy.highlights.map(highlight => (
                <li key={highlight.title} className="flex gap-3 py-4 first:pt-4 last:pb-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                  <div>
                    <h3 className="text-sm font-semibold text-ink">{highlight.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-ink/85">{highlight.description}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" onClick={() => setShowDetails(true)} className="min-h-11 rounded-control px-2 text-left text-sm font-semibold text-accent hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
                {copy.detailsLabel}
              </button>
              <Button data-autofocus onClick={dismiss} className="min-w-36">{copy.acknowledgeLabel}</Button>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
};

export default ReleaseNotice;
