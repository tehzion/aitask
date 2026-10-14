import type { AppNotification } from '../types';
import { presentNotification } from '../lib/notificationPresentation';
import { formatLocalizedDistanceToNow } from '../lib/i18n';
import { useI18n } from './I18nProvider';

export default function NotificationPreviewText({ notification }: { notification: AppNotification }) {
  const { locale } = useI18n();
  const presentation = presentNotification(notification, locale);
  return <>
    <p className="truncate text-xs font-medium text-slate-500">{presentation.title}</p>
    <p data-i18n-skip className="mt-0.5 text-sm font-semibold leading-5 text-slate-950">{presentation.message}</p>
    <p className="mt-1 text-xs text-slate-400">{formatLocalizedDistanceToNow(new Date(notification.createdAt), locale)}</p>
  </>;
}
