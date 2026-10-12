import React from 'react';
import { PackagePlus, Plus, Save, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import type { ServiceItem, ServicePackage } from '../types';
import { Button } from './ui';
import { cardBase, inputBase } from './uiTokens';
import { formatMoney, snapshotWorkflow } from '../lib/serviceManagement';
import { cn } from '../lib/utils';
import { useI18n } from './I18nProvider';
import ConfirmDialog from './ConfirmDialog';
import { useCatalogEditor } from '../hooks/useCatalogEditor';

const blankItem = (): ServiceItem => ({
  id: crypto.randomUUID(), name: '', platforms: [], unit: 'item', quantity: 1, unitPriceMinor: 0,
});

const blankPackage = (): Omit<ServicePackage, 'id' | 'revision' | 'createdAt' | 'updatedAt'> => ({
  name: '', description: '', currency: 'MYR', serviceItems: [blankItem()], discountType: 'none', discountValue: 0, taxRateBps: 0, isActive: true,
});

const ServicePackageManager = () => {
  const { locale, t } = useI18n();
  const { servicePackages, serviceWorkflowTemplates, saveServicePackage, deleteServicePackage } = useStore();
  const { editingId, draft, setDraft, message, setMessage, saving, hasPending, edit, save: persistDraft, deleteItem } = useCatalogEditor({
    blank: blankPackage,
    fromRecord: (pkg: ServicePackage) => ({
      name: pkg.name, description: pkg.description, currency: 'MYR' as const,
      serviceItems: structuredClone(pkg.serviceItems), discountType: pkg.discountType,
      discountValue: pkg.discountValue, taxRateBps: pkg.taxRateBps, isActive: pkg.isActive,
    }),
    findRecord: id => useStore.getState().servicePackages.find(pkg => pkg.id === id),
    persist: (value, id) => saveServicePackage({ ...value, id }), remove: deleteServicePackage,
    command: 'service_package.manage', savedMessage: 'Package saved. Existing client plans remain unchanged.',
    deletedMessage: 'Package deleted. Existing client plans remain unchanged.',
  });
  const [packageToDelete, setPackageToDelete] = React.useState<ServicePackage | null>(null);

  const handleDelete = async (pkg: ServicePackage) => {
    await deleteItem(pkg);
  };

  const updateItem = (id: string, patch: Partial<ServiceItem>) => setDraft(current => ({
    ...current,
    serviceItems: current.serviceItems.map(item => item.id === id ? { ...item, ...patch } : item),
  }));

  const save = async () => {
    if (hasPending) { await persistDraft(); return; }
    setMessage('');
    if (!draft.name.trim()) return setMessage(t('Package name is required.'));
    if (draft.serviceItems.length === 0) return setMessage(t('Add at least one service item.'));
    if (draft.serviceItems.some(item => !item.name.trim())) return setMessage(t('Every service item needs a name.'));
    if (draft.serviceItems.some(item => !Number.isInteger(item.quantity) || item.quantity < 1)) return setMessage(t('Quantities must be whole numbers of at least one.'));
    if (draft.serviceItems.some(item => item.unitPriceMinor < 0 || !Number.isFinite(item.unitPriceMinor))) return setMessage(t('Unit prices must be non-negative.'));
    if (draft.discountType === 'percent' && draft.discountValue > 10000) return setMessage(t('Percent discount cannot exceed 100%.'));

    await persistDraft();
  };

  return (
    <section className={cn(cardBase, 'overflow-hidden')} aria-labelledby="service-packages-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-5">
        <div>
          <h2 id="service-packages-title" className="font-semibold text-slate-950">{t('Service Packages')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('Reusable plan templates. Saved client plans always keep their own snapshot.')}</p>
        </div>
        <Button variant="secondary" onClick={() => edit()} disabled={saving || hasPending}><PackagePlus className="h-4 w-4" />{t('New package')}</Button>
      </div>
      <div className="grid gap-0 lg:grid-cols-[280px_1fr]">
        <div className="border-b border-line bg-inset/60 p-3 lg:border-b-0 lg:border-r lg:border-line">
          <p className="calm-eyebrow px-2 pb-2 pt-1">{t('Package library')}</p>
          <div className="space-y-2">
            {servicePackages.map(pkg => (
              <div key={pkg.id} className={cn('group flex items-stretch gap-1 rounded-control', editingId === pkg.id ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'hover:bg-surface/70')}>
              <button onClick={() => edit(pkg)} disabled={saving || hasPending} aria-current={editingId === pkg.id ? 'true' : undefined} className="min-w-0 flex-1 rounded-control px-3 py-3 text-left transition-colors">
                <span className="block truncate text-sm font-semibold text-slate-900" data-i18n-skip>{pkg.name}</span>
                <span className="mt-1 block text-xs text-slate-500">{t('Revision')} {pkg.revision} · {pkg.serviceItems.length} {t(pkg.serviceItems.length === 1 ? 'service' : 'services')}</span>
              </button>
              <button
                type="button"
                onClick={() => setPackageToDelete(pkg)}
                disabled={saving || hasPending}
                data-i18n-skip
                aria-label={`${t('Delete package')} ${pkg.name}`}
                title={`${t('Delete')} ${pkg.name}`}
                className="flex w-10 items-center justify-center rounded-control text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              </div>
            ))}
            {servicePackages.length === 0 && <p className="py-6 text-center text-sm text-slate-500">{t('No standard packages yet.')}</p>}
          </div>
        </div>
        <div className="space-y-6 p-5 sm:p-6">
          <div><p className="calm-eyebrow">{t('Package editor')}</p><h3 className="mt-1 text-lg font-semibold text-ink">{t(editingId ? 'Edit standard package' : 'Create standard package')}</h3></div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">{t('Package name')}<input data-i18n-skip className={cn(inputBase, 'mt-1 px-3 py-2.5')} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
            <label className="text-sm font-medium text-slate-700">{t('Tax rate (%)')}<input className={cn(inputBase, 'mt-1 px-3 py-2.5')} type="number" min="0" max="100" step="0.01" value={draft.taxRateBps / 100} onChange={e => setDraft({ ...draft, taxRateBps: Math.round(Number(e.target.value) * 100) })} /></label>
          </div>
          <label className="block text-sm font-medium text-slate-700">{t('Description')}<textarea data-i18n-skip className={cn(inputBase, 'mt-1 min-h-20 px-3 py-2.5')} value={draft.description || ''} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">{t('Discount type')}<select className={cn(inputBase,'mt-1 px-3 py-2.5')} value={draft.discountType} onChange={e=>setDraft({...draft,discountType:e.target.value as ServicePackage['discountType'],discountValue:0})}><option value="none">{t('None')}</option><option value="percent">{t('Percent')}</option><option value="fixed">{t('Fixed MYR')}</option></select></label>
            <label className="text-sm font-medium text-slate-700">{t('Discount value')}<input className={cn(inputBase,'mt-1 px-3 py-2.5')} type="number" min="0" max={draft.discountType === 'percent' ? 100 : undefined} step="0.01" disabled={draft.discountType==='none'} value={draft.discountValue/100} onChange={e=>setDraft({...draft,discountValue:Math.round(Number(e.target.value)*100)})}/></label>
          </div>
          <div className="space-y-3">
            {draft.serviceItems.map(item => (
              <div key={item.id} className="grid gap-3 rounded-panel border border-line bg-inset/55 p-3 md:grid-cols-12">
                <input aria-label={t('Service name')} placeholder={t('Service name')} data-i18n-skip className={cn(inputBase, 'px-3 py-2 md:col-span-3')} value={item.name} onChange={e => updateItem(item.id, { name: e.target.value })} />
                <input aria-label={t('Platforms')} placeholder={t('Platforms, comma separated')} data-i18n-skip className={cn(inputBase, 'px-3 py-2 md:col-span-3')} value={item.platforms.join(', ')} onChange={e => updateItem(item.id, { platforms: e.target.value.split(',').map(v => v.trim()).filter(Boolean) })} />
                <input aria-label={t('Unit')} placeholder={t('Unit')} data-i18n-skip className={cn(inputBase, 'px-3 py-2 md:col-span-2')} value={item.unit} onChange={e => updateItem(item.id, { unit: e.target.value })} />
                <input aria-label={t('Quantity')} className={cn(inputBase, 'px-3 py-2 md:col-span-1')} type="number" min="1" value={item.quantity} onChange={e => updateItem(item.id, { quantity: Number(e.target.value) })} />
                <input aria-label={t('Unit price')} className={cn(inputBase, 'px-3 py-2 md:col-span-2')} type="number" min="0" step="0.01" value={item.unitPriceMinor / 100} onChange={e => updateItem(item.id, { unitPriceMinor: Math.round(Number(e.target.value) * 100) })} />
                <button aria-label={t('Remove service')} disabled={draft.serviceItems.length === 1} onClick={() => setDraft(current => ({ ...current, serviceItems: current.serviceItems.filter(value => value.id !== item.id) }))} className="flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
                <label className="text-xs font-medium text-slate-600 md:col-span-11">{t('Task workflow')}<select aria-label={t('Task workflow')} className={cn(inputBase, 'mt-1 px-3 py-2')} value={item.workflow?.templateId || ''} onChange={event => {
                  const template = serviceWorkflowTemplates.find(value => value.id === event.target.value);
                  updateItem(item.id, { workflow: template ? snapshotWorkflow(template) : undefined });
                }}><option value="">{t('No automatic task chain')}</option>{serviceWorkflowTemplates.filter(template => template.isActive || template.id === item.workflow?.templateId).map(template => <option key={template.id} value={template.id} data-i18n-skip>{template.name} · {t('revision')} {template.revision}</option>)}</select></label>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <Button variant="secondary" onClick={() => setDraft(current => ({ ...current, serviceItems: [...current.serviceItems, blankItem()] }))}><Plus className="h-4 w-4" />{t('Add service')}</Button>
            <div className="text-right"><p className="text-xs text-slate-500">{t('Monthly subtotal')}</p><p className="font-semibold text-slate-950">{formatMoney(draft.serviceItems.reduce((sum, item) => sum + item.quantity * item.unitPriceMinor, 0), draft.currency, locale)}</p></div>
          </div>
          {message && <p className="text-sm font-medium text-blue-700" role="status">{message}</p>}
          <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end border-t border-line bg-surface/95 px-5 py-4 backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6"><Button onClick={save} disabled={saving}><Save className="h-4 w-4" />{saving ? t('Saving...') : hasPending ? t('Retry save') : t('Save package')}</Button></div>
        </div>
      </div>
      {packageToDelete && (
        <ConfirmDialog
          labelledBy="delete-service-package-title"
          title={t(`Delete the "${packageToDelete.name}" package?`)}
          description={t('Existing client plans keep their own snapshots and are unaffected.')}
          confirmLabel={t('Delete package')}
          busy={saving}
          onClose={() => setPackageToDelete(null)}
          onConfirm={async () => {
            await handleDelete(packageToDelete);
            setPackageToDelete(null);
          }}
        />
      )}
    </section>
  );
};

export default ServicePackageManager;
