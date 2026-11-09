import React from 'react';
import { useNavigate } from 'react-router-dom';
import { clearWorkspaceSession } from '../store';
import { useI18n } from './I18nProvider';
import { Button } from './ui';

/** Sign in without discarding the account-scoped command retained in this tab. */
const SessionRecoveryButton = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  return <Button type="button" variant="secondary" onClick={() => {
    clearWorkspaceSession();
    navigate('/login', { replace: true });
  }}>{t('Sign in again')}</Button>;
};

export default SessionRecoveryButton;
