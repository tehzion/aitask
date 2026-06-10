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
  if (!value) return 'Never';
  const date = new Date(value);
  const isToday = new Date().toDateString() === date.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'numeric', day: 'numeric' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
  const label = isLocal && backendStatus.isHostedRuntime ? 'Local build' : getFreshnessLabel(backend, isLocal);
  const tone = isLocal ? 'slate' : getFreshnessTone(backend);
  const Icon = isLocal ? CloudOff : backend.hasRemoteUpdate || backend.error ? AlertCircle : backend.isPulling ? RefreshCw : Cloud;
  const lastChecked = backend.lastPulledAt || backend.lastSyncedAt || backend.remoteUpdatedAt;
  const showRefresh = !isLocal && (backend.hasRemoteUpdate || backend.error || !compact);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex items-center gap-1.5 text-[11px] text-stone-400 font-medium">
        <Badge tone={tone} className="px-1.5 py-0.5 text-[10px] font-semibold gap-1 shrink-0">
          <Icon className={cn('h-3 w-3', backend.isPulling && 'animate-spin')} />
          {label}
        </Badge>
        {!compact && (
          <span className="whitespace-nowrap text-stone-400">
            {isLocal && backendStatus.isHostedRuntime
              ? 'Vercel configuration required'
              : `Synced: ${formatSyncTime(lastChecked)}`}
          </span>
        )}
      </div>
      {showRefresh && (
        <Button
          variant="secondary"
          onClick={() => pullBackendNow({ force: backend.hasRemoteUpdate, silent: false })}
          disabled={backend.isPulling || backend.isSaving}
          className="h-7 w-7 p-0 rounded-md flex items-center justify-center shrink-0 border border-stone-200 bg-white hover:bg-stone-50 transition-colors shadow-sm"
          title="Refresh sync status"
        >
          <RefreshCw className={cn('h-3 w-3 text-stone-500', backend.isPulling && 'animate-spin')} />
        </Button>
      )}
    </div>
  );
};

export default BackendFreshness;
