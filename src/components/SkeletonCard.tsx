import React from 'react';
import { cardBase } from './uiTokens';
import { cn } from '../lib/utils';

// Metric Card Skeleton
export const SkeletonMetricCard: React.FC = () => (
  <div className={cn(cardBase, "p-5 animate-pulse flex items-start justify-between gap-3 bg-white")}>
    <div className="flex-1 space-y-2">
      <div className="h-4 bg-slate-200 rounded-lg w-2/3"></div>
      <div className="h-8 bg-slate-300 rounded-lg w-1/2 mt-1"></div>
    </div>
    <div className="h-10 w-10 bg-slate-200 rounded-lg shrink-0"></div>
  </div>
);

// Chart Skeleton
export const SkeletonChartCard: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn(cardBase, "p-5 animate-pulse flex flex-col space-y-4 bg-white", className)}>
    <div className="space-y-2">
      <div className="h-5 bg-slate-300 rounded-lg w-1/3"></div>
      <div className="h-4 bg-slate-200 rounded-lg w-1/2"></div>
    </div>
    <div className="h-64 bg-slate-100 rounded-lg w-full flex items-end justify-between p-4 gap-2">
      <div className="bg-slate-200/60 rounded-t w-full" style={{ height: '30%' }}></div>
      <div className="bg-slate-200/60 rounded-t w-full" style={{ height: '70%' }}></div>
      <div className="bg-slate-200/60 rounded-t w-full" style={{ height: '45%' }}></div>
      <div className="bg-slate-200/60 rounded-t w-full" style={{ height: '85%' }}></div>
      <div className="bg-slate-200/60 rounded-t w-full" style={{ height: '60%' }}></div>
    </div>
  </div>
);

// Table Row Skeleton
export const SkeletonTableRow: React.FC = () => (
  <tr className="animate-pulse border-b border-slate-100 bg-white">
    <td className="px-4 py-4"><div className="h-4 bg-slate-200 rounded-lg w-4/5 mb-1"></div><div className="h-3 bg-slate-100 rounded w-1/2"></div></td>
    <td className="px-4 py-4"><div className="h-4 bg-slate-200 rounded-lg w-3/4 mb-1"></div><div className="h-3 bg-slate-100 rounded w-2/3"></div></td>
    <td className="px-4 py-4"><div className="h-5 bg-slate-200 rounded-lg w-16"></div></td>
    <td className="px-4 py-4"><div className="h-3 bg-slate-200 rounded w-16 mb-1"></div><div className="h-3 bg-slate-100 rounded w-14"></div></td>
    <td className="px-4 py-4 w-[120px]"><div className="h-5 bg-slate-200 rounded-full w-12 mx-auto"></div></td>
    <td className="px-4 py-4 w-[150px]"><div className="h-6 bg-slate-200 rounded-full w-20 mx-auto"></div></td>
    <td className="px-4 py-4 w-[260px]"><div className="h-5 bg-slate-200 rounded-full w-24 mx-auto"></div></td>
    <td className="px-4 py-4"><div className="h-2 bg-slate-200 rounded-full w-24 mx-auto"></div></td>
    <td className="px-4 py-4"><div className="h-4 bg-slate-200 rounded w-10"></div></td>
  </tr>
);

// Mobile Card Skeleton
export const SkeletonMobileCard: React.FC = () => (
  <div className="p-4 bg-white animate-pulse space-y-3 border-b border-slate-100">
    <div className="flex justify-between">
      <div className="h-4 bg-slate-200 rounded w-2/3"></div>
      <div className="h-4 bg-slate-200 rounded w-12"></div>
    </div>
    <div className="h-3 bg-slate-100 rounded w-1/2"></div>
    <div className="grid grid-cols-2 gap-2">
      <div className="h-3 bg-slate-100 rounded w-3/4"></div>
      <div className="h-3 bg-slate-100 rounded w-1/2 justify-self-end"></div>
    </div>
    <div className="flex justify-between items-center pt-2">
      <div className="h-6 bg-slate-200 rounded-full w-16"></div>
      <div className="h-2 bg-slate-200 rounded-full w-20"></div>
    </div>
  </div>
);
