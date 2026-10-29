import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { ClientServicePlan } from '../types';
import { useStore } from '../store';
import { getRenewalSignals } from '../lib/opsSignals';
import { useI18n } from './I18nProvider';
import { StatusChip } from './ui';

const percent = (value?: number) => value === undefined ? '—' : `${Math.round(value * 100)}%`;

/** The delivery record to bring to a renewal conversation: on time, revisions and extras. */
const RenewalSignals = ({ plan }: { plan: Pick<ClientServicePlan, 'id' | 'clientId'> }) => {
  const { t } = useI18n();
  const { serviceCycles, deliverables, addons, tasks } = useStore(useShallow(state => ({
    serviceCycles: state.serviceCycles, deliverables: state.deliverables, addons: state.addons, tasks: state.tasks,
  })));
  const signals = React.useMemo(
    () => getRenewalSignals(plan, serviceCycles, deliverables, addons, tasks),
    [plan, serviceCycles, deliverables, addons, tasks],
  );
  if (signals.cyclesReviewed === 0) return <p className="mt-1 text-xs text-muted">{t('No published months yet to review.')}</p>;
  return <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
    <span>{t('On time')} {percent(signals.onTimeRate)}</span>
    <span>{t('Revisions')} {percent(signals.revisionRate)}</span>
    <span>{signals.extras} {t(signals.extras === 1 ? 'extra request' : 'extra requests')}</span>
    {signals.suggestUpgrade && <StatusChip tone="blue">{t('Suggest a larger plan')}</StatusChip>}
    <span className="basis-full text-[11px]">{t('Last {count} months', { count: signals.cyclesReviewed })}</span>
  </div>;
};

export default RenewalSignals;
