export const pageShell = 'mx-auto w-full max-w-workspace space-y-7';
export const cardBase = 'calm-surface';
export const raisedCard = 'calm-raised';
export const mutedPanel = 'calm-inset';
export const sectionDivider = 'border-t border-line/80 pt-6';
export const tableShell = 'overflow-hidden rounded-panel bg-surface ring-1 ring-line/80';
export const tableHeader = 'bg-inset/90 text-xs font-semibold text-muted';
export const filterBar = 'rounded-panel bg-inset/80 p-3 ring-1 ring-line/70 sm:p-4';
export const inputBase = [
  'w-full rounded-control border border-line bg-surface text-sm text-ink shadow-none',
  'outline-none transition-[border-color,box-shadow,background-color] duration-160',
  'focus:border-accent focus:ring-2 focus:ring-accent/15',
  'placeholder:text-muted/70',
  'disabled:cursor-not-allowed disabled:bg-inset disabled:text-muted/60',
].join(' ');
export const buttonBase = [
  'inline-flex items-center justify-center gap-2 rounded-control text-sm font-semibold leading-5',
  'transition-[transform,background-color,border-color,color,box-shadow] duration-160 active:translate-y-px active:scale-[0.985]',
  'focus:outline-none focus:ring-2 focus:ring-accent/35 focus:ring-offset-2 focus:ring-offset-canvas',
  'disabled:cursor-not-allowed disabled:opacity-50',
].join(' ');
export const fieldLabel = 'mb-1.5 block text-sm font-medium text-ink';
export const detailLabel = 'mb-1 block text-xs font-medium text-muted';
export const panelHeader = 'flex items-center gap-3 border-b border-line/80 px-5 py-4 sm:px-6';
export const modalFooter = 'flex shrink-0 flex-col-reverse gap-2 border-t border-line/80 bg-inset/80 px-4 py-3 sm:flex-row sm:justify-end sm:px-6';
