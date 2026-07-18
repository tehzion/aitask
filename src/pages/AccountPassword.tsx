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

const AccountPassword: React.FC = () => {
  const navigate = useNavigate();
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted || !session || !getPasswordSetupMode()) return;
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
      setError(result.error || 'Unable to set your password.');
      return;
    }
    setIsComplete(true);
  };

  const unavailable = !isChecking && !hasValidSession;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 sm:px-6">
      <section className="w-full max-w-md border border-slate-200 bg-white px-5 py-8 shadow-[0_8px_30px_rgba(15,23,42,0.08)] sm:rounded-lg sm:px-10" aria-labelledby="password-title">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-blue-600 text-white">
          {isComplete ? <CheckCircle2 className="h-6 w-6" /> : <KeyRound className="h-6 w-6" />}
        </div>

        {isChecking || backendLoading ? (
          <div className="py-6 text-center" role="status" aria-live="polite">
            <h1 id="password-title" className="text-xl font-semibold text-slate-950">Checking your secure link</h1>
            <p className="mt-2 text-sm text-slate-600">Please wait while AiTask verifies this session.</p>
          </div>
        ) : unavailable ? (
          <div className="py-6 text-center">
            <h1 id="password-title" className="text-xl font-semibold text-slate-950">Link unavailable</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">This password link is invalid, expired, or has already been used.</p>
            <Button className="mt-6 w-full" onClick={() => navigate('/login', { replace: true })}>Return to Login</Button>
          </div>
        ) : isComplete ? (
          <div className="py-6 text-center" role="status" aria-live="polite">
            <h1 id="password-title" className="text-xl font-semibold text-slate-950">Password ready</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Your account password has been securely updated.</p>
            <Button className="mt-6 w-full" onClick={() => navigate('/', { replace: true })}>Continue to AiTask</Button>
          </div>
        ) : (
          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div className="text-center">
              <h1 id="password-title" className="text-xl font-semibold text-slate-950">Choose your password</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">Use at least 12 characters and keep this password private.</p>
            </div>
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-slate-700">New password</label>
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
              <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700">Confirm password</label>
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
              {isSaving ? 'Saving password...' : 'Set password'}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center font-mono text-[11px] text-slate-400">{APP_BUILD_LABEL}</p>
      </section>
    </main>
  );
};

export default AccountPassword;
