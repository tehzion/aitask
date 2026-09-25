import React from 'react';
import { X } from 'lucide-react';
import ModalShell from './ModalShell';
import { Button } from './ui';
import { inputBase, modalFooter } from './uiTokens';
import { useStore } from '../store';
import { useToastStore } from '../store/useToastStore';
import { useShallow } from 'zustand/react/shallow';
import { useI18n } from './I18nProvider';
import type { ClientServicePlan } from '../types';

type Props = {
  plan: ClientServicePlan;
  onClose: () => void;
};

const EditClientPlanDatesModal: React.FC<Props> = ({ plan, onClose }) => {
  const { updateDraftClientPlan, updateActivePlanDates, retryPendingSave, backend } = useStore(useShallow(state => ({
    updateDraftClientPlan: state.updateDraftClientPlan,
    updateActivePlanDates: state.updateActivePlanDates,
    retryPendingSave: state.retryPendingSave,
    backend: state.backend,
  })));
  const { t } = useI18n();
  const titleId = React.useId();
  const isDraft = plan.status === 'Draft';
  const [startDate, setStartDate] = React.useState(plan.startDate || '');
  const [billingDay, setBillingDay] = React.useState(String(plan.billingDay || 1));
  const [contractEndDate, setContractEndDate] = React.useState(plan.contractEndDate || '');
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setError('');
    const day = Number(billingDay);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      setError(t('Billing day must be a whole number from 1 to 31.'));
      return;
    }
    if (contractEndDate && startDate && contractEndDate < startDate) {
      setError(t('Contract end date cannot be before the start date.'));
      return;
    }
    const result = isDraft
      ? updateDraftClientPlan(plan.id, { startDate, billingDay: day, contractEndDate })
      : updateActivePlanDates(plan.id, { billingDay: day, contractEndDate });
    if (!result.ok) {
      setError(t(result.error || 'Unable to update the plan dates.'));
      return;
    }
    setSaving(true);
    const committed = await retryPendingSave();
    setSaving(false);
    if (!committed.ok) {
      setError(t(committed.error || 'The plan date change is waiting to be saved.'));
      return;
    }
    useToastStore.getState().addToast(`Plan dates updated for "${plan.clientName}".`, 'success');
    onClose();
  };

  return (
    <ModalShell labelledBy={titleId} onClose={onClose} panelClassName="max-w-md">
      <header className="flex items-start justify-between gap-4 border-b border-line px-5 pb-5 pt-6 sm:px-6">
        <div>
          <p className="calm-eyebrow">{t('Service plan')}</p>
          <h2 id={titleId} className="mt-1 text-xl font-semibold tracking-[-0.03em] text-ink">{t('Edit plan dates')}</h2>
          <p className="mt-1 text-sm text-muted" data-i18n-skip>{plan.name}</p>
        </div>
        <button type="button" aria-label={t('Close')} onClick={onClose} disabled={saving} className="flex h-11 w-11 items-center justify-center rounded-control text-muted hover:bg-inset hover:text-ink disabled:cursor-wait disabled:opacity-50"><X className="h-5 w-5" /></button>
      </header>
      <form onSubmit={save} className="space-y-4 p-5 sm:p-6">
        <label className="block text-sm font-medium text-ink">{t('Start date')}
          <input
            type="date"
            disabled={!isDraft}
            className={`${inputBase} mt-1.5 px-3 py-2.5 disabled:cursor-not-allowed disabled:bg-inset disabled:text-muted`}
            value={startDate}
            onChange={event => setStartDate(event.target.value)}
          />
        </label>
        {!isDraft && <p className="-mt-2 text-xs leading-5 text-muted">{t('An active plan’s start date is fixed. Use Revision to change the schedule from a future cycle.')}</p>}
        <label className="block text-sm font-medium text-ink">{t('Monthly billing day')}
          <input
            type="number"
            min={1}
            max={31}
            className={`${inputBase} mt-1.5 px-3 py-2.5`}
            value={billingDay}
            onChange={event => setBillingDay(event.target.value)}
          />
        </label>
        <label className="block text-sm font-medium text-ink">{t('Contract end date (reminder only)')}
          <input
            type="date"
            min={startDate || undefined}
            className={`${inputBase} mt-1.5 px-3 py-2.5`}
            value={contractEndDate}
            onChange={event => setContractEndDate(event.target.value)}
          />
        </label>
        {error && <p className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert">{error}</p>}
        <div className={modalFooter}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>{t('Cancel')}</Button>
          <Button type="submit" disabled={saving || backend.isSaving || backend.isPulling}>{saving ? t('Saving…') : t('Save dates')}</Button>
        </div>
      </form>
    </ModalShell>
  );
};

export default EditClientPlanDatesModal;
