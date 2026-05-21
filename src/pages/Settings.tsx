import React from 'react';
import { Bell, Cloud, Database, Lock, ShieldCheck, UserCircle } from 'lucide-react';
import { useStore } from '../store';
import { Badge, Button, MetricCard, PageHeader, cardBase, inputBase, pageShell } from '../components/ui';
import { getEffectivePermissions, getEffectiveRoleName, getVisibleProjects, getVisibleTasks, isNotificationVisible, permissionLabels } from '../lib/access';
import { getBackendStatus } from '../lib/backend';
import { cn } from '../lib/utils';

const Settings: React.FC = () => {
  const { currentUser, tasks, projects, notifications, backend, rolePermissions, updateCurrentUserProfile, updateCurrentUserPassword } = useStore();
  const [profileName, setProfileName] = React.useState(currentUser?.name || '');
  const [avatarUrl, setAvatarUrl] = React.useState(currentUser?.avatar || '');
  const [profileMessage, setProfileMessage] = React.useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [passwordForm, setPasswordForm] = React.useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordMessage, setPasswordMessage] = React.useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const backendStatus = getBackendStatus();
  const visibleTasks = getVisibleTasks(currentUser, tasks);
  const visibleProjects = getVisibleProjects(currentUser, projects);
  const effectivePermissions = getEffectivePermissions(currentUser, rolePermissions);
  const effectiveRoleName = getEffectiveRoleName(currentUser, rolePermissions);
  const enabledPermissions = Object.entries(effectivePermissions)
    .filter(([, enabled]) => enabled)
    .map(([key]) => permissionLabels[key as keyof typeof permissionLabels]);
  const unreadCount = notifications.filter(notification => !notification.isRead && isNotificationVisible(currentUser, notification)).length;
  const scopeDescription = currentUser?.role === 'Client'
    ? `Review your profile and ${currentUser.companyName || 'client'} workspace state.`
    : 'Review your profile, workspace scope, and local app state.';
  const profileChanged = profileName.trim() !== (currentUser?.name || '') || avatarUrl.trim() !== (currentUser?.avatar || '');
  const passwordChanged = Boolean(passwordForm.currentPassword || passwordForm.newPassword || passwordForm.confirmPassword);

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
    const result = updateCurrentUserPassword(passwordForm);

    if (result.ok) {
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    }

    setPasswordMessage({
      tone: result.ok ? 'success' : 'error',
      text: result.ok ? 'Password updated.' : result.error || 'Password could not be updated.',
    });
  };

  return (
    <div className={pageShell}>
      <PageHeader title="Settings" description={scopeDescription} />

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
                <h3 className="text-base font-semibold text-slate-900">Password</h3>
                <p className="text-sm text-slate-500">Update the login password for this user profile.</p>
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
                Update password
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
      </div>

      <div className={`${cardBase} overflow-hidden`}>
        <div className="px-6 py-5 border-b border-slate-100 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Cloud className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-slate-800">Data Backend</h2>
          </div>
          <Badge tone={backendStatus.ready ? 'emerald' : 'amber'}>
            {backendStatus.mode === 'supabase' ? 'Supabase' : 'Local'}
          </Badge>
        </div>
        <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Status</p>
            <p className="mt-1 font-semibold text-slate-900">
              {backend.isLoading ? 'Loading workspace...' : backend.isSaving ? 'Saving changes...' : backend.message}
            </p>
            {backend.error && <p className="mt-2 text-red-600">{backend.error}</p>}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Supabase Table</p>
            <p className="mt-1 font-semibold text-slate-900">{backendStatus.stateTable}</p>
            <p className="mt-1 text-slate-500">Snapshot ID: {backendStatus.stateId}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Last Sync</p>
            <p className="mt-1 font-semibold text-slate-900">
              {backend.lastSyncedAt ? new Date(backend.lastSyncedAt).toLocaleString() : 'Not synced yet'}
            </p>
            {backendStatus.missing.length > 0 && (
              <p className="mt-1 text-slate-500">Missing: {backendStatus.missing.join(', ')}</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard title="Visible Tasks" value={visibleTasks.length} icon={Database} tone="indigo" />
        <MetricCard title="Visible Projects" value={visibleProjects.length} icon={Database} tone="emerald" />
        <MetricCard title="Unread Notices" value={unreadCount} icon={Bell} tone="amber" />
        <MetricCard
          title="Backend"
          value={backendStatus.mode === 'supabase' ? 'Supabase' : 'Local'}
          icon={Cloud}
          tone={backendStatus.ready ? 'blue' : 'amber'}
          footer={backendStatus.ready ? 'Configured' : 'Needs env keys'}
        />
      </div>
    </div>
  );
};

export default Settings;
