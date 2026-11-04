import React from 'react';
import { useStore } from '../store';
import { canManageServiceCycles, canViewServicePrices } from '../lib/access';
import { canOpenServiceClient } from '../lib/access';
import { isPendingMutationResolution } from '../store';
import { captureWorkspaceSession, isWorkspaceSessionCurrent } from '../lib/workspaceSession';
import { useI18n } from './I18nProvider';
import ModalShell from './ModalShell';
import { Button } from './ui';
import { inputBase } from './uiTokens';
import type { ServiceCycle } from '../types';
import { cyclePaymentSummary, halfPaymentMinor } from '../lib/cyclePayments';
import { getBillingToday } from '../lib/monthlyRecords';
import { formatMoney } from '../lib/serviceManagement';
import { formatLocalizedDate, formatLocalizedDateTime } from '../lib/i18n';

export default function CyclePaymentControl({ cycle }: { cycle: ServiceCycle }) {
  const store = useStore();
  const { t, locale } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState('');
  const [date, setDate] = React.useState(getBillingToday);
  const [voidId, setVoidId] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const guard = React.useRef(false);
  const pending = React.useRef<{ type: 'service_cycle_payment.record' | 'service_cycle_payment.void'; id: string } | null>(null);
  const titleId = React.useId();
  const canSee = canViewServicePrices(store.currentUser, store.rolePermissions) && store.currentUser?.role !== 'Client';
  const canManage = canSee && canManageServiceCycles(store.currentUser, store.rolePermissions) && canOpenServiceClient(store.currentUser, cycle.clientName, store.tasks, store.rolePermissions, store.clients, store.projects);
  const summary = cyclePaymentSummary(cycle, store.servicePricingSnapshots, store.serviceCyclePayments);
  const blocked = isPendingMutationResolution(store.backend);
  const money = (value: number) => formatMoney(value, 'MYR', locale);
  const day = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return match ? formatLocalizedDate(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])), locale) : value;
  };
  const stamp = (value?: string) => (value ? formatLocalizedDateTime(new Date(value), locale) || value : '');
  const memberName = (id?: string) => store.users.find(user => user.id === id)?.name || t('Team member');
  if (!canSee) return null;
  const choose = (half: boolean) => {
    setAmount(((half ? halfPaymentMinor(summary) : summary.remaining) / 100).toFixed(2));
    setDate(getBillingToday()); setVoidId(''); setReason(''); setError(''); setOpen(true);
  };
  const save = async (retry = false) => {
    if (guard.current) return;
    guard.current = true; setBusy(true); setError('');
    const session = captureWorkspaceSession();
    try {
      let submission = pending.current;
      if (!retry) {
        if (!voidId && !/^\d+(\.\d{1,2})?$/.test(amount)) { setError(t('Enter a positive amount in MYR.')); return; }
        const result = voidId ? store.voidServiceCyclePayment(voidId, reason) : store.recordServiceCyclePayment(cycle.id, Math.round(Number(amount) * 100), date);
        if (!result.ok) { setError(result.error || 'Unable to save payment.'); return; }
        const id = voidId || ('id' in result && typeof result.id === 'string' ? result.id : '');
        submission = { type: voidId ? 'service_cycle_payment.void' : 'service_cycle_payment.record', id };
        pending.current = submission;
      }
      if (!submission) return;
      const result = retry ? await store.retryPendingSave(submission.type) : await store.commitPendingMutation(submission.type);
      if (!isWorkspaceSessionCurrent(session)) return;
      if (!result.ok) { setError(result.error || 'Unable to save payment.'); return; }
      const saved = useStore.getState().serviceCyclePayments.find(item => item.id === submission.id);
      if (!saved || (submission.type.endsWith('.void') && !saved.voidedAt)) { pending.current = null; setError(t('Payment was not saved. Review and try again.')); return; }
      pending.current = null; setVoidId(''); setReason(''); setAmount(''); setError('');
    } catch (failure) {
      if (isWorkspaceSessionCurrent(session)) setError(failure instanceof Error ? failure.message : 'Unable to save payment.');
    } finally { guard.current = false; if (isWorkspaceSessionCurrent(session)) setBusy(false); }
  };
  return <div className="min-w-48 space-y-1 text-xs">
    <p className="font-medium text-ink">{t(summary.status)}</p>
    {summary.receipts.filter(item => !item.voidedAt).map(item => <p key={item.id} data-i18n-skip>{money(item.amountMinor)} · {day(item.paymentDate)}</p>)}
    <p>{t('Total received')}: {money(summary.received)}</p><p>{t('Remaining balance')}: {money(summary.remaining)}</p>
    {canManage && <div className="flex flex-wrap gap-2 pt-1"><Button variant="secondary" disabled={blocked || busy || summary.remaining <= 0} onClick={() => choose(true)}>{t('Half payment')}</Button><Button variant="secondary" disabled={blocked || busy || summary.remaining <= 0} onClick={() => choose(false)}>{t('Full payment')}</Button></div>}
    {(canManage || summary.receipts.length > 0) && <button type="button" className="min-h-9 text-accent underline" onClick={() => setOpen(true)}>{t('Payment records')}</button>}
    {open && <ModalShell labelledBy={titleId} onClose={() => { if (!busy) setOpen(false); }} panelClassName="max-w-lg">
      <div className="p-5"><h2 id={titleId} className="text-lg font-semibold">{t('Payment records')}</h2><p className="mt-2 text-sm" data-i18n-skip>{cycle.periodStart} – {cycle.periodEnd}</p>
        <p className="mt-2 text-sm">{t('Monthly total')}: {money(summary.total)} · {t('Total received')}: {money(summary.received)} · {t('Remaining balance')}: {money(summary.remaining)}</p>
        <ul className="my-4 divide-y divide-line">{summary.receipts.map(item => <li key={item.id} className="py-3 text-sm"><p data-i18n-skip>{money(item.amountMinor)} · {day(item.paymentDate)}</p><p className="text-xs text-muted">{t('Recorded by')} <span data-i18n-skip>{memberName(item.createdBy)} · {stamp(item.createdAt)}</span></p>{item.voidedAt ? <><p>{t('Voided')}</p><p className="text-xs text-muted">{t('Voided by')} <span data-i18n-skip>{memberName(item.voidedBy)} · {stamp(item.voidedAt)}</span></p>{item.voidReason && <p className="text-xs text-muted" data-i18n-skip>{item.voidReason}</p>}</> : canManage && <Button variant="secondary" disabled={busy || blocked || Boolean(pending.current)} onClick={() => { setVoidId(item.id); setReason(''); }}>{t('Void receipt')}</Button>}</li>)}</ul>
        {canManage && <form onSubmit={event => { event.preventDefault(); void save(); }}><fieldset disabled={busy || blocked || Boolean(pending.current)} className="space-y-3">
          {voidId ? <label className="block text-sm">{t('Reason for voiding')}<input required maxLength={1000} className={inputBase} value={reason} onChange={event => setReason(event.target.value)} /></label> : <><div className="flex gap-2"><Button variant="secondary" disabled={summary.remaining <= 0} onClick={() => choose(true)}>{t('Half payment')}</Button><Button variant="secondary" disabled={summary.remaining <= 0} onClick={() => choose(false)}>{t('Full payment')}</Button></div><label className="block text-sm">{t('Amount (MYR)')}<input required type="number" min="0.01" max={summary.remaining / 100} step="0.01" inputMode="decimal" className={inputBase} value={amount} onChange={event => setAmount(event.target.value)} /></label><label className="block text-sm">{t('Payment date')}<input required type="date" max={getBillingToday()} className={inputBase} value={date} onChange={event => setDate(event.target.value)} /></label></>}
          <Button type="submit" disabled={!voidId && summary.remaining <= 0}>{t(voidId ? 'Void receipt' : 'Record payment')}</Button>{voidId && <Button variant="secondary" onClick={() => setVoidId('')}>{t('Cancel')}</Button>}
        </fieldset></form>}
        {error && <p role="alert" className="mt-3 text-sm">{t(error)}</p>}
        {pending.current && <Button variant="secondary" disabled={busy} onClick={() => void save(true)}>{t('Retry saved change')}</Button>}
        <Button className="mt-4" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>{t('Close')}</Button>
      </div>
    </ModalShell>}
  </div>;
}
