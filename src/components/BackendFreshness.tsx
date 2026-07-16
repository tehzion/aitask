import React from 'react';
import { AlertCircle, Cloud, CloudOff, RefreshCw, RotateCcw, X } from 'lucide-react';
import { useStore } from '../store';
import { getBackendStatus } from '../lib/backend';
import { Badge, Button } from './ui';
import { cn } from '../lib/utils';

interface BackendFreshnessProps {
  compact?: boolean;
  className?: string;
}

const formatSyncTime = (value?: string) => {
  if (!value) return 'Never';
  const date = new Date(value);
  const isToday = new Date().toDateString() === date.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'numeric', day: 'numeric' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const getFreshnessTone = (backend: ReturnType<typeof useStore.getState>['backend']) => {
  if (backend.status === 'conflict' || backend.status === 'retry_required' || backend.error) return 'amber';
  if (backend.status === 'offline') return 'slate';
  if (backend.status === 'loading' || backend.status === 'saving') return 'blue';
  return 'emerald';
};

const getFreshnessLabel = (backend: ReturnType<typeof useStore.getState>['backend'], isLocal: boolean) => {
  if (isLocal) return 'Local';
  if (backend.status === 'conflict') return 'Conflict';
  if (backend.status === 'retry_required') return 'Retry required';
  if (backend.status === 'offline') return 'Offline';
  if (backend.status === 'loading') return 'Refreshing';
  if (backend.status === 'saving') return 'Saving';
  if (backend.hasRemoteUpdate) return 'Update available';
  return 'Live';
};

const BackendFreshness: React.FC<BackendFreshnessProps> = ({ compact = false, className }) => {
  const { backend, pullBackendNow, retryMutation, discardMutation } = useStore();
  const backendStatus = getBackendStatus();
  const isLocal = backendStatus.mode === 'local';
  const label = isLocal && backendStatus.isHostedRuntime ? 'Local build' : getFreshnessLabel(backend, isLocal);
  const tone = isLocal ? 'slate' : getFreshnessTone(backend);
  const needsResolution = backend.status === 'conflict' || backend.status === 'retry_required' || (backend.status === 'offline' && backend.hasLocalChanges);
  const Icon = isLocal || backend.status === 'offline'
    ? CloudOff
    : needsResolution || backend.error
      ? AlertCircle
      : backend.status === 'loading'
        ? RefreshCw
        : Cloud;
  const lastChecked = backend.lastPulledAt || backend.lastSavedAt || backend.lastSyncedAt || backend.remoteUpdatedAt;
  const showRefresh = !isLocal && !needsResolution && (backend.hasRemoteUpdate || backend.error || !compact);

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)} aria-live="polite">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
        <Badge tone={tone} className="px-1.5 py-0.5 text-[10px] font-semibold gap-1 shrink-0">
          <Icon className={cn('h-3 w-3', backend.status === 'loading' && 'animate-spin')} />
          {label}
        </Badge>
        {!compact && (
          <span className="whitespace-nowrap text-slate-500">
            {isLocal && backendStatus.isHostedRuntime
              ? 'Vercel configuration required'
              : `Synced: ${formatSyncTime(lastChecked)}`}
          </span>
        )}
      </div>
      {showRefresh && (
        <Button
          variant="secondary"
          onClick={() => pullBackendNow({ silent: false })}
          disabled={backend.isPulling || backend.isSaving}
          className="h-7 w-7 p-0 rounded-md flex items-center justify-center shrink-0 border border-slate-200 bg-white hover:bg-slate-50 transition-colors shadow-sm"
          title="Refresh sync status"
          aria-label="Refresh sync status"
        >
          <RefreshCw className={cn('h-3 w-3 text-slate-500', backend.isPulling && 'animate-spin')} />
        </Button>
      )}
      {needsResolution && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="secondary"
            onClick={() => void retryMutation()}
            disabled={backend.isPulling || backend.isSaving || backend.status === 'offline'}
            className="min-h-7 px-2 py-1 text-[11px]"
            title="Retry my pending changes"
          >
            <RotateCcw className="h-3 w-3" />
            Retry my changes
          </Button>
          <Button
            variant="secondary"
            onClick={() => void discardMutation()}
            disabled={backend.isPulling || backend.isSaving || backend.status === 'offline'}
            className="min-h-7 px-2 py-1 text-[11px]"
            title="Discard pending changes and load the latest saved version"
          >
            <X className="h-3 w-3" />
            Use latest
          </Button>
        </div>
      )}
      {!compact && backend.conflict && (
        <span className="basis-full text-xs text-amber-700">
          {backend.conflict.entityType} {backend.conflict.entityId} changed remotely
          {backend.conflict.changedFields?.length ? `: ${backend.conflict.changedFields.join(', ')}` : '.'}
        </span>
      )}
    </div>
  );
};

export default BackendFreshness;
