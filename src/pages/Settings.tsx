import { useSaveAction } from '../hooks/useSaveAction';
import DiagnosticsPanel from '../components/DiagnosticsPanel';
import UploadRecoveryPanel from '../components/UploadRecoveryPanel';
import { clearWorkspaceSession } from '../store';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import React from 'react';
import { AlertTriangle, ArrowRight, Bell, CheckCircle2, Cloud, Database, Download, Lock, PackageCheck, RefreshCw, ShieldCheck, SlidersHorizontal, Trash2, Upload, UserCircle, Volume2, VolumeX, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStore, selectPersistedWorkspaceState } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { useToastStore } from '../store/useToastStore';
import { useI18n } from '../components/I18nProvider';
import type { User } from '../types';
import { getMemberDepartments } from '../lib/departments';
import { Badge, Button, MetricCard, PageHeader } from '../components/ui';
import { cardBase, inputBase, pageShell } from '../components/uiTokens';
import { canManageServiceCatalog, canManageTaskTemplates, getDefaultAccessiblePath, getEffectivePermissions, getEffectiveRoleName, getRoleDisplayName, getVisibleProjects, getVisibleTasks, isNotificationReadByUser, isNotificationVisible, permissionLabels, isBossKoo } from '../lib/access';
import { getBackendStatus } from '../lib/backend';
import { cn } from '../lib/utils';
import { formatLocalizedDateTime } from '../lib/i18n';
import BackendFreshness from '../components/BackendFreshness';
import { getSoundEnabled, setSoundEnabled, SOUND_PREF_EVENT } from '../lib/sounds';
import { canUsePasswordResetBypass, enablePasswordResetBypass, hasPasswordResetBypass } from '../lib/auth';
import { APP_BUILD_CHANNEL, APP_BUILD_LABEL, APP_BUILD_TIME, APP_COMMIT, APP_VERSION_LABEL } from '../lib/appVersion';
import { shouldUseSecureSupabase, signOutSecureSession } from '../lib/supabaseClient';
import { getRetainedSecureCommand } from '../lib/secureWorkspace';
import ServicePackageManager from '../components/ServicePackageManager';
import WorkflowTemplateManager from '../components/WorkflowTemplateManager';
import { isLocalServiceDemoEnabled } from '../mock/localServiceDemo';
import ConfirmDialog from '../components/ConfirmDialog';

const AVATAR_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_UPLOAD_SIZE = 320;
const AVATAR_UPLOAD_MAX_DATA_URL_LENGTH = 60_000;
const AVATAR_UPLOAD_QUALITIES = [0.84, 0.72, 0.6, 0.48, 0.36, 0.24];
const AVATAR_UPLOAD_SIZES = [AVATAR_UPLOAD_SIZE, 256, 192, 160, 128];
const AVATAR_ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);
const AVATAR_ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

const hasSupportedAvatarType = (file: File) => {
  if (AVATAR_ALLOWED_TYPES.has(file.type.toLowerCase())) return true;
  const extension = file.name.split('.').pop()?.toLowerCase();
  return !file.type && Boolean(extension && AVATAR_ALLOWED_EXTENSIONS.has(extension));
};

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

  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = Math.max(0, (image.naturalWidth - sourceSize) / 2);
  const sourceY = Math.max(0, (image.naturalHeight - sourceSize) / 2);

  for (const size of AVATAR_UPLOAD_SIZES) {
    canvas.width = size;
    canvas.height = size;

    for (const quality of AVATAR_UPLOAD_QUALITIES) {
      context.clearRect(0, 0, size, size);
      context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
      const webp = canvas.toDataURL('image/webp', quality);
      if (webp.length <= AVATAR_UPLOAD_MAX_DATA_URL_LENGTH) return webp;

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size, size);
      context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
      const jpeg = canvas.toDataURL('image/jpeg', quality);
      if (jpeg.length <= AVATAR_UPLOAD_MAX_DATA_URL_LENGTH) return jpeg;
    }
  }

  throw new Error('This photo is too detailed to save. Choose a smaller image and try again.');
};

const Settings: React.FC = () => {
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const {
    currentUser,
    tasks,
    projects,
    clientProfiles,
    notifications,
    notificationUnreadCount,
    backend,
    rolePermissions,
    updateCurrentUserProfile,
    updateCurrentUserEmail,
    updateCurrentUserPassword,
    pullBackendNow,
    taskStatuses,
    addTaskStatus,
    deleteTaskStatus,
    commitPendingMutation,
    discardMutation,
    resetLocalServiceDemo,
  } = useStore(useShallow(state => ({
    currentUser: state.currentUser,
    tasks: state.tasks,
    projects: state.projects,
    clientProfiles: state.clients,
    notifications: state.notifications,
    notificationUnreadCount: state.notificationUnreadCount,
    backend: state.backend,
    rolePermissions: state.rolePermissions,
    updateCurrentUserProfile: state.updateCurrentUserProfile,
    updateCurrentUserEmail: state.updateCurrentUserEmail,
    updateCurrentUserPassword: state.updateCurrentUserPassword,
    pullBackendNow: state.pullBackendNow,
    taskStatuses: state.taskStatuses,
    addTaskStatus: state.addTaskStatus,
    deleteTaskStatus: state.deleteTaskStatus,
    commitPendingMutation: state.commitPendingMutation,
    discardMutation: state.discardMutation,
    resetLocalServiceDemo: state.resetLocalServiceDemo,
  })));
  const isSuperAdmin = isBossKoo(currentUser);
  const isClientUser = currentUser?.role === 'Client';
  const [profileName, setProfileName] = React.useState(currentUser?.name || '');
  const [profileEmail, setProfileEmail] = React.useState(currentUser?.email || '');
  const [profileCurrentPassword, setProfileCurrentPassword] = React.useState('');
  const [avatarUrl, setAvatarUrl] = React.useState(currentUser?.avatar || '');
  const [profileMessage, setProfileMessage] = React.useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [avatarUploadMessage, setAvatarUploadMessage] = React.useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const { busy: isPreparingAvatar, run: runAvatar } = useSaveAction();
  const [avatarPreviewFailed, setAvatarPreviewFailed] = React.useState(false);
  const [profileRetryDraft, setProfileRetryDraft] = React.useState<Pick<User, 'name' | 'email' | 'avatar'> | null>(null);
  const avatarFileInputRef = React.useRef<HTMLInputElement>(null);
  const profileFormRef = React.useRef<HTMLFormElement>(null);
  const [soundEnabled, setSoundEnabledState] = React.useState(getSoundEnabled);

  React.useEffect(() => {
    const handleSoundPreference = (event: Event) => {
      const enabled = (event as CustomEvent<boolean>).detail;
      setSoundEnabledState(enabled);
    };
    window.addEventListener(SOUND_PREF_EVENT, handleSoundPreference);
    return () => window.removeEventListener(SOUND_PREF_EVENT, handleSoundPreference);
  }, []);
  const [passwordForm, setPasswordForm] = React.useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordMessage, setPasswordMessage] = React.useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [newStatusInput, setNewStatusInput] = React.useState('');
  const [statusError, setStatusError] = React.useState('');
  const { busy: isProfileSaving, run: runProfile } = useSaveAction();
  const { busy: isPasswordSaving, run: runPassword } = useSaveAction();
  const { busy: isStatusSaving, run: runStatus } = useSaveAction();
  const pendingStatus = React.useRef<{ kind: 'add' | 'delete'; name: string; raw: string } | null>(null);
  const [hasPendingStatusAdd, setHasPendingStatusAdd] = React.useState(false);
  const [localDemoMessage, setLocalDemoMessage] = React.useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [confirmation, setConfirmation] = React.useState<{
    title: string;
    description: string;
    confirmLabel: string;
    action: () => void | Promise<void>;
  } | null>(null);
  const [isConfirming, setIsConfirming] = React.useState(false);
  const confirmationTitleId = React.useId();

  const confirmStatus = async (retry = false) => {
    const submitted = pendingStatus.current;
    if (!submitted) return;
    const saved = await runStatus(() => retry && shouldUseSecureSupabase() ? useStore.getState().retryPendingSave() : commitPendingMutation());
    if (!saved) return;
    if (!saved.ok) { setStatusError(saved.error || t('The change is waiting to be saved.')); return; }
    const present = useStore.getState().taskStatuses.includes(submitted.name);
    pendingStatus.current = null;
    setHasPendingStatusAdd(false);
    if (present !== (submitted.kind === 'add')) {
      setStatusError(t('The pending status change is no longer available. Review your draft before saving again.'));
      return;
    }
    if (submitted.kind === 'add') setNewStatusInput(current => current === submitted.raw ? '' : current);
    setStatusError('');
    useToastStore.getState().addToast(t(submitted.kind === 'add' ? 'Status added successfully' : `Status "${submitted.name}" deleted successfully`), 'success');
  };

  const handleStatusAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isStatusSaving) return;
    const retry = Boolean(pendingStatus.current);
    if (!pendingStatus.current) {
      const result = addTaskStatus(newStatusInput);
      if (!result.ok) { setStatusError(result.error || 'Failed to add status.'); return; }
      pendingStatus.current = { kind: 'add', name: newStatusInput.trim(), raw: newStatusInput };
      setHasPendingStatusAdd(true);
    }
    await confirmStatus(retry);
  };

  const handleDeleteStatus = async (status: string) => {
    if (isStatusSaving || pendingStatus.current) return;
    setConfirmation({ title: t(`Delete the "${status}" status?`),
      description: t('Tasks using another status are not changed.'), confirmLabel: t('Delete status'),
      action: async () => {
        const result = deleteTaskStatus(status);
        if (!result.ok) { setStatusError(result.error || 'Failed to delete status.'); return; }
        pendingStatus.current = { kind: 'delete', name: status, raw: '' };
        setHasPendingStatusAdd(true);
        await confirmStatus();
      },
    });
  };

  const backendStatus = getBackendStatus();
  const visibleTasks = getVisibleTasks(currentUser, tasks, rolePermissions, { clients: clientProfiles, projects });
  const visibleProjects = getVisibleProjects(currentUser, projects, tasks, rolePermissions, { clients: clientProfiles, projects });
  const effectivePermissions = getEffectivePermissions(currentUser, rolePermissions);
  const effectiveRoleName = getEffectiveRoleName(currentUser, rolePermissions);
  const enabledPermissions = Object.entries(effectivePermissions)
    .filter(([, enabled]) => enabled)
    .map(([key]) => permissionLabels[key as keyof typeof permissionLabels]);
  const loadedUnreadCount = notifications.filter(notification => (
    isNotificationVisible(currentUser, notification) &&
    !isNotificationReadByUser(currentUser, notification)
  )).length;
  const unreadCount = shouldUseSecureSupabase() ? notificationUnreadCount : loadedUnreadCount;
  const scopeDescription = currentUser?.role === 'Client'
    ? `Manage your login details and review ${currentUser.companyName || 'your company'} account access.`
    : 'Review your profile, workspace scope, and backend sync state.';
  const profileChanged = (
    profileName.trim() !== (currentUser?.name || '') ||
    profileEmail.trim() !== (currentUser?.email || '') ||
    avatarUrl.trim() !== (currentUser?.avatar || '')
  );
  const avatarChanged = avatarUrl.trim() !== (currentUser?.avatar || '');
  const profileEmailChanged = profileEmail.trim().toLowerCase() !== (currentUser?.email || '').trim().toLowerCase();
  const isUploadedAvatar = avatarUrl.startsWith('data:image/');
  const passwordChanged = Boolean(passwordForm.currentPassword || passwordForm.newPassword || passwordForm.confirmPassword);
  useUnsavedChanges(profileChanged || passwordChanged || Boolean(profileCurrentPassword) || isProfileSaving || isPasswordSaving || isPreparingAvatar || hasPendingStatusAdd || Boolean(newStatusInput.trim()));
  const mustResetPassword = Boolean(currentUser?.mustResetPassword);
  const canBypassPasswordReset = mustResetPassword && canUsePasswordResetBypass();
  const bypassActive = currentUser ? hasPasswordResetBypass(currentUser.id) : false;
  const isPasswordSetupOnly = mustResetPassword && !bypassActive;
  const canResetLocalDemo = !isPasswordSetupOnly && currentUser?.role === 'Project Manager' && isLocalServiceDemoEnabled();
  const secureAccounts = shouldUseSecureSupabase();
  const defaultAccessiblePath = getDefaultAccessiblePath(currentUser, rolePermissions);
  const completeSignOut = async () => {
    clearWorkspaceSession({ discardPending: true });
    if (secureAccounts) {
      await signOutSecureSession();
    }
    navigate('/login', { replace: true });
  };
  const handleSettingsSignOut = () => {
    const hasPendingChange = backend.pendingMutations > 0 || getRetainedSecureCommand() !== null;
    if (secureAccounts && hasPendingChange) {
      setConfirmation({
        title: t('Sign out with an unsaved change?'),
        description: t('Your pending change in this browser tab will be permanently discarded.'),
        confirmLabel: t('Sign out anyway'),
        action: completeSignOut,
      });
      return;
    }
    void completeSignOut();
  };
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
    setProfileCurrentPassword('');
    setAvatarUrl(currentUser?.avatar || '');
    setAvatarPreviewFailed(false);
    setProfileMessage(null);
    setAvatarUploadMessage(null);
    setProfileRetryDraft(null);
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setPasswordMessage(null);
    pendingStatus.current = null; setHasPendingStatusAdd(false); setStatusError(''); setNewStatusInput('');
    setConfirmation(null);
    // Account identity owns the draft; profile refreshes must not erase it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  const saveProfileChanges = async () => {
    if (isProfileSaving || isPreparingAvatar) return;
    const submitted = profileRetryDraft || { name: profileName, email: profileEmail, avatar: avatarUrl };
    let staged = Boolean(profileRetryDraft);
    const saved = await runProfile(async isCurrent => {
      if (!staged) {
        const emailChanged = submitted.email?.trim().toLowerCase() !== (currentUser?.email || '').trim().toLowerCase();
        if (backend.mode === 'supabase' && emailChanged) {
          const result = await updateCurrentUserEmail(submitted.email || '', profileCurrentPassword);
          if (!isCurrent() || !result.ok) return result;
          setProfileCurrentPassword('');
        }
        const result = updateCurrentUserProfile(submitted);
        if (!result.ok) return result;
        staged = true;
      }
      return profileRetryDraft && shouldUseSecureSupabase() ? useStore.getState().retryPendingSave() : commitPendingMutation();
    });
    if (!saved) return;
    if (!saved.ok) {
      if (staged) setProfileRetryDraft(submitted);
      setProfileMessage({ tone: 'error', text: saved.error || t('Profile is waiting to be saved. Use Retry required to try again.') });
      return;
    }
    const latest = useStore.getState().currentUser;
    setProfileRetryDraft(null);
    if (!latest || latest.name !== submitted.name.trim() || (latest.email || '').toLowerCase() !== (submitted.email || '').trim().toLowerCase() || (latest.avatar || '') !== (submitted.avatar || '').trim()) {
      setProfileMessage({ tone: 'error', text: t('The pending profile change is no longer available. Review your draft before saving again.') });
      return;
    }
    setProfileMessage({ tone: 'success', text: t('Profile updated.') });
    setAvatarUploadMessage(null);
  };

  const handleProfileSave = async (event: React.FormEvent) => {
    event.preventDefault();
    await saveProfileChanges();
  };

  const retryProfileSave = () => { if (profileRetryDraft && !isProfileSaving) void saveProfileChanges(); };

  const discardPendingProfileChange = async () => {
    const result = await runProfile(async () => { await discardMutation(); return { ok: true, error: undefined }; });
    if (!result) return;
    if (!result.ok) { setProfileMessage({ tone: 'error', text: result.error }); return; }
    resetProfileForm();
  };

  const resetProfileForm = () => {
    setProfileName(currentUser?.name || '');
    setProfileEmail(currentUser?.email || '');
    setProfileCurrentPassword('');
    setAvatarUrl(currentUser?.avatar || '');
    setAvatarPreviewFailed(false);
    setProfileRetryDraft(null);
    setProfileMessage(null);
    setAvatarUploadMessage(null);
  };

  const useGeneratedAvatar = () => {
    const seed = encodeURIComponent((profileName || currentUser?.name || 'AiTask User').replace(/\s/g, ''));
    setAvatarUrl(`https://i.pravatar.cc/150?u=${seed}`);
    setAvatarPreviewFailed(false);
    setProfileMessage(null);
    setAvatarUploadMessage({ tone: 'success', text: t('Photo change ready. Save profile to apply it.') });
  };

  const clearAvatar = () => {
    setAvatarUrl('');
    setAvatarPreviewFailed(false);
    setProfileMessage(null);
    setAvatarUploadMessage({ tone: 'success', text: t('Photo removal ready. Save profile to apply it.') });
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    setProfileMessage(null);
    setAvatarUploadMessage(null);

    if (!hasSupportedAvatarType(file)) {
      setAvatarUploadMessage({
        tone: 'error',
        text: t('Choose a JPG, PNG, WebP, or GIF image.'),
      });
      return;
    }

    if (file.size > AVATAR_UPLOAD_MAX_BYTES) {
      setAvatarUploadMessage({
        tone: 'error',
        text: t('Photo must be 5 MB or smaller.'),
      });
      return;
    }

    const prepared = await runAvatar(async () => ({ ok: true, error: undefined, avatar: await resizeAvatarImage(file) }));
    if (!prepared) return;
    if (!prepared.ok || !('avatar' in prepared)) {
      setAvatarUploadMessage({ tone: 'error', text: t(prepared.error || 'Could not prepare that photo.') });
      return;
    }
    setAvatarUrl(prepared.avatar);
    setAvatarPreviewFailed(false);
    setAvatarUploadMessage({ tone: 'success', text: t('Photo ready. Save profile to apply it.') });
  };

  const updatePasswordField = (field: keyof typeof passwordForm, value: string) => {
    setPasswordForm(current => ({ ...current, [field]: value }));
    setPasswordMessage(null);
  };

  const handlePasswordSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const wasResetRequired = mustResetPassword;
    if (isPasswordSaving) return;
    const result = await runPassword(() => updateCurrentUserPassword(passwordForm));
    if (!result) return;

    if (result.ok) {
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      if (wasResetRequired) {
        navigate(defaultAccessiblePath, { replace: true });
      }
    }

    setPasswordMessage({
      tone: result.ok ? 'success' : 'error',
      text: result.ok
        ? wasResetRequired
          ? 'Password set. Opening AiTask...'
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
    navigate(defaultAccessiblePath, { replace: true });
  };

  const handleResetLocalDemo = () => {
    setConfirmation({
      title: t('Reset the local sample workspace?'),
      description: t('This recreates the UrbanEats, TechNova, and EcoLife demo records without deleting your other local records.'),
      confirmLabel: t('Reset sample workspace'),
      action: () => {
        const result = resetLocalServiceDemo();
        setLocalDemoMessage({
          tone: result.ok ? 'success' : 'error',
          text: result.ok
            ? t('Sample workspace reset. Open Delivery tracker to explore the seeded service plans and cycles.')
            : result.error || 'The sample workspace could not be reset.',
        });
      },
    });
  };

  return (
    <div className={pageShell}>
      <UploadRecoveryPanel />
      <DiagnosticsPanel />
      <PageHeader
        title={mustResetPassword ? t('Account Setup') : t('Settings')}
        description={mustResetPassword ? t('Set your own password to unlock the workspace.') : scopeDescription}
      />

      {mustResetPassword && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-amber-700">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <p className="font-bold">{t('Password reset required')}</p>
                <p className="mt-1 text-sm leading-6 text-amber-800">
                  {secureAccounts
                    ? t('Choose a private password with at least 12 characters to unlock the workspace.')
                    : t('Use the default password once as the current password, then choose a private password with at least 12 characters.')}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 lg:items-end">
              <Badge tone="amber" className="self-start lg:self-end">{t('Required')}</Badge>
              <div className="flex flex-col gap-2 sm:flex-row">
              {canBypassPasswordReset && (
                <Button type="button" variant="secondary" onClick={handlePasswordResetBypass} className="min-h-9 whitespace-nowrap px-3 py-1.5 text-xs">
                  {t('Continue for now')}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                onClick={handleSettingsSignOut}
                className="min-h-9 whitespace-nowrap px-3 py-1.5 text-xs"
              >
                {t('Sign out')}
              </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-3">
          <h2 className="text-lg font-semibold text-ink">{t('Account')}</h2>
          <p className="mt-1 text-sm text-muted">{t('Profile, sign-in security, and your current access.')}</p>
        </div>
        <div className={`${isPasswordSetupOnly ? 'xl:col-span-3' : 'xl:col-span-2'} ${cardBase} overflow-hidden`}>
          {!isPasswordSetupOnly && (
            <>
          <div className="flex items-center gap-3 border-b border-line px-6 py-5">
            <UserCircle className="h-5 w-5 text-accent" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-ink">{t('Profile')}</h2>
          </div>
          <form ref={profileFormRef} onSubmit={handleProfileSave} className="p-6 space-y-5" aria-busy={isProfileSaving || isPreparingAvatar}>
            <fieldset disabled={isProfileSaving || Boolean(profileRetryDraft)} className="min-w-0 border-0 p-0 space-y-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
              <div className="flex flex-col items-start gap-3 lg:w-64 lg:shrink-0">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-line bg-inset">
                  {avatarUrl && !avatarPreviewFailed ? (
                    <img
                      src={avatarUrl}
                      alt={t('profile photo preview')}
                      className="h-full w-full object-cover"
                      onError={() => {
                        setAvatarPreviewFailed(true);
                        setAvatarUploadMessage({ tone: 'error', text: t('That photo could not be previewed. Choose another photo or URL.') });
                      }}
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted" role="img" aria-label={avatarUrl ? t('Photo preview unavailable') : t('No profile photo')}>
                      <UserCircle className="h-9 w-9" aria-hidden="true" />
                      {avatarUrl && <span className="px-1 text-center text-[10px] leading-3">{t('Preview unavailable')}</span>}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={avatarFileInputRef}
                    type="file"
                    id="profile-avatar-file"
                    accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
                    aria-describedby="profile-avatar-help profile-avatar-feedback"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => avatarFileInputRef.current?.click()}
                    disabled={isPreparingAvatar || isProfileSaving}
                    aria-busy={isPreparingAvatar}
                  >
                    <Upload className="h-4 w-4" aria-hidden="true" />
                    {isPreparingAvatar ? t('Preparing...') : t('Upload photo')}
                  </Button>
                  <Button type="button" variant="secondary" onClick={useGeneratedAvatar} disabled={isPreparingAvatar || isProfileSaving}>
                    {t('Generate')}
                  </Button>
                  {avatarUrl && (
                    <Button type="button" variant="ghost" onClick={clearAvatar} disabled={isPreparingAvatar || isProfileSaving} className="text-[rgb(var(--calm-danger))] hover:bg-[rgb(var(--calm-danger-soft))] hover:text-[rgb(var(--calm-danger))]">
                      <X className="h-4 w-4" aria-hidden="true" />
                      {t('Remove photo')}
                    </Button>
                  )}
                </div>
                <p id="profile-avatar-help" className="text-xs leading-5 text-muted">
                  {t('JPG, PNG, WebP, or GIF · maximum 5 MB. Photos are square-cropped and resized before saving. GIFs use the first frame.')}
                </p>
                {avatarUploadMessage && (
                  <p className={cn(
                    'text-xs font-medium leading-5',
                    avatarUploadMessage.tone === 'success' ? 'text-[rgb(var(--calm-success))]' : 'text-[rgb(var(--calm-danger))]'
                  )} id="profile-avatar-feedback" role={avatarUploadMessage.tone === 'error' ? 'alert' : 'status'} aria-live="polite">
                    {avatarUploadMessage.text}
                  </p>
                )}
              </div>

              <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <label htmlFor="profile-name" className="mb-1 block text-xs font-semibold text-muted">{t('Name')}</label>
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
                  <label htmlFor="profile-email" className="mb-1 block text-xs font-semibold text-muted">{t('Email')}</label>
                  <input
                    id="profile-email"
                    type="email"
                    value={profileEmail}
                    onChange={event => {
                      setProfileEmail(event.target.value);
                      setProfileMessage(null);
                    }}
                    className={cn(inputBase, 'px-3 py-2.5')}
                    data-i18n-skip
                    placeholder="name@company.com"
                    autoComplete="email"
                    maxLength={320}
                  />
                </div>
                {backend.mode === 'supabase' && profileEmailChanged && (
                  <div className="lg:col-span-2">
                    <label htmlFor="profile-current-password" className="mb-1 block text-xs font-semibold text-muted">
                      {t('Current password')}
                    </label>
                    <input
                      id="profile-current-password"
                      type="password"
                      value={profileCurrentPassword}
                      onChange={event => {
                        setProfileCurrentPassword(event.target.value);
                        setProfileMessage(null);
                      }}
                      className={cn(inputBase, 'px-3 py-2.5')}
                      autoComplete="current-password"
                      required
                    />
                    <p className="mt-1 text-xs leading-5 text-muted">
                      {t('This changes both your Supabase login email and AiTask profile email.')}
                    </p>
                  </div>
                )}
                <div className="lg:col-span-2">
                    <label id="profile-avatar-label" htmlFor={isUploadedAvatar ? undefined : 'profile-avatar'} className="mb-1 block text-xs font-semibold text-muted">
                    {isUploadedAvatar ? t('Photo source') : t('Avatar URL')}
                  </label>
                  {isUploadedAvatar ? (
                    <div id="profile-avatar" className="flex min-h-11 items-center justify-between gap-3 rounded-control border border-line bg-inset px-3 text-sm text-ink" role="status" aria-labelledby="profile-avatar-label">
                      <span>{avatarChanged ? t('New uploaded photo · unsaved') : t('Uploaded photo stored with profile')}</span>
                      <span className="shrink-0 text-xs text-muted">{t('Use Remove to switch source')}</span>
                    </div>
                  ) : (
                    <input
                      id="profile-avatar"
                      value={avatarUrl}
                      onChange={event => {
                        setAvatarUrl(event.target.value);
                        setAvatarPreviewFailed(false);
                        setProfileMessage(null);
                        setAvatarUploadMessage(null);
                      }}
                      className={cn(inputBase, 'px-3 py-2.5')}
                      placeholder={t('Upload a photo, generate an avatar, or use a Supabase image URL')}
                      autoComplete="url"
                    />
                  )}
                  {isUploadedAvatar && (
                    <p className="mt-1 text-xs leading-5 text-muted">
                      {t('Remove the uploaded photo if you want to paste a web image URL instead.')}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">{t('Role')}</label>
                  <p className="font-semibold text-ink">{effectiveRoleName}</p>
                  {currentUser?.customRoleId && <p className="mt-1 text-xs text-muted">{t('Base role')}: {getRoleDisplayName(currentUser.role)}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">{t('Department')}</label>
                  <p className="font-semibold text-ink">
                    {currentUser ? getMemberDepartments(currentUser).join(', ') : t('Not assigned')}
                  </p>
                </div>
                <div className="lg:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-muted">{t('Client Company')}</label>
                  <p className="font-semibold text-ink">{currentUser?.companyName || t('Not linked')}</p>
                </div>
              </div>
            </div>

            </fieldset>
            <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-h-5 text-sm">
                {profileMessage && (
                  <p className={profileMessage.tone === 'success' ? 'text-[rgb(var(--calm-success))]' : 'text-[rgb(var(--calm-danger))]'} role={profileMessage.tone === 'error' ? 'alert' : 'status'} aria-live="polite">
                    {profileMessage.text}
                  </p>
                )}
                {!profileMessage && profileChanged && <p className="text-muted">{t('Unsaved profile changes')}</p>}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" onClick={resetProfileForm} disabled={!profileChanged || isProfileSaving}>
                  {t('Reset')}
                </Button>
                <Button type="submit" disabled={!profileChanged || isProfileSaving} aria-busy={isProfileSaving}>
                  {isProfileSaving ? t('Saving...') : t('Save profile')}
                </Button>
                {profileRetryDraft && (
                  <Button type="button" variant="secondary" onClick={retryProfileSave} disabled={isProfileSaving}>
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    {t('Retry save')}
                  </Button>
                )}
                {profileMessage?.tone === 'error' && (
                  <Button type="button" variant="secondary" onClick={() => void discardPendingProfileChange()} disabled={isProfileSaving}>
                    {t('Use latest')}
                  </Button>
                )}
              </div>
            </div>
          </form>
            </>
          )}

          <form onSubmit={handlePasswordSave} className="border-t border-slate-100 p-6">
            <div className="mb-4 flex items-center gap-3">
              <Lock className="h-5 w-5 text-blue-600" />
              <div>
                <h3 className="text-base font-semibold text-slate-900">{mustResetPassword ? t('Reset Password') : t('Password')}</h3>
                <p className="text-sm text-slate-500">
                  {mustResetPassword
                    ? t('Set your own password before continuing to the workspace.')
                    : t('Update the login password for this user profile.')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div>
                <label htmlFor="current-password" className="block text-xs font-semibold text-slate-400 mb-1">{t('Current Password')}</label>
                <input
                  id="current-password"
                  type="password"
                  disabled={isPasswordSaving}
                  value={passwordForm.currentPassword}
                  onChange={event => updatePasswordField('currentPassword', event.target.value)}
                  className={cn(inputBase, 'px-3 py-2.5')}
                  autoComplete="current-password"
                  required
                />
              </div>
              <div>
                <label htmlFor="new-password" className="block text-xs font-semibold text-slate-400 mb-1">{t('New Password')}</label>
                <input
                  id="new-password"
                  type="password"
                  disabled={isPasswordSaving}
                  value={passwordForm.newPassword}
                  onChange={event => updatePasswordField('newPassword', event.target.value)}
                  className={cn(inputBase, 'px-3 py-2.5')}
                  autoComplete="new-password"
                  minLength={12}
                  required
                />
              </div>
              <div>
                <label htmlFor="confirm-password" className="block text-xs font-semibold text-slate-400 mb-1">{t('Confirm Password')}</label>
                <input
                  id="confirm-password"
                  type="password"
                  disabled={isPasswordSaving}
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
              <Button type="submit" disabled={!passwordChanged || isPasswordSaving}>
                {mustResetPassword ? t('Set password') : t('Update password')}
              </Button>
            </div>
          </form>
      </div>

      {!isPasswordSetupOnly && (canManageServiceCatalog(currentUser, rolePermissions) || canManageTaskTemplates(currentUser, rolePermissions)) && (
        <div className="xl:col-span-3 space-y-6">
          {canManageServiceCatalog(currentUser, rolePermissions) && <ServicePackageManager />}
          {canManageTaskTemplates(currentUser, rolePermissions) && <WorkflowTemplateManager />}
        </div>
      )}

      {canResetLocalDemo && (
        <section className={`${cardBase} overflow-hidden xl:col-span-3`} aria-labelledby="local-demo-title">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="calm-eyebrow">{t('Local development only')}</p>
              <h2 id="local-demo-title" className="mt-1 text-lg font-semibold text-slate-900">{t('Sample service workspace')}</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{t('UrbanEats, TechNova, and EcoLife demonstrate package modes, frozen plans, cycles, task chains, client-visible activity, add-ons, revisions, and role-specific workbenches. This data stays in this browser.')}</p>
            </div>
            <Button type="button" variant="secondary" onClick={handleResetLocalDemo}>
              <Database className="h-4 w-4" />
              {t('Reset sample workspace')}
            </Button>
          </div>
          {localDemoMessage && <p className={cn('border-t border-line px-5 py-3 text-sm font-medium', localDemoMessage.tone === 'success' ? 'text-emerald-700' : 'text-red-700')} role={localDemoMessage.tone === 'error' ? 'alert' : 'status'}>{localDemoMessage.text}</p>}
        </section>
      )}

      {!isPasswordSetupOnly && (
        <>
      {isClientUser ? (
          <div className={`${cardBase} overflow-hidden xl:col-span-3`}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-slate-800">{t('Client Access')}</h2>
            </div>
            <div className="p-6 space-y-4 text-sm text-slate-600">
              <div>
                <p className="text-xs font-semibold text-slate-400">{t('Company')}</p>
                <p data-i18n-skip className="mt-1 text-base font-semibold text-slate-900">{currentUser?.companyName || t('Not linked')}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-400">{t('Tasks')}</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{visibleTasks.length}</p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-400">{t('Companies')}</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{visibleProjects.length}</p>
                </div>
              </div>
              <p className="leading-6">
                {t('You can check task progress, leave feedback on your company tasks, and approve or request revisions when work is ready for review.')}
              </p>
              <Button type="button" variant="secondary" onClick={() => navigate('/clients?period=all')} className="w-full justify-center">
                {t('View company tasks')}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className={`${cardBase} overflow-hidden xl:col-span-3`}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-slate-800">{t('Permissions')}</h2>
            </div>
            <div className="p-6 space-y-3 text-sm text-slate-600">
              <p><strong className="text-slate-800">{t('Boss Koo:')}</strong> {t('has super admin access to add members, manage users, approve registrations, companies, and all task workflows.')}</p>
              <p><strong className="text-slate-800">{t('Project Manager:')}</strong> {t('can create and edit their own projects, companies, and tasks.')}</p>
              <p><strong className="text-slate-800">{t('Staff and Finance:')}</strong> {t('can create tasks for internal teammates, update tasks assigned to them, and see companies they created or participate in.')}</p>
              <p><strong className="text-slate-800">{t('Client:')}</strong> {t('can view company tasks, calendar, reports, and review completed or waiting-approval work.')}</p>
              <div className="pt-3 border-t border-slate-100">
                <p className="font-semibold text-slate-800 mb-2">{t('Your effective permissions')}</p>
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
          <h2 className="text-lg font-semibold text-slate-950">{t('Workspace')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('Notifications, workflow preferences, and operational status.')}</p>
        </div>

        {/* Sound Notifications */}
        <div className={`${cardBase} overflow-hidden xl:col-span-3`}>
          <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
            {soundEnabled ? <Volume2 className="w-5 h-5 text-blue-600" /> : <VolumeX className="w-5 h-5 text-slate-400" />}
            <h2 className="text-lg font-semibold text-slate-800">{t('Sound Notifications')}</h2>
          </div>
          <div className="p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-800">
                {soundEnabled ? t('Sound alerts are enabled') : t('Sound alerts are muted')}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {t('Play a chime for new assignments, deadlines, reviews, feedback, and registration requests. You can also toggle sound from the volume icon in the top bar.')}
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
              aria-label={t('Toggle sound notifications')}
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

        {isSuperAdmin && (
          <div className={`${cardBase} overflow-hidden xl:col-span-3`}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
              <SlidersHorizontal className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-slate-800">{t('Workflow Statuses')}</h2>
            </div>
            <div className="p-6 space-y-6">
              <p className="text-sm text-slate-500">
                {t('Manage workspace task statuses. Default statuses are locked. Custom statuses can only be deleted if they are not in active use.')}
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
                        <span className="text-sm font-semibold text-slate-700 truncate">{t(status)}</span>
                        {isDefault ? (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-bold tracking-wide shrink-0">
                            <Lock className="w-2.5 h-2.5" /> {t('System')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 font-bold tracking-wide shrink-0">
                            {t('Custom')}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-3 shrink-0">
                        {taskCount > 0 && (
                          <span className="text-xs text-slate-400 font-medium">
                            {taskCount} {taskCount === 1 ? t('task') : t('tasks')}
                          </span>
                        )}
                        {!isDefault && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteStatus(status)}
                            disabled={isStatusSaving || taskCount > 0}
                            className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                            title={taskCount > 0 ? t('In-use status cannot be deleted') : t('Delete status')}
                            aria-label={t('Delete status')}
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
                <h3 className="text-sm font-semibold text-slate-800 mb-2">{t('Create Custom Status')}</h3>
                <form onSubmit={handleStatusAdd} className="flex gap-2">
                  <input
                    type="text"
                    value={newStatusInput}
                    onChange={(e) => {
                      setNewStatusInput(e.target.value);
                      setStatusError('');
                    }}
                    placeholder={t('e.g. Under QA, Draft')}
                    className={cn(inputBase, 'flex-1 px-3 py-2 text-sm')}
                    maxLength={50}
                  />
                  <Button type="submit" disabled={(!newStatusInput.trim() && !hasPendingStatusAdd) || isStatusSaving}>
                    {isStatusSaving ? t('Saving...') : hasPendingStatusAdd ? t('Retry save') : t('Add Status')}
                  </Button>
                </form>
                {statusError && (
                  <p className="mt-2 text-xs text-red-600" role="alert" aria-live="polite">{statusError}</p>
                )}
              </div>
            </div>
          </div>
        )}
        </>
      )}

      {!isPasswordSetupOnly && (
        <>
      {isSuperAdmin && (
        <div className={`${cardBase} overflow-hidden xl:col-span-3`}>
          <div className="px-6 py-5 border-b border-slate-100 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Cloud className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-slate-800">{t('Data Backend')}</h2>
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
                  {t('Check now')}
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => {
                  const snapshot = selectPersistedWorkspaceState(useStore.getState());
                  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const anchor = document.createElement('a');
                  anchor.href = url;
                  anchor.download = `aitask-workspace-${new Date().toISOString().slice(0, 10)}.json`;
                  anchor.click();
                  URL.revokeObjectURL(url);
                  useToastStore.getState().addToast(t('settings.exported'), 'success');
                }}
                className="min-h-9 px-3 py-1.5 text-xs"
              >
                <Download className="h-3.5 w-3.5" />
                {t('Export workspace')}
              </Button>
              <Badge tone={backendStatus.ready ? 'emerald' : 'amber'}>
                {backendStatus.mode === 'supabase' ? 'Supabase' : 'Local'}
              </Badge>
            </div>
          </div>
          <div className="p-6 grid grid-cols-1 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs font-semibold text-slate-400">{t('Status')}</p>
              <p className="mt-1 font-semibold text-slate-900">
                {backend.status === 'loading' ? t('settings.checkingWorkspace') : backend.status === 'saving' ? t('settings.savingChanges') : t(backend.message)}
              </p>
              {backend.error && <p className="mt-2 text-red-600" role="alert" aria-live="polite">{backend.error}</p>}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400">{t('Supabase Table')}</p>
              <p className="mt-1 font-semibold text-slate-900">{backendStatus.stateTable}</p>
              <p className="mt-1 text-slate-500">{t('Snapshot ID')}: {backendStatus.stateId}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400">{t('Last Pull')}</p>
              <p className="mt-1 font-semibold text-slate-900">
                {backend.lastPulledAt ? formatLocalizedDateTime(new Date(backend.lastPulledAt), locale) : t('settings.notChecked')}
              </p>
              {backend.remoteVersion && (
                <p className="mt-1 text-slate-500">{t('Remote version')}: {backend.remoteVersion}</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400">{t('Last Save')}</p>
              <p className="mt-1 font-semibold text-slate-900">
                {backend.lastSavedAt || backend.lastSyncedAt
                  ? formatLocalizedDateTime(new Date(backend.lastSavedAt || backend.lastSyncedAt || ''), locale)
                  : t('settings.notSynced')}
              </p>
              {backendStatus.missing.length > 0 && (
                <p className="mt-1 text-slate-500">{t('Missing')}: {backendStatus.missing.join(', ')}</p>
              )}
            </div>
          </div>

          <div className="border-t border-slate-100 px-6 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">{t('Supabase readiness')}</p>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                  {hostedLocalBuild
                    ? t('This hosted build is running with local browser storage. Add the Supabase environment variables in Vercel, then redeploy.')
                    : isSupabaseMode
                    ? backendStatus.ready
                      ? t('The app is using versioned Supabase workspace commands with row-scoped access.')
                      : t('Supabase mode is selected, but required environment variables are missing.')
                    : t('The app is running locally. Set Supabase mode in deployment to share live workspace data.')}
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
                      <p className="text-xs font-semibold text-slate-400">{item.label}</p>
                      <p className="mt-1 break-words text-sm font-medium text-slate-800">{item.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
        </>
      )}

      {!isClientUser && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 xl:col-span-3">
          <MetricCard title={t('Visible Tasks')} value={visibleTasks.length} icon={Database} tone="indigo" />
          <MetricCard title={t('Visible Companies')} value={visibleProjects.length} icon={Database} tone="emerald" />
          <MetricCard title={t('Unread Notices')} value={unreadCount} icon={Bell} tone="amber" />
          {isSuperAdmin && (
            <MetricCard
              title={t('Backend')}
              value={backendStatus.mode === 'supabase' ? 'Supabase' : 'Local'}
              icon={Cloud}
              tone={backendStatus.ready ? 'blue' : 'amber'}
              footer={backendStatus.ready ? t('Configured') : t('Needs env keys')}
            />
          )}
        </div>
      )}

      <section className={`${cardBase} overflow-hidden xl:col-span-3`}>
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <PackageCheck className="h-5 w-5 text-blue-600" />
          <h2 className="text-base font-semibold text-slate-900">{t('Application release')}</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 px-5 py-4 text-sm lg:grid-cols-4">
          <div>
            <p className="text-xs font-semibold text-slate-400">{t('Release')}</p>
            <p className="mt-1 font-semibold text-slate-900">{APP_VERSION_LABEL}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400">{t('Build')}</p>
            <p className="mt-1 font-mono font-semibold text-slate-900">{APP_COMMIT}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400">{t('Channel')}</p>
            <p className="mt-1 font-semibold capitalize text-slate-900">{APP_BUILD_CHANNEL}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400">{t('Built')}</p>
            <p className="mt-1 font-semibold text-slate-900">{formatLocalizedDateTime(new Date(APP_BUILD_TIME), locale)}</p>
          </div>
        </div>
        <div className="border-t border-slate-100 px-5 py-2.5">
          <p className="font-mono text-[11px] text-slate-400">{APP_BUILD_LABEL}</p>
        </div>
      </section>
      {confirmation && (
        <ConfirmDialog
          labelledBy={confirmationTitleId}
          title={confirmation.title}
          description={confirmation.description}
          confirmLabel={confirmation.confirmLabel}
          busy={isConfirming}
          onClose={() => setConfirmation(null)}
          onConfirm={async () => {
            setIsConfirming(true);
            try { await confirmation.action(); setConfirmation(null); }
            catch (error) { setStatusError(error instanceof Error ? error.message : t('The change is waiting to be saved.')); }
            finally { setIsConfirming(false); }
          }}
        />
      )}
    </div>
    </div>
  );
};

export default Settings;
