import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useI18n } from './I18nProvider';
export default function NotFound() {
  const { t } = useI18n();
  return (
    <main className="app-error-page flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-2xl">
        <div className="app-error-code" aria-hidden="true">404</div>
        <div className="relative mt-[-1.25rem] max-w-lg">
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.045em] text-ink sm:text-4xl">{t('Page not found')}</h1>
          <p className="mt-3 text-sm leading-6 text-muted">{t('This page may have moved or the link may be incorrect.')}</p>
          <Link to="/" className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-control bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas dark:text-[rgb(var(--calm-accent-ink))]">
            {t('Return to workspace')}
            <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </main>
  );
}
