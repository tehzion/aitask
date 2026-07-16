import React from 'react';
import { AlertTriangle, ArrowRight, Bell, CheckCircle2, Cloud, Database, Lock, PackageCheck, RefreshCw, ShieldCheck, SlidersHorizontal, Trash2, Upload, UserCircle, Volume2, VolumeX, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { Badge, Button, MetricCard, PageHeader } from '../components/ui';
import { cardBase, inputBase, pageShell } from '../components/uiTokens';
import { getEffectivePermissions, getEffectiveRoleName, getVisibleProjects, getVisibleTasks, isNotificationReadByUser, isNotificationVisible, permissionLabels, isBossKoo } from '../lib/access';
import { getBackendStatus } from '../lib/backend';
import { cn } from '../lib/utils';
import MfaSettings from '../components/MfaSettings';
import { shouldUseSecureSupabase } from '../lib/supabaseClient';
import BackendFreshness from '../components/BackendFreshness';
import { getSoundEnabled, setSoundEnabled } from '../lib/sounds';
import { canUsePasswordResetBypass, enablePasswordResetBypass } from '../lib/auth';
import { APP_BUILD_CHANNEL, APP_BUILD_LABEL, APP_BUILD_TIME, APP_COMMIT, APP_VERSION_LABEL } from '../lib/appVersion';

const AVATAR_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_UPLOAD_SIZE = 320;
const AVATAR_UPLOAD_QUALITY = 0.86;
const AVATAR_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === 'string') resolve(reader.result);
    else reject(new Error('Could not read the selected image.'));
  };
  reader.onerror = () => reject(new Error('Could not read the selected image.'));
  reader.readAsDataURL(file);
});

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('The selected file is not a readable image.'));
  image.src = src;
});

const resizeAvatarImage = async (file: File) => {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) throw new Error('This browser cannot prepare the avatar image.');

  canvas.width = AVATAR_UPLOAD_SIZE;
  canvas.height = AVATAR_UPLOAD_SIZE;

  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = Math.max(0, (image.naturalWidth - sourceSize) / 2);
  const sourceY = Math.max(0, (image.naturalHeight - sourceSize) / 2);

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, AVATAR_UPLOAD_SIZE, AVATAR_UPLOAD_SIZE);
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    AVATAR_UPLOAD_SIZE,
    AVATAR_UPLOAD_SIZE,
  );

  return canvas.toDataURL('image/jpeg', AVATAR_UPLOAD_QUALITY);
};

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
    commitPendingMutation,
  } = useStore();
  const isSuperAdmin = isBossKoo(currentUser);
  const isClientUser = currentUser?.role === 'Client';
  const [profileName, setProfileName] = React.useState(currentUser?.name || '');
  const [profileEmail, setProfileEmail] = React.useState(currentUser?.email || '');
  const [avatarUrl, setAvatarUrl] = React.useState(currentUser?.avatar || '');
  const [profileMessage, setProfileMessage] = React.useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [avatarUploadMessage, setAvatarUploadMessage] = React.useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [isPreparingAvatar, setIsPreparingAvatar] = React.useState(false);
  const avatarFileInputRef = React.useRef<HTMLInputElement>(null);
  const [soundEnabled, setSoundEnabledState] = React.useState(getSoundEnabled);
  const [passwordForm, setPasswordForm] = React.useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordMessage, setPasswordMessage] = React.useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [newStatusInput, setNewStatusInput] = React.useState('');
  const [statusError, setStatusError] = React.useState('');
  const [isProfileSaving, setIsProfileSaving] = React.useState(false);
  const [isStatusSaving, setIsStatusSaving] = React.useState(false);
  const [hasPendingStatusAdd, setHasPendingStatusAdd] = React.useState(false);

  const handleStatusAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasPendingStatusAdd) {
      const result = addTaskStatus(newStatusInput);
      if (!result.ok) {
        setStatusError(result.error || 'Failed to add status.');
        return;
      }
    }

    setIsStatusSaving(true);
    const saved = await commitPendingMutation();
    setIsStatusSaving(false);
    if (!saved.ok) {
      setHasPendingStatusAdd(true);
      setStatusError(saved.error || 'The status is waiting to be saved. Use Retry required to try again.');
      return;
    }

    setHasPendingStatusAdd(false);
    setNewStatusInput('');
    setStatusError('');
  };

  const handleDeleteStatus = async (status: string) => {
    const previousStatuses = useStore.getState().taskStatuses;
    const result = deleteTaskStatus(status);
    if (!result.ok) {
      setStatusError(result.error || 'Failed to delete status.');
      return;
    }

    setIsStatusSaving(true);
    const saved = await commitPendingMutation();
    setIsStatusSaving(false);
    if (!saved.ok) {
      useStore.setState({ taskStatuses: previousStatuses });
      setStatusError(saved.error || 'The status could not be deleted.');
      return;
    }

    setStatusError('');
  };

  const backendStatus = getBackendStatus();
  const visibleTasks = getVisibleTasks(currentUser, tasks, rolePermissions);
  const visibleProjects = getVisibleProjects(currentUser, projects, tasks, rolePermissions);
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
    ? `Manage your login details and review ${currentUser.companyName || 'your company'} account access.`
    : 'Review your profile, workspace scope, and backend sync state.';
  const profileChanged = (
    profileName.trim() !== (currentUser?.name || '') ||
    profileEmail.trim() !== (currentUser?.email || '') ||
    avatarUrl.trim() !== (currentUser?.avatar || '')
  );
  const isUploadedAvatar = avatarUrl.startsWith('data:image/');
  const passwordChanged = Boolean(passwordForm.currentPassword || passwordForm.newPassword || passwordForm.confirmPassword);
  const mustResetPassword = Boolean(currentUser?.mustResetPassword);
  const canBypassPasswordReset = mustResetPassword && canUsePasswordResetBypass();
  const isSupabaseMode = backendStatus.mode === 'supabase';
  const hostedLocalBuild = backendStatus.mode === 'local' && backendStatus.isHostedRuntime;
  const hasSupabaseKey = isSupabaseMode && !backendStatus.missing.includes('VITE_SUPABASE_PUBLISHABLE_KEY');
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
      detail: hasSupabaseKey ? 'Client key is configured.' : 'Set VITE_SUPABASE_PUBLISHABLE_KEY.',
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
    setProfileEmail(currentUser?.email || '');
    setAvatarUrl(currentUser?.avatar || '');
    setProfileMessage(null);
    setAvatarUploadMessage(null);
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setPasswordMessage(null);
  }, [currentUser?.id, currentUser?.name, currentUser?.email, currentUser?.avatar]);

  const handleProfileSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = updateCurrentUserProfile({
      name: profileName,
      email: profileEmail,
      avatar: avatarUrl,
    });

    if (!result.ok) {
      setProfileMessage({ tone: 'error', text: result.error || 'Profile could not be updated.' });
      return;
    }

    setIsProfileSaving(true);
    const saved = await commitPendingMutation();
    setIsProfileSaving(false);
    setProfileMessage({
      tone: saved.ok ? 'success' : 'error',
      text: saved.ok ? 'Profile updated.' : saved.error || 'Profile is waiting to be saved. Use Retry required to try again.',
    });
    if (saved.ok) setAvatarUploadMessage(null);
  };

  const resetProfileForm = () => {
    setProfileName(currentUser?.name || '');
    setProfileEmail(currentUser?.email || '');
    setAvatarUrl(currentUser?.avatar || '');
    setProfileMessage(null);
    setAvatarUploadMessage(null);
  };

  const useGeneratedAvatar = () => {
    const seed = encodeURIComponent((profileName || currentUser?.name || 'AiTask User').replace(/\s/g, ''));
    setAvatarUrl(`https://i.pravatar.cc/150?u=${seed}`);
    setProfileMessage(null);
    setAvatarUploadMessage(null);
  };

  const clearAvatar = () => {
    setAvatarUrl('');
    setProfileMessage(null);
    setAvatarUploadMessage(null);
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    setProfileMessage(null);
    setAvatarUploadMessage(null);

    if (!AVATAR_ALLOWED_TYPES.has(file.type)) {
      setAvatarUploadMessage({
        tone: 'error',
        text: 'Choose a JPG, PNG, WebP, or GIF image.',
      });
      return;
    }

    if (file.size > AVATAR_UPLOAD_MAX_BYTES) {
      setAvatarUploadMessage({
        tone: 'error',
        text: 'Photo must be 5 MB or smaller.',
      });
      return;
    }

    try {
      setIsPreparingAvatar(true);
      const resizedAvatar = await resizeAvatarImage(file);
      setAvatarUrl(resizedAvatar);
      setAvatarUploadMessage({
        tone: 'success',
        text: 'Photo ready. Save profile to apply it.',
      });
    } catch (error) {
      setAvatarUploadMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Could not prepare that photo.',
      });
    } finally {
      setIsPreparingAvatar(false);
    }
  };

  const updatePasswordField = (field: keyof typeof passwordForm, value: string) => {
    setPasswordForm(current => ({ ...current, [field]: value }));
    setPasswordMessage(null);
  };

  const handlePasswordSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const wasResetRequired = mustResetPassword;
    const result = await updateCurrentUserPassword(passwordForm);

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

  const handlePasswordResetBypass = () => {
    if (!currentUser) return;

    const bypassEnabled = enablePasswordResetBypass(currentUser.id);
    if (!bypassEnabled) {
      setPasswordMessage({
        tone: 'error',
        text: 'Temporary access is not enabled for this environment.',
      });
      return;
    }

    setPasswordMessage({
      tone: 'success',
      text: 'Opening the workspace for this browser session...',
    });
    navigate('/', { replace: true });
  };

  return (
    <div className={pageShell}>
      <PageHeader
        title={mustResetPassword ? 'Account Setup' : 'Settings'}
        description={mustResetPassword ? 'Set your own password to unlock the workspace.' : scopeDescription}
      />

      {mustResetPassword && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-amber-700">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <p className="font-bold">Password reset required</p>
                <p className="mt-1 text-sm leading-6 text-amber-800">
                  Use the default password once as the current password, then choose a private password with at least 12 characters.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 lg:items-end">
              <Badge tone="amber" className="self-start lg:self-end">Required</Badge>
              {canBypassPasswordReset && (
                <Button type="button" variant="secondary" onClick={handlePasswordResetBypass} className="min-h-9 whitespace-nowrap px-3 py-1.5 text-xs">
                  Continue for now
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-3">
          <h2 className="text-lg font-semibold text-slate-950">Account</h2>
          <p className="mt-1 text-sm text-slate-500">Profile, sign-in security, and your current access.</p>
        </div>
        <div className={`xl:col-span-2 ${cardBase} overflow-hidden`}>
          <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
            <UserCircle className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-slate-800">Profile</h2>
          </div>
          <form onSubmit={handleProfileSave} className="p-6 space-y-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
              <div className="flex flex-col items-start gap-3 lg:w-64 lg:shrink-0">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={`${profileName || currentUser?.name || 'User'} avatar preview`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-400">
                      <UserCircle className="h-9 w-9" />
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={avatarFileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => avatarFileInputRef.current?.click()}
                    disabled={isPreparingAvatar}
                    className="min-h-9 px-3 py-1.5"
                  >
                    <Upload className="h-4 w-4" />
                    {isPreparingAvatar ? 'Preparing...' : 'Upload photo'}
                  </Button>
                  <Button type="button" variant="secondary" onClick={useGeneratedAvatar} className="min-h-9 px-3 py-1.5">
                    Generate
                  </Button>
                  {avatarUrl && (
                    <Button type="button" variant="ghost" onClick={clearAvatar} className="min-h-9 px-3 py-1.5 text-red-600 hover:bg-red-50 hover:text-red-700">
                      <X className="h-4 w-4" />
                      Remove
                    </Button>
                  )}
                </div>
                <p className="text-xs leading-5 text-slate-500">
                  JPG, PNG, WebP, or GIF. Photos are resized before saving.
                </p>
                {avatarUploadMessage && (
                  <p className={cn(
                    'text-xs font-medium leading-5',
                    avatarUploadMessage.tone === 'success' ? 'text-emerald-700' : 'text-red-600'
                  )} role={avatarUploadMessage.tone === 'error' ? 'alert' : 'status'} aria-live="polite">
                    {avatarUploadMessage.text}
                  </p>
                )}
              </div>

              <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
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
                <div>
                  <label htmlFor="profile-email" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Email</label>
                  <input
                    id="profile-email"
                    type="email"
                    value={profileEmail}
                    onChange={event => {
                      setProfileEmail(event.target.value);
                      setProfileMessage(null);
                    }}
                    className={cn(inputBase, 'px-3 py-2.5')}
                    placeholder="name@company.com"
                    autoComplete="email"
                    maxLength={320}
                  />
                </div>
                <div className="lg:col-span-2">
                  <label htmlFor="profile-avatar" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    {isUploadedAvatar ? 'Avatar source' : 'Avatar URL'}
                  </label>
                  <input
                    id="profile-avatar"
                    value={isUploadedAvatar ? 'Uploaded photo stored with profile' : avatarUrl}
                    onChange={event => {
                      setAvatarUrl(event.target.value);
                      setProfileMessage(null);
                      setAvatarUploadMessage(null);
                    }}
                    readOnly={isUploadedAvatar}
                    className={cn(inputBase, 'px-3 py-2.5')}
                    placeholder="Upload a photo, generate an avatar, or use a Supabase image URL"
                    autoComplete="url"
                  />
                  {isUploadedAvatar && (
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Remove the uploaded photo if you want to paste a web image URL instead.
                    </p>
                  )}
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
                <div className="lg:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Client Company</label>
                  <p className="font-semibold text-slate-900">{currentUser?.companyName || 'Not linked'}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-h-5 text-sm">
                {profileMessage && (
                  <p className={profileMessage.tone === 'success' ? 'text-emerald-700' : 'text-red-600'} role={profileMessage.tone === 'error' ? 'alert' : 'status'} aria-live="polite">
                    {profileMessage.text}
                  </p>
                )}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" onClick={resetProfileForm} disabled={!profileChanged || isProfileSaving}>
                  Reset
                </Button>
                <Button type="submit" disabled={!profileChanged || isProfileSaving}>
                  {isProfileSaving ? 'Saving...' : 'Save profile'}
                </Button>
              </div>
            </div>
          </form>

          <form onSubmit={handlePasswordSave} className="border-t border-slate-100 p-6">
            <div className="mb-4 flex items-center gap-3">
              <Lock className="h-5 w-5 text-blue-600" />
              <div>
                <h3 className="text-base font-semibold text-slate-900">{mustResetPassword ? 'Reset Password' : 'Password'}</h3>
                <p className="text-sm text-slate-500">
                  {mustResetPassword
                    ? 'Set your own password before continuing to the workspace.'
                    : 'Update the login password for this user profile.'}
                </p>
              </div>
            </div>

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
                  minLength={12}
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
                  minLength={12}
                  required
                />
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-h-5 text-sm">
                {passwordMessage && (
                  <p className={passwordMessage.tone === 'success' ? 'text-emerald-700' : 'text-red-600'} role={passwordMessage.tone === 'error' ? 'alert' : 'status'} aria-live="polite">
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

      {shouldUseSecureSupabase() && (currentUser?.role === 'Admin' || currentUser?.isSuperAdmin) && <MfaSettings />}

      {isClientUser ? (
          <div className={`${cardBase} overflow-hidden`}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-slate-800">Client Access</h2>
            </div>
            <div className="p-6 space-y-4 text-sm text-slate-600">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Company</p>
                <p className="mt-1 text-base font-semibold text-slate-900">{currentUser?.companyName || 'Not linked'}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Tasks</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{visibleTasks.length}</p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Companies</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{visibleProjects.length}</p>
                </div>
              </div>
              <p className="leading-6">
                You can check task progress, leave feedback on your company tasks, and approve or request revisions when work is ready for review.
              </p>
              <Button type="button" variant="secondary" onClick={() => navigate('/tasks')} className="w-full justify-center">
                View company tasks
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className={`${cardBase} overflow-hidden`}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-slate-800">Permissions</h2>
            </div>
            <div className="p-6 space-y-3 text-sm text-slate-600">
              <p><strong className="text-slate-800">Boss Koo:</strong> has super admin access to add members, manage users, approve registrations, companies, and all task workflows.</p>
              <p><strong className="text-slate-800">Admin:</strong> can create and edit all tasks and companies.</p>
              <p><strong className="text-slate-800">Staff and Finance:</strong> can create tasks for internal teammates, update tasks they created or are assigned to, and see companies they participate in.</p>
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
        )}

        <div className="border-t border-slate-200 pt-6 xl:col-span-3">
          <h2 className="text-lg font-semibold text-slate-950">Workspace</h2>
          <p className="mt-1 text-sm text-slate-500">Notifications, workflow preferences, and operational status.</p>
        </div>

        {/* Sound Notifications */}
        <div className={`${cardBase} overflow-hidden`}>
          <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
            {soundEnabled ? <Volume2 className="w-5 h-5 text-blue-600" /> : <VolumeX className="w-5 h-5 text-slate-400" />}
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
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
                soundEnabled ? 'bg-blue-600' : 'bg-slate-200'
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
              <SlidersHorizontal className="w-5 h-5 text-blue-600" />
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
                          'bg-slate-400'
                        }`} />
                        <span className="text-sm font-semibold text-slate-700 truncate">{status}</span>
                        {isDefault ? (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-bold uppercase tracking-wider shrink-0">
                            <Lock className="w-2.5 h-2.5" /> System
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 font-bold uppercase tracking-wider shrink-0">
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
                            onClick={() => void handleDeleteStatus(status)}
                            disabled={isStatusSaving}
                            className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors hover:bg-red-50"
                            title={`Delete ${status}`}
                            aria-label={`Delete ${status}`}
                          >
                            <Trash2 className="h-4 w-4" />
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
                  <Button type="submit" disabled={!newStatusInput.trim() || isStatusSaving}>
                    {isStatusSaving ? 'Saving...' : 'Add Status'}
                  </Button>
                </form>
                {statusError && (
                  <p className="mt-2 text-xs text-red-600" role="alert" aria-live="polite">{statusError}</p>
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
              <Cloud className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-slate-800">Data Backend</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <BackendFreshness compact />
              {isSupabaseMode && (
                <Button
                  variant="secondary"
                  onClick={() => pullBackendNow({ silent: false })}
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
                {backend.status === 'loading' ? 'Checking latest workspace...' : backend.status === 'saving' ? 'Saving changes...' : backend.message}
              </p>
              {backend.error && <p className="mt-2 text-red-600" role="alert" aria-live="polite">{backend.error}</p>}
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
                {backend.lastSavedAt || backend.lastSyncedAt
                  ? new Date(backend.lastSavedAt || backend.lastSyncedAt || '').toLocaleString()
                  : 'Not synced yet'}
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
                      ? 'The app is using versioned Supabase workspace commands with row-scoped access.'
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

      {!isClientUser && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <MetricCard title="Visible Tasks" value={visibleTasks.length} icon={Database} tone="indigo" />
          <MetricCard title="Visible Companies" value={visibleProjects.length} icon={Database} tone="emerald" />
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
      )}

      <section className={`${cardBase} overflow-hidden`}>
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <PackageCheck className="h-5 w-5 text-blue-600" />
          <h2 className="text-base font-semibold text-slate-900">Application release</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 px-5 py-4 text-sm lg:grid-cols-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Release</p>
            <p className="mt-1 font-semibold text-slate-900">{APP_VERSION_LABEL}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Build</p>
            <p className="mt-1 font-mono font-semibold text-slate-900">{APP_COMMIT}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Channel</p>
            <p className="mt-1 font-semibold capitalize text-slate-900">{APP_BUILD_CHANNEL}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Built</p>
            <p className="mt-1 font-semibold text-slate-900">{new Date(APP_BUILD_TIME).toLocaleString()}</p>
          </div>
        </div>
        <div className="border-t border-slate-100 px-5 py-2.5">
          <p className="font-mono text-[11px] text-slate-400">{APP_BUILD_LABEL}</p>
        </div>
      </section>
    </div>
  );
};

export default Settings;
