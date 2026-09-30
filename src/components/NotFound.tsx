import { Link } from 'react-router-dom';
import { useI18n } from './I18nProvider';
export default function NotFound() {
  const { t } = useI18n();
  return <main className="mx-auto max-w-xl px-6 py-20 text-center"><h1 className="text-2xl font-semibold text-ink">{t('Page not found')}</h1><p className="mt-3 text-muted">{t('This page may have moved or the link may be incorrect.')}</p><Link to="/" className="mt-6 inline-block rounded-control bg-accent px-4 py-3 font-medium text-white">{t('Return to workspace')}</Link></main>;
}
