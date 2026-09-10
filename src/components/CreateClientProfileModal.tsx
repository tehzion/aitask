import React from 'react';
import { ArrowRight, Building2, Check, X } from 'lucide-react';
import ModalShell from './ModalShell';
import { Button } from './ui';
import { inputBase, modalFooter } from './uiTokens';
import { useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';

type Props = {
  onClose: () => void;
  onCreated?: (clientId: string) => void;
  onCreateProject?: (clientId: string) => void;
  onAddServicePlan?: (clientId: string) => void;
};

const CreateClientProfileModal: React.FC<Props> = ({ onClose, onCreated, onCreateProject, onAddServicePlan }) => {
  const { createClientProfile, commitPendingMutation, backend } = useStore(useShallow(state => ({
    createClientProfile: state.createClientProfile,
    commitPendingMutation: state.commitPendingMutation,
    backend: state.backend,
  })));
  const titleId = React.useId();
  const [form, setForm] = React.useState({ clientName: '', contactPerson: '', email: '', phone: '', address: '', website: '', facebookPage: '', notes: '' });
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [createdClientId, setCreatedClientId] = React.useState('');

  const update = (key: keyof typeof form, value: string) => {
    setForm(current => ({ ...current, [key]: value }));
    setError('');
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (backend.upgradeRequired) {
      setError(backend.error || backend.message);
      return;
    }

    setSaving(true);
    setError('');
    try {
      let clientId = createdClientId;
      if (!clientId) {
        const result = createClientProfile(form);
        if (!result.ok || !result.id) {
          setError(result.error || 'Unable to add this company.');
          return;
        }
        clientId = result.id;
        setCreatedClientId(clientId);
      }
      const committed = await commitPendingMutation();
      if (!committed.ok) {
        setError(committed.error || 'The company is waiting to be saved. Retry to finish syncing.');
        return;
      }
      onCreated?.(clientId);
    } finally {
      setSaving(false);
    }
  };

  const continueTo = (callback?: (clientId: string) => void) => {
    if (!createdClientId || saving) return;
    callback?.(createdClientId);
  };

  return (
    <ModalShell labelledBy={titleId} onClose={() => { if (!saving) onClose(); }} closeOnBackdrop={!saving} panelClassName="max-w-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-line px-5 pb-5 pt-6 sm:px-6">
        <div>
          <p className="calm-eyebrow">Companies · New client</p>
          <h2 id={titleId} className="mt-1 text-2xl font-semibold tracking-[-0.035em] text-ink">{createdClientId ? 'Client added' : 'Add a client company'}</h2>
          <p className="mt-1 text-sm text-muted">{createdClientId ? 'The company is ready for projects, service plans, and tasks.' : 'Save the company profile first. A service plan and project can be added next.'}</p>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} disabled={saving} className="flex h-11 w-11 items-center justify-center rounded-control text-muted hover:bg-inset hover:text-ink disabled:cursor-wait disabled:opacity-50"><X className="h-5 w-5" /></button>
      </header>

      {createdClientId ? (
        <div className="space-y-5 p-5 sm:p-6">
          <div className="flex items-start gap-3 rounded-panel bg-accent-soft p-5 ring-1 ring-accent/25">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-accent text-white"><Check className="h-5 w-5" /></span>
            <div><p className="font-semibold text-ink">{form.clientName}</p><p className="mt-1 text-sm leading-6 text-muted">No login account or service plan was created automatically.</p></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button onClick={() => continueTo(onCreateProject)}><Building2 className="h-4 w-4" />Create project<ArrowRight className="ml-auto h-4 w-4" /></Button>
            <Button variant="secondary" onClick={() => continueTo(onAddServicePlan)}>Add service plan<ArrowRight className="ml-auto h-4 w-4" /></Button>
          </div>
          <button type="button" onClick={onClose} className="min-h-11 w-full rounded-control border border-line px-4 py-2 text-sm font-semibold text-muted transition hover:bg-inset hover:text-ink">Done</button>
        </div>
      ) : (
        <form onSubmit={save} className="max-h-[min(44rem,calc(100dvh-10rem))] overflow-y-auto p-5 sm:p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-ink">Company name *<input autoFocus required maxLength={240} className={`${inputBase} mt-1.5 px-3 py-2.5`} value={form.clientName} onChange={event => update('clientName', event.target.value)} /></label>
            <label className="text-sm font-medium text-ink">Contact person<input className={`${inputBase} mt-1.5 px-3 py-2.5`} value={form.contactPerson} onChange={event => update('contactPerson', event.target.value)} /></label>
            <label className="text-sm font-medium text-ink">Email<input type="email" className={`${inputBase} mt-1.5 px-3 py-2.5`} value={form.email} onChange={event => update('email', event.target.value)} /></label>
            <label className="text-sm font-medium text-ink">Phone<input type="tel" className={`${inputBase} mt-1.5 px-3 py-2.5`} value={form.phone} onChange={event => update('phone', event.target.value)} /></label>
            <label className="text-sm font-medium text-ink md:col-span-2">Address<textarea rows={2} className={`${inputBase} mt-1.5 px-3 py-2.5`} value={form.address} onChange={event => update('address', event.target.value)} /></label>
            <label className="text-sm font-medium text-ink">Website<input type="url" placeholder="https://" className={`${inputBase} mt-1.5 px-3 py-2.5`} value={form.website} onChange={event => update('website', event.target.value)} /></label>
            <label className="text-sm font-medium text-ink">Facebook page<input type="url" placeholder="https://" className={`${inputBase} mt-1.5 px-3 py-2.5`} value={form.facebookPage} onChange={event => update('facebookPage', event.target.value)} /></label>
            <label className="text-sm font-medium text-ink md:col-span-2">Notes<textarea rows={4} className={`${inputBase} mt-1.5 px-3 py-2.5`} value={form.notes} onChange={event => update('notes', event.target.value)} /></label>
          </div>
          {error && <p className="mt-5 rounded-control border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert">{error}</p>}
          <div className={modalFooter}>
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save client'}</Button>
          </div>
        </form>
      )}
    </ModalShell>
  );
};

export default CreateClientProfileModal;
