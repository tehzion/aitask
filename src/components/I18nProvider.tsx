/* eslint-disable react-refresh/only-export-components -- Provider module intentionally exports its consumer hook. */
import React from 'react';
import { Languages } from 'lucide-react';
import {
  APP_LOCALE_STORAGE_KEY,
  getInitialLocale,
  translateUiText,
  type AppLocale,
} from '../lib/i18n';
import { formatMessage, isMessageId, type MessageDescriptor, type MessageId, type MessageValues } from '../lib/messages';
import { cn } from '../lib/utils';

interface I18nContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  toggleLocale: () => void;
  t: (value: MessageId | string | MessageDescriptor, values?: MessageValues) => string;
}

const I18nContext = React.createContext<I18nContextValue | null>(null);

export const I18nProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [locale, setLocaleState] = React.useState<AppLocale>(getInitialLocale);

  const setLocale = React.useCallback((nextLocale: AppLocale) => {
    setLocaleState(nextLocale);
    try { window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, nextLocale); } catch { /* preference remains in memory */ }
  }, []);

  const toggleLocale = React.useCallback(() => setLocale(locale === 'en' ? 'zh' : 'en'), [locale, setLocale]);
  const translate = React.useCallback((value: MessageId | string | MessageDescriptor, values?: MessageValues) => {
    if (typeof value === 'object') return formatMessage(value, locale);
    if (isMessageId(value)) return formatMessage({ id: value, values }, locale);
    const resolvedValue = values
      ? value.replace(/\{(\w+)\}/g, (match, key: string) => (
        Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
      ))
      : value;
    return translateUiText(resolvedValue, locale);
  }, [locale]);

  React.useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    document.documentElement.dataset.locale = locale;
    document.title = translateUiText('AiTask - Marketing Agency Task Management', locale);
  }, [locale]);

  const value = React.useMemo<I18nContextValue>(() => ({ locale, setLocale, toggleLocale, t: translate }), [locale, setLocale, toggleLocale, translate]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => {
  const context = React.useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within I18nProvider.');
  return context;
};

export const LanguageSwitcher: React.FC<{ className?: string; compact?: boolean }> = ({ className, compact = false }) => {
  const { locale, toggleLocale } = useI18n();
  const nextLanguage = locale === 'en' ? '中文' : 'English';
  const label = locale === 'en' ? '切换为中文' : 'Switch to English';
  return (
    <button
      type="button"
      onClick={toggleLocale}
      data-i18n-skip
      aria-label={label}
      title={label}
      className={cn(
        compact
          ? 'inline-flex h-11 w-11 items-center justify-center rounded-control text-muted transition-colors hover:bg-inset hover:text-ink focus:outline-none focus:ring-2 focus:ring-accent/35'
          : 'inline-flex min-h-11 items-center gap-2 rounded-control border border-line bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-inset focus:outline-none focus:ring-2 focus:ring-accent/35',
        className,
      )}
    >
      <Languages className="h-5 w-5" aria-hidden="true" />
      {!compact && <span>{nextLanguage}</span>}
    </button>
  );
};
