import type { MessageDescriptor } from '../lib/messages';
import { userFacingMessage } from '../lib/userFacingMessage';
import { useI18n } from './I18nProvider';

/** Use only for application feedback; user-authored content renders separately. */
const SystemMessage = ({ message }: { message: string | MessageDescriptor | null | undefined }) => {
  const { t } = useI18n();
  return <>{t(userFacingMessage(message))}</>;
};

export default SystemMessage;
