import React from 'react';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui';
import { inputBase } from '../components/uiTokens';
import { APP_BUILD_LABEL } from '../lib/appVersion';
import { getPasswordSetupMode } from '../lib/authRecovery';
import { supabase } from '../lib/supabaseClient';
import { cn } from '../lib/utils';
import { useStore } from '../store';
import { LanguageSwitcher, useI18n } from '../components/I18nProvider';

const AccountPassword: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const completePasswordSetup = useStore(state => state.completePasswordSetup);
  const backendLoading = useStore(state => state.backend.isLoading);
  const [isChecking, setIsChecking] = React.useState(true);
  const [hasValidSession, setHasValidSession] = React.useState(false);
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [isComplete, setIsComplete] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    const mode = getPasswordSetupMode();
    if (!mode) {
      setIsChecking(false);
      return;
    }

    const checkSession = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!mounted) return;
      setHasValidSession(!sessionError && Boolean(data.session));
      setIsChecking(false);
    };

    void checkSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted || !getPasswordSetupMode()) return;
      if (!session) {
        setHasValidSession(false);
        setIsChecking(false);
        return;
      }
      setHasValidSession(true);
      setIsChecking(false);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsSaving(true);
    const result = await completePasswordSetup({ newPassword, confirmPassword });
    setIsSaving(false);
    if (!result.ok) {
      setError(t(result.error || 'Unable to set your password.'));
      return;
    }
    setIsComplete(true);
  };

  const unavailable = !isChecking && !hasValidSession;

  return (
    <main className="auth-page relative flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 sm:px-6">
      <LanguageSwitcher compact className="fixed right-4 top-4 z-10 rounded-lg border border-slate-300 bg-white text-slate-600 shadow-sm hover:bg-slate-100 hover:text-slate-950 focus:ring-blue-500" />
      <section className="auth-card w-full max-w-md px-5 py-8 sm:px-10" aria-labelledby="password-title">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-accent text-white">
          {isComplete ? <CheckCircle2 className="h-6 w-6" /> : <KeyRound className="h-6 w-6" />}
        </div>

        {isChecking || backendLoading ? (
          <div className="py-6 text-center" role="status" aria-live="polite">
            <h1 id="password-title" className="text-xl font-semibold text-slate-950">{t('auth.checkingLink')}</h1>
            <p className="mt-2 text-sm text-slate-600">{t('auth.checkingLinkDescription')}</p>
          </div>
        ) : unavailable ? (
          <div className="py-6 text-center">
            <h1 id="password-title" className="text-xl font-semibold text-slate-950">{t('auth.linkUnavailable')}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t('auth.invalidLink')}</p>
            <Button className="mt-6 w-full" onClick={() => navigate('/login', { replace: true })}>{t('auth.returnToLogin')}</Button>
          </div>
        ) : isComplete ? (
          <div className="py-6 text-center" role="status" aria-live="polite">
            <h1 id="password-title" className="text-xl font-semibold text-slate-950">{t('auth.passwordReady')}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t('auth.passwordUpdated')}</p>
            <Button className="mt-6 w-full" onClick={() => navigate('/', { replace: true })}>{t('auth.continueToAiTask')}</Button>
          </div>
        ) : (
          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div className="text-center">
              <h1 id="password-title" className="text-xl font-semibold text-slate-950">{t('auth.choosePassword')}</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">{t('auth.passwordGuidance')}</p>
            </div>
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-slate-700">{t('auth.newPassword')}</label>
              <input
                id="new-password"
                type="password"
                minLength={12}
                required
                autoComplete="new-password"
                className={cn(inputBase, 'mt-2 px-4 py-3')}
                value={newPassword}
                onChange={event => setNewPassword(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700">{t('auth.confirmPassword')}</label>
              <input
                id="confirm-password"
                type="password"
                minLength={12}
                required
                autoComplete="new-password"
                className={cn(inputBase, 'mt-2 px-4 py-3')}
                value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
              />
            </div>
            {error && <p className="text-sm font-medium text-red-600" role="alert" aria-live="assertive">{error}</p>}
            <Button type="submit" className="w-full py-3" disabled={isSaving}>
              {isSaving ? t('auth.savingPassword') : t('auth.setPassword')}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center font-mono text-[11px] text-slate-400">{APP_BUILD_LABEL}</p>
      </section>
    </main>
  );
};

export default AccountPassword;
