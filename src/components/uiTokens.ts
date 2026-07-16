export const pageShell = 'space-y-5 sm:space-y-6';
export const cardBase = 'rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]';
export const inputBase = [
  'w-full rounded-lg border border-slate-200 bg-white text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.03)]',
  'outline-none transition-colors',
  'focus:border-blue-500 focus:ring-2 focus:ring-blue-100/80',
  'placeholder:text-slate-400',
  'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400',
].join(' ');
export const buttonBase = [
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold',
  'transition-colors focus:outline-none focus:ring-2 focus:ring-blue-200 focus:ring-offset-1',
  'disabled:cursor-not-allowed disabled:opacity-50',
].join(' ');
export const fieldLabel = 'mb-1.5 block text-sm font-medium text-slate-700';
export const panelHeader = 'flex items-center gap-3 border-b border-slate-100 px-5 py-4 sm:px-6';
export const modalFooter = 'flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:justify-end sm:px-6';
