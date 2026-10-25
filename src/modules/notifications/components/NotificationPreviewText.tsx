import { useI18n } from '../../../shared/components/I18nProvider';
import type { AppNotification } from '../../../shared/types/index';
import { formatLocalizedDistanceToNow } from '../../../shared/utils/relativeTime';
import { presentNotification } from '../services/notificationPresentation';

export default function NotificationPreviewText({ notification }: { notification: AppNotification }) {
  const { locale } = useI18n();
  const presentation = presentNotification(notification, locale);
  return <>
    <p className="truncate text-xs font-medium text-slate-500">{presentation.title}</p>
    <p data-i18n-skip className="mt-0.5 text-sm font-semibold leading-5 text-slate-950">{presentation.message}</p>
    <p className="mt-1 text-xs text-slate-400">{formatLocalizedDistanceToNow(new Date(notification.createdAt), locale)}</p>
  </>;
}
