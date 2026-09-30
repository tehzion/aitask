import { useSyncExternalStore } from 'react';
import { getDiagnostics, subscribeDiagnostics } from '../lib/diagnostics';
import { useI18n } from './I18nProvider';
import { Button } from './ui';
import { cardBase } from './uiTokens';
export default function DiagnosticsPanel() {
  const { t } = useI18n();
  // A serialized snapshot stays stable until the bounded report changes.
  const snapshot = useSyncExternalStore(subscribeDiagnostics, () => JSON.stringify(getDiagnostics()));
  const samples = JSON.parse(snapshot) as ReturnType<typeof getDiagnostics>;
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, samples }, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'aitask-diagnostics.json'; anchor.click(); URL.revokeObjectURL(url);
  };
  return <details className={`${cardBase} p-5`}>
    <summary className="cursor-pointer font-semibold text-ink">{t('Performance and save diagnostics')}</summary>
    <p className="mt-2 text-sm text-muted">{t('This session only. No account IDs, form values or attachment paths are included.')}</p>
    <p className="my-3 text-sm text-muted">{t('Recorded events')}: {samples.length} · {t('Failed requests')}: {samples.filter(sample => sample.outcome !== 'ok').length}</p>
    <Button variant="secondary" onClick={download}>{t('Download diagnostics')}</Button>
  </details>;
}
