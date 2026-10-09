import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import type { SecureCommandType } from '../lib/secureWorkspace';
import { captureWorkspaceSession, isWorkspaceSessionCurrent } from '../lib/workspaceSession';
import { useUnsavedChanges } from './useUnsavedChanges';
import { useI18n } from '../components/I18nProvider';
import { useToastStore } from '../store/useToastStore';

type LocalResult = { ok: boolean; id?: string; error?: string };
type CatalogOptions<D, R extends { id: string }> = {
  blank: () => D;
  fromRecord: (record: R) => D;
  findRecord: (id: string) => R | undefined;
  persist: (draft: D, id?: string) => LocalResult;
  remove: (id: string) => LocalResult;
  command: SecureCommandType;
  savedMessage: string;
  deletedMessage: string;
};

// Retain the submitted record separately from newer typing. Retry confirms the
// original operation; it never creates a second template or another revision.
export function useCatalogEditor<D, R extends { id: string }>(options: CatalogOptions<D, R>) {
  const { t } = useI18n();
  const account = useStore(state => state.currentUser?.id);
  const [editingId, setEditingId] = useState<string>();
  const [draft, setDraft] = useState(options.blank);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const currentDraft = useRef(draft);
  currentDraft.current = draft;
  const baseline = useRef(JSON.stringify(draft));
  const busy = useRef(false);
  const pending = useRef<{
    kind: 'save' | 'delete'; id: string; draft: D; savedDraft?: D;
    actor: string | undefined; session: ReturnType<typeof captureWorkspaceSession>;
  } | null>(null);
  const previousAccount = useRef(account);
  const blank = useRef(options.blank);
  useUnsavedChanges(saving || hasPending || JSON.stringify(draft) !== baseline.current);

  useEffect(() => {
    if (previousAccount.current === account) return;
    previousAccount.current = account;
    const initial = blank.current();
    baseline.current = JSON.stringify(initial);
    pending.current = null;
    busy.current = false;
    setHasPending(false); setSaving(false); setEditingId(undefined); setDraft(initial); setMessage('');
  }, [account]);

  const edit = (record?: R) => {
    if (busy.current || pending.current) return;
    if (JSON.stringify(currentDraft.current) !== baseline.current
      && !window.confirm(t('Discard unsaved changes?'))) return;
    const next = record ? options.fromRecord(record) : options.blank();
    baseline.current = JSON.stringify(next);
    setEditingId(record?.id); setDraft(next); setMessage('');
  };

  const confirm = async () => {
    const operation = pending.current;
    if (!operation || busy.current) return false;
    const isCurrent = () => pending.current === operation && isWorkspaceSessionCurrent(operation.session)
      && useStore.getState().currentUser?.id === operation.actor;
    let released = false;
    busy.current = true; setSaving(true); setMessage('');
    try {
      const result = await useStore.getState().retryPendingSave(options.command);
      if (!isCurrent()) {
        if (pending.current === operation) {
          pending.current = null; released = true; setHasPending(false);
          setMessage(t('Your session changed. Sign in again.'));
        }
        return false;
      }
      if (!result.ok) { setMessage(result.error || t('The change has not been saved yet.')); return false; }
      const canonical = options.findRecord(operation.id);
      const acknowledged = operation.kind === 'delete' ? !canonical : canonical
        && JSON.stringify(options.fromRecord(canonical)) === JSON.stringify(operation.savedDraft);
      pending.current = null; released = true; setHasPending(false);
      if (!acknowledged) {
        setMessage(t('The pending catalog change is no longer available. Review your draft before saving again.'));
        return false;
      }
      const unchanged = JSON.stringify(currentDraft.current) === JSON.stringify(operation.draft);
      if (operation.kind === 'save') {
        baseline.current = JSON.stringify(operation.draft);
        if (unchanged) {
          const next = options.blank(); baseline.current = JSON.stringify(next);
          setEditingId(undefined); setDraft(next);
        } else setEditingId(operation.id);
      } else if (editingId === operation.id) {
        setEditingId(undefined);
        if (unchanged) {
          const next = options.blank(); baseline.current = JSON.stringify(next); setDraft(next);
        }
      }
      const confirmation = t(operation.kind === 'save' ? options.savedMessage : options.deletedMessage);
      setMessage(confirmation);
      useToastStore.getState().addToast(confirmation, 'success');
      return true;
    } catch (error) {
      if (isCurrent()) setMessage(error instanceof Error ? error.message : t('Unable to save this change.'));
      return false;
    } finally {
      if (pending.current === operation || (released && !pending.current)) {
        busy.current = false; setSaving(false);
      }
    }
  };

  const save = async () => {
    if (busy.current) return false;
    if (pending.current) return confirm();
    const submitted = structuredClone(currentDraft.current);
    const result = options.persist(submitted, editingId);
    if (!result.ok || !result.id) { setMessage(result.error || t('Unable to save this change.')); return false; }
    const record = options.findRecord(result.id);
    pending.current = { kind: 'save', id: result.id, draft: submitted,
      savedDraft: record ? options.fromRecord(record) : undefined,
      actor: account, session: captureWorkspaceSession() };
    setHasPending(true);
    return confirm();
  };

  const deleteItem = async (record: R) => {
    if (busy.current || pending.current) return false;
    const result = options.remove(record.id);
    if (!result.ok) { setMessage(result.error || t('Unable to save this change.')); return false; }
    pending.current = { kind: 'delete', id: record.id, draft: structuredClone(currentDraft.current),
      actor: account, session: captureWorkspaceSession() };
    setHasPending(true);
    return confirm();
  };

  return { editingId, draft, setDraft, message, setMessage, saving, hasPending, edit, save, deleteItem };
}
