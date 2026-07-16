import React from 'react';
import { cn } from '../lib/utils';

interface ModalShellProps {
  children: React.ReactNode;
  labelledBy: string;
  describedBy?: string;
  onClose: () => void;
  panelClassName?: string;
  overlayClassName?: string;
  closeOnBackdrop?: boolean;
}

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const modalStack: symbol[] = [];
let previousBodyOverflow = '';

const ModalShell: React.FC<ModalShellProps> = ({
  children,
  labelledBy,
  describedBy,
  onClose,
  panelClassName,
  overlayClassName,
  closeOnBackdrop = true,
}) => {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const tokenRef = React.useRef(Symbol('aitask-modal'));
  const onCloseRef = React.useRef(onClose);

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    const token = tokenRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (modalStack.length === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    modalStack.push(token);

    const focusTimer = window.setTimeout(() => {
      const initialTarget = panelRef.current?.querySelector<HTMLElement>('[autofocus], [data-autofocus]')
        ?? panelRef.current?.querySelector<HTMLElement>(focusableSelector);
      (initialTarget ?? panelRef.current)?.focus();
    }, 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (modalStack.at(-1) !== token) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(focusableSelector))
        .filter(element => (
          !element.hasAttribute('hidden') &&
          element.getAttribute('aria-hidden') !== 'true' &&
          element.getClientRects().length > 0
        ));

      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      const stackIndex = modalStack.lastIndexOf(token);
      if (stackIndex >= 0) modalStack.splice(stackIndex, 1);
      if (modalStack.length === 0) document.body.style.overflow = previousBodyOverflow;
      window.setTimeout(() => previouslyFocused?.focus(), 0);
    };
  }, []);

  return (
    <div
      className={cn('fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm sm:p-4', overlayClassName)}
      onMouseDown={event => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={cn(
          'flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-lg bg-white shadow-xl shadow-slate-950/15 outline-none sm:max-h-[90vh]',
          panelClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
};

export default ModalShell;
