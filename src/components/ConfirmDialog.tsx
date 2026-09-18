import React from 'react';
import { AlertTriangle } from 'lucide-react';
import ModalShell from './ModalShell';
import { Button } from './ui';

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  labelledBy: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  busy?: boolean;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'danger',
  labelledBy,
  onConfirm,
  onClose,
  busy = false,
}) => (
  <ModalShell labelledBy={labelledBy} onClose={busy ? () => undefined : onClose} panelClassName="max-w-md">
    <div className="flex items-start gap-3 border-b border-line/70 px-5 py-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-red-50 text-red-700">
        <AlertTriangle className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h2 id={labelledBy} className="text-base font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
      </div>
    </div>
    <div className="flex justify-end gap-3 px-5 py-4">
      <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>{cancelLabel}</Button>
      <Button type="button" variant={tone === 'danger' ? 'danger' : 'primary'} onClick={() => void onConfirm()} disabled={busy}>
        {busy ? 'Working…' : confirmLabel}
      </Button>
    </div>
  </ModalShell>
);

export default ConfirmDialog;
