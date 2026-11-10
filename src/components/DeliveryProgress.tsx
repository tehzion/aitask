import '../lib/pageCopy';
import { ProgressBar, StatusChip } from './ui';
import { useI18n } from './I18nProvider';

/**
 * The caller selects a cycle; drafts never contribute progress.
 *
 * `delivered` is the number of deliverables whose work is done (Ready or
 * Delivered). `confirmed`, when given, is the subset the PM has confirmed as
 * sent to the client.
 */
export const DeliveryProgress = ({ published, total, delivered, confirmed, draft = false }: {
  published: boolean; total: number; delivered: number; confirmed?: number; draft?: boolean;
}) => {
  const { t } = useI18n();
  if (!published || total === 0) return <div className="mt-5" role="status">
    <StatusChip tone="slate">{t(published ? 'No deliverables in this cycle' : draft ? 'Not started yet' : 'No month in progress')}</StatusChip>
    {!published && <p className="mt-2 text-sm text-muted">{t('Delivery progress appears once this month starts.')}</p>}
  </div>;
  return <div className="mt-5">
    <p className="calm-number text-4xl font-semibold tracking-tight text-ink">{Math.round(delivered / total * 100)}%</p>
    <ProgressBar className="mt-3" value={delivered} max={total} label={`${t('Done')} ${delivered}/${total}`} />
    <p className="mt-2 text-xs text-muted">{t('Progress counts completed work.')}{confirmed !== undefined && <> · {confirmed} {t('confirmed as delivered')}</>}</p>
    <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
      {(['Included', 'Done', 'Remaining'] as const).map((label, index) => <div key={label} className="flex flex-col">
        <dt className="order-2 mt-1 text-xs text-muted">{t(label)}</dt>
        <dd className="calm-number order-1 text-2xl font-semibold text-ink">{[total, delivered, Math.max(0, total - delivered)][index]}</dd>
      </div>)}
    </dl>
  </div>;
};
