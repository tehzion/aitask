import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, UserPlus } from 'lucide-react';
import { useStore } from '../store';
import { Role } from '../types';
import { Button, inputBase } from '../components/ui';
import { cn } from '../lib/utils';

/** Max failed attempts before a short lockout is applied */
const MAX_ATTEMPTS = 5;
/** Lockout duration in seconds */
const LOCKOUT_SECONDS = 30;

const Login: React.FC = () => {
  const { login, currentUser, registerUser } = useStore();
  const navigate = useNavigate();

  // --- Login state ---
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const attemptsRef = useRef(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);

  // --- Registration state ---
  const [isRegistering, setIsRegistering] = useState(false);
  const [regData, setRegData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    jobPosition: '',
    requestedRole: 'Staff' as Role,
  });
  const [regSuccess, setRegSuccess] = useState(false);

  React.useEffect(() => {
    if (currentUser) navigate('/');
  }, [currentUser, navigate]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    // Lockout check
    if (lockedUntil && Date.now() < lockedUntil) {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
      setLoginError(`Too many attempts. Please wait ${remaining} seconds.`);
      return;
    }

    if (!username.trim()) {
      setLoginError('Please enter your username.');
      return;
    }

    if (login(username, password)) {
      attemptsRef.current = 0;
      setTimeout(() => navigate('/'), 50);
    } else {
      attemptsRef.current += 1;
      if (attemptsRef.current >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_SECONDS * 1000;
        setLockedUntil(until);
        attemptsRef.current = 0;
        setLoginError(`Too many failed attempts. Please wait ${LOCKOUT_SECONDS} seconds.`);
        // Auto-clear lockout message after delay
        setTimeout(() => setLockedUntil(null), LOCKOUT_SECONDS * 1000);
      } else {
        setLoginError('Incorrect username or password. Please try again.');
      }
    }
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    registerUser(regData);
    setRegSuccess(true);
    setRegData({ name: '', email: '', phone: '', password: '', jobPosition: '', requestedRole: 'Staff' });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="flex flex-col items-center justify-center">
            <div className="flex items-baseline font-sans">
              <span className="text-5xl font-bold text-red-500 tracking-tighter">A</span>
              <span className="text-5xl font-bold text-red-500 tracking-tighter">i</span>
              <span className="text-4xl font-extrabold text-slate-800 tracking-tight ml-1">Task</span>
            </div>
            <span className="text-xs text-slate-500 font-medium tracking-widest mt-1 uppercase">Marketing Agency</span>
          </div>
        </div>
        <h2 className="mt-8 text-center text-3xl font-extrabold text-slate-900">
          {isRegistering ? 'Register for Access' : 'Sign in to AiTask'}
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          {isRegistering
            ? 'Fill in your details. An admin will review and approve your account.'
            : 'Enter your username and password to access the dashboard.'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-lg sm:rounded-lg sm:px-10 border border-slate-200 relative overflow-hidden">
          {!isRegistering ? (
            <>
              <form className="space-y-6" onSubmit={handleLogin}>
                <div>
                  <label htmlFor="username" className="block text-sm font-medium text-slate-700">
                    Username
                  </label>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    required
                    placeholder="Enter your username"
                    className={cn(inputBase, 'mt-2 py-3 px-4')}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                    Password
                  </label>
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
                  {loginError && <p className="mt-2 text-sm text-red-600">{loginError}</p>}
                </div>

                <Button type="submit" className="w-full py-3">
                  <LayoutDashboard className="w-4 h-4" />
                  Access Dashboard
                </Button>
              </form>

              <div className="mt-6">
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
                  className="mt-6 w-full border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                >
                  <UserPlus className="w-4 h-4" />
                  Register for Access
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
                  <h3 className="text-lg font-medium text-slate-900">Registration Submitted!</h3>
                  <p className="mt-2 text-sm text-slate-500">
                    Your request has been submitted for approval. Please wait for confirmation.
                  </p>
                  <Button
                    onClick={() => {
                      setRegSuccess(false);
                      setIsRegistering(false);
                    }}
                    className="mt-6 w-full"
                  >
                    Back to Login
                  </Button>
                </div>
              ) : (
                <form className="space-y-4" onSubmit={handleRegister}>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Full Name</label>
                    <input type="text" required className={cn(inputBase, 'mt-1 py-2.5 px-3')} value={regData.name} onChange={e => setRegData({ ...regData, name: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Email</label>
                    <input type="email" required className={cn(inputBase, 'mt-1 py-2.5 px-3')} value={regData.email} onChange={e => setRegData({ ...regData, email: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Phone Number</label>
                    <input type="tel" required className={cn(inputBase, 'mt-1 py-2.5 px-3')} value={regData.phone} onChange={e => setRegData({ ...regData, phone: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Password</label>
                    <input type="password" required autoComplete="new-password" className={cn(inputBase, 'mt-1 py-2.5 px-3')} value={regData.password} onChange={e => setRegData({ ...regData, password: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Job Position / Department</label>
                    <input type="text" required placeholder="e.g. Designer, Ads Manager" className={cn(inputBase, 'mt-1 py-2.5 px-3')} value={regData.jobPosition} onChange={e => setRegData({ ...regData, jobPosition: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Requested Access Role</label>
                    <select className={cn(inputBase, 'mt-1 py-2.5 px-3')} value={regData.requestedRole} onChange={e => setRegData({ ...regData, requestedRole: e.target.value as Role })}>
                      {/* Admin role is not self-selectable; it must be assigned by the super admin */}
                      <option value="Staff">Staff (Internal Team Member)</option>
                      <option value="Client">Client (External Customer)</option>
                    </select>
                  </div>

                  <Button type="submit" className="w-full py-3">Submit Registration</Button>

                  <div className="text-center mt-4">
                    <button type="button" onClick={() => setIsRegistering(false)} className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
                      Already have an account? Sign in
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
