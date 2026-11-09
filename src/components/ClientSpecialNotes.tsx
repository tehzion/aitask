import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { StickyNote } from 'lucide-react';
import type { ClientProfile } from '../types';
import { isPendingMutationResolution, useStore } from '../store';
import { canEditClientProfile } from '../lib/access';
import { useI18n } from './I18nProvider';
import { Button, Surface } from './ui';

/**
 * Special notes for a client (team feedback B2, 9 Nov 2026). Stored on
 * `ClientProfile.notes`, which the client portal projection never returns, so
 * the notes stay internal. Anyone who may edit the client profile can edit them.
 */
const ClientSpecialNotes = ({ client }: { client: ClientProfile }) => {
  const { t } = useI18n();
  const { currentUser, tasks, rolePermissions, clients, upsertClientProfile } = useStore(useShallow(state => ({
    currentUser: state.currentUser,
    tasks: state.tasks,
    rolePermissions: state.rolePermissions,
    clients: state.clients,
    upsertClientProfile: state.upsertClientProfile,
  })));
  const canEdit = canEditClientProfile(currentUser, client.clientName, tasks, rolePermissions, clients, client.id);
  const saved = client.notes || '';
  const [draft, setDraft] = React.useState(saved);
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const headingId = React.useId();

  React.useEffect(() => { if (!editing) setDraft(saved); }, [editing, saved]);

  const save = async () => {
    if (saving) return;
    setError('');
    const result = upsertClientProfile(client.clientName, {
      clientSince: client.clientSince || '',
      contactPerson: client.contactPerson,
      email: client.email,
      phone: client.phone,
      address: client.address,
      website: client.website,
      facebookPage: client.facebookPage,
      notes: draft,
    });
    if (!result.ok) { setError(result.error || 'Unable to save client details.'); return; }
    setSaving(true);
    try {
      const store = useStore.getState();
      const committed = isPendingMutationResolution(store.backend) ? await store.retryPendingSave() : await store.commitPendingMutation();
      if (!committed.ok) { setError(committed.error || 'The notes are waiting to be saved.'); return; }
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Surface className="p-6" aria-labelledby={headingId}>
      <div className="flex items-center justify-between gap-3">
        <h2 id={headingId} className="calm-eyebrow inline-flex items-center gap-1.5"><StickyNote className="h-3.5 w-3.5" aria-hidden="true" />{t('Special notes')}</h2>
        {canEdit && !editing && <Button variant="secondary" className="min-h-9 px-3 py-1 text-xs" onClick={() => setEditing(true)}>{t(saved ? 'Edit' : 'Add notes')}</Button>}
      </div>
      {editing ? (
        <div className="mt-4 space-y-3">
          <label className="sr-only" htmlFor={`${headingId}-input`}>{t('Special notes')}</label>
          <textarea
            id={`${headingId}-input`}
            data-i18n-skip
            rows={6}
            maxLength={5000}
            value={draft}
            disabled={saving}
            onChange={event => setDraft(event.target.value)}
            className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
          />
          <p className="text-xs text-muted">{t('Visible to the internal team only. Clients never see these notes.')}</p>
          {error && <p role="alert" className="text-sm text-[rgb(var(--calm-danger))]">{t(error)}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" disabled={saving} onClick={() => { setDraft(saved); setEditing(false); setError(''); }}>{t('Cancel')}</Button>
            <Button disabled={saving || draft === saved} onClick={() => void save()}>{saving ? t('Saving…') : t('Save notes')}</Button>
          </div>
        </div>
      ) : saved
        ? <p data-i18n-skip className="mt-4 whitespace-pre-wrap text-sm text-ink">{saved}</p>
        : <p className="mt-4 text-sm text-muted">{t('No special notes yet.')}</p>}
    </Surface>
  );
};

export default ClientSpecialNotes;
