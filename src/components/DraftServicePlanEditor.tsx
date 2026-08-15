import React from 'react';
import { Save } from 'lucide-react';
import { useStore } from '../store';
import type { ClientServicePlan, ServiceItem } from '../types';
import { snapshotWorkflow } from '../lib/serviceManagement';
import { Badge, Button } from './ui';
import { cardBase, inputBase } from './uiTokens';
import { cn } from '../lib/utils';

const DraftServicePlanEditor = ({ plan }: { plan: ClientServicePlan }) => {
  const { serviceWorkflowTemplates, updateDraftClientPlan, commitPendingMutation } = useStore();
  const [name, setName] = React.useState(plan.name);
  const [contractEndDate, setContractEndDate] = React.useState(plan.contractEndDate || '');
  const [serviceItems, setServiceItems] = React.useState<ServiceItem[]>(() => structuredClone(plan.serviceItems));
  const [discountType, setDiscountType] = React.useState(plan.discountType);
  const [discountValue, setDiscountValue] = React.useState(plan.discountValue);
  const [taxRateBps, setTaxRateBps] = React.useState(plan.taxRateBps);
  const [message, setMessage] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setName(plan.name);
    setContractEndDate(plan.contractEndDate || '');
    setServiceItems(structuredClone(plan.serviceItems));
    setDiscountType(plan.discountType);
    setDiscountValue(plan.discountValue);
    setTaxRateBps(plan.taxRateBps);
  }, [plan]);

  const updateItem = (id: string, patch: Partial<ServiceItem>) => {
    setServiceItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
  };

  const save = async () => {
    const result = updateDraftClientPlan(plan.id, { name, contractEndDate: contractEndDate || undefined, serviceItems, discountType, discountValue, taxRateBps });
    if (!result.ok) return setMessage(result.error || 'Unable to update this revision.');
    setSaving(true);
    const committed = await commitPendingMutation('client_plan.manage');
    setSaving(false);
    setMessage(committed.ok ? 'Draft revision saved.' : committed.error || 'The revision is waiting to be saved.');
  };

  return <section className={cn(cardBase, 'overflow-hidden border-blue-200')}>
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-blue-100 bg-blue-50 px-5 py-4">
      <div><div className="flex items-center gap-2"><h2 className="font-semibold text-blue-950">Scheduled revision {plan.revision}</h2><Badge tone="amber">Draft</Badge></div><p className="mt-1 text-sm text-blue-800">Takes effect on {plan.effectiveFromCycleStart}. Existing cycles remain unchanged.</p></div>
      <Button onClick={() => void save()} disabled={saving}><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save revision'}</Button>
    </div>
    <div className="grid gap-4 border-b border-slate-100 p-5 md:grid-cols-2">
      <label className="text-sm font-semibold text-slate-700">Plan name<input className={cn(inputBase, 'mt-1 px-3 py-2')} value={name} onChange={event => setName(event.target.value)} /></label>
      <label className="text-sm font-semibold text-slate-700">Contract end date<input type="date" className={cn(inputBase, 'mt-1 px-3 py-2')} value={contractEndDate} onChange={event => setContractEndDate(event.target.value)} /></label>
    </div>
    <div className="divide-y divide-slate-100">{serviceItems.map(item => <div key={item.id} className="grid gap-3 p-5 md:grid-cols-12">
      <input aria-label="Service name" className={cn(inputBase, 'px-3 py-2 md:col-span-3')} value={item.name} onChange={event => updateItem(item.id, { name: event.target.value })} />
      <input aria-label="Platforms" className={cn(inputBase, 'px-3 py-2 md:col-span-3')} value={item.platforms.join(', ')} onChange={event => updateItem(item.id, { platforms: event.target.value.split(',').map(value => value.trim()).filter(Boolean) })} />
      <input aria-label="Quantity" type="number" min="1" className={cn(inputBase, 'px-3 py-2 md:col-span-1')} value={item.quantity} onChange={event => updateItem(item.id, { quantity: Number(event.target.value) })} />
      <input aria-label="Unit price" type="number" min="0" step="0.01" className={cn(inputBase, 'px-3 py-2 md:col-span-2')} value={item.unitPriceMinor / 100} onChange={event => updateItem(item.id, { unitPriceMinor: Math.round(Number(event.target.value) * 100) })} />
      <select aria-label="Task workflow" className={cn(inputBase, 'px-3 py-2 md:col-span-3')} value={item.workflow?.templateId || ''} onChange={event => { const template = serviceWorkflowTemplates.find(value => value.id === event.target.value); updateItem(item.id, { workflow: template ? snapshotWorkflow(template) : undefined }); }}>
        <option value="">No task workflow</option>{serviceWorkflowTemplates.filter(value => value.isActive).map(template => <option key={template.id} value={template.id}>{template.name} · rev {template.revision}</option>)}
      </select>
    </div>)}</div>
    <div className="grid gap-4 border-t border-slate-100 bg-slate-50 p-5 md:grid-cols-3">
      <label className="text-sm font-semibold text-slate-700">Discount type<select className={cn(inputBase, 'mt-1 px-3 py-2')} value={discountType} onChange={event => { setDiscountType(event.target.value as ClientServicePlan['discountType']); setDiscountValue(0); }}><option value="none">None</option><option value="percent">Percent</option><option value="fixed">Fixed MYR</option></select></label>
      <label className="text-sm font-semibold text-slate-700">Discount value<input type="number" min="0" step="0.01" disabled={discountType === 'none'} className={cn(inputBase, 'mt-1 px-3 py-2')} value={discountValue / 100} onChange={event => setDiscountValue(Math.round(Number(event.target.value) * 100))} /></label>
      <label className="text-sm font-semibold text-slate-700">Tax rate (%)<input type="number" min="0" max="100" step="0.01" className={cn(inputBase, 'mt-1 px-3 py-2')} value={taxRateBps / 100} onChange={event => setTaxRateBps(Math.round(Number(event.target.value) * 100))} /></label>
    </div>
    {message && <p className="border-t border-slate-100 px-5 py-3 text-sm font-medium text-blue-800" role="status">{message}</p>}
  </section>;
};

export default DraftServicePlanEditor;
