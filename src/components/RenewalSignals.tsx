import '../lib/pageCopy';
import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { ClientServicePlan } from '../types';
import { useStore } from '../store';
import { getRenewalSignals } from '../lib/opsSignals';
import { useI18n } from './I18nProvider';

const percent = (value?: number) => value === undefined ? '—' : `${Math.round(value * 100)}%`;

/** The delivery record to bring to a renewal conversation: on time and revisions. Extra requests are no longer tracked here (team feedback B1). */
const RenewalSignals = ({ plan }: { plan: Pick<ClientServicePlan, 'id' | 'clientId'> }) => {
  const { t } = useI18n();
  const { serviceCycles, deliverables, tasks } = useStore(useShallow(state => ({
    serviceCycles: state.serviceCycles, deliverables: state.deliverables, tasks: state.tasks,
  })));
  const signals = React.useMemo(
    () => getRenewalSignals(plan, serviceCycles, deliverables, tasks),
    [plan, serviceCycles, deliverables, tasks],
  );
  if (signals.cyclesReviewed === 0) return <p className="mt-1 text-xs text-muted">{t('No published months yet to review.')}</p>;
  return <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
    <span>{t('On time')} {percent(signals.onTimeRate)}</span>
    <span>{t('Revisions')} {percent(signals.revisionRate)}</span>
    <span className="basis-full text-[11px]">{t('Last {count} months', { count: signals.cyclesReviewed })}</span>
  </div>;
};

export default RenewalSignals;
