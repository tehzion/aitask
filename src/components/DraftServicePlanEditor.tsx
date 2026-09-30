import { mergeDraft, type DraftConflict } from '../lib/draftMerge';
import { readRecoveredDraft, writeRecoveredDraft, removeRecoveredDraft } from '../lib/draftRecovery';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import React from 'react';
import { Save } from 'lucide-react';
import { useStore } from '../store';
import type { ClientServicePlan, ServiceItem } from '../types';
import { snapshotWorkflow } from '../lib/serviceManagement';
import { Badge, Button } from './ui';
import { cardBase, inputBase } from './uiTokens';
import { cn } from '../lib/utils';
import { useI18n } from './I18nProvider';

const DraftServicePlanEditor = ({ plan }: { plan: ClientServicePlan }) => {
  const { t } = useI18n();
  const { serviceWorkflowTemplates, updateDraftClientPlan, commitPendingMutation } = useStore();
  const [name, setName] = React.useState(plan.name);
  const [contractEndDate, setContractEndDate] = React.useState(plan.contractEndDate || '');
  const [serviceItems, setServiceItems] = React.useState<ServiceItem[]>(() => structuredClone(plan.serviceItems));
  const [discountType, setDiscountType] = React.useState(plan.discountType);
  const [discountValue, setDiscountValue] = React.useState(plan.discountValue);
  const [taxRateBps, setTaxRateBps] = React.useState(plan.taxRateBps);
  const [message, setMessage] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const isDirtyRef = React.useRef(false);
  const [dirty, setDirty] = React.useState(false);
  const [conflict, setConflict] = React.useState(false);
  const editSequence = React.useRef(0);
  const draftOf = (value: ClientServicePlan) => ({ name: value.name, contractEndDate: value.contractEndDate || '', serviceItems: structuredClone(value.serviceItems), discountType: value.discountType, discountValue: value.discountValue, taxRateBps: value.taxRateBps });
  const baseline = React.useRef(draftOf(plan));
  const baselineFingerprint = React.useRef(JSON.stringify(plan));
  const [mergeConflicts, setMergeConflicts] = React.useState<DraftConflict[]>([]);
  const mergeChoices = React.useRef<Record<string, 'local' | 'remote'>>({});
  const reconciliation = React.useRef<{ baseline: ReturnType<typeof draftOf>; local: ReturnType<typeof draftOf>; remote: ReturnType<typeof draftOf>; fingerprint: string } | null>(null);
  const account = useStore(state => state.currentUser?.authUserId || state.currentUser?.id || '');
  const recoveryKey = `service-plan:${plan.id}`;
  const [recovery, setRecovery] = React.useState(() => account ? readRecoveredDraft<ReturnType<typeof draftOf>>(account, recoveryKey) : null);
  const optimisticFingerprint = React.useRef<string | null>(null);
  const savingRef = React.useRef(false);
  useUnsavedChanges(dirty || saving);
  const applyDraft = (value: ReturnType<typeof draftOf>) => {
    setName(value.name); setContractEndDate(value.contractEndDate); setServiceItems(value.serviceItems);
    setDiscountType(value.discountType); setDiscountValue(value.discountValue); setTaxRateBps(value.taxRateBps);
  };
  const reloadLatest = () => {
    applyDraft(draftOf(plan));
    baseline.current = draftOf(plan); baselineFingerprint.current = JSON.stringify(plan); optimisticFingerprint.current = null;
    isDirtyRef.current = false; setDirty(false); setConflict(false); setMergeConflicts([]); reconciliation.current = null; setMessage('');
    removeRecoveredDraft(account, recoveryKey, recovery?.storageKey); setRecovery(null);
  };
  const completeMerge = (choices: Record<string, 'local' | 'remote'>) => {
    const context = reconciliation.current;
    if (!context) return;
    const result = mergeDraft(context.baseline, context.local, context.remote, choices);
    setMergeConflicts(result.conflicts);
    if (result.conflicts.length) return;
    applyDraft(result.value);
    baseline.current = context.remote; baselineFingerprint.current = context.fingerprint;
    optimisticFingerprint.current = null; reconciliation.current = null;
    setConflict(false); setRecovery(null);
  };
  const keepDraft = () => {
    const latest = useStore.getState().clientPlans.find(value => value.id === plan.id);
    if (!latest) return;
    mergeChoices.current = {};
    reconciliation.current = { baseline: baseline.current, local: { name, contractEndDate, serviceItems, discountType, discountValue, taxRateBps }, remote: draftOf(latest), fingerprint: JSON.stringify(latest) };
    completeMerge({});
  };
  const chooseConflict = (path: string, choice: 'local' | 'remote') => {
    mergeChoices.current = { ...mergeChoices.current, [path]: choice };
    completeMerge(mergeChoices.current);
  };
  const restoreRecovery = () => {
    if (!recovery || !Array.isArray(recovery.value.serviceItems) || typeof recovery.value.name !== 'string') return;
    applyDraft(recovery.value); baseline.current = recovery.baseline;
    baselineFingerprint.current = ''; optimisticFingerprint.current = null;
    isDirtyRef.current = true; editSequence.current += 1; setDirty(true); setConflict(true); setRecovery(null);
  };
  React.useEffect(() => {
    if (!dirty || !account) return;
    const actor = useStore.getState().currentUser;
    if ((actor?.authUserId || actor?.id) !== account) return;
    writeRecoveredDraft(account, recoveryKey, baseline.current, { name, contractEndDate, serviceItems, discountType, discountValue, taxRateBps });
  }, [account, recoveryKey, dirty, name, contractEndDate, serviceItems, discountType, discountValue, taxRateBps]);


  React.useEffect(() => {
    if (savingRef.current) return;
    if (isDirtyRef.current) {
      const fingerprint = JSON.stringify(plan);
      setConflict(fingerprint !== baselineFingerprint.current && fingerprint !== optimisticFingerprint.current);
      if (reconciliation.current && reconciliation.current.fingerprint !== fingerprint) { reconciliation.current = null; setMergeConflicts([]); }
      return;
    }
    baseline.current = draftOf(plan); baselineFingerprint.current = JSON.stringify(plan);
    setName(plan.name);
    setContractEndDate(plan.contractEndDate || '');
    setServiceItems(structuredClone(plan.serviceItems));
    setDiscountType(plan.discountType);
    setDiscountValue(plan.discountValue);
    setTaxRateBps(plan.taxRateBps);
  }, [plan, saving]);

  const markDirty = () => {
    isDirtyRef.current = true;
    editSequence.current += 1;
    setDirty(true);
  };

  const updateItem = (id: string, patch: Partial<ServiceItem>) => {
    markDirty();
    setServiceItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
  };

  const save = async () => {
    if (savingRef.current) return;
    const latestPlan = useStore.getState().clientPlans.find(value => value.id === plan.id);
    const latestFingerprint = JSON.stringify(latestPlan);
    if (latestFingerprint !== baselineFingerprint.current && latestFingerprint !== optimisticFingerprint.current) { setConflict(true); return; }
    setMessage('');
    const trimmedName = name.trim();
    if (!trimmedName) return setMessage(t('Plan name is required.'));
    if (serviceItems.length === 0) return setMessage(t('Add at least one service item.'));
    if (serviceItems.some(item => !item.name.trim())) return setMessage(t('Every service item needs a name.'));
    if (serviceItems.some(item => !Number.isInteger(item.quantity) || item.quantity < 1)) return setMessage(t('Quantities must be whole numbers of at least one.'));
    if (serviceItems.some(item => item.unitPriceMinor < 0 || !Number.isFinite(item.unitPriceMinor))) return setMessage(t('Unit prices must be non-negative.'));
    if (discountType === 'percent' && discountValue > 10000) return setMessage(t('Percent discount cannot exceed 100%.'));

    const submittedSequence = editSequence.current;
    savingRef.current = true;
    const result = updateDraftClientPlan(plan.id, { name: trimmedName, contractEndDate, serviceItems, discountType, discountValue, taxRateBps });
    if (!result.ok) { savingRef.current = false; return setMessage(result.error || t('Unable to update this revision.')); }
    optimisticFingerprint.current = JSON.stringify(useStore.getState().clientPlans.find(value => value.id === plan.id));
    setSaving(true);
    let committed: { ok: boolean; error?: string };
    try { committed = await commitPendingMutation('client_plan.manage'); }
    catch (error) { committed = { ok: false, error: error instanceof Error ? error.message : t('Unable to update this revision.') }; }
    finally { savingRef.current = false; setSaving(false); }
    if (committed.ok) {
      optimisticFingerprint.current = null;
      const canonical = useStore.getState().clientPlans.find(value => value.id === plan.id);
      if (canonical) { baseline.current = draftOf(canonical); baselineFingerprint.current = JSON.stringify(canonical); }
      if (editSequence.current === submittedSequence) {
        isDirtyRef.current = false; setDirty(false); removeRecoveredDraft(account, recoveryKey, recovery?.storageKey); setRecovery(null);
        if (canonical) applyDraft(draftOf(canonical));
      }
      setConflict(false);
    }
    setSaving(false);
    setMessage(committed.ok ? t('Draft revision saved.') : committed.error || t('The revision is waiting to be saved.'));
  };

  return <section className={cn(cardBase, 'overflow-hidden border-blue-200')}>
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-blue-100 bg-blue-50 px-5 py-4">
      <div><div className="flex items-center gap-2"><h2 className="font-semibold text-blue-950">{t('Scheduled revision')} {plan.revision}</h2><Badge tone="amber">{t('Draft')}</Badge></div><p className="mt-1 text-sm text-blue-800">{t('Takes effect on')} {plan.effectiveFromCycleStart}. {t('Existing cycles remain unchanged.')}</p></div>
      <Button onClick={() => void save()} disabled={saving || conflict}><Save className="h-4 w-4" />{saving ? t('Saving…') : t('Save revision')}</Button>
    </div>
    {recovery && <div className="border-b border-line bg-inset px-5 py-4" role="status"><p>{t('A recoverable draft is available on this device.')}</p><div className="mt-3 flex gap-2"><Button variant="secondary" onClick={restoreRecovery}>{t('Restore recovered draft')}</Button><Button variant="secondary" onClick={() => { removeRecoveredDraft(account, recoveryKey, recovery?.storageKey); setRecovery(null); }}>{t('Discard recovered draft')}</Button></div></div>}
    {conflict && <div className="border-b border-line bg-inset px-5 py-4" role="alert">
      <p className="text-sm text-ink">{t('This revision changed elsewhere. Review the latest version before saving.')}</p>
      <div className="mt-3 flex gap-2"><Button variant="secondary" onClick={reloadLatest}>{t('Reload latest')}</Button><Button variant="secondary" onClick={keepDraft}>{t('Keep my draft')}</Button></div>
      {mergeConflicts.map(item => <div key={item.path} className="mt-3 rounded-lg border border-line p-3"><p className="text-sm">{t('Both versions changed this field. Choose which value to keep.')}</p><p data-i18n-skip className="mt-1 break-all font-mono text-xs">{item.path}</p><div className="mt-2 grid gap-2 sm:grid-cols-2"><div><pre data-i18n-skip className="max-h-32 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(item.local, null, 2) ?? t('Removed')}</pre><Button variant="secondary" onClick={() => chooseConflict(item.path, 'local')}>{t('Use my value')}</Button></div><div><pre data-i18n-skip className="max-h-32 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(item.remote, null, 2) ?? t('Removed')}</pre><Button variant="secondary" onClick={() => chooseConflict(item.path, 'remote')}>{t('Use latest value')}</Button></div></div></div>)}
    </div>}
    <fieldset disabled={mergeConflicts.length > 0} className="contents"><div className="grid gap-4 border-b border-slate-100 p-5 md:grid-cols-2">
      <label className="text-sm font-semibold text-slate-700">{t('Plan name')}<input data-i18n-skip className={cn(inputBase, 'mt-1 px-3 py-2')} value={name} onChange={event => { markDirty(); setName(event.target.value); }} /></label>
      <label className="text-sm font-semibold text-slate-700">{t('Contract end date')}<input type="date" className={cn(inputBase, 'mt-1 px-3 py-2')} value={contractEndDate} onChange={event => { markDirty(); setContractEndDate(event.target.value); }} /></label>
    </div>
    <div className="divide-y divide-slate-100">{serviceItems.map(item => <div key={item.id} className="grid gap-3 p-5 md:grid-cols-12">
      <input aria-label={t('Service name')} data-i18n-skip className={cn(inputBase, 'px-3 py-2 md:col-span-3')} value={item.name} onChange={event => updateItem(item.id, { name: event.target.value })} />
      <input aria-label={t('Platforms')} data-i18n-skip className={cn(inputBase, 'px-3 py-2 md:col-span-3')} value={item.platforms.join(', ')} onChange={event => updateItem(item.id, { platforms: event.target.value.split(',').map(value => value.trim()).filter(Boolean) })} />
      <input aria-label={t('Quantity')} className={cn(inputBase, 'px-3 py-2 md:col-span-1')} value={item.quantity} onChange={event => updateItem(item.id, { quantity: Number(event.target.value) })} />
      <input aria-label={t('Unit price')} type="number" min="0" step="0.01" className={cn(inputBase, 'px-3 py-2 md:col-span-2')} value={item.unitPriceMinor / 100} onChange={event => updateItem(item.id, { unitPriceMinor: Math.round(Number(event.target.value) * 100) })} />
      <select aria-label={t('Task workflow')} className={cn(inputBase, 'px-3 py-2 md:col-span-3')} value={item.workflow?.templateId || ''} onChange={event => { const template = serviceWorkflowTemplates.find(value => value.id === event.target.value); updateItem(item.id, { workflow: template ? snapshotWorkflow(template) : undefined }); }}>
        <option value="">{t('No task workflow')}</option>{serviceWorkflowTemplates.filter(value => value.isActive).map(template => <option key={template.id} value={template.id} data-i18n-skip>{template.name}{' · '}{t('rev')} {template.revision}</option>)}
      </select>
    </div>)}</div>
    <div className="grid gap-4 border-t border-slate-100 bg-slate-50 p-5 md:grid-cols-3">
      <label className="text-sm font-semibold text-slate-700">{t('Discount type')}<select className={cn(inputBase, 'mt-1 px-3 py-2')} value={discountType} onChange={event => { markDirty(); setDiscountType(event.target.value as ClientServicePlan['discountType']); setDiscountValue(0); }}><option value="none">{t('None')}</option><option value="percent">{t('Percent')}</option><option value="fixed">{t('Fixed MYR')}</option></select></label>
      <label className="text-sm font-semibold text-slate-700">{t('Discount value')}<input type="number" min="0" max={discountType === 'percent' ? 100 : undefined} step="0.01" disabled={discountType === 'none'} className={cn(inputBase, 'mt-1 px-3 py-2')} value={discountValue / 100} onChange={event => { markDirty(); setDiscountValue(Math.round(Number(event.target.value) * 100)); }} /></label>
      <label className="text-sm font-semibold text-slate-700">{t('Tax rate (%)')}<input type="number" min="0" max="100" step="0.01" className={cn(inputBase, 'mt-1 px-3 py-2')} value={taxRateBps / 100} onChange={event => { markDirty(); setTaxRateBps(Math.round(Number(event.target.value) * 100)); }} /></label>
    </div>
    </fieldset>
    {message && <p className="border-t border-slate-100 px-5 py-3 text-sm font-medium text-blue-800" role="status">{message}</p>}
  </section>;
};

export default DraftServicePlanEditor;
