import React from 'react';
import ModalShell from './ModalShell';
import { NAVIGATION_SHORTCUTS } from '../lib/keyboard';
import { canAccessPath } from '../lib/access';
import { useStore } from '../store';
import { X } from 'lucide-react';

interface KeyboardShortcutsDialogProps {
  isOpen: boolean;
  canCreateTask: boolean;
  onClose: () => void;
}

const Key: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="min-w-7 rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-center font-mono text-xs font-semibold text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
    {children}
  </kbd>
);

const KeyboardShortcutsDialog: React.FC<KeyboardShortcutsDialogProps> = ({ isOpen, canCreateTask, onClose }) => {
  const currentUser = useStore(state => state.currentUser);
  const rolePermissions = useStore(state => state.rolePermissions);
  const accessibleShortcuts = NAVIGATION_SHORTCUTS.filter(shortcut => (
    canAccessPath(currentUser, shortcut.path, rolePermissions)
  ));
  if (!isOpen) return null;

  return (
    <ModalShell labelledBy="keyboard-shortcuts-title" describedBy="keyboard-shortcuts-description" onClose={onClose} panelClassName="max-w-2xl">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <div>
          <h2 id="keyboard-shortcuts-title" className="text-lg font-semibold text-slate-950 dark:text-white">Keyboard shortcuts</h2>
          <p id="keyboard-shortcuts-description" className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Shortcuts are paused while you type in a form field.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close keyboard shortcuts" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="custom-scrollbar grid gap-6 overflow-y-auto p-5 sm:grid-cols-2">
        <section aria-labelledby="shortcut-actions-heading">
          <h3 id="shortcut-actions-heading" className="text-sm font-semibold text-slate-950 dark:text-white">Actions</h3>
          <dl className="mt-3 space-y-3">
            <div className="flex items-center justify-between gap-4"><dt className="text-sm text-slate-600 dark:text-slate-300">Focus task search</dt><dd><Key>/</Key></dd></div>
            {canCreateTask && <div className="flex items-center justify-between gap-4"><dt className="text-sm text-slate-600 dark:text-slate-300">Create a task</dt><dd><Key>N</Key></dd></div>}
            <div className="flex items-center justify-between gap-4"><dt className="text-sm text-slate-600 dark:text-slate-300">Switch day/night mode</dt><dd className="flex gap-1"><Key>Shift</Key><Key>D</Key></dd></div>
            <div className="flex items-center justify-between gap-4"><dt className="text-sm text-slate-600 dark:text-slate-300">Tasks: board view</dt><dd><Key>B</Key></dd></div>
            <div className="flex items-center justify-between gap-4"><dt className="text-sm text-slate-600 dark:text-slate-300">Open this guide</dt><dd><Key>?</Key></dd></div>
            <div className="flex items-center justify-between gap-4"><dt className="text-sm text-slate-600 dark:text-slate-300">Close dialog or sheet</dt><dd><Key>Esc</Key></dd></div>
          </dl>
        </section>

        <section aria-labelledby="shortcut-navigation-heading">
          <h3 id="shortcut-navigation-heading" className="text-sm font-semibold text-slate-950 dark:text-white">Go to a page</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Press G, then the page key.</p>
          <dl className="mt-3 space-y-3">
            {accessibleShortcuts.map(shortcut => (
              <div key={shortcut.path} className="flex items-center justify-between gap-4">
                <dt className="text-sm text-slate-600 dark:text-slate-300">{shortcut.label}</dt>
                <dd className="flex gap-1"><Key>G</Key><Key>{shortcut.key.toUpperCase()}</Key></dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </ModalShell>
  );
};

export default KeyboardShortcutsDialog;
