import { useRecoverableForm } from '../hooks/useRecoverableForm';
import DraftRecoveryNotice from './DraftRecoveryNotice';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import React from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, PackageCheck, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { isPendingMutationResolution, useStore, pendingMutationMessage } from '../store';
import type { ClientProfile, PlanOrigin, ServiceItem } from '../types';
import ModalShell from './ModalShell';
import BackendFreshness from './BackendFreshness';
import { Button } from './ui';
import { inputBase } from './uiTokens';
import { cn } from '../lib/utils';
import { calculatePlanTotalMinor, formatMoney, snapshotWorkflow } from '../lib/serviceManagement';
import { useI18n } from './I18nProvider';

const blankItem = (): ServiceItem => ({ id: crypto.randomUUID(), name: '', platforms: [], unit: 'item', quantity: 1, unitPriceMinor: 0 });
const WIZARD_BLOCKED_MESSAGE = 'An earlier change is still waiting to sync. Use “Retry my changes” or “Use latest” in the banner above this dialog, then save this draft again.';

const CreateClientPlanModal = ({ onClose, client }: { onClose: () => void; client?: ClientProfile }) => {
  const navigate = useNavigate();
  const { locale, t } = useI18n();
  const {
    servicePackages,
    serviceWorkflowTemplates,
    createClientWithPlan,
    createClientPlan,
    retryPendingSave,
    backend,
  } = useStore();
  const [dirty, setDirty] = React.useState(false);
  const markPristine = useUnsavedChanges(dirty);
  const [step, setStep] = React.useState(1);
  const [mode, setMode] = React.useState<PlanOrigin>('standard');
  const [packageId, setPackageId] = React.useState(servicePackages.find(item => item.isActive)?.id || '');
  const [profile, setProfile] = React.useState({ clientName: '', contactPerson: '', email: '', phone: '', address: '', website: '', facebookPage: '', notes: '' });
  const [plan, setPlan] = React.useState({ name: '', startDate: new Date().toISOString().slice(0, 10), billingDay: new Date().getDate(), contractEndDate: '', discountType: 'none' as 'none' | 'percent' | 'fixed', discountValue: 0, taxRateBps: 0 });
  const [items, setItems] = React.useState<ServiceItem[]>([blankItem()]);
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const createdClientIdRef = React.useRef('');
  const titleId = React.useId();
  const selectedPackage = servicePackages.find(item => item.id === packageId);
  const readOnlyItems = mode === 'standard';
  const appliedPackageKeyRef = React.useRef('');
  const recovery = useRecoverableForm(`create-client-plan:${client?.id || 'new'}`, { step, mode, packageId, profile, plan, items }, dirty, !saving);
  const restoreDraft = () => { const value = recovery.restore(); if (!value || !Array.isArray(value.items)) return; setStep(value.step); setMode(value.mode); setPackageId(value.packageId); setProfile(value.profile); setPlan(value.plan); setItems(value.items); setDirty(true); };
  const requestClose = () => { if (!saving && (!dirty || window.confirm(t('Discard unsaved changes?')))) { recovery.clear(); markPristine(); onClose(); } };
  const pendingResolution = isPendingMutationResolution(backend);

  React.useEffect(() => {
    if (!client) return;
    setProfile({
      clientName: client.clientName,
      contactPerson: client.contactPerson || '',
      email: client.email || '',
      phone: client.phone || '',
      address: client.address || '',
      website: client.website || '',
      facebookPage: client.facebookPage || '',
      notes: client.notes || '',
    });
  }, [client]);

  const applyPackage = React.useCallback((pkg: typeof selectedPackage) => {
    if (!pkg) return;
    setItems(pkg.serviceItems.map(item => ({ ...item, id: crypto.randomUUID(), platforms: [...item.platforms], workflow: item.workflow ? structuredClone(item.workflow) : undefined })));
    setPlan(current => ({ ...current, discountType: pkg.discountType, discountValue: pkg.discountValue, taxRateBps: pkg.taxRateBps }));
    appliedPackageKeyRef.current = `${pkg.id}:${pkg.revision}`;
  }, []);

  const chooseMode = (value: PlanOrigin) => {
    if (saving) return;
    setMode(value);
    const pkg = servicePackages.find(item => item.id === packageId) || servicePackages.find(item => item.isActive);
    if (value === 'custom') {
      setItems([blankItem()]);
      setPlan(current => ({ ...current, discountType: 'none', discountValue: 0, taxRateBps: 0 }));
    }
    else applyPackage(pkg);
  };

  React.useEffect(() => {
    if (mode === 'custom') return;
    const pkg = servicePackages.find(item => item.id === packageId);
    const packageKey = pkg ? `${pkg.id}:${pkg.revision}` : '';
    if (pkg && appliedPackageKeyRef.current !== packageKey) applyPackage(pkg);
  }, [applyPackage, mode, packageId, servicePackages]);

  const updateItem = (id: string, patch: Partial<ServiceItem>) => setItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
  const isValidOptionalUrl = (value: string) => {
    if (!value.trim()) return true;
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };
  const validateStep = (candidate: number): string => {
    if (candidate === 1) {
      if (!profile.clientName.trim()) return t('Client name is required.');
      if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) return t('Enter a valid email address.');
      if (!isValidOptionalUrl(profile.website)) return t('Website must be a complete http:// or https:// URL.');
      if (!isValidOptionalUrl(profile.facebookPage)) return t('Facebook page must be a complete http:// or https:// URL.');
    }
    if (candidate === 2 && mode !== 'custom' && !selectedPackage) return t('Choose a standard package.');
    if (candidate === 3) {
      if (!items.length) return t('Add at least one service.');
      if (items.some(item => !item.name.trim() || !item.unit.trim())) return t('Every service needs a name and unit.');
      if (items.some(item => !Number.isInteger(item.quantity) || item.quantity < 1)) return t('Every service quantity must be a whole number of at least one.');
      if (items.some(item => !Number.isFinite(item.unitPriceMinor) || item.unitPriceMinor < 0)) return t('Every service price must be a valid non-negative amount.');
    }
    if (candidate === 4) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(plan.startDate)) return t('Choose a valid start date.');
      if (!Number.isInteger(plan.billingDay) || plan.billingDay < 1 || plan.billingDay > 31) return t('Billing day must be a whole number from 1 to 31.');
      if (plan.contractEndDate && plan.contractEndDate < plan.startDate) return t('Contract end date cannot be before the start date.');
      if (!Number.isFinite(plan.taxRateBps) || plan.taxRateBps < 0 || plan.taxRateBps > 10000) return t('Tax rate must be between 0% and 100%.');
      if (!Number.isFinite(plan.discountValue) || plan.discountValue < 0) return t('Discount must be a valid non-negative amount.');
      if (plan.discountType === 'percent' && plan.discountValue > 10000) return t('Percentage discount cannot exceed 100%.');
    }
    return '';
  };
  const next = () => {
    if (saving) return;
    const validationError = validateStep(step);
    setError(validationError);
    if (validationError) return;
    setStep(value => Math.min(5, value + 1));
  };
  const save = async () => {
    if (saving) return;
    if (backend.upgradeRequired && !createdClientIdRef.current) {
      setError(backend.error || backend.message);
      return;
    }
    for (let candidate = 1; candidate <= 4; candidate += 1) {
      const validationError = validateStep(candidate);
      if (validationError) {
        setStep(candidate);
        setError(validationError);
        return;
      }
    }
    setSaving(true);
    setError('');
    try {
      if (!createdClientIdRef.current) {
        const buildInput = () => {
          const pkg = selectedPackage;
          return {
            ...profile,
            planName: plan.name || `${profile.clientName} Service Plan`,
            origin: mode,
            sourcePackageId: mode === 'custom' ? undefined : pkg?.id,
            sourcePackageRevision: mode === 'custom' ? undefined : pkg?.revision,
            serviceItems: items,
            startDate: plan.startDate,
            billingDay: plan.billingDay,
            contractEndDate: plan.contractEndDate || undefined,
            discountType: plan.discountType,
            discountValue: plan.discountValue,
            taxRateBps: plan.taxRateBps,
          };
        };
        const planInput = buildInput();
        let result = client
          ? createClientPlan(client.id, planInput)
          : createClientWithPlan(planInput);
        let resultClientId = 'clientId' in result && typeof result.clientId === 'string' ? result.clientId : undefined;
        if (!client && !result.ok && result.error === pendingMutationMessage) {
          const recovered = await retryPendingSave();
          if (recovered.ok) {
            result = createClientWithPlan(planInput);
            resultClientId = 'clientId' in result && typeof result.clientId === 'string' ? result.clientId : undefined;
          }
        }
        if (!result.ok || (!client && !resultClientId) || (client && !result.planId)) {
          setError(result.error === pendingMutationMessage
            ? t(WIZARD_BLOCKED_MESSAGE)
            : result.error || (client ? t('Unable to create the service plan.') : t('Unable to create the client.')));
          return;
        }
        createdClientIdRef.current = client?.id || resultClientId || '';
      }
      const committed = await retryPendingSave('client_plan.manage');
      if (!committed.ok) {
        setError(committed.error === pendingMutationMessage
          ? t(WIZARD_BLOCKED_MESSAGE)
          : committed.error || t('The client is waiting to be saved. Retry to finish syncing this same Draft.'));
        return;
      }
      const createdClientId = createdClientIdRef.current;
      if (!createdClientId) {
        setError(t('The client was saved without a valid workspace destination.'));
        return;
      }
      recovery.clear(); markPristine(); setDirty(false); onClose();
      navigate(`/clients/${encodeURIComponent(createdClientId)}`);
    } finally {
      setSaving(false);
    }
  };
  const totals = calculatePlanTotalMinor(items, plan.discountType, plan.discountValue, plan.taxRateBps);
  const serviceSlots = items.reduce((sum, item) => sum + (Number.isFinite(item.quantity) ? Math.max(0, item.quantity) : 0), 0);
  const steps = ['Client details', 'Plan source', 'Service scope', 'Terms', 'Review'].map(label => t(label));
  const modeOptions = [
    { value: 'standard' as const, title: 'Use standard package', text: 'Save the selected Growth Plan as this client’s frozen service scope.', icon: PackageCheck },
    { value: 'customized' as const, title: 'Duplicate as Custom Plan', text: 'Select Growth Plan, duplicate it, then adjust quantity, platform or price for this client only.', icon: Copy },
    { value: 'custom' as const, title: 'Fully custom', text: 'Build a service plan from a blank scope.', icon: SlidersHorizontal },
  ];

  return (
    <ModalShell labelledBy={titleId} onClose={requestClose} onEdit={() => setDirty(true)} panelClassName="h-[min(54rem,calc(100dvh-2rem))] max-w-[88rem]">
      {recovery.available && <DraftRecoveryNotice onRestore={restoreDraft} onDiscard={recovery.clear} />}
      <header className="flex items-start justify-between gap-4 border-b border-line px-5 pb-5 pt-6 sm:px-6">
        <div><p className="calm-eyebrow">{t(client ? 'Service plan' : 'New client')} · {t('Step')} {step} {t('of')} 5</p><h2 id={titleId} className="mt-1 text-2xl font-semibold tracking-[-0.035em] text-ink">{t(client ? 'Create service plan' : 'Create client and service plan')}</h2><p className="mt-1 text-sm text-muted">{t(client ? 'Create a frozen Draft plan for this existing company.' : 'Save the client and a frozen Draft plan in one workflow.')}</p></div>
        <button type="button" aria-label={t('common.close')} onClick={requestClose} className="flex h-11 w-11 items-center justify-center rounded-control text-muted hover:bg-inset hover:text-ink"><X className="h-5 w-5" /></button>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[13rem_minmax(0,1fr)_17rem]">
        <aside className="hidden border-r border-line bg-inset/55 p-4 lg:block" aria-label={t('Creation progress')}>
          <ol className="space-y-1">{steps.map((label, index) => { const number = index + 1; const current = step === number; const complete = step > number; return <li key={label}><button type="button" onClick={() => complete && setStep(number)} disabled={!complete || saving} className={cn('flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-sm', current ? 'bg-surface font-semibold text-ink shadow-sm ring-1 ring-line' : complete ? 'text-accent hover:bg-surface' : 'text-muted/60')}><span className={cn('calm-number flex h-6 w-6 items-center justify-center rounded-tag text-xs', current ? 'bg-accent text-[rgb(var(--calm-accent-ink))]' : complete ? 'bg-accent-soft text-accent' : 'bg-line/60')}>{complete ? <Check className="h-3.5 w-3.5" /> : number}</span>{label}</button></li>; })}</ol>
        </aside>

        <main className="custom-scrollbar min-h-0 overflow-y-auto p-5 sm:p-6 lg:p-8">
          <div className="mb-5 flex gap-1 lg:hidden" aria-hidden="true">{steps.map((_, index) => <span key={index} className={cn('h-1.5 flex-1 rounded-full', index + 1 <= step ? 'bg-accent' : 'bg-line')} />)}</div>
          {step === 1 && <section aria-labelledby="client-details-step"><h3 id="client-details-step" className="text-lg font-semibold text-ink">{t(client ? 'Company' : 'Client details')}</h3><p className="mt-1 text-sm text-muted">{t(client ? 'This plan will be attached to the selected company.' : 'Start with the primary business and contact information.')}</p><div className="mt-6 grid gap-4 md:grid-cols-2">{([['clientName','Client / company name'],['contactPerson','Contact person'],['email','Email'],['phone','Phone'],['address','Address'],['website','Website'],['facebookPage','Facebook page']] as const).map(([key,label]) => <label key={key} className="text-sm font-medium text-ink">{t(label)}{key === 'clientName' && ' *'}<input disabled={Boolean(client)} className={cn(inputBase, 'mt-1.5 px-3 py-2.5')} value={profile[key]} onChange={e => setProfile({ ...profile, [key]: e.target.value })} /></label>)}<label className="text-sm font-medium text-ink md:col-span-2">{t('Notes')}<textarea disabled={Boolean(client)} className={cn(inputBase, 'mt-1.5 min-h-28 px-3 py-2.5')} value={profile.notes} onChange={e => setProfile({ ...profile, notes: e.target.value })} /></label></div></section>}

          {step === 2 && <section aria-labelledby="plan-source-step"><h3 id="plan-source-step" className="text-lg font-semibold text-ink">{t('Choose a plan source')}</h3><p className="mt-1 text-sm text-muted">{t('The selected scope and workflow are frozen when you save.')}</p><p className="mt-3 rounded-control bg-inset px-3 py-2 text-sm leading-6 text-muted">{t('Duplicating Growth Plan creates this client’s own Custom Service Plan. Later quantity, platform, or price changes never modify the original Growth Plan.')}</p><div className="mt-6 grid gap-3 xl:grid-cols-3">{modeOptions.map(option => <button type="button" key={option.value} onClick={() => chooseMode(option.value)} aria-pressed={mode === option.value} className={cn('min-h-44 rounded-panel p-5 text-left ring-1 transition-[background-color,box-shadow,transform] duration-160 active:scale-[0.99]', mode === option.value ? 'bg-accent-soft text-ink ring-accent/45' : 'bg-surface text-ink ring-line hover:bg-inset')}><span className={cn('flex h-10 w-10 items-center justify-center rounded-control', mode === option.value ? 'bg-accent text-white' : 'bg-inset text-muted')}><option.icon className="h-5 w-5" /></span><span className="mt-5 block font-semibold">{t(option.title)}</span><span className="mt-1 block text-sm leading-5 text-muted">{t(option.text)}</span></button>)}</div>{mode !== 'custom' && <label className="mt-6 block text-sm font-medium text-ink">{t('Standard package')}<select className={cn(inputBase, 'mt-1.5 px-3 py-2.5')} value={packageId} onChange={e => setPackageId(e.target.value)}><option value="">{t('Choose package')}</option>{servicePackages.filter(item => item.isActive).map(pkg => <option key={pkg.id} value={pkg.id} data-i18n-skip>{pkg.name}{' · '}{t('rev')} {pkg.revision}</option>)}</select></label>}</section>}

          {step === 3 && <section aria-labelledby="service-scope-step"><h3 id="service-scope-step" className="text-lg font-semibold text-ink">{t('Service scope')}</h3><p className="mt-1 text-sm text-muted">{t(readOnlyItems ? 'Standard package items and task workflows are frozen and read-only.' : 'Adjust quantity, platform, price and the internal task workflow.')}</p><div className="mt-6 space-y-3">{items.map((item, index) => <article key={item.id} className="rounded-panel bg-inset/60 p-4 ring-1 ring-line/70"><div className="mb-3 flex items-center justify-between"><p className="calm-eyebrow">{t('Service')} {index + 1}</p>{!readOnlyItems && <button type="button" aria-label={t('Remove service')} onClick={()=>setItems(current=>current.filter(value=>value.id!==item.id))} className="flex h-9 w-9 items-center justify-center rounded-control text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4"/></button>}</div><div className="grid gap-3 md:grid-cols-12"><label className="md:col-span-4"><span className="text-xs font-semibold text-muted">{t('Service name')}</span><input disabled={readOnlyItems} aria-label={t('Service name')} placeholder={t('Service')} className={cn(inputBase,'mt-1.5 px-3 py-2.5 w-full')} value={item.name} onChange={e=>updateItem(item.id,{name:e.target.value})}/></label><label className="md:col-span-3"><span className="text-xs font-semibold text-muted">{t('Platforms')}</span><input disabled={readOnlyItems} aria-label={t('Platforms')} placeholder={t('Platforms')} className={cn(inputBase,'mt-1.5 px-3 py-2.5 w-full')} value={item.platforms.join(', ')} onChange={e=>updateItem(item.id,{platforms:e.target.value.split(',').map(v=>v.trim()).filter(Boolean)})}/></label><label className="md:col-span-2"><span className="text-xs font-semibold text-muted">{t('Unit')}</span><input disabled={readOnlyItems} aria-label={t('Unit')} placeholder={t('Item')} className={cn(inputBase,'mt-1.5 px-3 py-2.5 w-full')} value={item.unit} onChange={e=>updateItem(item.id,{unit:e.target.value})}/></label><label className="md:col-span-1"><span className="text-xs font-semibold text-muted">{t('Quantity')}</span><input disabled={readOnlyItems} aria-label={t('Quantity')} type="number" min="1" className={cn(inputBase,'mt-1.5 px-3 py-2.5 w-full')} value={item.quantity} onChange={e=>updateItem(item.id,{quantity:Number(e.target.value)})}/></label><label className="md:col-span-2"><span className="text-xs font-semibold text-muted">{t('Price')}</span><input disabled={readOnlyItems} aria-label={t('Price')} type="number" min="0" step="0.01" className={cn(inputBase,'mt-1.5 px-3 py-2.5 w-full')} value={item.unitPriceMinor/100} onChange={e=>updateItem(item.id,{unitPriceMinor:Math.round(Number(e.target.value)*100)})}/></label><label className="text-xs font-semibold text-muted md:col-span-12">{t('Task workflow')}<select disabled={readOnlyItems} className={cn(inputBase,'mt-1.5 px-3 py-2.5')} value={item.workflow?.templateId || ''} onChange={e=>{const template=serviceWorkflowTemplates.find(value=>value.id===e.target.value);updateItem(item.id,{workflow:template?snapshotWorkflow(template):undefined});}}><option value="">{t('No automatic task chain')}</option>{serviceWorkflowTemplates.filter(value=>value.isActive).map(template=><option key={template.id} value={template.id} data-i18n-skip>{template.name}{' · '}{t('rev')} {template.revision}{' · '}{template.steps.length} {t('steps')}</option>)}</select></label></div></article>)}{!readOnlyItems && <Button variant="secondary" onClick={()=>setItems(current=>[...current,blankItem()])}><Plus className="h-4 w-4"/>{t('Add service')}</Button>}</div></section>}

          {step === 4 && <section aria-labelledby="plan-terms-step"><h3 id="plan-terms-step" className="text-lg font-semibold text-ink">{t('Plan terms')}</h3><p className="mt-1 text-sm text-muted">{t('Set the operating dates and internal pricing rules.')}</p><div className="mt-6 grid gap-4 md:grid-cols-2"><label className="text-sm font-medium text-ink">{t('Plan name')}<input className={cn(inputBase,'mt-1.5 px-3 py-2.5')} value={plan.name} onChange={e=>setPlan({...plan,name:e.target.value})}/></label><label className="text-sm font-medium text-ink">{t('Start date')}<input type="date" className={cn(inputBase,'mt-1.5 px-3 py-2.5')} value={plan.startDate} onChange={e=>setPlan({...plan,startDate:e.target.value})}/></label><label className="text-sm font-medium text-ink">{t('Monthly billing day')}<input type="number" min="1" max="31" className={cn(inputBase,'mt-1.5 px-3 py-2.5')} value={plan.billingDay} onChange={e=>setPlan({...plan,billingDay:Number(e.target.value)})}/></label><label className="text-sm font-medium text-ink">{t('Contract end date (reminder only)')}<input type="date" min={plan.startDate} className={cn(inputBase,'mt-1.5 px-3 py-2.5')} value={plan.contractEndDate} onChange={e=>setPlan({...plan,contractEndDate:e.target.value})}/></label><label className="text-sm font-medium text-ink">{t('Tax rate (%)')}<input type="number" min="0" max="100" step="0.01" className={cn(inputBase,'mt-1.5 px-3 py-2.5')} value={plan.taxRateBps/100} onChange={e=>setPlan({...plan,taxRateBps:Math.round(Number(e.target.value)*100)})}/></label><label className="text-sm font-medium text-ink">{t('Discount type')}<select className={cn(inputBase,'mt-1.5 px-3 py-2.5')} value={plan.discountType} onChange={e=>setPlan({...plan,discountType:e.target.value as typeof plan.discountType,discountValue:0})}><option value="none">{t('None')}</option><option value="percent">{t('Percent')}</option><option value="fixed">{t('Fixed MYR')}</option></select></label><label className="text-sm font-medium text-ink">{t('Discount value')}<input type="number" min="0" step="0.01" disabled={plan.discountType==='none'} className={cn(inputBase,'mt-1.5 px-3 py-2.5')} value={plan.discountValue/100} onChange={e=>setPlan({...plan,discountValue:Math.round(Number(e.target.value)*100)})}/></label></div></section>}

          {step === 5 && <section aria-labelledby="review-step"><h3 id="review-step" className="text-lg font-semibold text-ink">{t('Review the Draft plan')}</h3><div className="mt-5 rounded-panel bg-accent-soft p-5 text-ink ring-1 ring-accent/25"><p className="font-semibold">{t('Ready to save as Draft')}</p><p className="mt-1 text-sm text-muted"><span data-i18n-skip>{profile.clientName}</span> · {mode} · {items.length} {t('services')} · {t('starts')} {plan.startDate}</p></div><div className="mt-4 grid gap-px overflow-hidden rounded-panel bg-line sm:grid-cols-4">{Object.entries(totals).map(([key,value])=><div key={key} className="bg-surface p-4"><p className="text-xs capitalize text-muted">{key}</p><p className="calm-number mt-2 font-semibold text-ink">{formatMoney(value, 'MYR', locale)}</p></div>)}</div><p className="mt-5 text-sm text-muted">{t('No service cycle is created until Boss Koo activates the plan.')}</p>{backend.upgradeRequired && !createdClientIdRef.current && <p className="mt-5 rounded-control border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900" role="status">{backend.message}</p>}</section>}
          {(error || pendingResolution) && (
            <div className="mt-6 rounded-control border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-900" role="alert" aria-live="assertive">
              <p>{error || t(WIZARD_BLOCKED_MESSAGE)}</p>
              {pendingResolution && <BackendFreshness compact className="mt-3" />}
            </div>
          )}
        </main>

        <aside className="hidden border-l border-line bg-inset/45 p-5 lg:block" aria-label={t('Draft summary')}><p className="calm-eyebrow">{t('Draft summary')}</p><h3 className="mt-2 truncate font-semibold text-ink" data-i18n-skip>{profile.clientName || t('Unnamed client')}</h3><p className="mt-1 text-xs capitalize text-muted">{mode} {t('plan')} · {items.length} {t(items.length === 1 ? 'service' : 'services')}</p><dl className="mt-6 space-y-4 text-sm"><div><dt className="text-muted">{t('Start date')}</dt><dd className="calm-number mt-1 font-medium text-ink">{plan.startDate}</dd></div><div><dt className="text-muted">{t('Billing day')}</dt><dd className="calm-number mt-1 font-medium text-ink">{t('Day')} {plan.billingDay}</dd></div><div><dt className="text-muted">{t('Internal total')}</dt><dd className="calm-number mt-1 text-lg font-semibold text-ink">{formatMoney(totals.total, 'MYR', locale)}</dd></div></dl><div className="mt-6 border-t border-line pt-5"><p className="text-xs leading-5 text-muted">{t('Scope, workflow and price are frozen when this Draft is saved.')}</p></div></aside>
      </div>

      <footer className="sticky bottom-0 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-t border-line bg-surface px-5 py-3 sm:px-6"><Button variant="secondary" onClick={() => step === 1 ? requestClose() : setStep(value => value - 1)} disabled={saving && step > 1}><ArrowLeft className="h-4 w-4" />{t(step === 1 ? 'Cancel' : 'Back')}</Button><p className="min-w-0 text-center text-xs leading-5 text-muted"><span className="font-semibold text-ink">{t('Step')} {step}/5</span><span aria-hidden="true"> · </span>{serviceSlots} {t(serviceSlots === 1 ? 'service slot' : 'service slots')}<span className="hidden sm:inline"><span aria-hidden="true"> · </span>{t('Internal total')} <strong className="calm-number text-ink">{formatMoney(totals.total, 'MYR', locale)}</strong></span></p>{step < 5 ? <Button onClick={next} disabled={saving || pendingResolution}>{t('Continue')}<ArrowRight className="h-4 w-4" /></Button> : <Button onClick={save} disabled={saving || pendingResolution || (backend.upgradeRequired === true && !createdClientIdRef.current)}><Check className="h-4 w-4" />{saving ? t('Saving…') : createdClientIdRef.current ? t('Retry save') : t('Save draft plan')}</Button>}</footer>
    </ModalShell>
  );
};

export default CreateClientPlanModal;
