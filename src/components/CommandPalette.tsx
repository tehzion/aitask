import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, LayoutDashboard, Moon, Search, Sun, UserPlus, CalendarDays, Users, FolderKanban, BarChart3, UserCheck, Settings, Languages, Keyboard } from 'lucide-react';
import ModalShell from './ModalShell';
import { useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { canAccessPath, canCreateTasks, isBossKoo } from '../lib/access';
import { useColorTheme } from '../hooks/useColorTheme';
import { useI18n } from './I18nProvider';
import { cn } from '../lib/utils';

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
  const navigate = useNavigate();
  const { currentUser, rolePermissions, setCreateTaskModalOpen } = useStore(useShallow(state => ({
    currentUser: state.currentUser,
    rolePermissions: state.rolePermissions,
    setCreateTaskModalOpen: state.setCreateTaskModalOpen,
  })));
  const { resolvedTheme, toggleTheme } = useColorTheme();
  const { t, toggleLocale } = useI18n();
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const titleId = React.useId();

  React.useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [isOpen]);

  const commands = React.useMemo<PaletteCommand[]>(() => {
    const navigation: Array<[string, string, React.ComponentType<{ className?: string }>]> = [
      ['/', t('Dashboard'), LayoutDashboard],
      ['/tasks', t('Tasks'), CheckSquare],
      ['/calendar', t('Calendar'), CalendarDays],
      ['/clients', t('Clients'), Users],
      ['/projects', t('Companies'), FolderKanban],
      ['/reports', t('Reports'), BarChart3],
      ['/approvals', t('Approvals'), UserCheck],
      ['/settings', t('Settings'), Settings],
    ];
    const actions: PaletteCommand[] = [];
    navigation.forEach(([path, label, Icon]) => {
      if (canAccessPath(currentUser, path, rolePermissions)) {
        actions.push({ id: `nav:${path}`, label, icon: Icon, run: () => { navigate(path); onClose(); } });
      }
    });
    if (canCreateTasks(currentUser, rolePermissions)) {
      actions.push({ id: 'action:create-task', label: t('Create task'), icon: CheckSquare, run: () => { setCreateTaskModalOpen(true); onClose(); } });
    }
    if (isBossKoo(currentUser)) {
      actions.push({ id: 'action:add-member', label: t('Add member'), icon: UserPlus, run: () => { navigate('/approvals'); onClose(); } });
    }
    actions.push({ id: 'action:theme', label: resolvedTheme === 'dark' ? t('Switch to day mode') : t('Switch to night mode'), icon: resolvedTheme === 'dark' ? Sun : Moon, run: () => { toggleTheme(); onClose(); } });
    actions.push({ id: 'action:language', label: t('Switch language'), icon: Languages, run: () => { toggleLocale(); onClose(); } });
    if (onOpenShortcuts) {
      actions.push({ id: 'action:shortcuts', label: t('Keyboard shortcuts'), icon: Keyboard, run: () => { onOpenShortcuts(); onClose(); } });
    }
    return actions;
  }, [currentUser, navigate, onClose, onOpenShortcuts, resolvedTheme, rolePermissions, setCreateTaskModalOpen, t, toggleLocale, toggleTheme]);

  const filtered = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return commands;
    return commands.filter(command => command.label.toLowerCase().includes(normalized));
  }, [commands, query]);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const runActive = () => {
    const command = filtered[activeIndex];
    if (command) command.run();
  };

  if (!isOpen) return null;

  return (
    <ModalShell labelledBy={titleId} onClose={onClose} panelClassName="max-w-xl">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Search className="h-4 w-4 shrink-0 text-muted" />
        <input
          data-autofocus
          type="text"
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex(index => Math.min(filtered.length - 1, index + 1)); }
            else if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(index => Math.max(0, index - 1)); }
            else if (event.key === 'Enter') { event.preventDefault(); runActive(); }
          }}
          placeholder={t('Search pages and actions...')}
          aria-label={t('Search pages and actions...')}
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted/70"
        />
        <kbd className="rounded border border-line bg-inset px-1.5 py-0.5 font-mono text-[10px] text-muted">Esc</kbd>
      </div>
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
