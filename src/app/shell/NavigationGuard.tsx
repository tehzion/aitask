import { useEffect } from 'react';
import { useBlocker, useLocation } from 'react-router-dom';
import { recordDiagnostic } from '../../infrastructure/observability/diagnostics';
import { useI18n } from '../../shared/components/I18nProvider';
import { hasBlockingUnsavedChanges, hasUnsavedChanges } from '../../shared/forms/unsavedChanges';
import { useStore } from '../store/workspaceStore';

export default function NavigationGuard() {
  const { t } = useI18n();
  const location = useLocation();
  useEffect(() => {
    const start = performance.now();
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => recordDiagnostic('route.ready', performance.now() - start)); });
    return () => cancelAnimationFrame(frame);
  }, [location.key]);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => Boolean(useStore.getState().currentUser) && hasUnsavedChanges() && (
    currentLocation.pathname !== nextLocation.pathname
    || currentLocation.search !== nextLocation.search
    || currentLocation.hash !== nextLocation.hash
  ));
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (hasBlockingUnsavedChanges()) { blocker.reset(); return; }
    if (window.confirm(t('feedback.leaveUnsaved'))) blocker.proceed();
    else blocker.reset();
  }, [blocker, t]);
  return null;
}
