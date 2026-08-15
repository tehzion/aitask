import React from 'react';
import { X } from 'lucide-react';
import ModalShell from './ModalShell';
import { cn } from '../lib/utils';

interface SideSheetProps {
  isOpen: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

const SideSheet: React.FC<SideSheetProps> = ({ isOpen, title, description, onClose, children, footer, className }) => {
  const id = React.useId();
  if (!isOpen) return null;
  return <ModalShell labelledBy={`${id}-title`} describedBy={description ? `${id}-description` : undefined} onClose={onClose} overlayClassName="justify-end p-0" panelClassName={cn('h-full max-h-none max-w-lg rounded-none border-y-0 border-r-0 shadow-float sm:max-h-full', className)}>
    <header className="flex items-start justify-between gap-4 border-b border-line px-5 pb-5 pt-6 sm:px-6">
      <div><h2 id={`${id}-title`} className="text-xl font-semibold tracking-[-0.025em] text-ink">{title}</h2>{description && <p id={`${id}-description`} className="mt-1 max-w-[48ch] text-sm leading-6 text-muted">{description}</p>}</div>
      <button type="button" aria-label={`Close ${title}`} onClick={onClose} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted hover:bg-inset hover:text-ink"><X className="h-5 w-5" /></button>
    </header>
    <div className="custom-scrollbar flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
    {footer && <footer className="border-t border-line bg-inset/80 px-5 py-4 sm:px-6">{footer}</footer>}
  </ModalShell>;
};

export default SideSheet;
