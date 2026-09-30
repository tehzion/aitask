import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckSquare, Languages, Moon, Search, Sun, UserPlus, Keyboard, X } from 'lucide-react';
import ModalShell from './ModalShell';
import { useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { canAccessPath, canCreateTasks, isBossKoo } from '../lib/access';
import { useColorTheme } from '../hooks/useColorTheme';
import { useI18n } from './I18nProvider';
import { cn } from '../lib/utils';
import { getNavigationSections } from '../lib/navigation';
import { useImeSafeInput } from '../hooks/useImeSafeInput';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenShortcuts?: () => void;
}

interface PaletteCommand {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, onOpenShortcuts }) => {
  const routerNavigate = useNavigate();
  const { currentUser, rolePermissions, setCreateTaskModalOpen } = useStore(useShallow(state => ({
    currentUser: state.currentUser,
    rolePermissions: state.rolePermissions,
    setCreateTaskModalOpen: state.setCreateTaskModalOpen,
  })));
  const { resolvedTheme, toggleTheme } = useColorTheme();
  const { t, toggleLocale } = useI18n();
  const navigate = routerNavigate;
  const [query, setQuery] = React.useState('');
  const queryInput = useImeSafeInput(query, setQuery);
  const resetQuery = queryInput.commit;
  const [activeIndex, setActiveIndex] = React.useState(0);
  const titleId = React.useId();
  const activeRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (isOpen) {
      resetQuery('');
      setActiveIndex(0);
    }
  }, [isOpen, resetQuery]);

  const commands = React.useMemo<PaletteCommand[]>(() => {
    const sections = getNavigationSections(currentUser, rolePermissions);
    const navigation = [...sections.primary, ...sections.secondary, ...sections.footer];
    if (!navigation.some(item => item.path === '/tasks') && canAccessPath(currentUser, '/tasks', rolePermissions)) navigation.push({ path: '/tasks', label: 'Tasks', icon: CheckSquare });
    if (!navigation.some(item => item.path === '/notifications')) navigation.push({ path: '/notifications', label: 'Notifications', icon: Bell });
    const actions: PaletteCommand[] = [];
    navigation.forEach(({ path, label, icon: Icon }) => {
      actions.push({ id: `nav:${path}`, label: t(label), icon: Icon, run: () => { navigate(path); onClose(); } });
    });
    if (canCreateTasks(currentUser, rolePermissions)) {
      actions.push({ id: 'action:create-task', label: t('Create task'), icon: CheckSquare, run: () => { setCreateTaskModalOpen(true); onClose(); } });
    }
    if (isBossKoo(currentUser)) {
      actions.push({ id: 'action:add-member', label: t('Manage members'), icon: UserPlus, run: () => { navigate('/approvals?tab=members'); onClose(); } });
    }
    actions.push({ id: 'action:theme', label: resolvedTheme === 'dark' ? t('Switch to day mode') : t('Switch to night mode'), icon: resolvedTheme === 'dark' ? Sun : Moon, run: () => { toggleTheme(); onClose(); } });
    actions.push({ id: 'action:language', label: t('Switch language'), icon: Languages, run: () => { toggleLocale(); onClose(); } });
    if (onOpenShortcuts) {
      actions.push({ id: 'action:shortcuts', label: t('Keyboard shortcuts'), icon: Keyboard, run: () => { onOpenShortcuts(); onClose(); } });
    }
    return actions;
  }, [currentUser, navigate, onClose, onOpenShortcuts, resolvedTheme, rolePermissions, setCreateTaskModalOpen, t, toggleLocale, toggleTheme]);

  const filtered = React.useMemo(() => {
    const normalized = queryInput.value.trim().toLowerCase();
    if (!normalized) return commands;
    return commands.filter(command => command.label.toLowerCase().includes(normalized));
  }, [commands, queryInput.value]);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [queryInput.value]);

  React.useEffect(() => { activeRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [activeIndex]);

  const runActive = () => {
    const command = filtered[activeIndex];
    if (command) command.run();
  };

  if (!isOpen) return null;

  return (
    <ModalShell labelledBy={titleId} onClose={onClose} closeOnBackdrop panelClassName="max-w-xl">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Search className="h-4 w-4 shrink-0 text-muted" />
        <input
          data-autofocus
          type="text"
          {...queryInput.inputProps}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex(index => Math.max(0, Math.min(filtered.length - 1, index + 1))); }
            else if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(index => Math.max(0, index - 1)); }
            else if (event.key === 'Enter') { event.preventDefault(); runActive(); }
          }}
          placeholder={t('Search pages and actions...')}
          aria-label={t('Search pages and actions...')}
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted/70"
        />
        <kbd className="rounded border border-line bg-inset px-1.5 py-0.5 font-mono text-[10px] text-muted">{t('common.escape')}</kbd>
        <button type="button" aria-label={t('Close')} onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-muted hover:bg-inset hover:text-ink"><X className="h-4 w-4" /></button>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{filtered[activeIndex]?.label || t('No matching commands.')}</p>
      <h2 id={titleId} className="sr-only">{t('Command palette')}</h2>
      <div className="custom-scrollbar max-h-80 overflow-y-auto p-2">
        {filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted">{t('No matching commands.')}</p>
        )}
        {filtered.map((command, index) => {
          const Icon = command.icon;
          return (
            <button
              key={command.id}
              ref={index === activeIndex ? activeRef : undefined}
              aria-current={index === activeIndex ? true : undefined}
              type="button"
              onClick={command.run}
              onMouseEnter={() => setActiveIndex(index)}
              className={cn(
                'flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left text-sm font-medium transition-colors',
                index === activeIndex ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-inset',
              )}
            >
              <Icon className="h-4 w-4 shrink-0 text-muted" />
              <span className="truncate">{command.label}</span>
            </button>
          );
        })}
      </div>
    </ModalShell>
  );
};

export default CommandPalette;
