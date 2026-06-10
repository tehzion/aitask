import React from 'react';
import { AlertCircle, Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { useStore } from '../store';
import { getBackendStatus } from '../lib/backend';
import { Badge, Button } from './ui';
import { cn } from '../lib/utils';

interface BackendFreshnessProps {
  compact?: boolean;
  className?: string;
}

const formatSyncTime = (value?: string) => {
  if (!value) return 'Not checked yet';
  return new Date(value).toLocaleString();
};

const getFreshnessTone = (backend: ReturnType<typeof useStore.getState>['backend']) => {
  if (backend.hasRemoteUpdate || backend.error) return 'amber';
  if (backend.isPulling || backend.isSaving || backend.isLoading) return 'blue';
  return 'emerald';
};

const getFreshnessLabel = (backend: ReturnType<typeof useStore.getState>['backend'], isLocal: boolean) => {
  if (isLocal) return 'Local';
  if (backend.hasRemoteUpdate) return 'Update available';
  if (backend.isPulling || backend.isLoading) return 'Refreshing';
  if (backend.isSaving || backend.hasLocalChanges) return 'Syncing';
  if (backend.error) return 'Sync issue';
  return 'Live';
};

const BackendFreshness: React.FC<BackendFreshnessProps> = ({ compact = false, className }) => {
  const { backend, pullBackendNow } = useStore();
  const backendStatus = getBackendStatus();
  const isLocal = backendStatus.mode === 'local';
  const label = getFreshnessLabel(backend, isLocal);
  const tone = isLocal ? 'slate' : getFreshnessTone(backend);
  const Icon = isLocal ? CloudOff : backend.hasRemoteUpdate || backend.error ? AlertCircle : backend.isPulling ? RefreshCw : Cloud;
  const lastChecked = backend.lastPulledAt || backend.lastSyncedAt || backend.remoteUpdatedAt;
  const showRefresh = !isLocal && (backend.hasRemoteUpdate || backend.error || !compact);

  return (
    <div className={cn('flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end', className)}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Badge tone={tone} className="shrink-0">
          <Icon className={cn('h-3.5 w-3.5', backend.isPulling && 'animate-spin')} />
          {label}
        </Badge>
        {!compact && (
          <span className="whitespace-nowrap">
            Last checked: {formatSyncTime(lastChecked)}
          </span>
        )}
      </div>
      {showRefresh && (
        <Button
          variant="secondary"
          onClick={() => pullBackendNow({ force: backend.hasRemoteUpdate, silent: false })}
          disabled={backend.isPulling || backend.isSaving}
          className="min-h-9 px-3 py-1.5 text-xs"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', backend.isPulling && 'animate-spin')} />
          Refresh
        </Button>
      )}
    </div>
  );
};

export default BackendFreshness;
