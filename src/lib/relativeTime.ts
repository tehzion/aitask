import { formatDistanceToNow } from 'date-fns/formatDistanceToNow';
import { enUS } from 'date-fns/locale/en-US';
import { zhCN } from 'date-fns/locale/zh-CN';
import type { AppLocale } from './i18n';

// Only authenticated, lazy-loaded screens need relative timestamps. Keep their
// date-fns locale data out of the eager localization/runtime dependency graph.
const DISTANCE_LOCALES = {
  en: { formatDistance: enUS.formatDistance },
  zh: { formatDistance: zhCN.formatDistance },
} as const;

export const formatLocalizedDistanceToNow = (value: Date, locale: AppLocale) => {
  if (!value || Number.isNaN(value.getTime())) return '';
  return formatDistanceToNow(value, { addSuffix: true, locale: DISTANCE_LOCALES[locale] });
};
