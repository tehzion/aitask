/* eslint-disable react-refresh/only-export-components -- Provider module intentionally exports its consumer hook. */
import React from 'react';
import { Languages } from 'lucide-react';
import {
  APP_LOCALE_STORAGE_KEY,
  getInitialLocale,
  translateUiText,
  type AppLocale,
} from '../lib/i18n';
import { cn } from '../lib/utils';

interface I18nContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  toggleLocale: () => void;
  t: (value: string) => string;
}

const I18nContext = React.createContext<I18nContextValue | null>(null);

interface LocalizedSource {
  source: string;
  rendered: string;
}

const textSources = new WeakMap<Text, LocalizedSource>();
const attributeSources = new WeakMap<HTMLElement, Map<string, LocalizedSource>>();
const localizedAttributes = ['aria-label', 'aria-description', 'placeholder', 'title', 'alt'] as const;

const isExcluded = (element: Element | null) => Boolean(element?.closest(
  '[data-i18n-skip], script, style, code, pre, [contenteditable="true"]',
));

const sourceForText = (node: Text) => {
  const current = node.nodeValue || '';
  const known = textSources.get(node);
  if (!known) {
    textSources.set(node, { source: current, rendered: current });
    return current;
  }
  if (current !== known.rendered) {
    known.source = current;
    known.rendered = current;
  }
  return known.source;
};

const localizeTextNode = (node: Text, locale: AppLocale) => {
  if (isExcluded(node.parentElement)) return;
  const source = sourceForText(node);
  const translated = translateUiText(source, locale);
  if (node.nodeValue !== translated) node.nodeValue = translated;
  const known = textSources.get(node);
  if (known) known.rendered = translated;
};

const sourceForAttribute = (element: HTMLElement, attribute: string) => {
  const current = element.getAttribute(attribute) || '';
  const sources = attributeSources.get(element) || new Map<string, LocalizedSource>();
  const known = sources.get(attribute);
  if (!known) sources.set(attribute, { source: current, rendered: current });
  else if (current !== known.rendered) {
    known.source = current;
    known.rendered = current;
  }
  attributeSources.set(element, sources);
  return sources.get(attribute)?.source || '';
};

const localizeAttribute = (element: HTMLElement, attribute: string, locale: AppLocale) => {
  if (isExcluded(element) || !element.hasAttribute(attribute)) return;
  const source = sourceForAttribute(element, attribute);
  const translated = translateUiText(source, locale);
  if (element.getAttribute(attribute) !== translated) element.setAttribute(attribute, translated);
  const known = attributeSources.get(element)?.get(attribute);
  if (known) known.rendered = translated;
};

const localizeElement = (element: Element, locale: AppLocale) => {
  if (isExcluded(element)) return;
  localizedAttributes.forEach(attribute => localizeAttribute(element as HTMLElement, attribute, locale));
  element.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) localizeTextNode(child as Text, locale);
    if (child.nodeType === Node.ELEMENT_NODE) localizeElement(child as Element, locale);
  });
};

export const I18nProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [locale, setLocaleState] = React.useState<AppLocale>(getInitialLocale);

  const setLocale = React.useCallback((nextLocale: AppLocale) => {
    setLocaleState(nextLocale);
    try { window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, nextLocale); } catch { /* preference remains in memory */ }
  }, []);

  const toggleLocale = React.useCallback(() => setLocale(locale === 'en' ? 'zh' : 'en'), [locale, setLocale]);
  const translate = React.useCallback((value: string) => translateUiText(value, locale), [locale]);

  React.useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    document.documentElement.dataset.locale = locale;
    document.title = translateUiText('AiTask - Marketing Agency Task Management', locale);
    if (!document.body) return;

    const translateAll = () => localizeElement(document.body, locale);
    translateAll();
    const observer = new MutationObserver(records => {
      records.forEach(record => {
        if (record.type === 'characterData') localizeTextNode(record.target as Text, locale);
        if (record.type === 'attributes') localizeAttribute(record.target as HTMLElement, record.attributeName || '', locale);
        if (record.type === 'childList') record.addedNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) localizeTextNode(node as Text, locale);
          if (node.nodeType === Node.ELEMENT_NODE) localizeElement(node as Element, locale);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...localizedAttributes] });
    return () => observer.disconnect();
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
