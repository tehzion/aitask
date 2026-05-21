import React from 'react';
import { Bell, Cloud, Database, ShieldCheck, UserCircle } from 'lucide-react';
import { useStore } from '../store';
import { Badge, MetricCard, PageHeader, cardBase, pageShell } from '../components/ui';
import { getEffectivePermissions, getEffectiveRoleName, getVisibleProjects, getVisibleTasks, isNotificationVisible, permissionLabels } from '../lib/access';
import { getBackendStatus } from '../lib/backend';

const Settings: React.FC = () => {
  const { currentUser, tasks, projects, notifications, backend, rolePermissions } = useStore();
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

  return (
    <div className={pageShell}>
      <PageHeader title="Settings" description={scopeDescription} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className={`xl:col-span-2 ${cardBase} overflow-hidden`}>
          <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
            <UserCircle className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-slate-800">Profile</h2>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Name</label>
              <p className="font-semibold text-slate-900">{currentUser?.name}</p>
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
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Client Company</label>
              <p className="font-semibold text-slate-900">{currentUser?.companyName || 'Not linked'}</p>
            </div>
          </div>
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
