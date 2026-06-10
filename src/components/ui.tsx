import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';

/* ── Core token strings (warm palette) ──────────────────────────────────── */
export const pageShell  = 'space-y-5 sm:space-y-6';
export const cardBase   = 'bg-white rounded-xl border border-[#e8e3db] shadow-sm';
export const inputBase  = [
  'w-full rounded-xl border border-[#e0d9cf] bg-white text-sm text-stone-900 shadow-sm',
  'outline-none transition',
  'focus:border-orange-400 focus:ring-2 focus:ring-orange-100',
  'placeholder:text-stone-400',
  'disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-400',
].join(' ');
export const buttonBase = [
  'inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold',
  'transition focus:outline-none focus:ring-2 focus:ring-orange-200',
  'disabled:cursor-not-allowed disabled:opacity-50',
].join(' ');

/* ── PageHeader ─────────────────────────────────────────────────────────── */
interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, description, action }) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0">
      <h1 className="text-2xl font-extrabold tracking-tight text-stone-900">{title}</h1>
      {description && <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-500">{description}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

/* ── Button ─────────────────────────────────────────────────────────────── */
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}

export const Button: React.FC<ButtonProps> = ({ className, variant = 'primary', type = 'button', ...props }) => (
  <button
    type={type}
    className={cn(
      buttonBase,
      'min-h-10 px-4 py-2',
      variant === 'primary'   && 'bg-orange-700 text-white shadow-sm hover:bg-orange-800 active:bg-orange-900',
      variant === 'secondary' && 'border border-[#e0d9cf] bg-white text-stone-700 shadow-sm hover:bg-stone-50 hover:border-stone-300',
      variant === 'ghost'     && 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
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
      'inline-flex h-9 w-9 items-center justify-center rounded-xl text-stone-500',
      'transition hover:bg-stone-100 hover:text-stone-900',
      'focus:outline-none focus:ring-2 focus:ring-orange-200',
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
  indigo:  'bg-violet-50  text-violet-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber:   'bg-amber-50   text-amber-600',
  orange:  'bg-orange-50  text-orange-700',
  red:     'bg-red-50     text-red-600',
  blue:    'bg-sky-50     text-sky-600',
  purple:  'bg-purple-50  text-purple-600',
  slate:   'bg-stone-100  text-stone-600',
};

export const MetricCard: React.FC<MetricCardProps> = ({ title, value, icon: Icon, tone = 'orange', footer, className }) => (
  <div className={cn(cardBase, 'p-4 sm:p-5', className)}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium leading-5 text-stone-500">{title}</p>
        <div className="mt-1 text-2xl font-extrabold leading-8 text-stone-900">{value}</div>
      </div>
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', toneClasses[tone])}>
        <Icon className="h-5 w-5" />
      </div>
    </div>
    {footer && <div className="mt-3 text-xs text-stone-500">{footer}</div>}
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

export const ChartCard: React.FC<ChartCardProps> = ({ title, description, children, className, heightClassName = 'h-72' }) => (
  <section className={cn(cardBase, 'flex flex-col p-4 sm:p-5', className)}>
    <div className="mb-4">
      <h2 className="text-base font-semibold text-stone-800">{title}</h2>
      {description && <p className="mt-1 text-sm text-stone-500">{description}</p>}
    </div>
    <div className={cn('relative w-full min-w-0 overflow-hidden shrink-0', heightClassName)}>
      {children}
    </div>
  </section>
);

export const ChartEmptyState: React.FC<{ children?: React.ReactNode }> = ({ children = 'No data yet' }) => (
  <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl border border-dashed border-stone-200 bg-stone-50/80 text-sm font-medium text-stone-400">
    {children}
  </div>
);

/* ── Badge ──────────────────────────────────────────────────────────────── */
interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: 'slate' | 'blue' | 'emerald' | 'amber' | 'red' | 'orange' | 'purple' | 'pink' | 'indigo';
}

const badgeTones: Record<string, string> = {
  slate:   'bg-stone-100  text-stone-700  border-stone-200',
  blue:    'bg-sky-50     text-sky-700    border-sky-100',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  amber:   'bg-amber-50   text-amber-700  border-amber-100',
  red:     'bg-red-50     text-red-700    border-red-100',
  orange:  'bg-orange-50  text-orange-700 border-orange-100',
  purple:  'bg-purple-50  text-purple-700 border-purple-100',
  pink:    'bg-pink-50    text-pink-700   border-pink-100',
  indigo:  'bg-violet-50  text-violet-700 border-violet-100',
};

export const Badge: React.FC<BadgeProps> = ({ className, tone = 'slate', ...props }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold leading-none',
      badgeTones[tone],
      className
    )}
    {...props}
  />
);
