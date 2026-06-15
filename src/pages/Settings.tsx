import React from 'react';
import { AlertTriangle, Bell, CheckCircle2, Cloud, Database, Lock, RefreshCw, ShieldCheck, SlidersHorizontal, UserCircle, Volume2, VolumeX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { Badge, Button, MetricCard, PageHeader, cardBase, inputBase, pageShell } from '../components/ui';
import { getEffectivePermissions, getEffectiveRoleName, getVisibleProjects, getVisibleTasks, isNotificationReadByUser, isNotificationVisible, permissionLabels, isBossKoo } from '../lib/access';
import { getBackendStatus } from '../lib/backend';
import { cn } from '../lib/utils';
import BackendFreshness from '../components/BackendFreshness';
import { getSoundEnabled, setSoundEnabled } from '../lib/sounds';

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const {
    currentUser,
    tasks,
    projects,
    notifications,
    backend,
    rolePermissions,
    updateCurrentUserProfile,
    updateCurrentUserPassword,
    pullBackendNow,
    taskStatuses,
    addTaskStatus,
    deleteTaskStatus,
  } = useStore();
  const isSuperAdmin = isBossKoo(currentUser);
  const [profileName, setProfileName] = React.useState(currentUser?.name || '');
  const [avatarUrl, setAvatarUrl] = React.useState(currentUser?.avatar || '');
  const [profileMessage, setProfileMessage] = React.useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [soundEnabled, setSoundEnabledState] = React.useState(getSoundEnabled);
  const [passwordForm, setPasswordForm] = React.useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordMessage, setPasswordMessage] = React.useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [newStatusInput, setNewStatusInput] = React.useState('');
  const [statusError, setStatusError] = React.useState('');

  const handleStatusAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const result = addTaskStatus(newStatusInput);
    if (!result.ok) {
      setStatusError(result.error || 'Failed to add status.');
    } else {
      setNewStatusInput('');
      setStatusError('');
    }
  };

  const handleDeleteStatus = (status: string) => {
    const result = deleteTaskStatus(status);
    if (!result.ok) {
      setStatusError(result.error || 'Failed to delete status.');
    } else {
      setStatusError('');
    }
  };

  const backendStatus = getBackendStatus();
  const visibleTasks = getVisibleTasks(currentUser, tasks);
  const visibleProjects = getVisibleProjects(currentUser, projects);
  const effectivePermissions = getEffectivePermissions(currentUser, rolePermissions);
  const effectiveRoleName = getEffectiveRoleName(currentUser, rolePermissions);
  const enabledPermissions = Object.entries(effectivePermissions)
    .filter(([, enabled]) => enabled)
    .map(([key]) => permissionLabels[key as keyof typeof permissionLabels]);
  const unreadCount = notifications.filter(notification => (
    isNotificationVisible(currentUser, notification) &&
    !isNotificationReadByUser(currentUser, notification)
  )).length;
  const scopeDescription = currentUser?.role === 'Client'
    ? `Review your profile and ${currentUser.companyName || 'client'} workspace state.`
    : 'Review your profile, workspace scope, and backend sync state.';
  const profileChanged = profileName.trim() !== (currentUser?.name || '') || avatarUrl.trim() !== (currentUser?.avatar || '');
  const passwordChanged = Boolean(passwordForm.currentPassword || passwordForm.newPassword || passwordForm.confirmPassword);
  const mustResetPassword = Boolean(currentUser?.mustResetPassword);
  const isSupabaseMode = backendStatus.mode === 'supabase';
  const hostedLocalBuild = backendStatus.mode === 'local' && backendStatus.isHostedRuntime;
  const hasSupabaseKey = isSupabaseMode && !backendStatus.missing.includes('VITE_SUPABASE_ANON_KEY');
  const hasCheckedRemote = Boolean(backend.lastPulledAt || backend.lastSyncedAt || backend.remoteUpdatedAt);
  const backendSetupItems = [
    {
      label: 'Backend mode',
      done: isSupabaseMode,
      detail: isSupabaseMode
        ? 'Supabase mode is active.'
        : hostedLocalBuild
          ? 'Hosted build is still local. Set Vercel env and redeploy.'
          : 'Local development mode is active.',
    },
    {
      label: 'Supabase URL',
      done: Boolean(backendStatus.supabaseUrl),
      detail: backendStatus.supabaseUrl || 'Set VITE_SUPABASE_URL.',
    },
    {
      label: 'Publishable key',
      done: hasSupabaseKey,
      detail: hasSupabaseKey ? 'Client key is configured.' : 'Set VITE_SUPABASE_ANON_KEY.',
    },
    {
      label: 'Snapshot target',
      done: true,
      detail: `${backendStatus.stateTable} / ${backendStatus.stateId}`,
    },
    {
      label: 'Remote check',
      done: isSupabaseMode && backendStatus.ready && hasCheckedRemote && !backend.error,
      detail: isSupabaseMode
        ? hasCheckedRemote
          ? 'Remote snapshot has been checked.'
          : 'Use Check now after the Supabase table is ready.'
        : hostedLocalBuild
          ? 'Vercel must be rebuilt with Supabase env before remote checks work.'
        : 'Switch to Supabase mode before deployment.',
    },
  ];

  React.useEffect(() => {
    setProfileName(currentUser?.name || '');
    setAvatarUrl(currentUser?.avatar || '');
    setProfileMessage(null);
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setPasswordMessage(null);
  }, [currentUser?.id, currentUser?.name, currentUser?.avatar]);

  const handleProfileSave = (event: React.FormEvent) => {
    event.preventDefault();
    const result = updateCurrentUserProfile({
      name: profileName,
      avatar: avatarUrl,
    });

    setProfileMessage({
      tone: result.ok ? 'success' : 'error',
      text: result.ok ? 'Profile updated.' : result.error || 'Profile could not be updated.',
    });
  };

  const resetProfileForm = () => {
    setProfileName(currentUser?.name || '');
    setAvatarUrl(currentUser?.avatar || '');
    setProfileMessage(null);
  };

  const useGeneratedAvatar = () => {
    const seed = encodeURIComponent((profileName || currentUser?.name || 'AiTask User').replace(/\s/g, ''));
    setAvatarUrl(`https://i.pravatar.cc/150?u=${seed}`);
    setProfileMessage(null);
  };

  const updatePasswordField = (field: keyof typeof passwordForm, value: string) => {
    setPasswordForm(current => ({ ...current, [field]: value }));
    setPasswordMessage(null);
  };

  const handlePasswordSave = (event: React.FormEvent) => {
    event.preventDefault();
    const wasResetRequired = mustResetPassword;
    const result = updateCurrentUserPassword(passwordForm);

    if (result.ok) {
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      if (wasResetRequired) {
        window.setTimeout(() => navigate('/', { replace: true }), 900);
      }
    }

    setPasswordMessage({
      tone: result.ok ? 'success' : 'error',
      text: result.ok
        ? wasResetRequired
          ? 'Password set. Opening your dashboard...'
          : 'Password updated.'
        : result.error || 'Password could not be updated.',
    });
  };

  return (
    <div className={pageShell}>
      <PageHeader
        title={mustResetPassword ? 'Account Setup' : 'Settings'}
        description={mustResetPassword ? 'Set your own password to unlock the workspace.' : scopeDescription}
      />

      {mustResetPassword && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-amber-700">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <p className="font-bold">Password reset required</p>
                <p className="mt-1 text-sm leading-6 text-amber-800">
                  Use the default password once as the current password, then choose a private password with at least 8 characters.
                </p>
              </div>
            </div>
            <Badge tone="amber" className="self-start">Required</Badge>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className={`xl:col-span-2 ${cardBase} overflow-hidden`}>
          <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
            <UserCircle className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-slate-800">Profile</h2>
          </div>
          <form onSubmit={handleProfileSave} className="p-6 space-y-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex items-center gap-4 sm:w-64 sm:flex-col sm:items-start">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={`${profileName || currentUser?.name || 'User'} avatar preview`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-400">
                      <UserCircle className="h-9 w-9" />
                    </div>
                  )}
                </div>
                <Button type="button" variant="secondary" onClick={useGeneratedAvatar} className="min-h-9 px-3 py-1.5">
                  Generate avatar
                </Button>
              </div>

              <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="profile-name" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Name</label>
                  <input
                    id="profile-name"
                    value={profileName}
                    onChange={event => {
                      setProfileName(event.target.value);
                      setProfileMessage(null);
                    }}
                    className={cn(inputBase, 'px-3 py-2.5')}
                    autoComplete="name"
                    maxLength={80}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="profile-avatar" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Avatar URL</label>
                  <input
                    id="profile-avatar"
                    value={avatarUrl}
                    onChange={event => {
                      setAvatarUrl(event.target.value);
                      setProfileMessage(null);
                    }}
                    className={cn(inputBase, 'px-3 py-2.5')}
                    placeholder="https://example.com/avatar.jpg"
                    autoComplete="url"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Role</label>
                  <p className="font-semibold text-slate-900">{effectiveRoleName}</p>
                  {currentUser?.customRoleId && <p className="mt-1 text-xs text-slate-500">Base role: {currentUser.role}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Department</label>
                  <p className="font-semibold text-slate-900">{currentUser?.department}</p>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Client Company</label>
                  <p className="font-semibold text-slate-900">{currentUser?.companyName || 'Not linked'}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-h-5 text-sm">
                {profileMessage && (
                  <p className={profileMessage.tone === 'success' ? 'text-emerald-700' : 'text-red-600'}>
                    {profileMessage.text}
                  </p>
                )}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" onClick={resetProfileForm} disabled={!profileChanged}>
                  Reset
                </Button>
                <Button type="submit" disabled={!profileChanged}>
                  Save profile
                </Button>
              </div>
            </div>
          </form>

          <form onSubmit={handlePasswordSave} className="border-t border-slate-100 p-6">
            <div className="mb-4 flex items-center gap-3">
              <Lock className="h-5 w-5 text-indigo-600" />
              <div>
                <h3 className="text-base font-semibold text-slate-900">{mustResetPassword ? 'Reset Password' : 'Password'}</h3>
                <p className="text-sm text-slate-500">
                  {mustResetPassword
                    ? 'Set your own password before continuing to the workspace.'
                    : 'Update the login password for this user profile.'}
                </p>
              </div>
            </div>

            {mustResetPassword && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Your account is using the default password. Enter it as the current password, then choose a new password.
                Password changes are stored on this browser until Supabase Auth is added.
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div>
                <label htmlFor="current-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Current Password</label>
                <input
                  id="current-password"
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={event => updatePasswordField('currentPassword', event.target.value)}
                  className={cn(inputBase, 'px-3 py-2.5')}
                  autoComplete="current-password"
                  required
                />
              </div>
              <div>
                <label htmlFor="new-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">New Password</label>
                <input
                  id="new-password"
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={event => updatePasswordField('newPassword', event.target.value)}
                  className={cn(inputBase, 'px-3 py-2.5')}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              <div>
                <label htmlFor="confirm-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Confirm Password</label>
                <input
                  id="confirm-password"
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={event => updatePasswordField('confirmPassword', event.target.value)}
                  className={cn(inputBase, 'px-3 py-2.5')}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-h-5 text-sm">
                {passwordMessage && (
                  <p className={passwordMessage.tone === 'success' ? 'text-emerald-700' : 'text-red-600'}>
                    {passwordMessage.text}
                  </p>
                )}
              </div>
              <Button type="submit" disabled={!passwordChanged}>
                {mustResetPassword ? 'Set password' : 'Update password'}
              </Button>
            </div>
          </form>
        </div>

        <div className={`${cardBase} overflow-hidden`}>
          <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-slate-800">Permissions</h2>
          </div>
          <div className="p-6 space-y-3 text-sm text-slate-600">
            <p><strong className="text-slate-800">Boss Koo:</strong> has super admin access to add members, manage users, approve registrations, projects, and all task workflows.</p>
            <p><strong className="text-slate-800">Admin:</strong> can create and edit all tasks and projects.</p>
            <p><strong className="text-slate-800">Staff and Finance:</strong> can view workspace tasks and update assigned tasks only.</p>
            <p><strong className="text-slate-800">Client:</strong> can view company tasks, calendar, reports, and review completed or waiting-approval work.</p>
            <div className="pt-3 border-t border-slate-100">
              <p className="font-semibold text-slate-800 mb-2">Your effective permissions</p>
              <div className="flex flex-wrap gap-2">
                {enabledPermissions.map(permission => (
                  <Badge key={permission} tone="indigo">{permission}</Badge>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Sound Notifications */}
        <div className={`${cardBase} overflow-hidden`}>
          <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
            {soundEnabled ? <Volume2 className="w-5 h-5 text-indigo-600" /> : <VolumeX className="w-5 h-5 text-slate-400" />}
            <h2 className="text-lg font-semibold text-slate-800">Sound Notifications</h2>
          </div>
          <div className="p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-800">
                {soundEnabled ? 'Sound alerts are enabled' : 'Sound alerts are muted'}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Play a chime when a new notification arrives. You can also toggle sound from the volume icon in the top bar.
              </p>
            </div>
            <button
              id="settings-sound-toggle"
              type="button"
              onClick={() => {
                const next = !soundEnabled;
                setSoundEnabledState(next);
                setSoundEnabled(next);
              }}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
                soundEnabled ? 'bg-indigo-600' : 'bg-slate-200'
              )}
              role="switch"
              aria-checked={soundEnabled}
              aria-label="Toggle sound notifications"
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                  soundEnabled ? 'translate-x-5' : 'translate-x-0'
                )}
              />
            </button>
          </div>
        </div>

        {(currentUser?.role === 'Admin' || isSuperAdmin) && (
          <div className={`${cardBase} overflow-hidden`}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
              <SlidersHorizontal className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-semibold text-slate-800">Workflow Statuses</h2>
            </div>
            <div className="p-6 space-y-6">
              <p className="text-sm text-slate-500">
                Manage workspace task statuses. Default statuses are locked. Custom statuses can only be deleted if they are not in active use.
              </p>

              {/* Status List */}
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                {taskStatuses.map((status) => {
                  const isDefault = ['Pending', 'In Progress', 'Waiting Approval', 'Completed', 'Cancelled'].includes(status);
                  const taskCount = tasks.filter(t => t.status.toLowerCase() === status.toLowerCase()).length;
                  
                  return (
                    <div key={status} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-slate-100/70 transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${
                          status === 'Pending' ? 'bg-slate-400' :
                          status === 'In Progress' ? 'bg-blue-500' :
                          status === 'Waiting Approval' ? 'bg-amber-500' :
                          status === 'Completed' ? 'bg-emerald-500' :
                          status === 'Cancelled' ? 'bg-red-500' :
                          'bg-stone-400'
                        }`} />
                        <span className="text-sm font-semibold text-slate-700 truncate">{status}</span>
                        {isDefault ? (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-bold uppercase tracking-wider shrink-0">
                            <Lock className="w-2.5 h-2.5" /> System
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold uppercase tracking-wider shrink-0">
                            Custom
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-3 shrink-0">
                        {taskCount > 0 && (
                          <span className="text-xs text-slate-400 font-medium">
                            {taskCount} task{taskCount === 1 ? '' : 's'}
                          </span>
                        )}
                        {!isDefault && (
                          <button
                            type="button"
                            onClick={() => handleDeleteStatus(status)}
                            className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors hover:bg-red-50"
                            title={`Delete ${status}`}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add Custom Status Form */}
              <div className="pt-4 border-t border-slate-100">
                <h3 className="text-sm font-semibold text-slate-800 mb-2">Create Custom Status</h3>
                <form onSubmit={handleStatusAdd} className="flex gap-2">
                  <input
                    type="text"
                    value={newStatusInput}
                    onChange={(e) => {
                      setNewStatusInput(e.target.value);
                      setStatusError('');
                    }}
                    placeholder="e.g. Under QA, Draft"
                    className={cn(inputBase, 'flex-1 px-3 py-2 text-sm')}
                    maxLength={50}
                  />
                  <Button type="submit" disabled={!newStatusInput.trim()}>
                    Add Status
                  </Button>
                </form>
                {statusError && (
                  <p className="mt-2 text-xs text-red-600">{statusError}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {isSuperAdmin && (
        <div className={`${cardBase} overflow-hidden`}>
          <div className="px-6 py-5 border-b border-slate-100 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Cloud className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-semibold text-slate-800">Data Backend</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <BackendFreshness compact />
              {isSupabaseMode && (
                <Button
                  variant="secondary"
                  onClick={() => pullBackendNow({ force: backend.hasRemoteUpdate, silent: false })}
                  disabled={!backendStatus.ready || backend.isLoading || backend.isPulling || backend.isSaving}
                  className="min-h-9 px-3 py-1.5 text-xs"
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', backend.isPulling && 'animate-spin')} />
                  Check now
                </Button>
              )}
              <Badge tone={backendStatus.ready ? 'emerald' : 'amber'}>
                {backendStatus.mode === 'supabase' ? 'Supabase' : 'Local'}
              </Badge>
            </div>
          </div>
          <div className="p-6 grid grid-cols-1 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Status</p>
              <p className="mt-1 font-semibold text-slate-900">
                {backend.isLoading ? 'Loading workspace...' : backend.isPulling ? 'Checking latest workspace...' : backend.isSaving ? 'Saving changes...' : backend.message}
              </p>
              {backend.error && <p className="mt-2 text-red-600">{backend.error}</p>}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Supabase Table</p>
              <p className="mt-1 font-semibold text-slate-900">{backendStatus.stateTable}</p>
              <p className="mt-1 text-slate-500">Snapshot ID: {backendStatus.stateId}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Last Pull</p>
              <p className="mt-1 font-semibold text-slate-900">
                {backend.lastPulledAt ? new Date(backend.lastPulledAt).toLocaleString() : 'Not checked yet'}
              </p>
              {backend.remoteVersion && (
                <p className="mt-1 text-slate-500">Remote version: {backend.remoteVersion}</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Last Save</p>
              <p className="mt-1 font-semibold text-slate-900">
                {backend.lastSyncedAt ? new Date(backend.lastSyncedAt).toLocaleString() : 'Not synced yet'}
              </p>
              {backendStatus.missing.length > 0 && (
                <p className="mt-1 text-slate-500">Missing: {backendStatus.missing.join(', ')}</p>
              )}
            </div>
          </div>

          <div className="border-t border-slate-100 px-6 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">Supabase readiness</p>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                  {hostedLocalBuild
                    ? 'This hosted build is running with local browser storage. Add the Supabase environment variables in Vercel, then redeploy.'
                    : isSupabaseMode
                    ? backendStatus.ready
                      ? 'The app is configured to read and write the shared Supabase snapshot.'
                      : 'Supabase mode is selected, but required environment variables are missing.'
                    : 'The app is running locally. Set Supabase mode in deployment to share live workspace data.'}
                </p>
              </div>
              {backend.error ? (
                <div className="flex items-start gap-2 text-sm text-amber-700 lg:max-w-md">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{backend.error}</span>
                </div>
              ) : null}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
              {backendSetupItems.map(item => {
                const Icon = item.done ? CheckCircle2 : AlertTriangle;
                return (
                  <div key={item.label} className="flex items-start gap-2 border-t border-slate-100 pt-3">
                    <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', item.done ? 'text-emerald-600' : 'text-amber-500')} />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{item.label}</p>
                      <p className="mt-1 break-words text-sm font-medium text-slate-800">{item.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard title="Visible Tasks" value={visibleTasks.length} icon={Database} tone="indigo" />
        <MetricCard title="Visible Projects" value={visibleProjects.length} icon={Database} tone="emerald" />
        <MetricCard title="Unread Notices" value={unreadCount} icon={Bell} tone="amber" />
        {isSuperAdmin && (
          <MetricCard
            title="Backend"
            value={backendStatus.mode === 'supabase' ? 'Supabase' : 'Local'}
            icon={Cloud}
            tone={backendStatus.ready ? 'blue' : 'amber'}
            footer={backendStatus.ready ? 'Configured' : 'Needs env keys'}
          />
        )}
      </div>
    </div>
  );
};

export default Settings;
