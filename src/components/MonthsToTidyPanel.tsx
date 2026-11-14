import '../lib/pageCopy';
import React from 'react';
import { Link } from 'react-router-dom';
import type { Deliverable, ServiceCycle } from '../types';
import { useStore } from '../store';
import { getMonthHousekeeping } from '../lib/monthHousekeeping';
import { formatLocalizedMonth } from '../lib/i18n';
import { parseOptionalDate } from '../lib/utils';
import { Button, CountLabel, StatusChip, Surface } from './ui';
import ConfirmDialog from './ConfirmDialog';
import { useI18n } from './I18nProvider';

type BulkAction = { status: ServiceCycle['status']; label: string; kind: 'never-published' | 'ready-to-close' };

const BULK_ACTIONS: BulkAction[] = [
  { status: 'Published', label: 'Start late', kind: 'never-published' },
  { status: 'Cancelled', label: 'Cancel month', kind: 'never-published' },
  { status: 'Completed', label: 'Close month', kind: 'ready-to-close' },
];

/**
 * Every ended month that still needs a decision, across companies, with bulk
 * Start late / Cancel / Close (click reduction, item 2). Each month is saved
 * as its own command so one refusal does not undo the others; overdue months
 * only link to their company, because they need delivery work, not a status.
 */
const MonthsToTidyPanel = ({ months, deliverables, todayKey, canManage }: {
  months: readonly ServiceCycle[];
  deliverables: readonly Deliverable[];
  todayKey: string;
  canManage: boolean;
}) => {
  const { locale, t } = useI18n();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [confirm, setConfirm] = React.useState<BulkAction | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const titleId = React.useId();

  const rows = months.map(cycle => ({ cycle, housekeeping: getMonthHousekeeping(cycle, deliverables, todayKey) }))
    .sort((left, right) => left.cycle.periodStart.localeCompare(right.cycle.periodStart));
  // Drop selections for months that were resolved elsewhere.
  const selectable = new Set(rows.filter(row => row.housekeeping.kind === 'never-published' || row.housekeeping.kind === 'ready-to-close').map(row => row.cycle.id));
  const chosen = rows.filter(row => selected.has(row.cycle.id) && selectable.has(row.cycle.id));
  const countFor = (action: BulkAction) => chosen.filter(row => row.housekeeping.kind === action.kind).length;

  const toggle = (id: string) => setSelected(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const apply = async (action: BulkAction) => {
    const targets = chosen.filter(row => row.housekeeping.kind === action.kind).map(row => row.cycle);
    if (!targets.length || busy) return;
    setBusy(true);
    setResult(null);
    let saved = 0;
    let firstError = '';
    try {
      for (const cycle of targets) {
        const local = useStore.getState().setServiceCycleStatus(cycle.id, action.status);
        if (!local.ok) { firstError ||= local.error || 'This month’s status can’t change that way.'; continue; }
        const committed = await useStore.getState().commitPendingMutation('service_cycle.manage');
        if (committed.ok) saved += 1;
        else { firstError ||= committed.error || 'The change is waiting to be saved.'; break; }
      }
    } finally {
      setBusy(false);
      setConfirm(null);
      setSelected(new Set());
    }
    setResult(firstError
      ? { tone: 'error', text: `${t('{count} of {total} months saved.', { count: saved, total: targets.length })} ${t(firstError)}` }
      : { tone: 'ok', text: t('{count} months saved.', { count: saved }) });
  };

  // Stay visible after the last month is resolved so the result is read.
  if (!rows.length && !result) return null;
  const label = (cycle: ServiceCycle) => {
    const start = parseOptionalDate(cycle.periodStart);
    return start ? formatLocalizedMonth(start, locale) : cycle.periodStart;
  };

  return <Surface className="overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-5 py-4">
      <div>
        <h3 id={titleId} className="font-semibold text-ink">{t('Months to tidy up')}</h3>
        <p className="mt-1 text-sm text-muted">{t('Ended months that still need a decision. Select several to start, cancel or close them together.')}</p>
      </div>
      <CountLabel>{rows.length}</CountLabel>
    </div>
    {canManage && <div className="flex flex-wrap gap-2 border-b border-line/70 px-5 py-3" role="group" aria-label={t('Apply to selected months')}>
      {BULK_ACTIONS.map(action => {
        const count = countFor(action);
        return <Button key={action.status} variant="secondary" className="min-h-9 px-3 py-1.5" disabled={busy || count === 0} onClick={() => action.status === 'Cancelled' ? setConfirm(action) : void apply(action)}>
          {t(action.label)}{count > 0 ? ` (${count})` : ''}
        </Button>;
      })}
    </div>}
    {result && <p role={result.tone === 'error' ? 'alert' : 'status'} className={`px-5 pt-3 text-sm ${result.tone === 'error' ? 'text-red-700 dark:text-red-300' : 'text-muted'}`}>{result.text}</p>}
    <ul className="divide-y divide-line/70" aria-labelledby={titleId}>
      {rows.map(({ cycle, housekeeping }) => {
        const canSelect = canManage && selectable.has(cycle.id);
        const name = `${cycle.clientName} · ${label(cycle)}`;
        return <li key={cycle.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
          {canSelect
            ? <input type="checkbox" className="h-4 w-4" checked={selected.has(cycle.id)} disabled={busy} aria-label={`${t('Select')}: ${name}`} onChange={() => toggle(cycle.id)} />
            : <span aria-hidden="true" className="inline-block h-4 w-4" />}
          <Link to={`/clients/${encodeURIComponent(cycle.clientId)}`} className="min-w-0 flex-1 truncate text-sm font-medium text-ink hover:underline"><span data-i18n-skip>{cycle.clientName}</span> · {label(cycle)}</Link>
          {housekeeping.kind === 'never-published' && <StatusChip tone="amber">{t('Never started')}</StatusChip>}
          {housekeeping.kind === 'ready-to-close' && <StatusChip tone="emerald">{t('Ready to close')}</StatusChip>}
          {housekeeping.kind === 'overdue' && <StatusChip tone="red">{t('Overdue: {count} not done', { count: housekeeping.notDone })}</StatusChip>}
        </li>;
      })}
    </ul>
    {confirm && <ConfirmDialog
      labelledBy={`${titleId}-confirm`}
      title={t('Cancel {count} months?', { count: countFor(confirm) })}
      description={t('Cancelled months stay in history but cannot be reopened.')}
      confirmLabel={t('Cancel months')}
      cancelLabel={t('Keep them')}
      tone="danger"
      busy={busy}
      onConfirm={() => apply(confirm)}
      onClose={() => setConfirm(null)}
    />}
  </Surface>;
};

export default MonthsToTidyPanel;
