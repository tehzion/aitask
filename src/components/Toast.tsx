import React from 'react';
import { useToastStore, Toast as ToastType } from '../store/useToastStore';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { cn } from '../lib/utils';

const iconMap = {
  success: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />,
  error: <XCircle className="w-5 h-5 text-red-600 shrink-0" />,
  info: <Info className="w-5 h-5 text-blue-700 shrink-0" />,
};

const bgClasses = {
  success: 'bg-white border border-emerald-100 shadow-emerald-50/40 text-slate-800',
  warning: 'bg-white border border-amber-100 shadow-amber-50/40 text-slate-800',
  error: 'bg-white border border-red-100 shadow-red-50/40 text-slate-800',
  info: 'bg-white border border-blue-100 shadow-blue-50/40 text-slate-800',
};

const ToastItem: React.FC<{ toast: ToastType }> = ({ toast }) => {
  const removeToast = useToastStore((state) => state.removeToast);

  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
      className={cn(
        'flex items-center gap-3 p-4 rounded-lg shadow-lg min-w-[300px] max-w-sm backdrop-blur-sm pointer-events-auto transition-all duration-300',
        'animate-in fade-in slide-in-from-right-5 slide-in-from-bottom-2',
        bgClasses[toast.type]
      )}
    >
      {iconMap[toast.type]}
      <p className="text-sm font-semibold flex-1 leading-5 pr-2">{toast.message}</p>
      <button
        onClick={() => removeToast(toast.id)}
        className="text-slate-400 hover:text-slate-600 p-0.5 rounded-lg hover:bg-slate-100 transition-colors"
        aria-label="Close notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export const ToastContainer: React.FC = () => {
  const toasts = useToastStore((state) => state.toasts);

  return (
    <div className="pointer-events-none fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 right-4 z-[70] flex select-none flex-col items-end gap-2.5 md:bottom-5 md:left-auto md:right-5">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
};
