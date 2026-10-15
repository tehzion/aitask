import React from 'react';
import { useStore, isPendingMutationResolution } from '../store';
import type { ClientServicePlan, ServiceItem } from '../types';
import { mergeDraft, type DraftConflict } from '../lib/draftMerge';
import { readRecoveredDraft, writeRecoveredDraft, removeRecoveredDraft } from '../lib/draftRecovery';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { calculatePlanTotalMinor, formatMoney, getPlanContractStartDate, nextBillingDate, snapshotWorkflow } from '../lib/serviceManagement';
import { getBillingToday, validateRevisionItems } from '../lib/monthlyRecords';
import { captureWorkspaceSession, isWorkspaceSessionCurrent } from '../lib/workspaceSession';
import { canViewServicePrices } from '../lib/access';
import { formatLocalizedDate } from '../lib/i18n';
import { cn, parseOptionalDate } from '../lib/utils';
import { revisionDraftOf } from './RevisionRecoveryNotice';
import { useI18n } from './I18nProvider';
import { Badge, Button } from './ui';
import { cardBase, inputBase } from './uiTokens';
import BackendFreshness from './BackendFreshness';
import SystemMessage from './SystemMessage';

type Draft = ReturnType<typeof revisionDraftOf>;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const DraftServicePlanEditor = ({ plan, source }: { plan: ClientServicePlan; source: ClientServicePlan }) => {
  const { t, locale } = useI18n();
  const store = useStore();
  const [draft, setDraft] = React.useState<Draft>(() => revisionDraftOf(plan));
  const [baseline, setBaseline] = React.useState<Draft>(() => revisionDraftOf(plan));
  const fingerprint = React.useRef(JSON.stringify(plan));
  const [conflict, setConflict] = React.useState(false);
  const [mergeConflicts, setMergeConflicts] = React.useState<DraftConflict[]>([]);
  const mergeContext = React.useRef<{ base: Draft; mine: Draft; latest: Draft; planFingerprint: string } | null>(null);
  const choices = React.useRef<Record<string, 'local' | 'remote'>>({});
  const [review, setReview] = React.useState<{ fingerprint: string; date: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const busyRef = React.useRef(false);
  const mounted = React.useRef(true);
  const [feedback, setFeedback] = React.useState<{ text: string; error: boolean } | null>(null);
  const alertRef = React.useRef<HTMLDivElement>(null);
  const formId = React.useId();
  const contractHelpId = React.useId();
  const account = store.currentUser?.authUserId || store.currentUser?.id || '';
  const formKey = `service-plan:${plan.id}`;
  const [recovery, setRecovery] = React.useState(() => account ? readRecoveredDraft<Draft>(account, formKey) : null);
  const optimistic = React.useRef<string | null>(null);
  const pending = React.useRef<{ kind: 'save' | 'schedule' | 'draft'; submitted: Draft } | null>(null);
  const dirty = !same(draft, baseline);
  const dirtyRef = React.useRef(dirty); dirtyRef.current = dirty;
  const scheduled = plan.revisionScheduleStatus === 'scheduled';
  const blocked = isPendingMutationResolution(store.backend);
  const canSeePrices = canViewServicePrices(store.currentUser, store.rolePermissions);
  const effectiveDate = source.nextCycleStart || nextBillingDate(getBillingToday(), source.billingDay);
  const contractStartDate = getPlanContractStartDate(plan, store.clientPlans);
  const dateLabel = (value: string) => formatLocalizedDate(parseOptionalDate(value)!, locale);
  const totals = calculatePlanTotalMinor(draft.serviceItems, draft.discountType, draft.discountValue, draft.taxRateBps);
  const currentTotals = calculatePlanTotalMinor(source.serviceItems, source.discountType, source.discountValue, source.taxRateBps);
  useUnsavedChanges(dirty || busy);

  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  React.useEffect(() => { if (feedback?.error) alertRef.current?.focus(); }, [feedback]);
  React.useEffect(() => {
    if (dirty && account && !scheduled) writeRecoveredDraft(account, formKey, baseline, draft);
  }, [account, formKey, baseline, draft, dirty, scheduled]);
  React.useEffect(() => {
    const refresh = () => { if (!dirtyRef.current && !busyRef.current) setRecovery(account ? readRecoveredDraft(account, formKey) : null); };
    window.addEventListener('storage', refresh); window.addEventListener('aitask:draft-recovery', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('aitask:draft-recovery', refresh); };
  }, [account, formKey]);
  React.useEffect(() => {
    if (busyRef.current) return;
    const nextFingerprint = JSON.stringify(plan);
    if (dirtyRef.current) {
      setConflict(nextFingerprint !== fingerprint.current && nextFingerprint !== optimistic.current);
      return;
    }
    fingerprint.current = nextFingerprint;
    setBaseline(revisionDraftOf(plan)); setDraft(revisionDraftOf(plan));
  }, [plan, busy]);
  React.useEffect(() => { setReview(null); }, [plan, effectiveDate]);

  const error = (text: string) => setFeedback({ text: t(text), error: true });
  const update = (patch: Partial<Draft>) => { setDraft(current => ({ ...current, ...patch })); setReview(null); setFeedback(null); };
  const updateItem = (id: string, patch: Partial<ServiceItem>) => {
    setDraft(current => ({ ...current, serviceItems: current.serviceItems.map(item => item.id === id ? { ...item, ...patch } : item) })); setReview(null); setFeedback(null);
  };
  const acceptSaved = (saved: ClientServicePlan, submitted?: Draft) => {
    const value = revisionDraftOf(saved);
    fingerprint.current = JSON.stringify(saved); optimistic.current = null;
    setBaseline(value); setConflict(false); setMergeConflicts([]);
    if (!submitted || same(draft, submitted)) {
      setDraft(value); removeRecoveredDraft(account, formKey, recovery?.storageKey); setRecovery(null);
    }
  };
  const reload = () => { acceptSaved(plan); setFeedback(null); setReview(null); };
  const merge = (nextChoices: Record<string, 'local' | 'remote'>) => {
    const context = mergeContext.current;
    if (!context) return;
    const result = mergeDraft(context.base, context.mine, context.latest, nextChoices);
    setMergeConflicts(result.conflicts);
    if (result.conflicts.length) return;
    fingerprint.current = context.planFingerprint; setBaseline(context.latest); setDraft(result.value);
    setConflict(false); setRecovery(null); optimistic.current = null; mergeContext.current = null;
  };
  const keepDraft = () => {
    const latest = useStore.getState().clientPlans.find(item => item.id === plan.id);
    if (!latest) return;
    choices.current = {}; mergeContext.current = { base: baseline, mine: draft, latest: revisionDraftOf(latest), planFingerprint: JSON.stringify(latest) }; merge({});
  };
  const restore = () => {
    if (!recovery || !Array.isArray(recovery.value.serviceItems) || typeof recovery.value.name !== 'string') return;
    choices.current = {}; mergeContext.current = { base: recovery.baseline, mine: recovery.value, latest: revisionDraftOf(plan), planFingerprint: JSON.stringify(plan) };
    setDraft(recovery.value); setConflict(true); merge({}); setRecovery(null);
  };

  const commit = async (kind: 'save' | 'schedule' | 'draft', mutate: () => { ok: boolean; error?: string }) => {
    if (busyRef.current) return;
    const session = captureWorkspaceSession();
    busyRef.current = true; setBusy(true); setFeedback(null);
    try {
      const result = mutate();
      if (!result.ok) { error(result.error || 'Unable to update this revision.'); return; }
      optimistic.current = JSON.stringify(useStore.getState().clientPlans.find(item => item.id === plan.id));
      pending.current = { kind, submitted: draft };
      const saved = await store.commitPendingMutation('client_plan.manage');
      if (!mounted.current || !isWorkspaceSessionCurrent(session)) return;
      if (!saved.ok) { error(saved.error || 'The revision is waiting to be saved.'); return; }
      const canonical = useStore.getState().clientPlans.find(item => item.id === plan.id);
      if (canonical) acceptSaved(canonical, draft);
      pending.current = null;
      setFeedback({ text: t(kind === 'save' ? 'Draft saved. Review the changes before scheduling.' : kind === 'schedule' ? 'Next month’s plan is scheduled.' : 'Plan returned to draft. Review and schedule it again when ready.'), error: false });
    } catch (failure) { if (mounted.current && isWorkspaceSessionCurrent(session)) error(failure instanceof Error ? failure.message : 'Unable to update this revision.'); }
    finally { busyRef.current = false; if (mounted.current && isWorkspaceSessionCurrent(session)) setBusy(false); }
  };
  const save = () => {
    const latest = useStore.getState().clientPlans.find(item => item.id === plan.id);
    if (JSON.stringify(latest) !== fingerprint.current && JSON.stringify(latest) !== optimistic.current) { setConflict(true); return; }
    const validation = validateRevisionItems(draft.serviceItems);
    if (!draft.name.trim()) return error('Plan name is required.');
    if (validation) return error(validation);
    if (draft.contractEndDate && draft.contractEndDate < contractStartDate) return error('Contract end date cannot be before the start date.');
    void commit('save', () => store.updateDraftClientPlan(plan.id, draft));
  };
  const retry = async () => {
    if (busyRef.current) return;
    const session = captureWorkspaceSession(); busyRef.current = true; setBusy(true);
    try {
      const result = await store.retryPendingSave('client_plan.manage');
      if (!mounted.current || !isWorkspaceSessionCurrent(session)) return;
      if (!result.ok) { error(result.error || 'The revision is waiting to be saved.'); return; }
      const saved = useStore.getState().clientPlans.find(item => item.id === plan.id);
      if (saved && pending.current) acceptSaved(saved, pending.current.submitted);
      pending.current = null; setFeedback({ text: t('Your plan change was saved.'), error: false });
    } catch (failure) { if (isWorkspaceSessionCurrent(session)) error(failure instanceof Error ? failure.message : 'Unable to update this revision.'); }
    finally { busyRef.current = false; if (mounted.current && isWorkspaceSessionCurrent(session)) setBusy(false); }
  };
  const schedule = () => {
    if (!review || review.fingerprint !== JSON.stringify(plan) || review.date !== effectiveDate || dirty) return error('The billing date changed. Refresh and review the next cycle before scheduling.');
    void commit('schedule', () => store.scheduleClientPlanRevision(plan.id, review.date, plan.version));
  };
  const itemSummary = (item?: ServiceItem) => item ? `${item.quantity} ${item.unit} · ${item.platforms.join(', ') || t('No platform')}${canSeePrices ? ` · ${formatMoney(item.unitPriceMinor, 'MYR', locale)} ${t('each')}` : ''}${item.workflow ? ` · ${item.workflow.name}` : ''}` : t('Not included');
  const fieldClass = cn(inputBase, 'mt-2 px-3 py-2');
  const conflictLabel = (path: string) => {
    const service = draft.serviceItems.find(item => path.includes(`[${item.id}]`));
    const fields: Record<string, string> = { name: 'Service name', quantity: 'Quantity', unit: 'Unit', unitPriceMinor: 'Unit price', platforms: 'Platforms', workflow: 'Task workflow', taxRateBps: 'Tax rate (%)', discountValue: 'Discount value', contractEndDate: 'Contract end date' };
    return `${service?.name ? `${service.name} · ` : ''}${t(fields[path.split('.').pop()!] || 'Plan details')}`;
  };
  const conflictValue = (value: unknown) => value == null ? t('Removed') : typeof value === 'object' ? Array.isArray(value) ? value.map(item => typeof item === 'string' ? item : t('Plan details')).join(', ') : t('Task workflow') : String(value);

  return <section aria-label={t('Next month’s plan')} className={cn(cardBase, 'overflow-hidden')}>
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-inset px-5 py-4">
      <div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-ink">{t('Next month’s plan')}</h2><Badge tone={scheduled ? 'emerald' : 'amber'}>{t(scheduled ? 'Scheduled' : 'Draft')}</Badge></div>
        <p className="mt-2 text-sm leading-6 text-muted">{t(scheduled ? 'Scheduled for' : 'Proposed start')}: {dateLabel(scheduled ? plan.effectiveFromCycleStart! : effectiveDate)} · {t('Revision')} {plan.revision}</p>
        <p className="mt-1 max-w-prose text-sm leading-6 text-muted">{t(scheduled ? 'This saved plan will apply at the next billing boundary. Editing returns it to draft until you schedule it again.' : 'Save a draft, review the changes, then schedule it. Existing monthly records keep their scope and prices.')}</p>
      </div>
      {scheduled && <Button variant="secondary" disabled={busy || blocked} onClick={() => void commit('draft', () => store.returnClientPlanRevisionToDraft(plan.id, plan.version))}>{t(busy ? 'Saving…' : 'Edit scheduled plan')}</Button>}
    </header>
    {recovery && !scheduled && <div className="border-b border-line bg-inset px-5 py-4" role="status"><p>{t('A recoverable draft is available on this device.')}</p><div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={restore}>{t('Restore recovered draft')}</Button><Button variant="secondary" disabled={busy} onClick={() => { removeRecoveredDraft(account, formKey, recovery.storageKey); setRecovery(null); }}>{t('Discard recovered draft')}</Button></div></div>}
    {conflict && <div className="border-b border-line bg-inset px-5 py-4" role="alert"><p className="text-sm text-ink">{t('This revision changed elsewhere. Review the saved revision before saving.')}</p><div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" onClick={reload}>{t('Reload saved data')}</Button><Button variant="secondary" onClick={keepDraft}>{t('Keep my draft')}</Button></div>
      {mergeConflicts.map(item => <div key={item.path} className="mt-3 rounded-control border border-line p-3"><p className="text-sm font-medium text-ink">{conflictLabel(item.path)}</p><p className="mt-1 text-sm text-muted">{t('This field was also changed elsewhere. Choose which value to keep.')}</p><div className="mt-2 grid gap-3 sm:grid-cols-2"><div><p data-i18n-skip className="break-words text-sm text-ink">{conflictValue(item.local)}</p><Button variant="secondary" onClick={() => { choices.current[item.path] = 'local'; merge(choices.current); }}>{t('Use my value')}</Button></div><div><p data-i18n-skip className="break-words text-sm text-ink">{conflictValue(item.remote)}</p><Button variant="secondary" onClick={() => { choices.current[item.path] = 'remote'; merge(choices.current); }}>{t('Use saved value')}</Button></div></div></div>)}
    </div>}
    {scheduled ? <div className="space-y-3 p-5"><p data-i18n-skip className="font-semibold text-ink">{plan.name}</p>{plan.serviceItems.map(item => <div key={item.id}><p data-i18n-skip className="text-sm font-medium text-ink">{item.name}</p><p data-i18n-skip className="mt-1 text-sm text-muted">{itemSummary(item)}</p></div>)}{canSeePrices && <p className="border-t border-line pt-3 font-semibold text-ink">{t('Monthly total')}: {formatMoney(totals.total, 'MYR', locale)}</p>}</div> : <form id={formId} onSubmit={event => { event.preventDefault(); save(); }}>
      <fieldset disabled={busy || mergeConflicts.length > 0 || Boolean(review)}>
        <legend className="sr-only">{t('Next month’s plan')}</legend>
        <div className="grid gap-4 border-b border-line p-5 md:grid-cols-2">
          <label className="text-sm font-medium text-ink">{t('Plan name')}<input required maxLength={160} data-i18n-skip className={fieldClass} value={draft.name} onChange={event => update({ name: event.target.value })} /></label>
          <label className="text-sm font-medium text-ink">{t('Contract end date (reminder only)')}<input type="date" min={contractStartDate} aria-describedby={contractHelpId} className={fieldClass} value={draft.contractEndDate} onChange={event => update({ contractEndDate: event.target.value })} /><span id={contractHelpId} className="mt-1 block text-xs font-normal leading-5 text-muted">{t('This is a reminder for the original contract, not a stop date for monthly cycles.')}</span></label>
        </div>
        <div className="divide-y divide-line">{draft.serviceItems.map((item, index) => <fieldset key={item.id} className="p-5">
          <legend className="sr-only">{t('Service item')} {index + 1}</legend>
          <div className="mb-4 flex items-center justify-between gap-3"><p className="text-sm font-semibold text-ink">{t('Service item')} {index + 1}</p><Button variant="secondary" onClick={() => update({ serviceItems: draft.serviceItems.filter(value => value.id !== item.id) })} aria-label={`${t('Remove service')}: ${item.name || index + 1}`}>{t('Remove')}</Button></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-medium text-ink">{t('Service name')}<input required maxLength={160} data-i18n-skip className={fieldClass} value={item.name} onChange={event => updateItem(item.id, { name: event.target.value })} /></label>
            <label className="text-sm font-medium text-ink">{t('Platforms')}<input data-i18n-skip className={fieldClass} value={item.platforms.join(', ')} onChange={event => updateItem(item.id, { platforms: event.target.value.split(',').map(value => value.trim()).filter(Boolean) })} /><span className="mt-1 block text-xs font-normal text-muted">{t('Separate platforms with commas.')}</span></label>
            <label className="text-sm font-medium text-ink">{t('Unit')}<input required maxLength={80} data-i18n-skip className={fieldClass} value={item.unit} onChange={event => updateItem(item.id, { unit: event.target.value })} /></label>
            <label className="text-sm font-medium text-ink">{t('Quantity')}<input id={`${formId}-quantity-${index}`} required type="number" min={1} max={400} step={1} inputMode="numeric" className={fieldClass} value={item.quantity || ''} onChange={event => updateItem(item.id, { quantity: Number(event.target.value) })} /></label>
            {canSeePrices && <label className="text-sm font-medium text-ink">{t('Unit price (MYR)')}<input required type="number" min="0" step="0.01" inputMode="decimal" className={fieldClass} value={item.unitPriceMinor / 100} onChange={event => updateItem(item.id, { unitPriceMinor: Math.round(Number(event.target.value) * 100) })} /></label>}
            <label className="text-sm font-medium text-ink">{t('Task workflow')}<select className={fieldClass} value={item.workflow?.templateId || ''} onChange={event => { const template = store.serviceWorkflowTemplates.find(value => value.id === event.target.value); updateItem(item.id, { workflow: template ? snapshotWorkflow(template) : undefined }); }}><option value="">{t('No task workflow')}</option>{item.workflow && !store.serviceWorkflowTemplates.some(value => value.id === item.workflow!.templateId && value.isActive) && <option value={item.workflow.templateId} data-i18n-skip>{item.workflow.name}</option>}{store.serviceWorkflowTemplates.filter(value => value.isActive).map(template => <option key={template.id} value={template.id} data-i18n-skip>{template.name} · {t('rev')} {template.revision}</option>)}</select></label>
          </div>
        </fieldset>)}</div>
        <div className="px-5 pb-5"><Button variant="secondary" onClick={() => update({ serviceItems: [...draft.serviceItems, { id: `SI-${crypto.randomUUID()}`, name: '', platforms: [], unit: 'item', quantity: 1, unitPriceMinor: 0 }] })}>{t('Add service')}</Button></div>
        {canSeePrices && <div className="grid gap-4 border-t border-line bg-inset p-5 md:grid-cols-3">
          <label className="text-sm font-medium text-ink">{t('Discount type')}<select className={fieldClass} value={draft.discountType} onChange={event => update({ discountType: event.target.value as ClientServicePlan['discountType'], discountValue: 0 })}><option value="none">{t('None')}</option><option value="percent">{t('Percent')}</option><option value="fixed">{t('Fixed MYR')}</option></select></label>
          <label className="text-sm font-medium text-ink">{t('Discount value')}<input type="number" min="0" max={draft.discountType === 'percent' ? 100 : undefined} step="0.01" disabled={draft.discountType === 'none'} className={fieldClass} value={draft.discountValue / 100} onChange={event => update({ discountValue: Math.round(Number(event.target.value) * 100) })} /></label>
          <label className="text-sm font-medium text-ink">{t('Tax rate (%)')}<input required type="number" min="0" max="100" step="0.01" className={fieldClass} value={draft.taxRateBps / 100} onChange={event => update({ taxRateBps: Math.round(Number(event.target.value) * 100) })} /></label>
        </div>}
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-5">
        {canSeePrices && <p className="text-sm font-semibold text-ink">{t('Monthly total')}: {formatMoney(totals.total, 'MYR', locale)}</p>}
        {!review && <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || conflict || blocked}>{t(busy ? 'Saving…' : 'Save draft')}</Button><Button variant="secondary" disabled={dirty || busy || conflict || blocked || source.status !== 'Active'} onClick={() => setReview({ fingerprint: JSON.stringify(plan), date: effectiveDate })}>{t('Review changes')}</Button></div>}
        {dirty && <p className="w-full text-sm text-muted" role="status">{t('Unsaved changes. Save the draft before reviewing.')}</p>}
        {source.status !== 'Active' && <p className="w-full text-sm text-muted">{t('Resume the active plan before scheduling a revision.')}</p>}
      </div>
    </form>}
    {review && !scheduled && <section aria-label={t('Review next month’s plan')} className="border-t border-line p-5">
      <h3 className="font-semibold text-ink">{t('Review changes')} · {dateLabel(review.date)}</h3><p className="mt-2 text-sm text-muted">{t('Only the next billing cycle will use these changes.')}</p>
      <div className="mt-4 divide-y divide-line">{[...new Set([...source.serviceItems.map(item => item.id), ...draft.serviceItems.map(item => item.id)])].map(id => { const before = source.serviceItems.find(item => item.id === id); const after = draft.serviceItems.find(item => item.id === id); return <div key={id} className="py-4"><p data-i18n-skip className="text-sm font-semibold text-ink">{after?.name || before?.name}</p><div className="mt-2 grid gap-3 sm:grid-cols-2"><div><p className="text-xs text-muted">{t('Current plan')}</p><p data-i18n-skip className="mt-1 text-sm text-ink">{itemSummary(before)}</p></div><div><p className="text-xs text-muted">{t('Next month’s plan')}</p><p data-i18n-skip className="mt-1 text-sm text-ink">{itemSummary(after)}</p></div></div></div>; })}</div>
      {canSeePrices && <p className="mt-3 text-sm font-semibold text-ink">{t('Monthly total')}: {formatMoney(currentTotals.total, 'MYR', locale)} → {formatMoney(totals.total, 'MYR', locale)}</p>}
      <div className="mt-5 flex flex-wrap gap-2"><Button disabled={busy || blocked} onClick={schedule}>{t(busy ? 'Saving…' : 'Schedule for')} {!busy && dateLabel(review.date)}</Button><Button variant="secondary" disabled={busy} onClick={() => setReview(null)}>{t('Back to draft')}</Button></div>
    </section>}
    {blocked && <div className="border-t border-line px-5 py-4"><BackendFreshness compact /><Button className="mt-3" variant="secondary" disabled={busy} onClick={() => void retry()}>{t('Retry saved change')}</Button></div>}
    {feedback && <div ref={alertRef} tabIndex={-1} className="border-t border-line px-5 py-3 text-sm font-medium text-ink" role={feedback.error ? 'alert' : 'status'}><SystemMessage message={feedback.text} />{feedback.error && draft.serviceItems.length > 0 && <button type="button" className="mt-2 block min-h-11 text-accent underline" onClick={() => document.getElementById(`${formId}-quantity-0`)?.focus()}>{t('Review service fields')}</button>}</div>}
  </section>;
};
export default DraftServicePlanEditor;
