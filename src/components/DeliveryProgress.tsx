import { ProgressBar, StatusChip } from './ui';
import { useI18n } from './I18nProvider';

/** Only published, current-cycle records are passed to this display. */
export const DeliveryProgress = ({ published, total, delivered, draft = false }: {
  published: boolean; total: number; delivered: number; draft?: boolean;
}) => {
  const { t } = useI18n();
  if (!published || total === 0) return <div className="mt-5" role="status">
    <StatusChip tone="slate">{t(published ? 'No deliverables in this cycle' : draft ? 'Awaiting publication' : 'No current published cycle')}</StatusChip>
    {!published && <p className="mt-2 text-sm text-muted">{t('Delivery progress appears after the current cycle is published.')}</p>}
  </div>;
  return <div className="mt-5">
    <p className="calm-number text-4xl font-semibold tracking-tight text-ink">{Math.round(delivered / total * 100)}%</p>
    <ProgressBar className="mt-3" value={delivered} max={total} label={`${t('Delivered')} ${delivered}/${total}`} />
    <p className="mt-2 text-xs text-muted">{t('Progress counts confirmed deliveries, not completed tasks.')}</p>
  </div>;
};
