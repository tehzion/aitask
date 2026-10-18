import '../lib/uxEnhancementCopy';
import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { searchWorkspace } from '../lib/globalSearch';
import { useI18n } from './I18nProvider';

export default function GlobalSearchResults({ query, onClose }: { query: string; onClose: () => void }) {
  const snapshot = useStore(useShallow(state => ({ currentUser: state.currentUser, tasks: state.tasks, projects: state.projects, clients: state.clients, clientPlans: state.clientPlans, rolePermissions: state.rolePermissions })));
  const results = React.useMemo(() => searchWorkspace(snapshot, query), [snapshot, query]);
  const navigate = useNavigate();
  const { t } = useI18n();
  return <div role="region" aria-label={t('Workspace search results')} className="absolute inset-x-0 top-full z-50 mt-1 max-h-[50dvh] overflow-y-auto rounded-panel border border-line bg-surface p-2 shadow-float" onKeyDown={event => {
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && buttons.length) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  }}>
    <p className="px-3 py-2 text-xs text-muted">{t('Search across your workspace')}</p>
    {!results.length && <p role="status" className="p-3 text-sm text-muted">{t('No accessible records match your search.')}</p>}
    {['Tasks', 'Projects', 'Companies', 'Clients', 'Service plans'].map(type => {
      const group = results.filter(result => result.type === type);
      return group.length ? <section key={type} aria-label={t(type)}>
        <h3 className="px-3 pt-3 text-xs font-semibold text-muted">{t(type)}</h3>
        {group.map(result => <button key={result.id} type="button" className="block min-h-11 w-full break-words rounded-control px-3 py-2 text-left text-sm text-ink hover:bg-inset focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" onClick={() => { navigate(result.path); onClose(); }}><span data-i18n-skip>{result.label}</span></button>)}
      </section> : null;
    })}
  </div>;
}
