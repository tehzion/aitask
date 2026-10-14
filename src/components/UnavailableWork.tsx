import '../lib/actionFeedbackCopy';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { getDefaultAccessiblePath } from '../lib/access';
import { useI18n } from './I18nProvider';
import { Button } from './ui';

export default function UnavailableWork({ onDismiss }: { onDismiss?: () => void }) {
  const { t } = useI18n();
  const user = useStore(state => state.currentUser);
  const permissions = useStore(state => state.rolePermissions);
  return <section className="rounded-panel border border-line bg-inset p-5 text-sm" role="status">
    <p className="font-semibold text-ink">{t('feedback.unavailable')}</p>
    <p className="mt-1 text-muted">{t('It may have been removed or your access may have changed.')}</p>
    <div className="mt-3 flex flex-wrap gap-3">
      {onDismiss && <Button variant="secondary" onClick={onDismiss}>{t('Close')}</Button>}
      <Link className="inline-flex min-h-11 items-center font-semibold text-accent underline" to={getDefaultAccessiblePath(user, permissions)}>{t('shell.goWorkspace')}</Link>
    </div>
  </section>;
}
