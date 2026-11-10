import React from 'react';
import { cn } from '../lib/utils';

/**
 * A small key hint beside a frequent action (role UX, 10 Nov 2026), e.g. "N" on
 * New task. Hidden from screen readers (the control carries aria-keyshortcuts
 * instead) and from small screens, where there is usually no keyboard.
 */
const ShortcutKey = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <kbd
    aria-hidden="true"
    className={cn(
      'hidden min-w-5 items-center justify-center rounded border border-slate-300 bg-slate-50 px-1 font-mono text-[11px] font-semibold leading-4 text-slate-700 md:inline-flex dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100',
      className,
    )}
  >{children}</kbd>
);

export default ShortcutKey;
