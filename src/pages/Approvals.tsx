import React, { useState } from 'react';
import { useStore } from '../store';
import { CheckCircle2, XCircle, UserPlus, Users, Trash2, AlertTriangle, ShieldCheck, Save } from 'lucide-react';
import { Department, Role, Registration, RolePermissionKey, RolePermissions } from '../types';
import { format } from 'date-fns';
import { Badge, Button, PageHeader } from '../components/ui';
import { cardBase, inputBase, pageShell } from '../components/uiTokens';
import { cn } from '../lib/utils';
import { canDeleteUser, defaultRolePermissions, getEffectiveRoleName, isBossKoo, permissionGroups, permissionLabels } from '../lib/access';
import { DEFAULT_USER_PASSWORD } from '../lib/auth';
import { shouldUseSecureSupabase } from '../lib/supabaseClient';
import ModalShell from '../components/ModalShell';

const ROLES: Role[] = ['Admin', 'Staff', 'Client'];
const DEPARTMENTS: Department[] = ['Operation', 'Management', 'Videoshooting', 'Ads Management', 'Account & Finance', 'Designer', 'Editor', 'Client'];

const clonePermissions = (permissions: RolePermissions): RolePermissions => ({ ...permissions });

const Approvals: React.FC = () => {
  const addMemberTitleId = React.useId();
  const approvalTitleId = React.useId();
  const deleteMemberTitleId = React.useId();
  const secureAccounts = shouldUseSecureSupabase();
  const {
    registrations,
    approveRegistration,
    rejectRegistration,
    currentUser,
    users,
    deleteUser,
    addUserBySuperAdmin,
    rolePermissions,
    addCustomRole,
    updateCustomRole,
    deleteCustomRole,
    assignCustomRoleToUser,
    backend,
    commitPendingMutation,
  } = useStore();
  const [selectedReg, setSelectedReg] = useState<Registration | null>(null);
  
  const [role, setRole] = useState<Role>('Staff');
  const [department, setDepartment] = useState<Department>('Designer');
  const [companyName, setCompanyName] = useState('');
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [addUserError, setAddUserError] = useState('');
  const [sendNewUserInvitation, setSendNewUserInvitation] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: secureAccounts ? '' : DEFAULT_USER_PASSWORD,
    role: 'Staff' as Role,
    department: 'Designer' as Department,
    companyName: '',
    customRoleId: '',
  });
  const [approvalCustomRoleId, setApprovalCustomRoleId] = useState('');
  const [sendApprovalInvitation, setSendApprovalInvitation] = useState(false);
  const [approvalTemporaryPassword, setApprovalTemporaryPassword] = useState('');
  const [roleEditorId, setRoleEditorId] = useState<string | null>(null);
  const [roleError, setRoleError] = useState('');
  const [assignmentError, setAssignmentError] = useState('');
  const [actionError, setActionError] = useState('');
  const [isActionSaving, setIsActionSaving] = useState(false);
  const superAdmin = isBossKoo(currentUser);
  const [roleForm, setRoleForm] = useState({
    name: '',
    description: '',
    baseRole: 'Staff' as Role,
    permissions: clonePermissions(defaultRolePermissions.Staff),
  });

  // Delete User Modal State
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [deleteUserError, setDeleteUserError] = useState('');

  const pendingRegs = (registrations || []).filter(r => r.status === 'Pending');
  const historyRegs = (registrations || []).filter(r => r.status !== 'Pending');

  const handleOpenApproval = (reg: Registration) => {
    setSelectedReg(reg);
    // Auto-fill form based on user's request
    setRole(reg.requestedRole || 'Staff');
    
    // Attempt to guess department based on requested role
    if (reg.requestedRole === 'Client') {
      setDepartment('Client');
    } else if (reg.requestedRole === 'Admin') {
      setDepartment('Management');
    } else {
      setDepartment('Designer'); // Default for staff
    }
    setApprovalCustomRoleId('');
    setSendApprovalInvitation(false);
    setApprovalTemporaryPassword('');
  };

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedReg) {
      setActionError('');
      setIsActionSaving(true);
      if (secureAccounts) {
        const inviteResult = await addUserBySuperAdmin({
          name: selectedReg.name,
          email: selectedReg.email,
          role,
          department: role === 'Client' ? 'Client' : department,
          companyName: role === 'Client' ? companyName : undefined,
          customRoleId: approvalCustomRoleId || undefined,
          registrationId: selectedReg.id,
          sendInvitation: sendApprovalInvitation,
          password: selectedReg.onboardingMode === 'legacy_invite' && !sendApprovalInvitation
            ? approvalTemporaryPassword
            : undefined,
        });
        if (!inviteResult.ok) {
          setIsActionSaving(false);
          setActionError(inviteResult.error || 'Unable to approve this member.');
          return;
        }
        setIsActionSaving(false);
        setSelectedReg(null);
        setRole('Staff');
        setDepartment('Designer');
        setCompanyName('');
        setApprovalCustomRoleId('');
        setSendApprovalInvitation(false);
        setApprovalTemporaryPassword('');
        return;
      }
      approveRegistration(selectedReg.id, role, department, role === 'Client' ? companyName : undefined, approvalCustomRoleId || undefined);
      const saved = await commitPendingMutation();
      setIsActionSaving(false);
      if (!saved.ok) {
        setActionError(saved.error || 'The approval is waiting to be saved. Use Retry required to continue.');
        return;
      }
      setSelectedReg(null);
      // Reset form
      setRole('Staff');
      setDepartment('Designer');
      setCompanyName('');
      setApprovalCustomRoleId('');
    }
  };

  const resetNewUser = () => {
    setNewUser({
      name: '',
      email: '',
      role: 'Staff',
      department: 'Designer',
      companyName: '',
      customRoleId: '',
      password: secureAccounts ? '' : DEFAULT_USER_PASSWORD,
    });
    setSendNewUserInvitation(false);
    setAddUserError('');
  };

  const resetRoleForm = (baseRole: Role = 'Staff') => {
    setRoleEditorId(null);
    setRoleForm({
      name: '',
      description: '',
      baseRole,
      permissions: clonePermissions(defaultRolePermissions[baseRole]),
    });
    setRoleError('');
  };

  const handleRoleBaseChange = (baseRole: Role) => {
    setRoleForm({
      ...roleForm,
      baseRole,
      permissions: clonePermissions(defaultRolePermissions[baseRole]),
    });
  };

  const togglePermission = (key: RolePermissionKey) => {
    setRoleForm({
      ...roleForm,
      permissions: {
        ...roleForm.permissions,
        [key]: !roleForm.permissions[key],
      },
    });
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setRoleError('');

    const payload = {
      name: roleForm.name,
      description: roleForm.description || undefined,
      baseRole: roleForm.baseRole,
      permissions: roleForm.permissions,
    };

    const result = roleEditorId
      ? updateCustomRole(roleEditorId, payload)
      : addCustomRole(payload);

    if (!result.ok) {
      setRoleError(result.error || 'Unable to save role.');
      return;
    }

    setIsActionSaving(true);
    const saved = await commitPendingMutation();
    setIsActionSaving(false);
    if (!saved.ok) {
      setRoleError(saved.error || 'The role is waiting to be saved. Use Retry required to continue.');
      return;
    }

    resetRoleForm(roleForm.baseRole);
  };

  const handleEditRole = (customRoleId: string) => {
    const targetRole = rolePermissions.find(customRole => customRole.id === customRoleId);
    if (!targetRole) return;

    setRoleEditorId(targetRole.id);
    setRoleForm({
      name: targetRole.name,
      description: targetRole.description || '',
      baseRole: targetRole.baseRole,
      permissions: clonePermissions(targetRole.permissions),
    });
    setRoleError('');
  };

  const handleDeleteRole = async (customRoleId: string) => {
    const previousRoles = useStore.getState().rolePermissions;
    const previousUsers = useStore.getState().users;
    const result = deleteCustomRole(customRoleId);
    if (!result.ok) {
      setRoleError(result.error || 'Unable to delete role.');
      return;
    }

    setIsActionSaving(true);
    const saved = await commitPendingMutation();
    setIsActionSaving(false);
    if (!saved.ok) {
      useStore.setState({ rolePermissions: previousRoles, users: previousUsers });
      setRoleError(saved.error || 'The role deletion was rolled back. Use Retry required to confirm it.');
      return;
    }

    if (roleEditorId === customRoleId) resetRoleForm();
  };

  const handleAssignRole = async (userId: string, customRoleId: string) => {
    setAssignmentError('');
    const previousUsers = useStore.getState().users;
    const result = assignCustomRoleToUser(userId, customRoleId || undefined);
    if (!result.ok) {
      setAssignmentError(result.error || 'Unable to assign role.');
      return;
    }
    setIsActionSaving(true);
    const saved = await commitPendingMutation();
    setIsActionSaving(false);
    if (!saved.ok) {
      useStore.setState({ users: previousUsers });
      setAssignmentError(saved.error || 'The role assignment was rolled back. Use Retry required to confirm it.');
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddUserError('');
    setIsActionSaving(true);
    const result = await addUserBySuperAdmin({
      name: newUser.name,
      email: newUser.email || undefined,
      password: newUser.password,
      role: newUser.role,
      department: newUser.role === 'Client' ? 'Client' : newUser.department,
      companyName: newUser.role === 'Client' ? newUser.companyName : undefined,
      customRoleId: newUser.customRoleId || undefined,
      sendInvitation: sendNewUserInvitation,
    });
    setIsActionSaving(false);

    if (!result.ok) {
      setAddUserError(result.error || 'Unable to add member.');
      return;
    }

    if (secureAccounts) {
      resetNewUser();
      setIsAddUserOpen(false);
      return;
    }

    const saved = await commitPendingMutation();
    if (!saved.ok) {
      setAddUserError(saved.error || 'The member is waiting to be saved.');
      return;
    }

    resetNewUser();
    setIsAddUserOpen(false);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    const previous = useStore.getState();
    setIsActionSaving(true);
    const result = await deleteUser(userToDelete);
    if (!result.ok) {
      setIsActionSaving(false);
      setDeleteUserError(result.error || 'Unable to delete this user.');
      return;
    }

    const saved = secureAccounts ? { ok: true } : await commitPendingMutation();
    setIsActionSaving(false);
    if (!saved.ok) {
      useStore.setState({
        users: previous.users,
        notifications: previous.notifications,
        deletedUserIds: previous.deletedUserIds,
      });
      setDeleteUserError(saved.error || 'The member deletion was rolled back. Use Retry required to confirm it.');
      return;
    }

    setDeleteUserError('');
    setUserToDelete(null);
  };

  return (
    <div className={pageShell}>
      <PageHeader
        title="User Approvals"
        description="Boss Koo super admin controls for registrations, direct member creation, and active users."
        action={superAdmin ? (
          <Button onClick={() => setIsAddUserOpen(true)} disabled={isActionSaving || backend.isSaving}>
            <UserPlus className="w-4 h-4" />
            Add Member
          </Button>
        ) : undefined}
      />

      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">
          {actionError}
        </div>
      )}

      {/* Pending Approvals */}
      <div className={`${cardBase} overflow-hidden`}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
          <UserPlus className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-slate-800">Pending Registrations ({pendingRegs.length})</h3>
        </div>
        
        {pendingRegs.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            No pending registrations at the moment.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="px-6 py-4 font-semibold border-b border-slate-200">Name</th>
                  <th className="px-6 py-4 font-semibold border-b border-slate-200">Contact</th>
                  <th className="px-6 py-4 font-semibold border-b border-slate-200">Requested Access</th>
                  <th className="px-6 py-4 font-semibold border-b border-slate-200 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingRegs.map(reg => (
                  <tr key={reg.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-800">{reg.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">Applied: {format(new Date(reg.createdAt), 'MMM dd, yyyy')}</div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div>{reg.email}</div>
                      <div className="text-slate-500 mt-0.5">{reg.phone}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${
                          reg.requestedRole === 'Admin' ? 'bg-purple-100 text-purple-700' :
                          reg.requestedRole === 'Client' ? 'bg-amber-100 text-amber-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {reg.requestedRole || 'Staff'}
                        </span>
                        <span className="text-sm font-medium text-slate-600">
                          ({reg.jobPosition})
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      {superAdmin ? (
                        <>
                          <button
                            onClick={() => handleOpenApproval(reg)}
                            disabled={isActionSaving || backend.isSaving}
                            className="inline-flex items-center px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-4 h-4 mr-1.5" /> Approve
                          </button>
                          <button
                            onClick={async () => {
                              const previousRegistrations = useStore.getState().registrations;
                              rejectRegistration(reg.id);
                              setIsActionSaving(true);
                              const saved = await commitPendingMutation();
                              setIsActionSaving(false);
                              if (!saved.ok) {
                                useStore.setState({ registrations: previousRegistrations });
                                setActionError(saved.error || 'The rejection was rolled back. Use Retry required to confirm it.');
                              }
                            }}
                            disabled={isActionSaving || backend.isSaving}
                            className="inline-flex items-center px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <XCircle className="w-4 h-4 mr-1.5" /> Reject
                          </button>
                        </>
                      ) : (
                        <span className="text-xs font-medium text-slate-500">Super Admin approval required</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Roles & Permissions */}
      <div className={`${cardBase} overflow-hidden`}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-blue-600" />
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Roles & Permissions</h3>
            <p className="text-sm text-slate-500">Create named roles with core app permissions. Super admin access stays protected.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-0">
          <form onSubmit={handleSaveRole} className="p-6 border-b xl:border-b-0 xl:border-r border-slate-100 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Role Name</label>
                <input
                  className={cn(inputBase, 'px-3 py-2.5')}
                  value={roleForm.name}
                  onChange={e => setRoleForm({ ...roleForm, name: e.target.value })}
                  placeholder="e.g. Account Manager"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Base Role</label>
                <select
                  className={cn(inputBase, 'px-3 py-2.5')}
                  value={roleForm.baseRole}
                  onChange={e => handleRoleBaseChange(e.target.value as Role)}
                >
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <input
                className={cn(inputBase, 'px-3 py-2.5')}
                value={roleForm.description}
                onChange={e => setRoleForm({ ...roleForm, description: e.target.value })}
                placeholder="Short internal note"
              />
            </div>

            <div className="space-y-4">
              {permissionGroups.map(group => (
                <div key={group.title}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{group.title}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {group.keys.map(key => (
                      <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={roleForm.permissions[key]}
                          onChange={() => togglePermission(key)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        {permissionLabels[key]}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {roleError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {roleError}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-3">
              {roleEditorId && (
                <Button type="button" variant="secondary" onClick={() => resetRoleForm()}>
                  Cancel Edit
                </Button>
              )}
              <Button type="submit">
                <Save className="w-4 h-4" />
                {roleEditorId ? 'Update Role' : 'Create Role'}
              </Button>
            </div>
          </form>

          <div className="p-6 space-y-3">
            {rolePermissions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                No custom roles yet. Create one to assign it to team members.
              </div>
            ) : rolePermissions.map(customRole => (
              <div key={customRole.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold text-slate-900">{customRole.name}</h4>
                      <Badge tone="slate">Base: {customRole.baseRole}</Badge>
                    </div>
                    {customRole.description && <p className="mt-1 text-sm text-slate-500">{customRole.description}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" onClick={() => handleEditRole(customRole.id)}>Edit</Button>
                    <Button type="button" variant="danger" onClick={() => void handleDeleteRole(customRole.id)} disabled={isActionSaving}>Delete</Button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(customRole.permissions)
                    .filter(([, enabled]) => enabled)
                    .map(([key]) => (
                      <Badge key={key} tone="indigo">{permissionLabels[key as RolePermissionKey]}</Badge>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* History */}
      {historyRegs.length > 0 && (
          <div className={`${cardBase} overflow-hidden opacity-70`}>
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Recent Decisions</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-slate-100">
                {historyRegs.map(reg => (
                  <tr key={reg.id}>
                    <td className="px-6 py-3 font-medium text-slate-700">{reg.name}</td>
                    <td className="px-6 py-3 text-slate-500">{reg.email}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex px-2 py-1 rounded-md text-xs font-semibold ${
                        reg.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {reg.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Active Users Management */}
      <div className={`${cardBase} overflow-hidden mt-8`}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-slate-800">Active System Users</h3>
          </div>
          <Button variant="secondary" onClick={() => setIsAddUserOpen(true)}>
            <UserPlus className="w-4 h-4" />
            Add Member
          </Button>
        </div>
        {deleteUserError && (
          <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {deleteUserError}
          </div>
        )}
        {assignmentError && (
          <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {assignmentError}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                <th className="px-6 py-4 font-semibold border-b border-slate-200">User</th>
                <th className="px-6 py-4 font-semibold border-b border-slate-200">Role & Dept</th>
                <th className="px-6 py-4 font-semibold border-b border-slate-200">Custom Role</th>
                <th className="px-6 py-4 font-semibold border-b border-slate-200">Contact</th>
                <th className="px-6 py-4 font-semibold border-b border-slate-200 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <img src={u.avatar} alt={u.name} className="w-8 h-8 rounded-full object-cover border border-slate-200" />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-800">{u.name}</span>
                          {isBossKoo(u) && <Badge tone="purple">Super Admin</Badge>}
                        </div>
                        {u.email && <div className="text-xs text-slate-500 mt-0.5">{u.email}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${
                        u.role === 'Admin' ? 'bg-purple-100 text-purple-700' :
                        u.role === 'Client' ? 'bg-amber-100 text-amber-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {u.role}
                      </span>
                      <span className="text-sm font-medium text-slate-600">
                        {u.role === 'Client' ? `(${u.companyName})` : `(${u.department})`}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 min-w-[220px]">
                    {isBossKoo(u) ? (
                      <Badge tone="purple">Permanent Super Admin</Badge>
                    ) : (
                      <select
                        className={cn(inputBase, 'px-3 py-2 text-sm')}
                        value={u.customRoleId || ''}
                        onChange={e => void handleAssignRole(u.id, e.target.value)}
                        disabled={isActionSaving}
                      >
                        <option value="">Base role only ({getEffectiveRoleName(u, rolePermissions)})</option>
                        {rolePermissions.map(customRole => (
                          <option key={customRole.id} value={customRole.id}>{customRole.name}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {u.email || 'No email on file'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {canDeleteUser(currentUser, u, rolePermissions) ? (
                      <button 
                        onClick={() => {
                          setDeleteUserError('');
                          setUserToDelete(u.id);
                        }}
                        className="inline-flex items-center px-3 py-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors"
                        title="Remove User"
                        aria-label={`Remove ${u.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : isBossKoo(u) || u.id === currentUser?.id ? (
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                        Protected account
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-slate-400">No access</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Member Modal */}
      {isAddUserOpen && (
        <ModalShell
          labelledBy={addMemberTitleId}
          onClose={() => {
            resetNewUser();
            setIsAddUserOpen(false);
          }}
          panelClassName="max-w-lg animate-in fade-in zoom-in-95 duration-200"
        >
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h2 id={addMemberTitleId} className="text-lg font-semibold text-slate-950">Add new member</h2>
              <p className="text-sm text-slate-500 mt-1">Invite a new account. Existing Staff signups should be approved below.</p>
            </div>

            <form onSubmit={handleAddUser} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                  <input
                    className={cn(inputBase, 'px-3 py-2.5')}
                    value={newUser.name}
                    onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    className={cn(inputBase, 'px-3 py-2.5')}
                    value={newUser.email}
                    onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                    placeholder="member@email.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">System Role</label>
                  <select
                    className={cn(inputBase, 'px-3 py-2.5')}
                    value={newUser.role}
                    onChange={e => {
                      const nextRole = e.target.value as Role;
                      setNewUser({
                        ...newUser,
                        role: nextRole,
                        department: nextRole === 'Client' ? 'Client' : nextRole === 'Admin' ? 'Management' : newUser.department,
                      });
                    }}
                  >
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Custom Role</label>
                  <select
                    className={cn(inputBase, 'px-3 py-2.5')}
                    value={newUser.customRoleId}
                    onChange={e => setNewUser({ ...newUser, customRoleId: e.target.value })}
                  >
                    <option value="">Base role only</option>
                    {rolePermissions.map(customRole => <option key={customRole.id} value={customRole.id}>{customRole.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
                  <select
                    className={cn(inputBase, 'px-3 py-2.5')}
                    value={newUser.department}
                    disabled={newUser.role === 'Client'}
                    onChange={e => setNewUser({ ...newUser, department: e.target.value as Department })}
                  >
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              {newUser.role === 'Client' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Client Company</label>
                  <input
                    className={cn(inputBase, 'px-3 py-2.5')}
                    value={newUser.companyName}
                    onChange={e => setNewUser({ ...newUser, companyName: e.target.value })}
                    placeholder="e.g. UrbanEats"
                    required
                  />
                </div>
              )}

              {secureAccounts ? (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                  <label className="flex items-start gap-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      checked={sendNewUserInvitation}
                      onChange={event => setSendNewUserInvitation(event.target.checked)}
                    />
                    <span>
                      <span className="block font-medium text-slate-900">Send email invitation</span>
                      <span className="mt-0.5 block text-xs text-slate-500">Enable this after SMTP is configured.</span>
                    </span>
                  </label>
                  {!sendNewUserInvitation && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Temporary Password</label>
                      <input
                        type="password"
                        autoComplete="new-password"
                        minLength={12}
                        className={cn(inputBase, 'px-3 py-2.5')}
                        value={newUser.password}
                        onChange={event => setNewUser({ ...newUser, password: event.target.value })}
                        required
                      />
                      <p className="mt-1 text-xs text-slate-500">At least 12 characters. The member must change it after login.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Default Password</label>
                  <input
                    type="text"
                    className={cn(inputBase, 'px-3 py-2.5')}
                    value={newUser.password}
                    onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                    required
                  />
                  <p className="text-xs text-slate-500 mt-1">The member signs in with this password first, then resets it in Settings.</p>
                </div>
              )}

              {addUserError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert" aria-live="assertive">
                  {addUserError}
                </div>
              )}

              <div className="pt-4 flex gap-3 justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    resetNewUser();
                    setIsAddUserOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isActionSaving || backend.isSaving}>
                  {isActionSaving
                    ? sendNewUserInvitation ? 'Sending invitation...' : 'Creating account...'
                    : 'Create member'}
                </Button>
              </div>
            </form>
        </ModalShell>
      )}

      {/* Approval Modal */}
      {selectedReg && (
        <ModalShell
          labelledBy={approvalTitleId}
          onClose={() => setSelectedReg(null)}
          panelClassName="max-w-md animate-in fade-in zoom-in-95 duration-200"
        >
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h2 id={approvalTitleId} className="text-lg font-semibold text-slate-950">Assign role and department</h2>
              <p className="text-sm text-slate-500 mt-1">Configure system access for {selectedReg.name}.</p>
            </div>
            
            <form onSubmit={handleApprove} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">System Role</label>
                <select 
                  className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5"
                  value={secureAccounts ? 'Staff' : role}
                  disabled={secureAccounts}
                  onChange={e => setRole(e.target.value as Role)}
                >
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                {secureAccounts && <p className="mt-1 text-xs text-slate-500">Registrations are approved as Staff.</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
                <select 
                  className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5"
                  value={department} onChange={e => setDepartment(e.target.value as Department)}
                >
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Custom Role</label>
                <select
                  className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5"
                  value={approvalCustomRoleId}
                  onChange={e => setApprovalCustomRoleId(e.target.value)}
                >
                  <option value="">Base role only</option>
                  {rolePermissions.map(customRole => <option key={customRole.id} value={customRole.id}>{customRole.name}</option>)}
                </select>
              </div>

              {role === 'Client' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
                  <input 
                    type="text" required
                    placeholder="e.g. TechNova"
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5"
                    value={companyName} onChange={e => setCompanyName(e.target.value)}
                  />
                  <p className="text-xs text-slate-500 mt-1">This links the client to their specific companies.</p>
                </div>
              )}

              {secureAccounts && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                  <label className="flex items-start gap-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      checked={sendApprovalInvitation}
                      onChange={event => setSendApprovalInvitation(event.target.checked)}
                    />
                    <span>
                      <span className="block font-medium text-slate-900">
                        {selectedReg.onboardingMode === 'legacy_invite' ? 'Send email invitation' : 'Require verified email'}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {sendApprovalInvitation
                          ? 'Approval waits for email delivery or verification.'
                          : 'Approve without SMTP using the member\'s existing password.'}
                      </span>
                    </span>
                  </label>
                  {selectedReg.onboardingMode === 'legacy_invite' && !sendApprovalInvitation && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Temporary Password</label>
                      <input
                        type="password"
                        autoComplete="new-password"
                        minLength={12}
                        className={cn(inputBase, 'px-3 py-2.5')}
                        value={approvalTemporaryPassword}
                        onChange={event => setApprovalTemporaryPassword(event.target.value)}
                        required
                      />
                      <p className="mt-1 text-xs text-slate-500">Share it privately. AiTask does not store the password.</p>
                    </div>
                  )}
                  {!sendApprovalInvitation && selectedReg.onboardingMode !== 'legacy_invite' && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800" role="note">
                      Confirm the applicant's identity before approving. Without email verification, approval activates the password chosen during signup.
                    </div>
                  )}
                </div>
              )}

              <div className="pt-4 flex gap-3 justify-end">
                <button 
                  type="button" onClick={() => setSelectedReg(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Confirm & Approve
                </button>
              </div>
            </form>
        </ModalShell>
      )}
      {/* Delete User Modal */}
      {userToDelete && (
        <ModalShell
          labelledBy={deleteMemberTitleId}
          onClose={() => setUserToDelete(null)}
          overlayClassName="z-[60]"
          panelClassName="max-w-sm animate-in fade-in zoom-in-95 duration-200"
        >
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 id={deleteMemberTitleId} className="mb-2 text-lg font-semibold text-slate-950">Delete user account</h3>
              <p className="text-sm text-slate-500">
                Are you sure you want to permanently delete this user? They will immediately lose access to the system. This action cannot be undone.
              </p>
            </div>
            <div className="px-6 py-4 bg-slate-50 flex gap-3 justify-center">
              <button 
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => void handleDeleteUser()}
                disabled={isActionSaving}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete user
              </button>
            </div>
        </ModalShell>
      )}
    </div>
  );
};

export default Approvals;
