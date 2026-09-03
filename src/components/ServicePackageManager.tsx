import React from 'react';
import { PackagePlus, Plus, Save, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import type { ServiceItem, ServicePackage } from '../types';
import { Button } from './ui';
import { cardBase, inputBase } from './uiTokens';
import { formatMoney, snapshotWorkflow } from '../lib/serviceManagement';
import { cn } from '../lib/utils';
import { useI18n } from './I18nProvider';

const blankItem = (): ServiceItem => ({
  id: crypto.randomUUID(), name: '', platforms: [], unit: 'item', quantity: 1, unitPriceMinor: 0,
});

const blankPackage = (): Omit<ServicePackage, 'id' | 'revision' | 'createdAt' | 'updatedAt'> => ({
  name: '', description: '', currency: 'MYR', serviceItems: [blankItem()], discountType: 'none', discountValue: 0, taxRateBps: 0, isActive: true,
});

const ServicePackageManager = () => {
  const { t } = useI18n();
  const { servicePackages, serviceWorkflowTemplates, saveServicePackage, deleteServicePackage, retryPendingSave } = useStore();
  const [editingId, setEditingId] = React.useState<string>();
  const [draft, setDraft] = React.useState(blankPackage);
  const [message, setMessage] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const handleDelete = async (pkg: ServicePackage) => {
    const confirmed = window.confirm(
      t(`Delete the "${pkg.name}" package from the catalog? Existing client plans keep their own snapshots and are unaffected.`),
    );
    if (!confirmed) return;
    const result = deleteServicePackage(pkg.id);
    if (!result.ok) return setMessage(result.error || 'Unable to delete the package.');
    setSaving(true);
    const committed = await retryPendingSave('service_package.manage');
    setSaving(false);
    if (!committed.ok) {
      setMessage(committed.error || 'The deletion is waiting to be saved.');
      return;
    }
    if (editingId === pkg.id) edit();
    setMessage('Package deleted. Existing client plans remain unchanged.');
  };

  const edit = (pkg?: ServicePackage) => {
    setEditingId(pkg?.id);
    setDraft(pkg ? {
      name: pkg.name, description: pkg.description, currency: 'MYR', serviceItems: pkg.serviceItems.map(item => ({ ...item, platforms: [...item.platforms] })),
      discountType: pkg.discountType, discountValue: pkg.discountValue, taxRateBps: pkg.taxRateBps, isActive: pkg.isActive,
    } : blankPackage());
    setMessage('');
  };

  const updateItem = (id: string, patch: Partial<ServiceItem>) => setDraft(current => ({
    ...current,
    serviceItems: current.serviceItems.map(item => item.id === id ? { ...item, ...patch } : item),
  }));

  const save = async () => {
    setMessage('');
    if (!draft.name.trim()) return setMessage('Package name is required.');
    if (draft.serviceItems.length === 0) return setMessage('Add at least one service item.');
    if (draft.serviceItems.some(item => !item.name.trim())) return setMessage('Every service item needs a name.');
    if (draft.serviceItems.some(item => !Number.isInteger(item.quantity) || item.quantity < 1)) return setMessage('Quantities must be whole numbers of at least one.');
    if (draft.serviceItems.some(item => item.unitPriceMinor < 0 || !Number.isFinite(item.unitPriceMinor))) return setMessage('Unit prices must be non-negative.');
    if (draft.discountType === 'percent' && draft.discountValue > 10000) return setMessage('Percent discount cannot exceed 100%.');

    const result = saveServicePackage({ ...draft, id: editingId });
    if (!result.ok) return setMessage(result.error || 'Unable to save the package.');
    setSaving(true);
    const committed = await retryPendingSave('service_package.manage');
    setSaving(false);
    if (!committed.ok) return setMessage(committed.error || 'The package is waiting to be saved.');
    edit();
    setMessage('Package saved. Existing client plans remain unchanged.');
  };

  return (
    <section className={cn(cardBase, 'overflow-hidden')} aria-labelledby="service-packages-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-5">
        <div>
          <h2 id="service-packages-title" className="font-semibold text-slate-950">Service Packages</h2>
          <p className="mt-1 text-sm text-slate-500">Reusable plan templates. Saved client plans always keep their own snapshot.</p>
        </div>
        <Button variant="secondary" onClick={() => edit()}><PackagePlus className="h-4 w-4" />New package</Button>
      </div>
      <div className="grid gap-0 lg:grid-cols-[280px_1fr]">
        <div className="border-b border-line bg-inset/60 p-3 lg:border-b-0 lg:border-r lg:border-line">
          <p className="calm-eyebrow px-2 pb-2 pt-1">Package library</p>
          <div className="space-y-2">
            {servicePackages.map(pkg => (
              <div key={pkg.id} className={cn('group flex items-stretch gap-1 rounded-control', editingId === pkg.id ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'hover:bg-surface/70')}>
              <button onClick={() => edit(pkg)} aria-current={editingId === pkg.id ? 'true' : undefined} className="min-w-0 flex-1 rounded-control px-3 py-3 text-left transition-colors">
                <span className="block truncate text-sm font-semibold text-slate-900">{pkg.name}</span>
                <span className="mt-1 block text-xs text-slate-500">Revision {pkg.revision} · {pkg.serviceItems.length} services</span>
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(pkg)}
                disabled={saving}
                aria-label={`Delete package ${pkg.name}`}
                title={`Delete ${pkg.name}`}
                className="flex w-10 items-center justify-center rounded-control text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              </div>
            ))}
            {servicePackages.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No standard packages yet.</p>}
          </div>
        </div>
        <div className="space-y-6 p-5 sm:p-6">
          <div><p className="calm-eyebrow">Package editor</p><h3 className="mt-1 text-lg font-semibold text-ink">{editingId ? 'Edit standard package' : 'Create standard package'}</h3></div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Package name<input className={cn(inputBase, 'mt-1 px-3 py-2.5')} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
            <label className="text-sm font-medium text-slate-700">Tax rate (%)<input className={cn(inputBase, 'mt-1 px-3 py-2.5')} type="number" min="0" max="100" step="0.01" value={draft.taxRateBps / 100} onChange={e => setDraft({ ...draft, taxRateBps: Math.round(Number(e.target.value) * 100) })} /></label>
          </div>
          <label className="block text-sm font-medium text-slate-700">Description<textarea className={cn(inputBase, 'mt-1 min-h-20 px-3 py-2.5')} value={draft.description || ''} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Discount type<select className={cn(inputBase,'mt-1 px-3 py-2.5')} value={draft.discountType} onChange={e=>setDraft({...draft,discountType:e.target.value as ServicePackage['discountType'],discountValue:0})}><option value="none">None</option><option value="percent">Percent</option><option value="fixed">Fixed MYR</option></select></label>
            <label className="text-sm font-medium text-slate-700">Discount value<input className={cn(inputBase,'mt-1 px-3 py-2.5')} type="number" min="0" max={draft.discountType === 'percent' ? 100 : undefined} step="0.01" disabled={draft.discountType==='none'} value={draft.discountValue/100} onChange={e=>setDraft({...draft,discountValue:Math.round(Number(e.target.value)*100)})}/></label>
          </div>
          <div className="space-y-3">
            {draft.serviceItems.map(item => (
              <div key={item.id} className="grid gap-3 rounded-panel border border-line bg-inset/55 p-3 md:grid-cols-12">
                <input aria-label="Service name" placeholder="Service name" className={cn(inputBase, 'px-3 py-2 md:col-span-3')} value={item.name} onChange={e => updateItem(item.id, { name: e.target.value })} />
                <input aria-label="Platforms" placeholder="Platforms, comma separated" className={cn(inputBase, 'px-3 py-2 md:col-span-3')} value={item.platforms.join(', ')} onChange={e => updateItem(item.id, { platforms: e.target.value.split(',').map(v => v.trim()).filter(Boolean) })} />
                <input aria-label="Unit" placeholder="Unit" className={cn(inputBase, 'px-3 py-2 md:col-span-2')} value={item.unit} onChange={e => updateItem(item.id, { unit: e.target.value })} />
                <input aria-label="Quantity" className={cn(inputBase, 'px-3 py-2 md:col-span-1')} type="number" min="1" value={item.quantity} onChange={e => updateItem(item.id, { quantity: Number(e.target.value) })} />
                <input aria-label="Unit price" className={cn(inputBase, 'px-3 py-2 md:col-span-2')} type="number" min="0" step="0.01" value={item.unitPriceMinor / 100} onChange={e => updateItem(item.id, { unitPriceMinor: Math.round(Number(e.target.value) * 100) })} />
                <button aria-label="Remove service" disabled={draft.serviceItems.length === 1} onClick={() => setDraft(current => ({ ...current, serviceItems: current.serviceItems.filter(value => value.id !== item.id) }))} className="flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
                <label className="text-xs font-medium text-slate-600 md:col-span-11">Task workflow<select aria-label="Task workflow" className={cn(inputBase, 'mt-1 px-3 py-2')} value={item.workflow?.templateId || ''} onChange={event => {
                  const template = serviceWorkflowTemplates.find(value => value.id === event.target.value);
                  updateItem(item.id, { workflow: template ? snapshotWorkflow(template) : undefined });
                }}><option value="">No automatic task chain</option>{serviceWorkflowTemplates.filter(template => template.isActive || template.id === item.workflow?.templateId).map(template => <option key={template.id} value={template.id}>{template.name} · revision {template.revision}</option>)}</select></label>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <Button variant="secondary" onClick={() => setDraft(current => ({ ...current, serviceItems: [...current.serviceItems, blankItem()] }))}><Plus className="h-4 w-4" />Add service</Button>
            <div className="text-right"><p className="text-xs text-slate-500">Monthly subtotal</p><p className="font-semibold text-slate-950">{formatMoney(draft.serviceItems.reduce((sum, item) => sum + item.quantity * item.unitPriceMinor, 0))}</p></div>
          </div>
          {message && <p className="text-sm font-medium text-blue-700" role="status">{message}</p>}
          <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end border-t border-line bg-surface/95 px-5 py-4 backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6"><Button onClick={save} disabled={saving}><Save className="h-4 w-4" />{saving ? 'Saving...' : 'Save package'}</Button></div>
        </div>
      </div>
    </section>
  );
};

export default ServicePackageManager;
