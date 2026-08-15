import React, { useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, UserPlus, ChevronDown, ChevronUp, Mail, Moon, Sun } from 'lucide-react';
import { useStore } from '../store';
import { Button } from '../components/ui';
import { inputBase } from '../components/uiTokens';
import { cn } from '../lib/utils';
import { DEFAULT_USER_PASSWORD, hasPasswordResetBypass, shouldShowDemoLogin, validateStaffSignupPassword } from '../lib/auth';
import { APP_BUILD_LABEL } from '../lib/appVersion';
import { shouldUseSecureSupabase } from '../lib/supabaseClient';
import { STAFF_DEPARTMENTS } from '../lib/departments';
import { useColorTheme } from '../hooks/useColorTheme';

/** Max failed attempts before a short lockout is applied */
const MAX_ATTEMPTS = 5;
/** Lockout duration in seconds */
const LOCKOUT_SECONDS = 30;

const DEMO_ACCOUNTS = [
  { username: 'Admin Demo',            role: 'Admin',       badge: 'bg-red-100 text-red-700' },
  { username: 'UrbanEats Client Demo', role: 'Client',      badge: 'bg-emerald-100 text-emerald-700' },
];

const LOCAL_STAFF_DEMO_ACCOUNT = {
  username: 'Staff Demo',
  role: 'Staff',
  badge: 'bg-blue-100 text-blue-700',
};

const getLoginDestination = (mustResetPassword: boolean, userId: string, requestedPath: string) => (
  mustResetPassword && !hasPasswordResetBypass(userId) ? '/settings' : requestedPath
);

const Login: React.FC = () => {
  const { resolvedTheme, toggleTheme } = useColorTheme();
  const { login, currentUser, registerUser, requestPasswordRecovery } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const requestedPath = typeof location.state?.returnTo === 'string'
    && location.state.returnTo.startsWith('/')
    && !location.state.returnTo.startsWith('//')
    ? location.state.returnTo
    : '/';

  // --- Login state ---
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const attemptsRef = useRef(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [showDemo, setShowDemo] = useState(true);
  const showDemoLogin = shouldShowDemoLogin();
  const secureAccounts = shouldUseSecureSupabase();
  const demoAccounts = secureAccounts
    ? DEMO_ACCOUNTS
    : [...DEMO_ACCOUNTS, LOCAL_STAFF_DEMO_ACCOUNT];
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryIdentifier, setRecoveryIdentifier] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const [recoverySent, setRecoverySent] = useState(false);
  const [isRequestingRecovery, setIsRequestingRecovery] = useState(false);

  // --- Registration state ---
  const [isRegistering, setIsRegistering] = useState(false);
  const [regData, setRegData] = useState({
    name: '', email: '', phone: '', jobPosition: '',
  });
  const [regSuccess, setRegSuccess] = useState(false);
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regError, setRegError] = useState('');
  const [isSubmittingRegistration, setIsSubmittingRegistration] = useState(false);

  React.useEffect(() => {
    if (currentUser) navigate(getLoginDestination(Boolean(currentUser.mustResetPassword), currentUser.id, requestedPath), { replace: true });
  }, [currentUser, navigate, requestedPath]);

  const fillDemo = (account: typeof DEMO_ACCOUNTS[0]) => {
    setUsername(account.username);
    setPassword(secureAccounts ? '' : DEFAULT_USER_PASSWORD);
    setLoginError('');
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError('');
    setIsRequestingRecovery(true);
    const result = await requestPasswordRecovery(recoveryIdentifier);
    setIsRequestingRecovery(false);
    if (!result.ok) {
      setRecoveryError(result.error || 'Unable to request a recovery email.');
      return;
    }
    setRecoverySent(true);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    if (lockedUntil && Date.now() < lockedUntil) {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
      setLoginError(`Too many attempts. Please wait ${remaining} seconds.`);
      return;
    }

    if (!username.trim()) {
      setLoginError('Please enter your email or username.');
      return;
    }

    setIsLoggingIn(true);
    let loginSucceeded = false;
    try {
      loginSucceeded = await login(username, password);
    } catch {
      setLoginError('This browser could not verify the account. Please try again.');
      return;
    } finally {
      setIsLoggingIn(false);
    }

    if (loginSucceeded) {
      attemptsRef.current = 0;
      const user = useStore.getState().currentUser;
      if (user) {
        setTimeout(() => navigate(getLoginDestination(Boolean(user.mustResetPassword), user.id, requestedPath), { replace: true }), 50);
      }
    } else {
      attemptsRef.current += 1;
      if (attemptsRef.current >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_SECONDS * 1000;
        setLockedUntil(until);
        attemptsRef.current = 0;
        setLoginError(`Too many failed attempts. Please wait ${LOCKOUT_SECONDS} seconds.`);
        setTimeout(() => setLockedUntil(null), LOCKOUT_SECONDS * 1000);
      } else {
        setLoginError('Incorrect username or password. Please try again.');
      }
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    if (secureAccounts) {
      const passwordError = validateStaffSignupPassword(regPassword, regConfirmPassword);
      if (passwordError) {
        setRegError(passwordError);
        return;
      }
    }
    setIsSubmittingRegistration(true);
    const result = await registerUser({
      ...regData,
      requestedRole: 'Staff',
      password: secureAccounts ? regPassword : undefined,
    });
    setIsSubmittingRegistration(false);
    if (!result.ok) {
      setRegError(result.error || 'Unable to submit your registration.');
      return;
    }
    setRegSuccess(true);
    setRegData({ name: '', email: '', phone: '', jobPosition: '' });
    setRegPassword('');
    setRegConfirmPassword('');
  };

  return (
    <main className="relative min-h-screen bg-slate-50 flex flex-col justify-center px-4 py-10 dark:bg-slate-950 sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={`Switch to ${resolvedTheme === 'dark' ? 'day' : 'night'} mode`}
        aria-pressed={resolvedTheme === 'dark'}
        className="fixed right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white"
      >
        {resolvedTheme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-blue-600 text-xl font-bold text-white shadow-sm">
              AT
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-950">AiTask</div>
              <span className="mt-0.5 block text-xs font-medium text-slate-500">Marketing agency workspace</span>
            </div>
          </div>
        </div>
        <h1 className="mt-8 text-center text-2xl font-semibold text-slate-950">
          {isRecovering ? 'Reset your password' : isRegistering ? 'Register for Access' : 'Sign in to AiTask'}
        </h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          {isRecovering
            ? 'Enter your account email or username to receive a secure recovery link.'
            : isRegistering
            ? 'Fill in your details. An admin will review and approve your account.'
            : 'Enter your username and password to access the dashboard.'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="border border-slate-200 bg-white px-4 py-8 shadow-[0_10px_24px_rgba(15,23,42,0.07)] sm:rounded-lg sm:px-10">
          {isRecovering ? (
            recoverySent ? (
              <div className="py-4 text-center" role="status" aria-live="polite">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                  <Mail className="h-6 w-6 text-blue-600" />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-slate-900">Check your email</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  If the account can receive recovery email, a password link has been sent.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-6 w-full"
                  onClick={() => {
                    setIsRecovering(false);
                    setRecoverySent(false);
                  }}
                >
                  Back to Login
                </Button>
              </div>
            ) : (
              <form className="space-y-5" onSubmit={handleRecovery}>
                <div>
                  <label htmlFor="recovery-identifier" className="block text-sm font-medium text-slate-700">Email or username</label>
                  <input
                    id="recovery-identifier"
                    type="text"
                    autoComplete="username"
                    required
                    className={cn(inputBase, 'mt-2 px-4 py-3')}
                    value={recoveryIdentifier}
                    onChange={event => setRecoveryIdentifier(event.target.value)}
                  />
                </div>
                {recoveryError && <p className="text-sm text-red-600" role="alert" aria-live="assertive">{recoveryError}</p>}
                <Button type="submit" className="w-full py-3" disabled={isRequestingRecovery}>
                  <Mail className="h-4 w-4" />
                  {isRequestingRecovery ? 'Requesting email...' : 'Send recovery email'}
                </Button>
                <button
                  type="button"
                  onClick={() => setIsRecovering(false)}
                  className="w-full text-center text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  Back to Login
                </button>
              </form>
            )
          ) : !isRegistering ? (
            <>
              <form className="space-y-5" onSubmit={handleLogin}>
                <div>
                  <label htmlFor="username" className="block text-sm font-medium text-slate-700">Email or username</label>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    required
                    placeholder="Enter your account email"
                    className={cn(inputBase, 'mt-2 py-3 px-4')}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-slate-700">Password</label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    placeholder="Enter your password"
                    className={cn(inputBase, 'mt-2 py-3 px-4')}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                  {secureAccounts && (
                    <button
                      type="button"
                      onClick={() => {
                        setRecoveryIdentifier(username);
                        setRecoveryError('');
                        setRecoverySent(false);
                        setIsRecovering(true);
                      }}
                      className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-700"
                    >
                      Forgot password?
                    </button>
                  )}
                  {loginError && <p className="mt-2 text-sm text-red-600" role="alert" aria-live="polite">{loginError}</p>}
                </div>

                <Button type="submit" className="w-full py-3" disabled={isLoggingIn}>
                  <LayoutDashboard className="w-4 h-4" />
                  {isLoggingIn ? 'Checking account...' : 'Access Dashboard'}
                </Button>
              </form>

              {showDemoLogin && (
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => setShowDemo(v => !v)}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
                  >
                    <span>Demo accounts - select username</span>
                    {showDemo ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {showDemo && (
                    <div className="mt-2 rounded-lg border border-slate-200 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-left px-3 py-2 font-semibold text-slate-500">Username</th>
                            <th className="text-left px-3 py-2 font-semibold text-slate-500">Role</th>
                          </tr>
                        </thead>
                        <tbody>
                          {demoAccounts.map((account) => (
                            <tr
                              key={account.username}
                              className={cn(
                                'border-b border-slate-100 last:border-0 transition-colors hover:bg-blue-50',
                                username === account.username ? 'bg-blue-50' : 'bg-white'
                              )}
                            >
                              <td className="px-3 py-2 font-medium text-slate-700">
                                <button
                                  type="button"
                                  onClick={() => fillDemo(account)}
                                  className="text-left font-medium text-slate-700 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                                  aria-label={`Use ${account.username}`}
                                >
                                  {account.username}
                                </button>
                              </td>
                              <td className="px-3 py-2">
                                <span className={cn('px-1.5 py-0.5 rounded text-xs font-semibold', account.badge)}>
                                  {account.role}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ── Register link ── */}
              <div className="mt-5">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-slate-500">Need an account?</span>
                  </div>
                </div>
                <Button
                  onClick={() => setIsRegistering(true)}
                  variant="secondary"
                  className="mt-5 w-full border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                >
                  <UserPlus className="w-4 h-4" />
                  Register as Staff
                </Button>
              </div>
            </>
          ) : (
            <>
              {regSuccess ? (
                <div className="text-center py-6">
                  <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-emerald-100 mb-4">
                    <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-medium text-slate-900">Registration Submitted!</h2>
                  <p className="mt-2 text-sm text-slate-500">
                    {secureAccounts
                      ? 'Your Staff registration is waiting for approval. After approval, sign in with the password you chose. Email setup is optional.'
                      : 'Your Staff access request has been submitted for Super Admin approval.'}
                  </p>
                  <Button onClick={() => { setRegSuccess(false); setIsRegistering(false); }} className="mt-6 w-full">
                    Back to Login
                  </Button>
                </div>
              ) : (
                <form className="space-y-4" onSubmit={handleRegister}>
                  <div>
                    <label htmlFor="registration-name" className="block text-sm font-medium text-slate-700">Full Name</label>
                    <input id="registration-name" type="text" required className={cn(inputBase, 'mt-1 py-2.5 px-3')} value={regData.name} onChange={e => setRegData({ ...regData, name: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="registration-email" className="block text-sm font-medium text-slate-700">Email</label>
                    <input id="registration-email" type="email" required className={cn(inputBase, 'mt-1 py-2.5 px-3')} value={regData.email} onChange={e => setRegData({ ...regData, email: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="registration-phone" className="block text-sm font-medium text-slate-700">Phone Number</label>
                    <input id="registration-phone" type="tel" required className={cn(inputBase, 'mt-1 py-2.5 px-3')} value={regData.phone} onChange={e => setRegData({ ...regData, phone: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="registration-position" className="block text-sm font-medium text-slate-700">Job Position / Department</label>
                    <input id="registration-position" list="staff-position-options" type="text" required placeholder="e.g. Designer, Video Editor" className={cn(inputBase, 'mt-1 py-2.5 px-3')} value={regData.jobPosition} onChange={e => setRegData({ ...regData, jobPosition: e.target.value })} />
                    <datalist id="staff-position-options">
                      {STAFF_DEPARTMENTS.map(position => <option key={position} value={position} />)}
                    </datalist>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <p className="text-xs font-semibold uppercase text-slate-500">Access role</p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-800">Staff</p>
                  </div>
                  {secureAccounts && (
                    <>
                      <div>
                        <label htmlFor="registration-password" className="block text-sm font-medium text-slate-700">Password</label>
                        <input id="registration-password" type="password" required minLength={12} autoComplete="new-password" className={cn(inputBase, 'mt-1 py-2.5 px-3')} value={regPassword} onChange={e => setRegPassword(e.target.value)} />
                        <p className="mt-1 text-xs text-slate-500">Use at least 12 characters.</p>
                      </div>
                      <div>
                        <label htmlFor="registration-password-confirmation" className="block text-sm font-medium text-slate-700">Confirm Password</label>
                        <input id="registration-password-confirmation" type="password" required minLength={12} autoComplete="new-password" className={cn(inputBase, 'mt-1 py-2.5 px-3')} value={regConfirmPassword} onChange={e => setRegConfirmPassword(e.target.value)} />
                      </div>
                    </>
                  )}
                  {regError && <p className="text-sm font-medium text-red-600" role="alert" aria-live="polite">{regError}</p>}
                  <Button type="submit" className="w-full py-3" disabled={isSubmittingRegistration}>
                    {isSubmittingRegistration ? 'Submitting...' : 'Submit Staff Registration'}
                  </Button>
                  <div className="text-center mt-4">
                    <button type="button" onClick={() => setIsRegistering(false)} className="text-sm font-medium text-blue-600 hover:text-blue-500">
                      Already have an account? Sign in
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
        <p className="mt-4 text-center font-mono text-[11px] text-slate-400">
          {APP_BUILD_LABEL}
        </p>
      </div>
    </main>
  );
};

export default Login;
