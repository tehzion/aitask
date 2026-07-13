import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { buttonBase, cardBase } from './uiTokens';

/* ── PageHeader ─────────────────────────────────────────────────────────── */
interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, description, action }) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0">
      <h1 className="text-2xl font-bold tracking-tight text-slate-950">{title}</h1>
      {description && <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>}
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
      variant === 'primary'   && 'bg-blue-600 text-white shadow-sm hover:bg-blue-700 active:bg-blue-800',
      variant === 'secondary' && 'border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50',
      variant === 'ghost'     && 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
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
      'inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500',
      'transition hover:bg-slate-100 hover:text-slate-950',
      'focus:outline-none focus:ring-2 focus:ring-blue-200',
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
  indigo:  'bg-blue-50    text-blue-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber:   'bg-amber-50   text-amber-600',
  orange:  'bg-teal-50    text-teal-700',
  red:     'bg-red-50     text-red-600',
  blue:    'bg-sky-50     text-sky-600',
  purple:  'bg-violet-50  text-violet-600',
  slate:   'bg-slate-100  text-slate-600',
};

export const MetricCard: React.FC<MetricCardProps> = ({ title, value, icon: Icon, tone = 'blue', footer, className }) => (
  <div className={cn(cardBase, 'p-4 sm:p-5', className)}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium leading-5 text-slate-500">{title}</p>
        <div className="mt-1 text-2xl font-bold leading-8 text-slate-950">{value}</div>
      </div>
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', toneClasses[tone])}>
        <Icon className="h-5 w-5" />
      </div>
    </div>
    {footer && <div className="mt-3 text-xs text-slate-500">{footer}</div>}
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
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
    </div>
    <div className={cn('relative w-full min-h-0 min-w-0 overflow-hidden shrink-0', heightClassName)}>
      {children}
    </div>
  </section>
);

export const ChartEmptyState: React.FC<{ children?: React.ReactNode }> = ({ children = 'No data yet' }) => (
  <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/80 text-sm font-medium text-slate-400">
    {children}
  </div>
);

/* ── Badge ──────────────────────────────────────────────────────────────── */
interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: 'slate' | 'blue' | 'emerald' | 'amber' | 'red' | 'orange' | 'purple' | 'pink' | 'indigo';
}

const badgeTones: Record<string, string> = {
  slate:   'bg-slate-100  text-slate-700  border-slate-200',
  blue:    'bg-sky-50     text-sky-700    border-sky-100',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  amber:   'bg-amber-50   text-amber-700  border-amber-100',
  red:     'bg-red-50     text-red-700    border-red-100',
  orange:  'bg-teal-50    text-teal-700   border-teal-100',
  purple:  'bg-violet-50  text-violet-700 border-violet-100',
  pink:    'bg-pink-50    text-pink-700   border-pink-100',
  indigo:  'bg-blue-50    text-blue-700   border-blue-100',
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
