import React from 'react';
import { createPortal } from 'react-dom';
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
let previousRootAriaHidden: string | null = null;
let rootWasInert = false;

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
  const [portalNode] = React.useState(() => {
    const node = document.createElement('div');
    node.dataset.aitaskModalPortal = '';
    return node;
  });

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    const token = tokenRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (modalStack.length === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const root = document.getElementById('root');
      if (root) {
        previousRootAriaHidden = root.getAttribute('aria-hidden');
        rootWasInert = root.hasAttribute('inert');
        root.setAttribute('inert', '');
        root.setAttribute('aria-hidden', 'true');
      }
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
      if (modalStack.length === 0) {
        document.body.style.overflow = previousBodyOverflow;
        const root = document.getElementById('root');
        if (root) {
          if (!rootWasInert) root.removeAttribute('inert');
          if (previousRootAriaHidden === null) root.removeAttribute('aria-hidden');
          else root.setAttribute('aria-hidden', previousRootAriaHidden);
        }
      }
      window.setTimeout(() => previouslyFocused?.focus(), 0);
    };
  }, []);

  React.useLayoutEffect(() => {
    document.body.appendChild(portalNode);
    return () => portalNode.remove();
  }, [portalNode]);

  return createPortal(
    <div
      className={cn('fixed inset-0 z-[100] flex items-center justify-center bg-ink/60 p-3 backdrop-blur-[2px] sm:p-4', overlayClassName)}
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
          'animate-fade-in flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-panel border border-line bg-surface text-ink shadow-float outline-none sm:max-h-[90vh]',
          panelClassName,
        )}
      >
        {children}
      </div>
    </div>,
    portalNode,
  );
};

export default ModalShell;
