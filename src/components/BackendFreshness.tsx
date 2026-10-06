import React from 'react';
import { AlertCircle, Cloud, CloudOff, RefreshCw, RotateCcw, X } from 'lucide-react';
import { isPendingMutationResolution, useStore } from '../store';
import { getBackendStatus } from '../lib/backend';
import { formatLocalizedSyncTime, type AppLocale } from '../lib/i18n';
import { Badge, Button } from './ui';
import { cn } from '../lib/utils';
import { useI18n } from './I18nProvider';

interface BackendFreshnessProps {
  compact?: boolean;
  className?: string;
  onRetry?: () => Promise<void>;
  onDiscard?: () => void;
}

const formatSyncTime = (value: string | undefined, locale: AppLocale) => {
  if (!value) return locale === 'zh' ? '从未' : 'Never';
  const date = new Date(value);
  return formatLocalizedSyncTime(date, locale);
};

const getFreshnessTone = (backend: ReturnType<typeof useStore.getState>['backend']) => {
  if (backend.upgradeRequired || backend.status === 'conflict' || backend.status === 'retry_required' || backend.error) return 'amber';
  if (backend.status === 'offline') return 'slate';
  if (backend.status === 'loading' || backend.status === 'saving') return 'blue';
  return 'emerald';
};

const BackendFreshness: React.FC<BackendFreshnessProps> = ({ compact = false, className, onRetry, onDiscard }) => {
  const { locale, t } = useI18n();
  const { backend, pullBackendNow, retryPendingSave, discardMutation } = useStore();
  const backendStatus = getBackendStatus();
  const isLocal = backendStatus.mode === 'local';
  const label = isLocal && backendStatus.isHostedRuntime
    ? t('shell.localBuild')
    : isLocal
      ? t('shell.local')
      : backend.upgradeRequired
        ? t('shell.readOnly')
        : backend.status === 'conflict'
          ? t('shell.conflict')
          : backend.status === 'retry_required'
            ? t('shell.retryRequired')
            : backend.status === 'offline'
              ? t('shell.offline')
              : backend.status === 'loading'
                ? t('shell.refreshing')
                : backend.status === 'saving'
                  ? t('shell.saving')
                  : backend.hasRemoteUpdate
                    ? t('shell.updateAvailable')
                    : t('shell.live');
  const tone = isLocal ? 'slate' : getFreshnessTone(backend);
  const needsResolution = isPendingMutationResolution(backend);
  const Icon = isLocal || backend.status === 'offline'
    ? CloudOff
    : needsResolution || backend.error
      ? AlertCircle
      : backend.status === 'loading'
        ? RefreshCw
        : Cloud;
  const lastChecked = backend.lastPulledAt || backend.lastSavedAt || backend.lastSyncedAt || backend.remoteUpdatedAt;
  const showRefresh = !isLocal && !needsResolution && (backend.upgradeRequired || backend.hasRemoteUpdate || backend.error || !compact);

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
              ? t('shell.vercelConfigurationRequired')
              : isLocal
                ? t('shell.localDemo')
                : t('shell.lastSync', { time: formatSyncTime(lastChecked, locale) })}
          </span>
        )}
      </div>
      {showRefresh && (
        <Button
          variant="secondary"
          onClick={() => pullBackendNow({ silent: false })}
          disabled={backend.isPulling || backend.isSaving}
          className="h-11 w-11 p-0 rounded-md flex items-center justify-center shrink-0 border border-slate-200 bg-white hover:bg-slate-50 transition-colors shadow-sm"
          title={t('shell.refreshSyncStatus')}
          aria-label={t('shell.refreshSyncStatus')}
        >
          <RefreshCw className={cn('h-3 w-3 text-slate-500', backend.isPulling && 'animate-spin')} />
        </Button>
      )}
      {needsResolution && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="secondary"
            onClick={() => void (onRetry ? onRetry() : retryPendingSave())}
            disabled={backend.isPulling || backend.isSaving || backend.status === 'offline'}
            className="min-h-11 px-3 py-2 text-xs"
            title={t('shell.retryPendingChanges')}
          >
            <RotateCcw className="h-3 w-3" />
            {t('shell.retryMyChanges')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => { if (onDiscard) onDiscard(); else void discardMutation(); }}
            disabled={backend.isPulling || backend.isSaving || backend.status === 'offline'}
            className="min-h-11 px-3 py-2 text-xs"
            title={t('shell.discardPendingChanges')}
          >
            <X className="h-3 w-3" />
            {t('shell.useLatest')}
          </Button>
        </div>
      )}
      {!compact && backend.conflict && (
        <span className="basis-full text-xs text-amber-700">
          {t('shell.changedRemotely', { entityType: backend.conflict.entityType, entityId: backend.conflict.entityId })}
          {backend.conflict.changedFields?.length ? `: ${backend.conflict.changedFields.join(', ')}` : '.'}
        </span>
      )}
    </div>
  );
};

export default BackendFreshness;
