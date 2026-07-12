export const pageShell = 'space-y-5 sm:space-y-6';
export const cardBase = 'bg-white rounded-lg border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04)]';
export const inputBase = [
  'w-full rounded-lg border border-slate-200 bg-white text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.03)]',
  'outline-none transition',
  'focus:border-blue-500 focus:ring-2 focus:ring-blue-100',
  'placeholder:text-slate-400',
  'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400',
].join(' ');
export const buttonBase = [
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold',
  'transition focus:outline-none focus:ring-2 focus:ring-blue-200',
  'disabled:cursor-not-allowed disabled:opacity-50',
].join(' ');
