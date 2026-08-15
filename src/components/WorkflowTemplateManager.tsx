import React from 'react';
import { ArrowDown, ArrowUp, Plus, Save, Trash2, Workflow } from 'lucide-react';
import { useStore } from '../store';
import type { ServiceWorkflowStep, ServiceWorkflowTemplate, WorkflowStepKind } from '../types';
import { STAFF_DEPARTMENTS } from '../lib/departments';
import { Button } from './ui';
import { cardBase, inputBase } from './uiTokens';
import { cn } from '../lib/utils';

const stepKinds: { value: WorkflowStepKind; label: string }[] = [
  { value: 'work', label: 'Work' },
  { value: 'internal_review', label: 'Internal review' },
  { value: 'client_approval', label: 'Client approval' },
  { value: 'publishing', label: 'Publishing' },
];

const blankStep = (order: number): ServiceWorkflowStep => ({
  id: crypto.randomUUID(), order, title: '', department: 'Operation', kind: 'work', clientVisible: false, required: true,
});

const blankTemplate = (): Omit<ServiceWorkflowTemplate, 'id' | 'revision' | 'createdAt' | 'updatedAt'> => ({
  name: '', description: '', serviceTypes: [], isActive: true, steps: [blankStep(1)],
});

const WorkflowTemplateManager = () => {
  const { serviceWorkflowTemplates, saveWorkflowTemplate, deleteWorkflowTemplate, commitPendingMutation } = useStore();
  const [editingId, setEditingId] = React.useState<string>();
  const [draft, setDraft] = React.useState(blankTemplate);
  const [message, setMessage] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const handleDelete = async (template: ServiceWorkflowTemplate) => {
    const confirmed = window.confirm(
      `Delete the "${template.name}" workflow template? Plans that already froze this workflow keep their copy.`,
    );
    if (!confirmed) return;
    const result = deleteWorkflowTemplate(template.id);
    if (!result.ok) return setMessage(result.error || 'Unable to delete the workflow template.');
    setSaving(true);
    const committed = await commitPendingMutation('service_workflow.manage');
    setSaving(false);
    if (!committed.ok) {
      setMessage(committed.error || 'The deletion is waiting to be saved.');
      return;
    }
    if (editingId === template.id) edit();
    setMessage('Workflow template deleted. Frozen copies in plans remain unchanged.');
  };

  const edit = (template?: ServiceWorkflowTemplate) => {
    setEditingId(template?.id);
    setDraft(template ? {
      name: template.name,
      description: template.description,
      serviceTypes: [...template.serviceTypes],
      isActive: template.isActive,
      steps: template.steps.map(step => ({ ...step })).sort((left, right) => left.order - right.order),
    } : blankTemplate());
    setMessage('');
  };

  const updateStep = (id: string, patch: Partial<ServiceWorkflowStep>) => setDraft(current => ({
    ...current,
    steps: current.steps.map(step => step.id === id ? { ...step, ...patch } : step),
  }));

  const moveStep = (index: number, direction: -1 | 1) => setDraft(current => {
    const target = index + direction;
    if (target < 0 || target >= current.steps.length) return current;
    const steps = [...current.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    return { ...current, steps: steps.map((step, stepIndex) => ({ ...step, order: stepIndex + 1 })) };
  });

  const save = async () => {
    const result = saveWorkflowTemplate({ ...draft, id: editingId });
    if (!result.ok) return setMessage(result.error || 'Unable to save the workflow template.');
    setSaving(true);
    const committed = await commitPendingMutation('service_workflow.manage');
    setSaving(false);
    if (!committed.ok) return setMessage(committed.error || 'The workflow is waiting to be saved.');
    edit();
    setMessage('Workflow saved. Existing client and cycle snapshots were not changed.');
  };

  return (
    <section className={cn(cardBase, 'overflow-hidden')} aria-labelledby="workflow-templates-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-5">
        <div>
          <h2 id="workflow-templates-title" className="font-semibold text-slate-950">Task Workflow Templates</h2>
          <p className="mt-1 text-sm text-slate-500">Reusable internal task chains that are frozen with each client plan.</p>
        </div>
        <Button variant="secondary" onClick={() => edit()}><Workflow className="h-4 w-4" />New workflow</Button>
      </div>
      <div className="grid lg:grid-cols-[280px_1fr]">
        <div className="border-b border-line bg-inset/60 p-3 lg:border-b-0 lg:border-r lg:border-line">
          <p className="calm-eyebrow px-2 pb-2 pt-1">Workflow library</p>
          <div className="space-y-2">
            {serviceWorkflowTemplates.map(template => (
              <div key={template.id} className={cn('group flex items-stretch gap-1 rounded-control', editingId === template.id ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'hover:bg-surface/70')}>
              <button onClick={() => edit(template)} aria-current={editingId === template.id ? 'true' : undefined} className="min-w-0 flex-1 rounded-control px-3 py-3 text-left transition-colors">
                <span className="block truncate text-sm font-semibold text-slate-900">{template.name}</span>
                <span className="mt-1 block text-xs text-slate-500">Revision {template.revision} · {template.steps.length} steps</span>
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(template)}
                disabled={saving}
                aria-label={`Delete workflow ${template.name}`}
                title={`Delete ${template.name}`}
                className="flex w-10 items-center justify-center rounded-control text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-6 p-5 sm:p-6">
          <div><p className="calm-eyebrow">Workflow editor</p><h3 className="mt-1 text-lg font-semibold text-ink">{editingId ? 'Edit task workflow' : 'Create task workflow'}</h3></div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Template name<input className={cn(inputBase, 'mt-1 px-3 py-2.5')} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
            <label className="text-sm font-medium text-slate-700">Service types<input className={cn(inputBase, 'mt-1 px-3 py-2.5')} placeholder="Short Video, Video" value={draft.serviceTypes.join(', ')} onChange={event => setDraft({ ...draft, serviceTypes: event.target.value.split(',').map(value => value.trim()).filter(Boolean) })} /></label>
          </div>
          <label className="block text-sm font-medium text-slate-700">Description<textarea className={cn(inputBase, 'mt-1 min-h-20 px-3 py-2.5')} value={draft.description || ''} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={draft.isActive} onChange={event => setDraft({ ...draft, isActive: event.target.checked })} />Available for new plans</label>
          <div className="space-y-3">
            {draft.steps.map((step, index) => (
              <div key={step.id} className="rounded-panel border border-line bg-inset/55 p-3">
                <div className="grid gap-3 lg:grid-cols-[44px_1fr_180px_160px_110px_auto] lg:items-center">
                  <span className="calm-number mx-auto flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-sm font-semibold text-accent">{index + 1}</span>
                  <input aria-label={`Step ${index + 1} title`} className={cn(inputBase, 'px-3 py-2')} placeholder="Step title" value={step.title} onChange={event => updateStep(step.id, { title: event.target.value })} />
                  <select aria-label={`Step ${index + 1} department`} className={cn(inputBase, 'px-3 py-2')} value={step.department} onChange={event => updateStep(step.id, { department: event.target.value as ServiceWorkflowStep['department'] })}>{STAFF_DEPARTMENTS.map(department => <option key={department}>{department}</option>)}</select>
                  <select aria-label={`Step ${index + 1} kind`} className={cn(inputBase, 'px-3 py-2')} value={step.kind} onChange={event => updateStep(step.id, { kind: event.target.value as WorkflowStepKind })}>{stepKinds.map(kind => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select>
                  <input aria-label={`Step ${index + 1} due offset`} type="number" min="0" max="365" className={cn(inputBase, 'px-3 py-2')} placeholder="Due +days" value={step.dueOffsetDays ?? ''} onChange={event => updateStep(step.id, { dueOffsetDays: event.target.value === '' ? undefined : Number(event.target.value) })} />
                  <div className="flex justify-end gap-1">
                    <button aria-label="Move step up" onClick={() => moveStep(index, -1)} className="rounded-md p-2 text-slate-500 hover:bg-white"><ArrowUp className="h-4 w-4" /></button>
                    <button aria-label="Move step down" onClick={() => moveStep(index, 1)} className="rounded-md p-2 text-slate-500 hover:bg-white"><ArrowDown className="h-4 w-4" /></button>
                    <button aria-label="Remove step" disabled={draft.steps.length === 1} onClick={() => setDraft(current => ({ ...current, steps: current.steps.filter(item => item.id !== step.id).map((item, itemIndex) => ({ ...item, order: itemIndex + 1 })) }))} className="rounded-md p-2 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 pl-0 lg:grid-cols-[1fr_auto_auto] lg:pl-11">
                  <input aria-label={`Step ${index + 1} description`} className={cn(inputBase, 'px-3 py-2')} placeholder="Optional instructions" value={step.description || ''} onChange={event => updateStep(step.id, { description: event.target.value })} />
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={step.clientVisible} onChange={event => updateStep(step.id, { clientVisible: event.target.checked })} />Client-visible</label>
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={step.required} onChange={event => updateStep(step.id, { required: event.target.checked })} />Required</label>
                </div>
              </div>
            ))}
          </div>
          <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface/95 px-5 py-4 backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6">
            <Button variant="secondary" onClick={() => setDraft(current => ({ ...current, steps: [...current.steps, blankStep(current.steps.length + 1)] }))}><Plus className="h-4 w-4" />Add step</Button>
            <Button onClick={save} disabled={saving}><Save className="h-4 w-4" />{saving ? 'Saving...' : 'Save workflow'}</Button>
          </div>
          {message && <p className="text-sm font-medium text-blue-700" role="status">{message}</p>}
        </div>
      </div>
    </section>
  );
};

export default WorkflowTemplateManager;
