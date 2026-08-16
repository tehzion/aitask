import React from 'react';
import { ArrowUpRight, LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { buttonBase, cardBase } from './uiTokens';

/* ── PageHeader ─────────────────────────────────────────────────────────── */
interface PageHeaderProps {
  title: React.ReactNode;
  description?: string;
  action?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  meta?: React.ReactNode;
  compact?: boolean;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, description, action, breadcrumb, meta, compact = false }) => (
  <header className={cn('flex flex-col gap-5 border-b border-line/70', compact ? 'pb-4' : 'pb-6', 'sm:flex-row sm:items-end sm:justify-between')}>
    <div className="min-w-0">
      {breadcrumb && <div className="mb-2 text-xs font-medium text-muted">{breadcrumb}</div>}
      <h1 className={cn('text-balance font-semibold tracking-[-0.035em] text-ink', compact ? 'text-2xl leading-8' : 'text-[1.75rem] leading-9 sm:text-[2rem] sm:leading-10')}>{title}</h1>
      {description && <p className="mt-1.5 max-w-[65ch] text-pretty text-sm leading-6 text-muted">{description}</p>}
      {meta && <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">{meta}</div>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </header>
);

/* ── Button ─────────────────────────────────────────────────────────────── */
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'quiet' | 'danger';
}

export const Button: React.FC<ButtonProps> = ({ className, variant = 'primary', type = 'button', ...props }) => (
  <button
    type={type}
    className={cn(
      buttonBase,
      'min-h-11 px-4 py-2.5',
      variant === 'primary'   && 'bg-accent text-white shadow-[0_5px_12px_-10px_rgb(7_22_18/0.8)] hover:bg-accent/90 dark:text-[rgb(var(--calm-accent-ink))]',
      variant === 'secondary' && 'border border-line bg-surface text-ink hover:border-accent/35 hover:bg-inset',
      variant === 'ghost'     && 'text-muted hover:bg-inset hover:text-ink',
      variant === 'quiet'     && 'px-2 text-accent hover:bg-accent-soft',
      variant === 'danger'    && 'bg-red-600 text-white shadow-sm hover:bg-red-700',
      className
    )}
    {...props}
  />
);

/* ── IconButton ─────────────────────────────────────────────────────────── */
interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
}

export const IconButton: React.FC<IconButtonProps> = ({ className, label, type = 'button', ...props }) => (
  <button
    type={type}
    aria-label={label}
    title={label}
    className={cn(
      'inline-flex h-11 w-11 items-center justify-center rounded-control text-muted',
      'transition-[transform,background-color,color] duration-160 hover:bg-inset hover:text-ink active:translate-y-px active:scale-[0.97]',
      'focus:outline-none focus:ring-2 focus:ring-accent/35',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  />
);

/* ── MetricCard ─────────────────────────────────────────────────────────── */
interface MetricCardProps {
  title: string;
  value: React.ReactNode;
  icon: LucideIcon;
  tone?: 'indigo' | 'emerald' | 'amber' | 'red' | 'blue' | 'purple' | 'slate' | 'orange';
  footer?: React.ReactNode;
  className?: string;
}

const toneClasses: Record<string, string> = {
  indigo:  'bg-accent-soft text-accent',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber:   'bg-amber-50   text-amber-600',
  orange:  'bg-amber-50  text-amber-700',
  red:     'bg-red-50     text-red-600',
  blue:    'bg-accent-soft text-accent',
  purple:  'bg-accent-soft text-accent',
  slate:   'bg-slate-100  text-slate-600',
};

export const MetricCard: React.FC<MetricCardProps> = ({ title, value, icon: Icon, tone = 'blue', footer, className }) => (
  <div className={cn(cardBase, 'p-4 sm:p-5', className)}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium leading-5 text-muted">{title}</p>
        <div className="calm-number mt-1.5 text-2xl font-semibold leading-8 tracking-[-0.035em] text-ink">{value}</div>
      </div>
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', toneClasses[tone])}>
        <Icon className="h-5 w-5" />
      </div>
    </div>
    {footer && <div className="mt-3 text-xs text-muted">{footer}</div>}
  </div>
);

/* ── ChartCard ──────────────────────────────────────────────────────────── */
interface ChartCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  heightClassName?: string;
}

export const ChartCard: React.FC<ChartCardProps> = ({ title, description, children, className, heightClassName = 'h-64' }) => (
  <section className={cn(cardBase, 'flex flex-col p-4 sm:p-5', className)}>
    <div className="mb-4">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {description && <p className="mt-1 text-sm leading-5 text-muted">{description}</p>}
    </div>
    <div className={cn('relative w-full min-h-0 min-w-0 overflow-hidden shrink-0', heightClassName)}>
      {children}
    </div>
  </section>
);

export const ChartEmptyState: React.FC<{ children?: React.ReactNode }> = ({ children = 'No data yet' }) => (
  <div className="absolute inset-0 z-10 flex items-center justify-center rounded-control border border-dashed border-line bg-inset/80 text-sm font-medium text-muted">
    {children}
  </div>
);

/* ── Badge ──────────────────────────────────────────────────────────────── */
interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: 'slate' | 'blue' | 'emerald' | 'amber' | 'red' | 'orange' | 'purple' | 'pink' | 'indigo';
}

const badgeTones: Record<string, string> = {
  slate:   'bg-slate-100  text-slate-700  border-slate-200',
  blue:    'bg-blue-50    text-blue-700   border-blue-100',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  amber:   'bg-amber-50   text-amber-700  border-amber-100',
  red:     'bg-red-50     text-red-700    border-red-100',
  orange:  'bg-amber-50   text-amber-700  border-amber-100',
  purple:  'bg-accent-soft text-accent border-accent/20',
  pink:    'bg-accent-soft text-accent border-accent/20',
  indigo:  'bg-accent-soft text-accent border-accent/20',
};

export const Badge: React.FC<BadgeProps> = ({ className, tone = 'slate', ...props }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium leading-none',
      badgeTones[tone],
      className
    )}
    {...props}
  />
);

export const Surface: React.FC<React.HTMLAttributes<HTMLElement> & { variant?: 'plain' | 'inset' | 'raised'; as?: 'section' | 'div' | 'article' }> = ({ variant = 'plain', as = 'section', className, ...props }) => {
  const Component = as;
  return <Component className={cn(variant === 'plain' ? 'calm-surface' : variant === 'inset' ? 'calm-inset' : 'calm-raised', className)} {...props} />;
};

export const StatGroup: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn('calm-surface grid divide-y divide-line/70 overflow-hidden ring-1 ring-line/70 sm:divide-x sm:divide-y-0', className)} {...props} />
);

export const StatusChip: React.FC<React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeProps['tone']; dot?: boolean }> = ({ tone = 'slate', dot = false, className, children, ...props }) => (
  <span className={cn('inline-flex items-center gap-1.5 rounded-tag border px-2 py-1 text-xs font-medium', badgeTones[tone], className)} {...props}>
    {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-75" aria-hidden="true" />}
    {children}
  </span>
);

export interface SegmentTab<T extends string> { id: T; label: string; compactLabel?: string; count?: number }
export const SegmentedTabs = <T extends string,>({ items, value, onChange, label, idPrefix }: { items: SegmentTab<T>[]; value: T; onChange: (value: T) => void; label: string; idPrefix?: string }) => {
  const generatedId = React.useId().replace(/:/g, '');
  const prefix = idPrefix || `segmented-tabs-${generatedId}`;
  const tabsRef = React.useRef<Array<HTMLButtonElement | null>>([]);

  const selectAt = (index: number) => {
    const item = items[index];
    if (!item) return;
    onChange(item.id);
    tabsRef.current[index]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | undefined;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % items.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + items.length) % items.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = items.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    selectAt(nextIndex);
  };

  return (
    <div role="tablist" aria-label={label} className="no-scrollbar flex min-w-0 gap-0.5 overflow-x-auto rounded-control bg-inset p-0.5 sm:gap-1 sm:p-1">
      {items.map((item, index) => (
        <button
          key={item.id}
          ref={node => { tabsRef.current[index] = node; }}
          id={`${prefix}-tab-${item.id}`}
          type="button"
          role="tab"
          tabIndex={value === item.id ? 0 : -1}
          aria-label={item.label}
          aria-selected={value === item.id}
          aria-controls={`${prefix}-panel-${item.id}`}
          onClick={() => onChange(item.id)}
          onKeyDown={event => handleKeyDown(event, index)}
          className={cn('min-h-11 shrink-0 rounded-tag px-2 text-xs font-medium transition-[background-color,color,box-shadow] duration-160 sm:px-3 sm:text-sm', value === item.id ? 'bg-surface text-ink ring-1 ring-line/70' : 'text-muted hover:text-ink')}
        >
          {item.compactLabel ? <><span className="sm:hidden" aria-hidden="true">{item.compactLabel}</span><span className="hidden sm:inline">{item.label}</span></> : item.label}
          {typeof item.count === 'number' && <span className="calm-number ml-1.5 text-xs opacity-70">{item.count}</span>}
        </button>
      ))}
    </div>
  );
};

export const ProgressBar: React.FC<{ value: number; max?: number; label: string; className?: string }> = ({ value, max = 100, label, className }) => {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return <div className={className}>
    <div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="font-medium text-muted">{label}</span><span className="calm-number font-semibold text-ink">{Math.round(percent)}%</span></div>
    <div className="h-2 overflow-hidden rounded-full bg-inset ring-1 ring-line/60" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${percent}%` }} />
    </div>
  </div>;
};

export const DataRow: React.FC<Omit<React.HTMLAttributes<HTMLElement>, 'title'> & { title: React.ReactNode; description?: React.ReactNode; meta?: React.ReactNode; action?: React.ReactNode }> = ({ title, description, meta, action, className, ...props }) => (
  <article className={cn('grid gap-3 px-4 py-4 transition-colors duration-160 hover:bg-inset/70 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5', className)} {...props}>
    <div className="min-w-0"><div data-i18n-skip className="font-semibold text-ink">{title}</div>{description && <div data-i18n-skip className="mt-1 text-sm leading-5 text-muted">{description}</div>}{meta && <div className="mt-2 text-xs text-muted">{meta}</div>}</div>
    {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
  </article>
);

export const EmptyState: React.FC<{ title: string; description: string; action?: React.ReactNode; className?: string }> = ({ title, description, action, className }) => (
  <div className={cn('rounded-panel bg-inset px-5 py-12 text-center', className)}>
    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-control bg-accent-soft text-accent"><ArrowUpRight className="h-5 w-5" /></div>
    <h3 className="mt-4 font-semibold text-ink">{title}</h3><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted">{description}</p>{action && <div className="mt-5">{action}</div>}
  </div>
);
