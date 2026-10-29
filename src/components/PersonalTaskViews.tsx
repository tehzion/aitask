import '../lib/uxEnhancementCopy';
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../store';
import { getVisibleTasks } from '../lib/access';
import { captureTaskFilters, emptyTaskPreferences, parseTaskPreferences, restoreTaskFilters, type TaskViewMode, type TaskViewPreferences } from '../lib/personalTaskViews';
import { useI18n } from './I18nProvider';
import { Button } from './ui';
import { inputBase } from './uiTokens';

export default function PersonalTaskViews({ storageKey, supportsBoard = false }: { storageKey: string; supportsBoard?: boolean }) {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [preferences, setPreferences] = React.useState(() => {
    try { return parseTaskPreferences(localStorage.getItem(storageKey)); } catch { return emptyTaskPreferences(); }
  });
  const [selected, setSelected] = React.useState('');
  const [name, setName] = React.useState('');
  const [message, setMessage] = React.useState('');
  const initialMode = React.useRef(preferences.mode);
  const initialized = React.useRef(false);
  React.useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (supportsBoard && !params.has('view') && initialMode.current === 'board') {
      const next = new URLSearchParams(params); next.set('view', 'board'); setParams(next, { replace: true });
    }
  }, [params, setParams, supportsBoard]);
  const persist = (next: TaskViewPreferences) => {
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setPreferences(next); return true; }
    catch { setMessage('Unable to save preferences on this device.'); return false; }
  };
  const mode: TaskViewMode = supportsBoard && params.get('view') === 'board' ? 'board' : 'table';
  React.useEffect(() => {
    // Only explicit URL choices overwrite the stored default, including toolbar/shortcut changes.
    if (!params.has('view') || preferences.mode === mode) return;
    const next: TaskViewPreferences = { ...preferences, mode: mode as TaskViewMode };
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setPreferences(next); }
    catch { setMessage('Unable to save preferences on this device.'); }
  }, [mode, params, preferences, storageKey]);
  const save = (update: boolean) => {
    const trimmed = name.trim();
    if (!trimmed || preferences.views.some(view => view.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase() && (!update || view.id !== selected))) { setMessage('Choose a unique view name.'); return; }
    if (!update && preferences.views.length >= 25) { setMessage('You can save up to 25 personal views.'); return; }
    const view = { id: update ? selected : crypto.randomUUID(), name: trimmed, filters: captureTaskFilters(params) };
    const views = update ? preferences.views.map(old => old.id === selected ? view : old) : [...preferences.views, view];
    if (persist({ version: 1, mode: mode as TaskViewMode, views })) { setSelected(view.id); setMessage('View saved on this device.'); }
  };
  const open = (id: string) => {
    setSelected(id);
    const view = preferences.views.find(item => item.id === id);
    setName(view?.name || '');
    if (!view) return;
    const state = useStore.getState();
    const visible = getVisibleTasks(state.currentUser, state.tasks, state.rolePermissions, { clients: state.clients, projects: state.projects });
    const restored = restoreTaskFilters(view.filters, visible, state.taskStatuses);
    restored.params.set('view', mode);
    setParams(restored.params);
    setMessage(restored.removed ? 'Some saved filters are no longer available and were removed.' : '');
  };
  // A quiet disclosure under the page title; it opens into a panel only on request.
  return <details className="group/views w-full">
    <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-muted hover:text-ink">{t('Personal views')}</summary>
    <div className="mt-1 flex flex-wrap items-end gap-3 rounded-panel border border-line bg-surface p-4">
      <label className="min-w-0 flex-1 text-sm text-ink">{t('Choose a saved view')}
        <select className={`${inputBase} mt-1 min-h-11`} value={selected} onChange={event => open(event.target.value)}><option value="">{t('Choose a saved view')}</option>{preferences.views.map(view => <option data-i18n-skip key={view.id} value={view.id}>{view.name}</option>)}</select>
      </label>
      <label className="min-w-0 flex-1 text-sm text-ink">{t('View name')}<input className={`${inputBase} mt-1 min-h-11`} value={name} maxLength={60} onChange={event => setName(event.target.value)} /></label>
      <Button variant="secondary" disabled={!name.trim()} onClick={() => save(false)}>{t('Save view')}</Button>
      {selected && <><Button variant="secondary" disabled={!name.trim()} onClick={() => save(true)}>{t('Update view')}</Button><Button variant="secondary" onClick={() => { if (persist({ ...preferences, views: preferences.views.filter(view => view.id !== selected) })) { setSelected(''); setName(''); setMessage('View deleted.'); } }}>{t('Delete view')}</Button></>}
      {supportsBoard && <label className="text-sm text-ink">{t('View mode')}<select className={`${inputBase} mt-1 min-h-11`} value={mode} onChange={event => { const nextMode: TaskViewMode = event.target.value === 'board' ? 'board' : 'table'; const next = new URLSearchParams(params); next.set('view', nextMode); setParams(next, { replace: true }); persist({ ...preferences, mode: nextMode }); }}><option value="table">{t('Table')}</option><option value="board">{t('Board')}</option></select></label>}
    </div>
    {message && <p role="status" className="mt-2 text-sm text-muted">{t(message)}</p>}
  </details>;
}
