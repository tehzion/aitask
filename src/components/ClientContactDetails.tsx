import '../lib/pageCopy';
import { Globe, Mail, MapPin, Phone, UserRound } from 'lucide-react';
import type { ClientProfile } from '../types';
import { useI18n } from './I18nProvider';
import { Surface } from './ui';

/**
 * The company's saved contact details, shown on its workspace so the team does
 * not have to open the Companies page to find who to call. Internal only.
 */
const ClientContactDetails = ({ client }: { client: ClientProfile }) => {
  const { t } = useI18n();
  const rows = [
    { key: 'person', icon: UserRound, value: client.contactPerson, label: 'Contact person' },
    { key: 'phone', icon: Phone, value: client.phone, label: 'Phone', href: client.phone ? `tel:${client.phone.replace(/[^\d+]/g, '')}` : undefined },
    { key: 'email', icon: Mail, value: client.email, label: 'Email', href: client.email ? `mailto:${client.email}` : undefined },
    { key: 'address', icon: MapPin, value: client.address, label: 'Address' },
    { key: 'website', icon: Globe, value: client.website, label: 'Website', href: client.website },
    { key: 'facebook', icon: Globe, value: client.facebookPage, label: 'Facebook page', href: client.facebookPage },
  ].filter(row => row.value);

  return (
    <Surface className="p-6" aria-label={t('Contact details')} data-testid="client-contact-details">
      <h2 className="calm-eyebrow">{t('Contact details')}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t('No contact details saved yet.')}</p>
      ) : (
        <dl className="mt-4 space-y-3">
          {rows.map(({ key, icon: Icon, value, label, href }) => (
            <div key={key} className="flex items-start gap-2.5 text-sm">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
              <div className="min-w-0">
                <dt className="sr-only">{t(label)}</dt>
                <dd data-i18n-skip className="break-words text-ink">
                  {href ? <a href={href} className="underline-offset-2 hover:underline" {...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{value}</a> : value}
                </dd>
              </div>
            </div>
          ))}
        </dl>
      )}
    </Surface>
  );
};

export default ClientContactDetails;
