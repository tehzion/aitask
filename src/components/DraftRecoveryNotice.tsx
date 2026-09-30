import { Button } from './ui';
import { useI18n } from './I18nProvider';
export default function DraftRecoveryNotice({ onRestore, onDiscard }: { onRestore: () => void; onDiscard: () => void }) {
  const { t } = useI18n();
  return <div className="border-b border-line bg-inset px-5 py-3" role="status">
    <p className="text-sm text-ink">{t('A recoverable draft is available on this device.')}</p>
    <div className="mt-2 flex flex-wrap gap-2"><Button data-draft-navigation variant="secondary" onClick={onRestore}>{t('Restore recovered draft')}</Button><Button data-draft-navigation variant="secondary" onClick={onDiscard}>{t('Discard recovered draft')}</Button></div>
  </div>;
}
