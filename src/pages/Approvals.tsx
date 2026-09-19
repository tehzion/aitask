import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { ArrowLeft, CheckCircle2, XCircle, UserPlus, Users, Trash2, AlertTriangle, ShieldCheck, Save, Pencil, Search, X, Clock3, UserCheck, History, ChevronRight } from 'lucide-react';
import { CustomRole, Department, Role, Registration, RolePermissionKey, RolePermissions, User } from '../types';
import { format } from 'date-fns';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, Button, IconButton, MetricCard, PageHeader, SegmentedTabs } from '../components/ui';
import { cardBase, fieldLabel, inputBase, pageShell } from '../components/uiTokens';
import { cn } from '../lib/utils';
import { useI18n } from '../components/I18nProvider';
import { canDeleteUser, defaultRolePermissions, getAssignableCustomRoles, getEffectivePermissions, getEffectiveRoleName, getRoleDisplayName, hodRestrictedPermissionKeys, isBossKoo, nonSuperAdminOnlyPermissionKeys, permissionGroups, permissionLabels, BUILTIN_HOD_ROLE_ID } from '../lib/access';
import { DEFAULT_USER_PASSWORD } from '../lib/auth';
import { shouldUseSecureSupabase } from '../lib/supabaseClient';
import { getMemberDepartments, normalizeDepartment } from '../lib/departments';
import { getRetainedSecureMemberMutation } from '../lib/secureWorkspace';
import { useToastStore } from '../store/useToastStore';
import ModalShell from '../components/ModalShell';
import ConfirmDialog from '../components/ConfirmDialog';
import DepartmentMultiSelect from '../components/DepartmentMultiSelect';

const ROLES: Role[] = ['Project Manager', 'HOD', 'Staff', 'Client'];
const APPROVAL_TABS = ['registrations', 'members', 'roles', 'history'] as const;
type ApprovalTab = typeof APPROVAL_TABS[number];

const approvalTabItems = [
  { id: 'registrations' as const, label: 'Registrations', compactLabel: 'Queue', icon: UserCheck },
  { id: 'members' as const, label: 'Members', compactLabel: 'Members', icon: Users },
  { id: 'roles' as const, label: 'Roles', compactLabel: 'Roles', icon: ShieldCheck },
  { id: 'history' as const, label: 'History', compactLabel: 'History', icon: History },
];

const isApprovalTab = (value: string | null): value is ApprovalTab => Boolean(value && APPROVAL_TABS.includes(value as ApprovalTab));

const clonePermissions = (permissions: RolePermissions): RolePermissions => ({ ...permissions });

type ConfirmationState = {
  title: string;
  description: string;
  confirmLabel: string;
  action: () => void | Promise<void>;
  tone?: 'danger' | 'primary';
};

type RegistrationReviewPanelProps = {
  registration: Registration;
  waitingDays: number;
  role: Role;
  departments: Department[];
  customRoleId: string;
  companyName: string;
  sendInvitation: boolean;
  temporaryPassword: string;
  secureAccounts: boolean;
  rolePermissions: CustomRole[];
  isSaving: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onRoleChange: (role: Role) => void;
  onDepartmentsChange: (departments: Department[]) => void;
  onCustomRoleChange: (customRoleId: string) => void;
  onCompanyNameChange: (companyName: string) => void;
  onInvitationChange: (sendInvitation: boolean) => void;
  onTemporaryPasswordChange: (password: string) => void;
  onGeneratePassword: () => void;
};

const RegistrationReviewPanel: React.FC<RegistrationReviewPanelProps> = ({
  registration,
  waitingDays,
  role,
  departments,
  customRoleId,
  companyName,
  sendInvitation,
  temporaryPassword,
  secureAccounts,
  rolePermissions,
  isSaving,
  error,
  onClose,
  onSubmit,
  onRoleChange,
  onDepartmentsChange,
  onCustomRoleChange,
  onCompanyNameChange,
  onInvitationChange,
  onTemporaryPasswordChange,
  onGeneratePassword,
}) => {
  const descriptionId = `approval-review-description-${registration.id}`;
  const errorId = `approval-review-error-${registration.id}`;
  const roleNeedsDepartments = role === 'Staff' || role === 'HOD';

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line/80 bg-inset/50 px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold tracking-wide text-ink">Registration review</p>
            <Badge tone="amber">Pending</Badge>
            {waitingDays >= 7 && <Badge tone="red">{waitingDays}d waiting</Badge>}
          </div>
          <h2 id={`approval-review-title-${registration.id}`} className="mt-2 truncate text-xl font-semibold tracking-[-0.025em] text-ink sm:text-2xl">{registration.name}</h2>
          <p id={descriptionId} className="mt-1 text-sm leading-6 text-muted">Review identity, requested access, and onboarding before approving this account.</p>
        </div>
        <IconButton label="Close registration review" onClick={onClose} className="shrink-0">
          <X className="h-5 w-5" aria-hidden="true" />
        </IconButton>
      </header>

      <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col" aria-describedby={descriptionId}>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {error && (
            <div id={errorId} className="mb-5 rounded-control border border-red-200 bg-red-50 px-3 py-3 text-sm leading-6 text-red-800" role="alert" aria-live="assertive">
              {error}
            </div>
          )}

          <section aria-labelledby={`applicant-details-${registration.id}`} className="rounded-panel border border-line/80 bg-surface p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 id={`applicant-details-${registration.id}`} className="text-sm font-semibold text-ink">Applicant details</h3>
              <span className="text-xs text-muted">Applied {format(new Date(registration.createdAt), 'MMM d, yyyy')}</span>
            </div>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="min-w-0"><dt className="text-xs font-medium text-muted">Email</dt><dd data-i18n-skip className="mt-1 break-words text-sm font-medium text-ink">{registration.email || 'No email provided'}</dd></div>
              <div className="min-w-0"><dt className="text-xs font-medium text-muted">Phone</dt><dd data-i18n-skip className="mt-1 break-words text-sm font-medium text-ink">{registration.phone || 'No phone provided'}</dd></div>
              <div className="min-w-0"><dt className="text-xs font-medium text-muted">Requested position</dt><dd data-i18n-skip className="mt-1 break-words text-sm font-medium text-ink">{registration.jobPosition || 'Not specified'}</dd></div>
              <div className="min-w-0"><dt className="text-xs font-medium text-muted">Onboarding</dt><dd className="mt-1 text-sm font-medium text-ink">{registration.onboardingMode === 'legacy_invite' ? 'Invitation' : 'Self signup'}</dd></div>
            </dl>
          </section>

          <section aria-labelledby={`access-details-${registration.id}`} className="mt-4 rounded-panel border border-line/80 bg-surface p-4 sm:p-5">
            <div>
              <h3 id={`access-details-${registration.id}`} className="text-sm font-semibold text-ink">Access assignment</h3>
              <p className="mt-1 text-sm leading-6 text-muted">Assign the smallest workspace access needed for this member.</p>
            </div>

            <div className="mt-5 space-y-5">
              <div>
                <label htmlFor={`approval-role-${registration.id}`} className={fieldLabel}>System role</label>
                <select
                  id={`approval-role-${registration.id}`}
                  className={cn(inputBase, 'px-3 py-2.5')}
                  value={role}
                  onChange={event => onRoleChange(event.target.value as Role)}
                  disabled={isSaving}
                >
                  {ROLES.map(option => <option key={option} value={option}>{option}</option>)}
                </select>
                <p className="mt-1 text-xs leading-5 text-muted">Requested role: <span className="font-medium text-ink">{registration.requestedRole}</span></p>
              </div>

              {role === 'Client' ? (
                <div>
                  <label htmlFor={`approval-company-${registration.id}`} className={fieldLabel}>Client company</label>
                  <input
                    id={`approval-company-${registration.id}`}
                    className={cn(inputBase, 'px-3 py-2.5')}
                    value={companyName}
                    onChange={event => onCompanyNameChange(event.target.value)}
                    placeholder="Choose or enter a company"
                    disabled={isSaving}
                    aria-required="true"
                  />
                  <p className="mt-1 text-xs leading-5 text-muted">The client account will only see work linked to this company.</p>
                </div>
              ) : (
                <DepartmentMultiSelect
                  value={departments}
                  onChange={onDepartmentsChange}
                  disabled={isSaving}
                  label={roleNeedsDepartments ? 'Departments' : 'Departments (optional)'}
                  description={roleNeedsDepartments ? 'Select every department this member can receive assignments from.' : 'Add departments when this Project Manager needs a narrower portfolio scope.'}
                />
              )}

              <div>
                <label htmlFor={`approval-custom-role-${registration.id}`} className={fieldLabel}>Custom role</label>
                <select
                  id={`approval-custom-role-${registration.id}`}
                  className={cn(inputBase, 'px-3 py-2.5')}
                  value={customRoleId}
                  onChange={event => onCustomRoleChange(event.target.value)}
                  disabled={isSaving}
                >
                  <option value="">Base role only</option>
                  {getAssignableCustomRoles(role, rolePermissions).filter(customRole => !customRole.isBuiltin).map(customRole => <option key={customRole.id} value={customRole.id}>{customRole.name}</option>)}
                </select>
                <p className="mt-1 text-xs leading-5 text-muted">Custom roles are limited to the selected system role.</p>
              </div>
            </div>
          </section>

          {secureAccounts && (
            <section aria-labelledby={`onboarding-details-${registration.id}`} className="mt-4 rounded-panel border border-line/80 bg-inset/60 p-4 sm:p-5">
              <h3 id={`onboarding-details-${registration.id}`} className="text-sm font-semibold text-ink">Onboarding</h3>
              <label className="mt-3 flex min-h-11 items-start gap-3 text-sm text-ink">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-line text-accent focus:ring-accent/40"
                  checked={sendInvitation}
                  onChange={event => onInvitationChange(event.target.checked)}
                  disabled={isSaving}
                />
                <span>
                  <span className="block font-medium">{registration.onboardingMode === 'legacy_invite' ? 'Send email invitation' : 'Require verified email'}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted">{sendInvitation ? 'Approval waits for email delivery or verification.' : 'Approve without SMTP using the member\'s existing password.'}</span>
                </span>
              </label>

              {registration.onboardingMode === 'legacy_invite' && !sendInvitation && (
                <div className="mt-4">
                  <label htmlFor={`approval-password-${registration.id}`} className={fieldLabel}>Temporary password</label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      id={`approval-password-${registration.id}`}
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
                      className={cn(inputBase, 'px-3 py-2.5')}
                      value={temporaryPassword}
                      onChange={event => onTemporaryPasswordChange(event.target.value)}
                      disabled={isSaving}
                      required
                    />
                    <Button type="button" variant="secondary" className="shrink-0" onClick={onGeneratePassword} disabled={isSaving}>Generate &amp; copy</Button>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted">Share it privately. AiTask does not store the password.</p>
                </div>
              )}

              {!sendInvitation && registration.onboardingMode !== 'legacy_invite' && (
                <div className="mt-4 rounded-control border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-900" role="note">
                  Confirm the applicant&apos;s identity before approving. Without email verification, approval activates the password chosen during signup.
                </div>
              )}
            </section>
          )}
        </div>

        <footer className="modalFooter shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back to queue</Button>
          <Button type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : 'Confirm & approve'}<CheckCircle2 className="h-4 w-4" aria-hidden="true" /></Button>
        </footer>
      </form>
    </div>
  );
};

const Approvals: React.FC = () => {
  const { t } = useI18n();
  const addMemberTitleId = React.useId();
  const deleteMemberTitleId = React.useId();
  const editDepartmentsTitleId = React.useId();
  const editPermissionsTitleId = React.useId();
  const confirmationTitleId = React.useId();
  const secureAccounts = shouldUseSecureSupabase();
  const {
    registrations,
    approveRegistration,
    rejectRegistration,
    currentUser,
    users,
    deleteUser,
    addUserBySuperAdmin,
    updateMemberDepartments,
    updateMemberPermissions,
    rolePermissions,
    clients,
    addCustomRole,
    updateCustomRole,
    deleteCustomRole,
    changeMemberRole,
    backend,
    commitPendingMutation,
    retryMutation,
  } = useStore(useShallow(state => ({
    registrations: state.registrations,
    approveRegistration: state.approveRegistration,
    rejectRegistration: state.rejectRegistration,
    currentUser: state.currentUser,
    users: state.users,
    deleteUser: state.deleteUser,
    addUserBySuperAdmin: state.addUserBySuperAdmin,
    updateMemberDepartments: state.updateMemberDepartments,
    updateMemberPermissions: state.updateMemberPermissions,
    rolePermissions: state.rolePermissions,
    clients: state.clients,
    addCustomRole: state.addCustomRole,
    updateCustomRole: state.updateCustomRole,
    deleteCustomRole: state.deleteCustomRole,
    changeMemberRole: state.changeMemberRole,
    backend: state.backend,
    commitPendingMutation: state.commitPendingMutation,
    retryMutation: state.retryMutation,
  })));
  const [selectedReg, setSelectedReg] = useState<Registration | null>(null);
  const [isMobileApprovalViewport, setIsMobileApprovalViewport] = useState(false);
  const [selectedBulkRegIds, setSelectedBulkRegIds] = useState<Set<string>>(new Set());
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = isApprovalTab(searchParams.get('tab')) ? searchParams.get('tab') as ApprovalTab : 'registrations';
  const registrationQueryId = searchParams.get('registrationId');
  const [registrationSearch, setRegistrationSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [memberRoleFilter, setMemberRoleFilter] = useState<'All' | Role>('All');
  
  const [role, setRole] = useState<Role>('Staff');
  const [approvalDepartments, setApprovalDepartments] = useState<Department[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [addUserError, setAddUserError] = useState('');
  const [sendNewUserInvitation, setSendNewUserInvitation] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: secureAccounts ? '' : DEFAULT_USER_PASSWORD,
    role: 'Staff' as Role,
    departments: [] as Department[],
    companyName: '',
    customRoleId: '',
    workerType: 'employee' as NonNullable<User['workerType']>,
  });
  const [approvalCustomRoleId, setApprovalCustomRoleId] = useState('');
  const [sendApprovalInvitation, setSendApprovalInvitation] = useState(false);
  const [approvalTemporaryPassword, setApprovalTemporaryPassword] = useState('');
  const [roleEditorId, setRoleEditorId] = useState<string | null>(null);
  const [roleError, setRoleError] = useState('');
  const [assignmentError, setAssignmentError] = useState('');
  const [actionError, setActionError] = useState('');
  const [isActionSaving, setIsActionSaving] = useState(false);
  const [memberDepartmentsId, setMemberDepartmentsId] = useState<string | null>(null);
  const [memberDepartments, setMemberDepartments] = useState<Department[]>([]);
  const [memberDepartmentsError, setMemberDepartmentsError] = useState('');
  const [memberPermissionsId, setMemberPermissionsId] = useState<string | null>(null);
  const [memberPermissionsCustom, setMemberPermissionsCustom] = useState(false);
  const [memberPermissions, setMemberPermissions] = useState<RolePermissions>(() => clonePermissions(defaultRolePermissions.Staff));
  const [memberPermissionsBefore, setMemberPermissionsBefore] = useState<RolePermissions>(() => clonePermissions(defaultRolePermissions.Staff));
  const [memberPermissionsError, setMemberPermissionsError] = useState('');
  const [roleCompanyUserId, setRoleCompanyUserId] = useState<string | null>(null);
  const [roleCompanyName, setRoleCompanyName] = useState('');
  const [roleDeptUserId, setRoleDeptUserId] = useState<string | null>(null);
  const [roleDeptPending, setRoleDeptPending] = useState<{ role: Role; customRoleId?: string } | null>(null);
  const [roleDeptValue, setRoleDeptValue] = useState<Department[]>([]);
  const superAdmin = isBossKoo(currentUser);
  const [roleForm, setRoleForm] = useState({
    name: '',
    description: '',
    baseRole: 'Staff' as Role,
    departmentScoped: false,
    permissions: clonePermissions(defaultRolePermissions.Staff),
  });

  // Delete User Modal State
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [deleteUserError, setDeleteUserError] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const update = () => setIsMobileApprovalViewport(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const pendingDays = (reg: Registration) => {
    const created = new Date(reg.createdAt).getTime();
    return Math.max(0, Math.floor((Date.now() - created) / (1000 * 60 * 60 * 24)));
  };

  const pendingRegs = useMemo(
    () => (registrations || [])
      .filter(registration => registration.status === 'Pending')
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()),
    [registrations],
  );
  const historyRegs = useMemo(
    () => (registrations || [])
      .filter(registration => registration.status !== 'Pending')
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [registrations],
  );
  const filteredPendingRegs = useMemo(() => {
    const query = registrationSearch.trim().toLowerCase();
    if (!query) return pendingRegs;
    return pendingRegs.filter(registration => [
      registration.name,
      registration.email,
      registration.phone,
      registration.jobPosition,
      registration.requestedRole,
      registration.onboardingMode,
    ].some(value => value?.toLowerCase().includes(query)));
  }, [pendingRegs, registrationSearch]);
  const agedRegistrationCount = pendingRegs.filter(registration => pendingDays(registration) >= 7).length;
  const activeMemberCount = users.length;
  const memberPermissionsUser = memberPermissionsId
    ? users.find(user => user.id === memberPermissionsId)
    : undefined;
  const retainedMemberMutation = getRetainedSecureMemberMutation();
  const memberPermissionsDefault = memberPermissionsUser
    ? getEffectivePermissions({ ...memberPermissionsUser, permissions: undefined }, rolePermissions)
    : clonePermissions(defaultRolePermissions.Staff);
  const memberPermissionsPreview = memberPermissionsCustom ? memberPermissions : memberPermissionsDefault;
  const memberPermissionKeys = permissionGroups.flatMap(group => group.keys);
  const addedMemberPermissions = memberPermissionKeys.filter(key => memberPermissionsPreview[key] && !memberPermissionsBefore[key]);
  const removedMemberPermissions = memberPermissionKeys.filter(key => !memberPermissionsPreview[key] && memberPermissionsBefore[key]);

  const updateApprovalQuery = (updates: { tab?: ApprovalTab; registrationId?: string | null }, replace = true) => {
    const next = new URLSearchParams(searchParams);
    if (updates.tab) next.set('tab', updates.tab);
    if (updates.registrationId === null) next.delete('registrationId');
    else if (updates.registrationId) next.set('registrationId', updates.registrationId);
    setSearchParams(next, { replace });
  };

  const closeApprovalReview = () => {
    setSelectedReg(null);
    updateApprovalQuery({ registrationId: null });
  };

  useEffect(() => {
    if (activeTab !== 'registrations' || !registrationQueryId) {
      setSelectedReg(null);
      return;
    }
    const registration = pendingRegs.find(item => item.id === registrationQueryId);
    if (registration) {
      setSelectedReg(current => current?.id === registration.id ? current : registration);
      return;
    }
    setSelectedReg(null);
    const next = new URLSearchParams(searchParams);
    next.delete('registrationId');
    setSearchParams(next, { replace: true });
  }, [activeTab, pendingRegs, registrationQueryId, searchParams, setSearchParams]);

  const toggleBulkSelect = (id: string) => {
    setSelectedBulkRegIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const performBulkReject = async (registrationIds: string[]) => {
    const previousRegistrations = useStore.getState().registrations;
    registrationIds.forEach(id => rejectRegistration(id));
    setIsActionSaving(true);
    const saved = await commitPendingMutation();
    setIsActionSaving(false);
    setSelectedBulkRegIds(new Set());
    if (!saved.ok) {
      useStore.setState({ registrations: previousRegistrations });
      setActionError(saved.error || 'The rejection was rolled back. Use Retry required to confirm it.');
    }
  };

  const handleBulkReject = () => {
    if (selectedBulkRegIds.size === 0 || isActionSaving) return;
    const registrationIds = Array.from(selectedBulkRegIds);
    setConfirmation({
      title: 'Reject registrations',
      description: t(`Reject ${registrationIds.length} registrations? Those applicants will need to apply again.`),
      confirmLabel: 'Reject registrations',
      action: () => performBulkReject(registrationIds),
    });
  };

  const performBulkApprove = async (targets: Registration[]) => {
    const count = targets.length;
    if (secureAccounts) {
      setIsActionSaving(true);
      setActionError('');
      const failures: string[] = [];
      for (const reg of targets) {
        const requestedDepartment = normalizeDepartment(reg.jobPosition);
        const departments = requestedDepartment && requestedDepartment !== 'Client' ? [requestedDepartment] : [];
        if (departments.length === 0) {
          failures.push(reg.name);
          continue;
        }
        const result = await addUserBySuperAdmin({
          name: reg.name,
          email: reg.email,
          role: 'Staff',
          departments,
          registrationId: reg.id,
          sendInvitation: false,
        });
        if (!result.ok) failures.push(reg.name);
      }
      setIsActionSaving(false);
      setSelectedBulkRegIds(new Set());
      if (failures.length > 0) {
        const done = count - failures.length;
        useToastStore.getState().addToast(
          done > 0
            ? `${done} registration(s) approved; ${failures.length} could not be approved. ${failures.slice(0, 3).join(', ')}`
            : `No registrations could be approved. ${failures.slice(0, 3).join(', ')}`,
          'error',
        );
        setActionError(failures.length > 0
          ? `Unable to approve: ${failures.slice(0, 3).join(', ')}${failures.length > 3 ? '…' : ''}`
          : 'No registrations were approved.');
        return;
      }
      useToastStore.getState().addToast(`${count} registration(s) approved.`, 'success');
      return;
    }

    const previousRegistrations = useStore.getState().registrations;
    const previousUsers = useStore.getState().users;
    const fallbackPositions: string[] = [];
    targets.forEach(reg => {
      const requestedDepartment = normalizeDepartment(reg.jobPosition);
      if (!requestedDepartment) fallbackPositions.push(reg.jobPosition || reg.name);
      approveRegistration(reg.id, reg.requestedRole || 'Staff', requestedDepartment ? [requestedDepartment] : ['Designer'], undefined, undefined);
    });
    setIsActionSaving(true);
    const saved = await commitPendingMutation();
    setIsActionSaving(false);
    setSelectedBulkRegIds(new Set());
    if (!saved.ok) {
      useStore.setState({ registrations: previousRegistrations, users: previousUsers });
      setActionError(saved.error || 'The approvals were rolled back. Use Retry required to confirm them.');
      return;
    }
    if (fallbackPositions.length > 0) {
      const uniq = Array.from(new Set(fallbackPositions));
      useToastStore.getState().addToast(
        `${targets.length} approved. ${uniq.slice(0, 3).join(', ')} ${uniq.length === 1 ? 'has' : 'have'} no matching department and ${uniq.length === 1 ? 'was' : 'were'} assigned to Designer.`,
        'warning',
      );
    } else {
      useToastStore.getState().addToast(`${count} registration(s) approved.`, 'success');
    }
  };

  const handleBulkApprove = () => {
    if (selectedBulkRegIds.size === 0 || isActionSaving) return;
    const targets = pendingRegs.filter(reg => selectedBulkRegIds.has(reg.id));
    setConfirmation({
      title: 'Approve registrations',
      description: t(`Approve ${targets.length} registrations as Staff with their requested departments?`),
      confirmLabel: 'Approve registrations',
      tone: 'primary',
      action: () => performBulkApprove(targets),
    });
  };

  const handleOpenApproval = (reg: Registration) => {
    setSelectedReg(reg);
    updateApprovalQuery({ tab: 'registrations', registrationId: reg.id });
    setActionError('');
    setRole(reg.requestedRole || 'Staff');
    if (reg.requestedRole === 'Client') {
      setApprovalDepartments(['Client']);
    } else {
      const requestedDepartment = normalizeDepartment(reg.jobPosition);
      setApprovalDepartments(requestedDepartment && requestedDepartment !== 'Client' ? [requestedDepartment] : []);
    }
    setApprovalCustomRoleId('');
    setSendApprovalInvitation(false);
    setApprovalTemporaryPassword('');
    setCompanyName('');
  };

  const handleTabChange = (tab: ApprovalTab) => {
    if (tab !== 'registrations') {
      setSelectedReg(null);
      updateApprovalQuery({ tab, registrationId: null });
      return;
    }
    updateApprovalQuery({ tab });
  };

  const handleApprovalRoleChange = (nextRole: Role) => {
    setRole(nextRole);
    setApprovalCustomRoleId('');
    setCompanyName('');
    setActionError('');
    if (nextRole === 'Client') setApprovalDepartments(['Client']);
    else if (nextRole === 'Project Manager') setApprovalDepartments([]);
    else {
      const requestedDepartment = selectedReg ? normalizeDepartment(selectedReg.jobPosition) : null;
      setApprovalDepartments(requestedDepartment && requestedDepartment !== 'Client' ? [requestedDepartment] : []);
    }
  };

  const generateApprovalPassword = () => {
    const generated = Array.from(crypto.getRandomValues(new Uint8Array(9)))
      .map(byte => 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'[byte % 55])
      .join('');
    setApprovalTemporaryPassword(generated);
    void navigator.clipboard?.writeText(generated).catch(() => undefined);
  };

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReg || isActionSaving) return;
    setActionError('');
    const departments = role === 'Client' ? ['Client' as Department] : approvalDepartments;
    if (role === 'Client' && !companyName.trim()) {
      setActionError('Choose a client company before approving this member.');
      return;
    }
    if (!['Project Manager', 'Client'].includes(role) && departments.length === 0) {
      setActionError('Choose at least one department before approving this member.');
      return;
    }
    setIsActionSaving(true);
    if (secureAccounts) {
      const inviteResult = await addUserBySuperAdmin({
        name: selectedReg.name,
        email: selectedReg.email,
        role,
        departments,
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
      closeApprovalReview();
      setRole('Staff');
      setApprovalDepartments([]);
      setCompanyName('');
      setApprovalCustomRoleId('');
      setSendApprovalInvitation(false);
      setApprovalTemporaryPassword('');
      return;
    }
    const registrationsBefore = registrations;
    const usersBefore = users;
    const approved = approveRegistration(selectedReg.id, role, departments, role === 'Client' ? companyName : undefined, approvalCustomRoleId || undefined);
    if (!approved.ok) {
      setIsActionSaving(false);
      setActionError(approved.error || 'Unable to approve this member.');
      return;
    }
    const saved = await commitPendingMutation();
    setIsActionSaving(false);
    if (!saved.ok) {
      useStore.setState({
        registrations: registrationsBefore,
        users: usersBefore,
      });
      setActionError(saved.error || 'The approval is waiting to be saved. Use Retry required to continue.');
      return;
    }
    closeApprovalReview();
    setRole('Staff');
    setApprovalDepartments([]);
    setCompanyName('');
    setApprovalCustomRoleId('');
    setSendApprovalInvitation(false);
    setApprovalTemporaryPassword('');
  };

  const resetNewUser = () => {
    setNewUser({
      name: '',
      email: '',
      role: 'Staff',
      departments: [],
      companyName: '',
      customRoleId: '',
      workerType: 'employee',
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
      departmentScoped: baseRole === 'HOD',
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
      departmentScoped: roleForm.baseRole === 'HOD' ? true : roleForm.baseRole === 'Staff' ? roleForm.departmentScoped : false,
      permissions: roleForm.permissions,
    };

    const hasAnyPermission = Object.values(roleForm.permissions).some(Boolean);
    if (!hasAnyPermission) {
      setRoleError('Choose at least one permission so members with this role keep workspace access.');
      return;
    }

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
      departmentScoped: targetRole.departmentScoped === true,
      permissions: clonePermissions(targetRole.permissions),
    });
    setRoleError('');
  };

  const performDeleteRole = async (customRoleId: string) => {
    const targetRole = useStore.getState().rolePermissions.find(customRole => customRole.id === customRoleId);
    if (!targetRole) return;
    const previousRoles = useStore.getState().rolePermissions;
    const previousUsers = useStore.getState().users;
    const previousDeletedRoleIds = useStore.getState().deletedRoleIds || [];
    const result = deleteCustomRole(customRoleId);
    if (!result.ok) {
      setRoleError(result.error || 'Unable to delete role.');
      return;
    }

    setIsActionSaving(true);
    const saved = await commitPendingMutation();
    setIsActionSaving(false);
    if (!saved.ok) {
      useStore.setState({ rolePermissions: previousRoles, users: previousUsers, deletedRoleIds: previousDeletedRoleIds });
      setRoleError(saved.error || 'The role deletion was rolled back. Use Retry required to confirm it.');
      return;
    }

    if (roleEditorId === customRoleId) resetRoleForm();
  };

  const handleDeleteRole = (customRoleId: string) => {
    const targetRole = useStore.getState().rolePermissions.find(customRole => customRole.id === customRoleId);
    if (!targetRole) return;
    const affectedMembers = useStore.getState().users.filter(user => user.customRoleId === customRoleId).length;
    setConfirmation({
      title: 'Delete custom role',
      description: t(`Delete "${targetRole.name}"?${affectedMembers > 0 ? ` ${affectedMembers} member${affectedMembers === 1 ? '' : 's'} will revert to their base role.` : ''}`),
      confirmLabel: 'Delete role',
      action: () => performDeleteRole(customRoleId),
    });
  };

  const roleSelectValue = (user: User) => {
    if (user.customRoleId) return `custom:${user.customRoleId}`;
    return user.role === 'Project Manager' ? 'role:project-manager' : `role:${user.role.toLowerCase()}`;
  };

  const handleChangeRole = async (user: User, value: string) => {
    if (!superAdmin) return;
    setAssignmentError('');
    if (value === 'role:client') {
      setRoleCompanyUserId(user.id);
      setRoleCompanyName('');
      return;
    }
    let nextRole: Role = 'Staff';
    let customRoleId: string | undefined;
    if (value.startsWith('custom:')) {
      const customRole = rolePermissions.find(item => item.id === value.slice('custom:'.length));
      if (!customRole) return;
      nextRole = customRole.baseRole;
      customRoleId = customRole.id;
    } else if (value === 'role:hod') {
      nextRole = 'HOD';
    } else if (value === 'role:project-manager') {
      nextRole = 'Project Manager';
    }

    if (['Staff', 'HOD'].includes(nextRole) && getMemberDepartments(user).length === 0) {
      setRoleCompanyUserId(null);
      setRoleDeptUserId(user.id);
      setRoleDeptPending({ role: nextRole, customRoleId });
      setRoleDeptValue([]);
      return;
    }
    await applyRoleChange(user, nextRole, customRoleId);
  };

  const applyRoleChange = async (
    user: User,
    nextRole: Role,
    customRoleId?: string,
    departments?: Department[],
  ) => {
    setIsActionSaving(true);
    const result = await changeMemberRole(user.id, nextRole, { customRoleId, departments });
    setIsActionSaving(false);
    if (!result.ok) {
      setAssignmentError(result.error || 'Unable to change role.');
      return false;
    }
    setRoleDeptUserId(null);
    setRoleDeptPending(null);
    setRoleDeptValue([]);
    return true;
  };

  const handleConfirmRoleDepartments = async (user: User) => {
    setAssignmentError('');
    if (!roleDeptPending || roleDeptValue.length === 0) {
      setAssignmentError('Choose at least one department for this member.');
      return;
    }
    await applyRoleChange(user, roleDeptPending.role, roleDeptPending.customRoleId, roleDeptValue);
  };

  const handleConfirmClientCompany = async (user: User) => {
    setAssignmentError('');
    if (!roleCompanyName.trim()) {
      setAssignmentError('Choose a company for this client account.');
      return;
    }
    setIsActionSaving(true);
    const result = await changeMemberRole(user.id, 'Client', { companyName: roleCompanyName.trim() });
    setIsActionSaving(false);
    setRoleCompanyUserId(null);
    setRoleCompanyName('');
    if (!result.ok) setAssignmentError(result.error || 'Unable to change role.');
  };

  const handleEditDepartments = (userId: string) => {
    const user = users.find(item => item.id === userId);
    if (!user || user.role === 'Client') return;
    setMemberDepartmentsId(user.id);
    setMemberDepartments(getMemberDepartments(user));
    setMemberDepartmentsError('');
  };

  const handleSaveDepartments = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberDepartmentsId) return;
    setMemberDepartmentsError('');
    const member = users.find(user => user.id === memberDepartmentsId);
    if (member && member.role !== 'Project Manager' && memberDepartments.length === 0) {
      setMemberDepartmentsError('Choose at least one department.');
      return;
    }
    setIsActionSaving(true);
    const result = await updateMemberDepartments(memberDepartmentsId, memberDepartments);
    setIsActionSaving(false);
    if (!result.ok) {
      setMemberDepartmentsError(result.error || 'Unable to update departments.');
      return;
    }
    setMemberDepartmentsId(null);
    setMemberDepartments([]);
  };

  const handleEditPermissions = (userId: string) => {
    const user = users.find(item => item.id === userId);
    if (!user || !['Staff', 'HOD'].includes(user.role) || isBossKoo(user)) return;
    const hasDirectPermissions = Boolean(user.permissions && Object.keys(user.permissions).length > 0);
    setMemberPermissionsId(user.id);
    setMemberPermissionsCustom(hasDirectPermissions);
    const effectivePermissions = clonePermissions(getEffectivePermissions(user, rolePermissions));
    setMemberPermissionsBefore(effectivePermissions);
    setMemberPermissions(effectivePermissions);
    setMemberPermissionsError('');
  };

  const toggleMemberPermission = (key: RolePermissionKey) => {
    setMemberPermissions(current => ({ ...current, [key]: !current[key] }));
  };

  const handleSaveMemberPermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberPermissionsId) return;
    setMemberPermissionsError('');
    setIsActionSaving(true);
    const result = await updateMemberPermissions(
      memberPermissionsId,
      memberPermissionsCustom ? memberPermissions : undefined,
    );
    setIsActionSaving(false);
    if (!result.ok) {
      setMemberPermissionsError(result.error || 'Unable to update member permissions.');
      return;
    }
    setMemberPermissionsId(null);
  };

  const handleRetryMemberMutation = async (kind: 'departments' | 'permissions', memberId: string) => {
    if (
      !retainedMemberMutation
      || retainedMemberMutation.kind !== kind
      || retainedMemberMutation.memberId !== memberId
      || isActionSaving
    ) return;
    if (kind === 'departments') setMemberDepartmentsError('');
    else setMemberPermissionsError('');
    setIsActionSaving(true);
    const result = await retryMutation();
    setIsActionSaving(false);
    if (!result.ok) {
      if (kind === 'departments') setMemberDepartmentsError(result.error || 'Unable to retry the department change.');
      else setMemberPermissionsError(result.error || 'Unable to retry the permission change.');
      return;
    }
    if (kind === 'departments') {
      setMemberDepartmentsId(null);
      setMemberDepartments([]);
    } else {
      setMemberPermissionsId(null);
    }
  };

  const performRejectRegistration = async (registrationId: string) => {
    const previousRegistrations = useStore.getState().registrations;
    rejectRegistration(registrationId);
    setIsActionSaving(true);
    const saved = await commitPendingMutation();
    setIsActionSaving(false);
    if (!saved.ok) {
      useStore.setState({ registrations: previousRegistrations });
      setActionError(saved.error || 'The rejection was rolled back. Use Retry required to confirm it.');
    }
  };

  const handleRejectRegistration = (reg: Registration) => {
    if (isActionSaving) return;
    setConfirmation({
      title: 'Reject registration',
      description: t(`Reject ${reg.name}'s registration? They will need to apply again.`),
      confirmLabel: 'Reject registration',
      action: () => performRejectRegistration(reg.id),
    });
  };

  const visibleMembers = users.filter(user => {
    const normalizedSearch = memberSearch.trim().toLowerCase();
    const matchesSearch = !normalizedSearch || user.name.toLowerCase().includes(normalizedSearch) || (user.email || '').toLowerCase().includes(normalizedSearch);
    const matchesRole = memberRoleFilter === 'All' || user.role === memberRoleFilter;
    return matchesSearch && matchesRole;
  });

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddUserError('');
    setIsActionSaving(true);
    const result = await addUserBySuperAdmin({
      name: newUser.name,
      email: newUser.email || undefined,
      password: newUser.password,
      role: newUser.role,
      departments: newUser.role === 'Client' ? ['Client'] : newUser.departments,
      companyName: newUser.role === 'Client' ? newUser.companyName : undefined,
      customRoleId: newUser.customRoleId || undefined,
      workerType: ['Staff', 'HOD'].includes(newUser.role) ? newUser.workerType : undefined,
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

  if (!superAdmin) {
    return (
      <div className={pageShell}>
        <PageHeader
          title="Approvals — Boss Koo only"
          description="Registration approvals, member management, and role controls are restricted to the Boss Koo account."
        />
        <section className="mt-6 rounded-panel border border-amber-200 bg-amber-50 p-6 text-amber-950" role="alert" aria-labelledby="approvals-access-denied-title">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            <div>
              <h2 id="approvals-access-denied-title" className="font-semibold">Access denied</h2>
              <p className="mt-1 text-sm leading-6">Only Boss Koo can review registrations, change member roles, or edit role permissions.</p>
              <Link to="/tasks" className="mt-4 inline-flex min-h-11 items-center rounded-control bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">Return to work</Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={pageShell}>
      <PageHeader
        title="Approvals"
        description="Review access requests and manage workspace members, roles, and decisions."
        action={superAdmin ? (
          <Button onClick={() => setIsAddUserOpen(true)} disabled={isActionSaving || backend.isSaving}>
            <UserPlus className="w-4 h-4" />
            Add Member
          </Button>
        ) : undefined}
      />

      {actionError && (
        <div className="rounded-panel border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert" aria-live="assertive">
          {actionError}
        </div>
      )}

      <section aria-label="Approval overview" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard title="Pending registrations" value={pendingRegs.length} icon={UserCheck} tone="blue" footer="Awaiting review" />
        <MetricCard title="Aging 7+ days" value={agedRegistrationCount} icon={Clock3} tone={agedRegistrationCount > 0 ? 'red' : 'emerald'} footer={agedRegistrationCount > 0 ? 'Prioritize these requests' : 'Queue is current'} />
        <MetricCard title="Active members" value={activeMemberCount} icon={Users} tone="purple" footer="Workspace accounts" />
        <MetricCard title="Recent decisions" value={historyRegs.length} icon={History} tone="slate" footer="Approved or rejected" />
      </section>

      <SegmentedTabs
        items={approvalTabItems.map(item => ({
          ...item,
          count: item.id === 'registrations' ? pendingRegs.length : item.id === 'members' ? activeMemberCount : item.id === 'history' ? historyRegs.length : undefined,
        }))}
        value={activeTab}
        onChange={handleTabChange}
        label="Approval workspace sections"
        idPrefix="approval-sections"
        variant="underline"
      />

      {/* Pending Approvals */}
      {activeTab === 'registrations' && <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(18rem,26rem)_minmax(0,1fr)]">
      <div className={`${cardBase} min-w-0 overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/80 px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent">
              <UserPlus className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-ink sm:text-lg">Pending registrations</h2>
              <p className="mt-0.5 text-xs text-muted">{pendingRegs.length} {t('awaiting review')}</p>
            </div>
          </div>
          {superAdmin && filteredPendingRegs.length > 0 && (
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-line text-accent focus:ring-accent/40"
                checked={selectedBulkRegIds.size === filteredPendingRegs.length && filteredPendingRegs.length > 0}
                onChange={() => setSelectedBulkRegIds(current => current.size === filteredPendingRegs.length ? new Set() : new Set(filteredPendingRegs.map(reg => reg.id)))}
              />
              {t('Select all')}
            </label>
          )}
        </div>

        <div className="border-b border-line/80 bg-inset/60 p-3 sm:p-4">
          <label htmlFor="registration-search" className="sr-only">Search registrations</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              id="registration-search"
              type="search"
              value={registrationSearch}
              onChange={event => setRegistrationSearch(event.target.value)}
              placeholder="Search name, email, phone, or position"
              className={cn(inputBase, 'pl-9 pr-10')}
            />
            {registrationSearch && (
              <IconButton
                label="Clear registration search"
                className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2"
                onClick={() => setRegistrationSearch('')}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </IconButton>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">Oldest requests appear first so aging access requests stay visible.</p>
        </div>

        {selectedBulkRegIds.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-accent/20 bg-accent-soft/60 px-4 py-3 sm:px-5">
            <p className="text-sm font-semibold text-accent">
              {selectedBulkRegIds.size} {t('selected')}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="primary"
                onClick={() => void handleBulkApprove()}
                disabled={isActionSaving}
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {t('Approve selected')}
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => void handleBulkReject()}
                disabled={isActionSaving}
              >
                <XCircle className="h-4 w-4" aria-hidden="true" /> {t('Reject selected')}
              </Button>
            </div>
          </div>
        )}
        
        {filteredPendingRegs.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <UserCheck className="mx-auto h-7 w-7 text-muted/60" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-ink">{pendingRegs.length === 0 ? 'No pending registrations' : 'No registrations match this search'}</p>
            <p className="mt-1 text-sm text-muted">{pendingRegs.length === 0 ? 'New access requests will appear here.' : 'Try a different name, email, phone number, or position.'}</p>
            {pendingRegs.length > 0 && <Button type="button" variant="secondary" className="mt-4" onClick={() => setRegistrationSearch('')}>Clear search</Button>}
          </div>
        ) : (
          <>
          {/* Mobile cards */}
          <div className="divide-y divide-line/70 sm:hidden">
            {filteredPendingRegs.map(reg => {
              const days = pendingDays(reg);
              return (
              <article
                key={reg.id}
                tabIndex={0}
                aria-label={`Review registration for ${reg.name}`}
                onClick={() => handleOpenApproval(reg)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleOpenApproval(reg);
                  }
                }}
                className="cursor-pointer p-4 transition-colors hover:bg-inset/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    {superAdmin && (
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        checked={selectedBulkRegIds.has(reg.id)}
                        onChange={() => toggleBulkSelect(reg.id)}
                        onClick={event => event.stopPropagation()}
                        aria-label={`Select ${reg.name}`}
                      />
                    )}
                    <div className="min-w-0">
                      <p data-i18n-skip className="font-semibold text-slate-800">{reg.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">Applied {format(new Date(reg.createdAt), 'MMM dd, yyyy')}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {days >= 7 && (
                      <span className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">{days}d</span>
                    )}
                    <span className="inline-flex px-2 py-1 rounded-md text-xs font-bold tracking-wide bg-accent-soft text-accent">
                      {reg.requestedRole || 'Staff'}
                    </span>
                  </div>
                </div>
                <p data-i18n-skip className="mt-2 text-sm text-slate-600">{reg.email}</p>
                <p data-i18n-skip className="mt-0.5 text-sm text-slate-500">{reg.phone}{reg.jobPosition ? ` · ${reg.jobPosition}` : ''}</p>
                <div className="mt-3 flex gap-2">
                  {superAdmin ? (
                    <>
                      <button
                        onClick={event => { event.stopPropagation(); handleOpenApproval(reg); }}
                        disabled={isActionSaving || backend.isSaving}
                        className="flex min-h-11 flex-1 items-center justify-center rounded-control border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1.5" /> Approve
                      </button>
                      <button
                        onClick={event => { event.stopPropagation(); handleRejectRegistration(reg); }}
                        disabled={isActionSaving || backend.isSaving}
                        className="flex min-h-11 flex-1 items-center justify-center rounded-control border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4 mr-1.5" /> Reject
                      </button>
                    </>
                  ) : (
                    <span className="text-xs font-medium text-muted">Boss Koo approval required</span>
                  )}
                </div>
              </article>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-inset/70 text-xs tracking-wide text-muted">
                  <th className="w-10 border-b border-line px-4 py-4">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="border-b border-line px-6 py-4 font-semibold">Name</th>
                  <th className="border-b border-line px-6 py-4 font-semibold">Contact</th>
                  <th className="border-b border-line px-6 py-4 font-semibold">Requested access</th>
                  <th className="border-b border-line px-6 py-4 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {filteredPendingRegs.map(reg => {
                  const days = pendingDays(reg);
                  return (
                  <tr
                    key={reg.id}
                    tabIndex={0}
                    aria-label={`Review registration for ${reg.name}`}
                    onClick={() => handleOpenApproval(reg)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleOpenApproval(reg);
                      }
                    }}
                    className="cursor-pointer hover:bg-inset/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40"
                  >
                    <td className="px-4 py-4">
                      {superAdmin ? (
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          checked={selectedBulkRegIds.has(reg.id)}
                          onChange={() => toggleBulkSelect(reg.id)}
                          onClick={event => event.stopPropagation()}
                          aria-label={`Select ${reg.name}`}
                        />
                      ) : null}
                    </td>
                    <td className="px-6 py-4">
                      <div data-i18n-skip className="font-semibold text-slate-800">{reg.name}</div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                        Applied: {format(new Date(reg.createdAt), 'MMM dd, yyyy')}
                        {days >= 7 && (
                          <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">{days}d pending</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div data-i18n-skip>{reg.email}</div>
                      <div data-i18n-skip className="text-slate-500 mt-0.5">{reg.phone}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex px-2 py-1 rounded-md text-xs font-bold tracking-wide bg-accent-soft text-accent">
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
                            onClick={event => { event.stopPropagation(); handleOpenApproval(reg); }}
                            disabled={isActionSaving || backend.isSaving}
                            className="inline-flex min-h-11 items-center rounded-control border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-4 h-4 mr-1.5" /> Approve
                          </button>
                          <button
                            onClick={event => { event.stopPropagation(); handleRejectRegistration(reg); }}
                            disabled={isActionSaving || backend.isSaving}
                            className="inline-flex min-h-11 items-center rounded-control border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <XCircle className="w-4 h-4 mr-1.5" /> Reject
                          </button>
                        </>
                      ) : (
                        <span className="text-xs font-medium text-muted">Boss Koo approval required</span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {selectedReg ? (
        <section className="hidden min-h-0 min-w-0 flex-col overflow-hidden rounded-panel bg-surface ring-1 ring-line/80 shadow-sm lg:sticky lg:top-6 lg:flex lg:h-[calc(100dvh-29rem)] lg:max-h-[calc(100dvh-29rem)]" aria-labelledby={`approval-review-title-${selectedReg.id}`}>
          <RegistrationReviewPanel
            registration={selectedReg}
            waitingDays={pendingDays(selectedReg)}
            role={role}
            departments={approvalDepartments}
            customRoleId={approvalCustomRoleId}
            companyName={companyName}
            sendInvitation={sendApprovalInvitation}
            temporaryPassword={approvalTemporaryPassword}
            secureAccounts={secureAccounts}
            rolePermissions={rolePermissions}
            isSaving={isActionSaving || backend.isSaving}
            error={actionError}
            onClose={closeApprovalReview}
            onSubmit={handleApprove}
            onRoleChange={handleApprovalRoleChange}
            onDepartmentsChange={setApprovalDepartments}
            onCustomRoleChange={setApprovalCustomRoleId}
            onCompanyNameChange={setCompanyName}
            onInvitationChange={setSendApprovalInvitation}
            onTemporaryPasswordChange={setApprovalTemporaryPassword}
            onGeneratePassword={generateApprovalPassword}
          />
        </section>
      ) : (
        <aside className="hidden min-h-[26rem] items-center justify-center rounded-panel border border-dashed border-line bg-inset/30 p-8 text-center lg:flex">
          <div className="max-w-sm">
            <ChevronRight className="mx-auto h-8 w-8 text-accent/60" aria-hidden="true" />
            <h2 className="mt-4 text-base font-semibold text-ink">Select a registration to review</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Choose an applicant from the queue to inspect their request and assign access.</p>
          </div>
        </aside>
      )}
      </div>}

      {/* Roles & Permissions */}
      {activeTab === 'roles' && <div className={`${cardBase} overflow-hidden`}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-blue-600" />
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Roles & Permissions</h2>
            <p className="text-sm text-slate-500">Manage Project Manager, HOD, Staff, and Client access. Boss Koo powers and HOD scope stay protected.</p>
          </div>
        </div>

        {!superAdmin && (
          <div className="border-b border-slate-100 bg-amber-50 px-6 py-3 text-sm text-amber-800" role="status">
            Only Boss Koo can manage roles and members. The controls below are read-only for your account.
          </div>
        )}
        <fieldset disabled={!superAdmin} className="p-0 m-0 border-0 min-w-0">
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
                  disabled={roleEditorId === BUILTIN_HOD_ROLE_ID}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Base Role</label>
                <select
                  aria-label="Base Role"
                  className={cn(inputBase, 'px-3 py-2.5')}
                  value={roleForm.baseRole}
                  onChange={e => handleRoleBaseChange(e.target.value as Role)}
                  disabled={roleEditorId === BUILTIN_HOD_ROLE_ID}
                >
                  {ROLES.map(r => <option key={r} value={r}>{t(getRoleDisplayName(r))}</option>)}
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
              {roleForm.baseRole === 'Staff' && (
                <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={roleForm.departmentScoped}
                    onChange={() => setRoleForm({ ...roleForm, departmentScoped: !roleForm.departmentScoped })}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    Limit this role to its departments
                    <span className="mt-0.5 block text-xs text-slate-500">Members only see and edit work in their own departments.</span>
                  </span>
                </label>
              )}
              {permissionGroups.map(group => (
                <div key={group.title}>
                  <p className="text-xs font-semibold tracking-wide text-slate-400 mb-2">{group.title}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {group.keys.map(key => (
                      (() => {
                        const protectedPermission = nonSuperAdminOnlyPermissionKeys.includes(key)
                          || (roleForm.baseRole === 'HOD' && hodRestrictedPermissionKeys.includes(key));
                        return (
                      <label key={key} className={cn('flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700', protectedPermission && 'cursor-not-allowed bg-slate-50 text-slate-400')}>
                        <input
                          type="checkbox"
                          checked={roleForm.permissions[key]}
                          onChange={() => togglePermission(key)}
                          disabled={protectedPermission}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>{permissionLabels[key]}</span>
                        {protectedPermission && <span className="ml-auto text-[10px] font-semibold tracking-wide text-slate-400">Protected</span>}
                      </label>
                        );
                      })()
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
            <div>
              <p className="mb-2 text-xs font-semibold tracking-wide text-slate-400">Default roles</p>
              <div className="space-y-2">
                {([['Project Manager', defaultRolePermissions['Project Manager'], 'Portfolio-scoped operational access. Account and role administration stays with Boss Koo.'],
                  ['HOD', rolePermissions.find(role => role.isBuiltin && role.baseRole === 'HOD')?.permissions || defaultRolePermissions.HOD, 'Editable department lead role. Sees and edits work in their own departments.'],
                  ['Staff', defaultRolePermissions.Staff, 'Standard employee access to assigned work.'],
                  ['Client', defaultRolePermissions.Client, 'Reviews and approves their company work.']] as const).map(([name, permissions, description]) => (
                  <div key={name} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center gap-2">
                      <h3 data-i18n-skip className="font-semibold text-slate-900">{name}</h3>
                      <Badge tone={name === 'HOD' ? 'purple' : 'slate'}>{name === 'HOD' ? 'Editable default' : 'Default'}</Badge>
                      {name === 'HOD' && superAdmin && <Button type="button" variant="secondary" className="ml-auto" onClick={() => handleEditRole(BUILTIN_HOD_ROLE_ID)}>Edit permissions</Button>}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{description}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {Object.entries(permissions).filter(([, enabled]) => enabled).map(([key]) => (
                        <Badge key={key} tone="indigo">{permissionLabels[key as RolePermissionKey]}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="pt-2 text-xs font-semibold tracking-wide text-slate-400">Custom roles</p>
            {rolePermissions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                No custom roles yet. Create one to assign it to team members.
              </div>
            ) : rolePermissions.filter(customRole => !customRole.isBuiltin).map(customRole => (
              <div key={customRole.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 data-i18n-skip className="font-semibold text-slate-900">{customRole.name}</h3>
                      <Badge tone="slate">Base: {t(getRoleDisplayName(customRole.baseRole))}</Badge>
                      {customRole.isProtected && <Badge tone="purple">Protected</Badge>}
                    </div>
                    {customRole.description && <p className="mt-1 text-sm text-slate-500">{customRole.description}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" onClick={() => handleEditRole(customRole.id)} disabled={customRole.isProtected}>Edit permissions</Button>
                    <Button type="button" variant="danger" onClick={() => void handleDeleteRole(customRole.id)} disabled={isActionSaving || customRole.isProtected}>Delete</Button>
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
        </fieldset>
      </div>
      }

      {/* History */}
      {activeTab === 'history' && (
        <div className={`${cardBase} overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/80 px-4 py-4 sm:px-5">
            <div>
              <h2 className="text-base font-semibold text-ink sm:text-lg">Decision history</h2>
              <p className="mt-1 text-sm text-muted">Review previously approved and rejected access requests.</p>
            </div>
            <Badge tone="slate">{historyRegs.length} decisions</Badge>
          </div>
          {historyRegs.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <History className="mx-auto h-7 w-7 text-muted/60" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-ink">No decisions yet</p>
              <p className="mt-1 text-sm text-muted">Completed reviews will appear here.</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-line/70 sm:hidden">
                {historyRegs.map(reg => (
                  <article key={reg.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p data-i18n-skip className="truncate font-semibold text-ink">{reg.name}</p>
                        <p data-i18n-skip className="mt-1 break-words text-xs text-muted">{reg.email}</p>
                      </div>
                      <Badge tone={reg.status === 'Approved' ? 'emerald' : 'red'}>{reg.status}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      <span>{reg.requestedRole}</span>
                      <span>{reg.jobPosition || 'Position not specified'}</span>
                      <span>{format(new Date(reg.createdAt), 'MMM d, yyyy')}</span>
                    </div>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-inset/70 text-xs tracking-wide text-muted">
                    <tr><th className="px-5 py-3 font-semibold">Applicant</th><th className="px-5 py-3 font-semibold">Requested access</th><th className="px-5 py-3 font-semibold">Decision</th><th className="px-5 py-3 font-semibold">Date</th></tr>
                  </thead>
                  <tbody className="divide-y divide-line/70">
                    {historyRegs.map(reg => (
                      <tr key={reg.id} className="hover:bg-inset/40">
                        <td data-i18n-skip className="px-5 py-4 font-medium text-ink"><span className="block">{reg.name}</span><span data-i18n-skip className="mt-1 block text-xs font-normal text-muted">{reg.email}</span></td>
                        <td className="px-5 py-4 text-muted">{reg.requestedRole} · {reg.jobPosition || 'Position not specified'}</td>
                        <td className="px-5 py-4"><Badge tone={reg.status === 'Approved' ? 'emerald' : 'red'}>{reg.status}</Badge></td>
                        <td className="px-5 py-4 text-muted">{format(new Date(reg.createdAt), 'MMM d, yyyy')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Active Users Management */}
      {activeTab === 'members' && <div className={`${cardBase} overflow-hidden`}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-slate-800">Active System Users</h2>
          </div>
        </div>
        {assignmentError && (
          <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {assignmentError}
          </div>
        )}
        <div className="flex flex-col gap-2 border-b border-line/80 bg-inset/60 px-4 py-3 sm:flex-row sm:px-5">
          <input
            type="search"
            value={memberSearch}
            onChange={event => setMemberSearch(event.target.value)}
            placeholder={t('Search members...')}
            aria-label={t('Search members...')}
            className={cn(inputBase, 'px-3 py-2 text-sm')}
          />
          <select
            value={memberRoleFilter}
            onChange={event => setMemberRoleFilter(event.target.value as 'All' | Role)}
            aria-label={t('Filter members by role')}
            className={cn(inputBase, 'px-3 py-2 text-sm')}
          >
            <option value="All">{t('All roles')}</option>
            {ROLES.map(role => <option key={role} value={role}>{role}</option>)}
          </select>
        </div>
        {visibleMembers.length === 0 && (
          <div className="px-6 py-12 text-center">
            <Users className="mx-auto h-7 w-7 text-muted/60" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-ink">No members match these filters</p>
            <p className="mt-1 text-sm text-muted">Try a different name, email, or role.</p>
          </div>
        )}
        <div className="divide-y divide-slate-100 sm:hidden">
          {visibleMembers.map(u => (
            <article key={u.id} className="space-y-4 p-4">
              <div className="flex items-start gap-3">
                <img src={u.avatar} alt="" className="h-10 w-10 shrink-0 rounded-full border border-slate-200 object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span data-i18n-skip className="font-semibold text-slate-800">{u.name}</span>
                    {isBossKoo(u) && <Badge tone="purple">Boss Koo</Badge>}
                  </div>
                  <p data-i18n-skip className="mt-1 truncate text-xs text-slate-500">{u.email || 'No email on file'}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={u.role === 'Project Manager' ? 'purple' : u.role === 'Client' ? 'amber' : 'blue'}>{t(getRoleDisplayName(u.role))}</Badge>
                {u.role === 'Client' ? (
                  <span className="text-sm font-medium text-slate-600">{u.companyName || 'No company'}</span>
                ) : getMemberDepartments(u).map(department => <Badge key={department} tone="slate">{department}</Badge>)}
              </div>
              {isBossKoo(u) ? (
                <Badge tone="purple">Protected Boss Koo account</Badge>
              ) : superAdmin ? (
                <div className="space-y-2">
                  <label className="sr-only" htmlFor={`mobile-role-${u.id}`}>Role for {u.name}</label>
                  <select
                    id={`mobile-role-${u.id}`}
                    className={cn(inputBase, 'w-full px-3 py-2 text-sm')}
                    value={roleSelectValue(u)}
                    onChange={event => void handleChangeRole(u, event.target.value)}
                    disabled={isActionSaving}
                  >
                    <option value="role:project-manager">{t(getRoleDisplayName('Project Manager'))}</option>
                    <option value="role:hod">HOD</option>
                    <option value="role:staff">Staff</option>
                    <option value="role:client">Client</option>
                    {rolePermissions.filter(customRole => !customRole.isBuiltin).map(customRole => (
                      <option key={customRole.id} data-i18n-skip value={`custom:${customRole.id}`}>{customRole.name}</option>
                    ))}
                  </select>
                  {roleCompanyUserId === u.id && (
                    <>
                      <label className="sr-only" htmlFor={`mobile-company-${u.id}`}>Company for {u.name}</label>
                      <select
                        id={`mobile-company-${u.id}`}
                        className={cn(inputBase, 'w-full px-3 py-2 text-sm')}
                        value={roleCompanyName}
                        onChange={event => setRoleCompanyName(event.target.value)}
                        disabled={isActionSaving}
                      >
                        <option value="">Choose a company…</option>
                        {clients.map(client => <option key={client.id} data-i18n-skip value={client.clientName}>{client.clientName}</option>)}
                      </select>
                      <Button type="button" className="w-full" onClick={() => void handleConfirmClientCompany(u)} disabled={isActionSaving || !roleCompanyName.trim()}>Confirm company</Button>
                    </>
                  )}
                  {roleDeptUserId === u.id && (
                    <>
                      <DepartmentMultiSelect value={roleDeptValue} onChange={setRoleDeptValue} />
                      <Button type="button" className="w-full" onClick={() => void handleConfirmRoleDepartments(u)} disabled={isActionSaving || roleDeptValue.length === 0}>Confirm departments</Button>
                    </>
                  )}
                </div>
              ) : (
                <Badge tone="slate">{getEffectiveRoleName(u, rolePermissions)}</Badge>
              )}
              {!isBossKoo(u) && u.permissions && Object.keys(u.permissions).length > 0 && <Badge tone="indigo">Custom access</Badge>}
              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                {superAdmin && u.role !== 'Client' && !isBossKoo(u) && (
                  <Button type="button" variant="secondary" onClick={() => handleEditDepartments(u.id)} disabled={isActionSaving}>Edit departments</Button>
                )}
                {superAdmin && ['Staff', 'HOD'].includes(u.role) && !isBossKoo(u) && (
                  <Button type="button" variant="secondary" onClick={() => handleEditPermissions(u.id)} disabled={isActionSaving}>Manage access</Button>
                )}
                {canDeleteUser(currentUser, u, rolePermissions) ? (
                  <Button type="button" variant="danger" onClick={() => { setDeleteUserError(''); setUserToDelete(u.id); }}>Remove</Button>
                ) : (
                  <span className="inline-flex min-h-11 items-center rounded-control bg-inset px-3 text-xs font-semibold text-muted">{isBossKoo(u) || u.id === currentUser?.id ? 'Protected account' : 'No access'}</span>
                )}
              </div>
            </article>
          ))}
        </div>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-inset text-muted text-xs tracking-wide">
                <th className="px-6 py-4 font-semibold border-b border-slate-200">User</th>
                <th className="px-6 py-4 font-semibold border-b border-slate-200">Role & Departments</th>
                <th className="px-6 py-4 font-semibold border-b border-slate-200">Custom Role</th>
                <th className="px-6 py-4 font-semibold border-b border-slate-200">Contact</th>
                <th className="px-6 py-4 font-semibold border-b border-slate-200 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleMembers.map(u => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <img src={u.avatar} alt="" className="w-8 h-8 rounded-full object-cover border border-slate-200" />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span data-i18n-skip className="font-semibold text-slate-800">{u.name}</span>
                          {isBossKoo(u) && <Badge tone="purple">Boss Koo</Badge>}
                        </div>
                        {u.email && <div data-i18n-skip className="text-xs text-slate-500 mt-0.5">{u.email}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex px-2 py-1 rounded-md text-xs font-bold tracking-wide ${
                        u.role === 'Project Manager' ? 'bg-accent-soft text-accent' :
                        u.role === 'Client' ? 'bg-amber-100 text-amber-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {t(getRoleDisplayName(u.role))}
                      </span>
                      {u.role === 'Client' ? (
                        <span className="text-sm font-medium text-slate-600">({u.companyName})</span>
                      ) : getMemberDepartments(u).map(department => (
                        <Badge key={department} tone="slate">{department}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 min-w-[240px]">
                    {isBossKoo(u) ? (
                      <Badge tone="purple">Protected Boss Koo account</Badge>
                    ) : superAdmin ? (
                      <div className="space-y-2">
                        <select
                          aria-label={`Role for ${u.name}`}
                          className={cn(inputBase, 'px-3 py-2 text-sm')}
                          value={roleSelectValue(u)}
                          onChange={e => void handleChangeRole(u, e.target.value)}
                          disabled={isActionSaving}
                        >
                          <option value="role:project-manager">{t(getRoleDisplayName('Project Manager'))}</option>
                          <option value="role:hod">HOD</option>
                          <option value="role:staff">Staff</option>
                          <option value="role:client">Client</option>
                          {rolePermissions
                            .filter(customRole => !customRole.isBuiltin)
                            .map(customRole => (
                              <option key={customRole.id} data-i18n-skip value={`custom:${customRole.id}`}>{customRole.name}</option>
                            ))}
                        </select>
                        {roleCompanyUserId === u.id && (
                          <select
                            aria-label={`Company for ${u.name}`}
                            className={cn(inputBase, 'px-3 py-2 text-sm')}
                            value={roleCompanyName}
                            onChange={e => setRoleCompanyName(e.target.value)}
                            disabled={isActionSaving}
                          >
                            <option value="">Choose a company…</option>
                            {clients.map(client => (
                              <option key={client.id} data-i18n-skip value={client.clientName}>{client.clientName}</option>
                            ))}
                          </select>
                        )}
                        {roleCompanyUserId === u.id && (
                          <button
                            type="button"
                            onClick={() => void handleConfirmClientCompany(u)}
                            disabled={isActionSaving || !roleCompanyName.trim()}
                            className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            Confirm
                          </button>
                        )}
                        {roleDeptUserId === u.id && (
                          <>
                            <DepartmentMultiSelect value={roleDeptValue} onChange={setRoleDeptValue} />
                            <button
                              type="button"
                              onClick={() => void handleConfirmRoleDepartments(u)}
                              disabled={isActionSaving || roleDeptValue.length === 0}
                              className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              Confirm
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <Badge tone="slate">{getEffectiveRoleName(u, rolePermissions)}</Badge>
                    )}
                    {!isBossKoo(u) && u.permissions && Object.keys(u.permissions).length > 0 && <Badge className="mt-2" tone="indigo">Custom access</Badge>}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {u.email || 'No email on file'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {superAdmin && u.role !== 'Client' && !isBossKoo(u) && (
                        <button
                          type="button"
                          onClick={() => handleEditDepartments(u.id)}
                          disabled={isActionSaving}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-control text-muted transition-colors hover:bg-accent-soft hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50"
                          title="Edit departments"
                          aria-label={`Edit departments for ${u.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      {superAdmin && ['Staff', 'HOD'].includes(u.role) && !isBossKoo(u) && (
                        <button
                          type="button"
                          onClick={() => handleEditPermissions(u.id)}
                          disabled={isActionSaving}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-control text-slate-500 transition-colors hover:bg-accent-soft hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50"
                          title="Manage permissions"
                          aria-label={`Manage permissions for ${u.name}`}
                        >
                          <ShieldCheck className="h-4 w-4" />
                        </button>
                      )}
                      {canDeleteUser(currentUser, u, rolePermissions) ? (
                      <button 
                        onClick={() => {
                          setDeleteUserError('');
                          setUserToDelete(u.id);
                        }}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-control text-muted transition-colors hover:bg-red-50 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
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
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>}

      {memberDepartmentsId && (
        <ModalShell
          labelledBy={editDepartmentsTitleId}
          onClose={() => {
            if (isActionSaving) return;
            setMemberDepartmentsId(null);
            setMemberDepartmentsError('');
          }}
          panelClassName="max-w-lg "
        >
          <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
            <h2 id={editDepartmentsTitleId} className="text-lg font-semibold text-slate-950">
              Edit departments
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Existing task assignments remain unchanged when a department is removed.
            </p>
          </div>
          <form onSubmit={handleSaveDepartments} className="space-y-5 p-6">
            <DepartmentMultiSelect value={memberDepartments} onChange={setMemberDepartments} />
            {memberDepartmentsError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {memberDepartmentsError}
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              {retainedMemberMutation?.kind === 'departments' && retainedMemberMutation.memberId === memberDepartmentsId && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isActionSaving || backend.isSaving}
                  onClick={() => void handleRetryMemberMutation('departments', memberDepartmentsId)}
                >
                  Retry saved change
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                disabled={isActionSaving}
                onClick={() => setMemberDepartmentsId(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isActionSaving || backend.isSaving}>
                {isActionSaving ? 'Saving...' : 'Save departments'}
              </Button>
            </div>
          </form>
        </ModalShell>
      )}

      {memberPermissionsUser && (
        <ModalShell
          labelledBy={editPermissionsTitleId}
          onClose={() => {
            if (isActionSaving) return;
            setMemberPermissionsId(null);
            setMemberPermissionsError('');
          }}
          panelClassName="max-w-3xl"
        >
          <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
            <h2 id={editPermissionsTitleId} data-i18n-skip className="text-lg font-semibold text-slate-950">Manage access for {memberPermissionsUser.name}</h2>
            <p className="mt-1 text-sm text-slate-500">Assigned tasks remain editable and deletable. Protected Boss Koo permissions are never delegated.</p>
          </div>
          <form onSubmit={handleSaveMemberPermissions} className="space-y-5 p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" aria-pressed={!memberPermissionsCustom} onClick={() => setMemberPermissionsCustom(false)} className={cn('min-h-20 rounded-lg border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400', !memberPermissionsCustom ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50')}>
                <span className="block text-sm font-semibold text-slate-900">Use role defaults</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">Follow {getEffectiveRoleName({ ...memberPermissionsUser, permissions: undefined }, rolePermissions)} permissions and future role updates.</span>
              </button>
              <button type="button" aria-pressed={memberPermissionsCustom} onClick={() => setMemberPermissionsCustom(true)} className={cn('min-h-20 rounded-lg border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400', memberPermissionsCustom ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50')}>
                <span className="block text-sm font-semibold text-slate-900">Custom access</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">Save a dedicated permission set for this member.</span>
              </button>
            </div>

            <section aria-labelledby="effective-access-preview" className="rounded-panel border border-accent/20 bg-accent-soft/50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 id="effective-access-preview" className="text-sm font-semibold text-slate-900">Effective access preview</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Preview the permissions that will apply after this choice is saved. Baseline: {getEffectiveRoleName({ ...memberPermissionsUser, permissions: undefined }, rolePermissions)}.
                  </p>
                </div>
                <Badge tone="indigo">{memberPermissionKeys.filter(key => memberPermissionsPreview[key]).length} enabled</Badge>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-semibold tracking-wide text-emerald-700">Added</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {addedMemberPermissions.length > 0 ? addedMemberPermissions.map(key => permissionLabels[key]).join(', ') : 'No additions'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold tracking-wide text-red-700">Removed</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {removedMemberPermissions.length > 0 ? removedMemberPermissions.map(key => permissionLabels[key]).join(', ') : 'No removals'}
                  </p>
                </div>
              </div>
            </section>

            <fieldset disabled={!memberPermissionsCustom} className="space-y-4 disabled:opacity-55">
              <legend className="sr-only">Member permissions</legend>
              {permissionGroups.map(group => (
                <div key={group.title}>
                  <p className="mb-2 text-xs font-semibold tracking-wide text-slate-400">{group.title}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {group.keys.map(key => (
                      <label key={key} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                        <input type="checkbox" checked={memberPermissions[key]} onChange={() => toggleMemberPermission(key)} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                        {permissionLabels[key]}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </fieldset>

            {memberPermissionsError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{memberPermissionsError}</div>}
            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-4">
              {retainedMemberMutation?.kind === 'permissions' && retainedMemberMutation.memberId === memberPermissionsUser.id && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isActionSaving || backend.isSaving}
                  onClick={() => void handleRetryMemberMutation('permissions', memberPermissionsUser.id)}
                >
                  Retry saved change
                </Button>
              )}
              <Button type="button" variant="secondary" disabled={isActionSaving} onClick={() => setMemberPermissionsId(null)}>Cancel</Button>
              <Button type="submit" disabled={isActionSaving || backend.isSaving}>{isActionSaving ? 'Saving...' : memberPermissionsCustom ? 'Save custom access' : 'Reset to role defaults'}</Button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* Add Member Modal */}
      {isAddUserOpen && (
        <ModalShell
          labelledBy={addMemberTitleId}
          onClose={() => {
            resetNewUser();
            setIsAddUserOpen(false);
          }}
          panelClassName="max-w-lg "
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
                    aria-label="System Role"
                    className={cn(inputBase, 'px-3 py-2.5')}
                    value={newUser.role}
                    onChange={e => {
                      const nextRole = e.target.value as Role;
                      setNewUser({
                        ...newUser,
                        role: nextRole,
                        departments: nextRole === 'Client' ? ['Client'] : [],
                        customRoleId: '',
                      });
                    }}
                  >
                    {ROLES.map(r => <option key={r} value={r}>{t(getRoleDisplayName(r))}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Custom Role</label>
                  <select
                    aria-label="Custom Role"
                    className={cn(inputBase, 'px-3 py-2.5')}
                    value={newUser.customRoleId}
                    onChange={e => setNewUser({ ...newUser, customRoleId: e.target.value })}
                  >
                    <option value="">Base role only</option>
                    {getAssignableCustomRoles(newUser.role, rolePermissions).filter(customRole => !customRole.isBuiltin).map(customRole => <option key={customRole.id} data-i18n-skip value={customRole.id}>{customRole.name}</option>)}
                  </select>
                </div>
              </div>

              {newUser.role === 'Client' ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="text-sm font-medium text-slate-700">Department</p>
                  <p className="mt-0.5 text-sm text-slate-600">Client</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <DepartmentMultiSelect
                    value={newUser.departments}
                    onChange={departments => setNewUser({ ...newUser, departments })}
                  />
                  {['Staff', 'HOD'].includes(newUser.role) && <label className="block text-sm font-medium text-slate-700">Worker type<select className={cn(inputBase, 'mt-1 px-3 py-2.5')} value={newUser.workerType} onChange={event => setNewUser({ ...newUser, workerType: event.target.value as NonNullable<User['workerType']> })}><option value="employee">Employee</option><option value="supplier">Supplier</option><option value="freelancer">Freelancer</option></select></label>}
                </div>
              )}

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

      {/* Mobile registration review sheet */}
      {selectedReg && isMobileApprovalViewport && (
        <ModalShell
          labelledBy={`approval-review-title-${selectedReg.id}`}
          describedBy={`approval-review-description-${selectedReg.id}`}
          onClose={closeApprovalReview}
          overlayClassName="items-end p-0 sm:items-center sm:p-4 lg:hidden"
          panelClassName="h-[100dvh] max-h-[100dvh] rounded-t-panel sm:h-auto sm:max-h-[90vh] sm:rounded-panel"
        >
          <RegistrationReviewPanel
            registration={selectedReg}
            waitingDays={pendingDays(selectedReg)}
            role={role}
            departments={approvalDepartments}
            customRoleId={approvalCustomRoleId}
            companyName={companyName}
            sendInvitation={sendApprovalInvitation}
            temporaryPassword={approvalTemporaryPassword}
            secureAccounts={secureAccounts}
            rolePermissions={rolePermissions}
            isSaving={isActionSaving || backend.isSaving}
            error={actionError}
            onClose={closeApprovalReview}
            onSubmit={handleApprove}
            onRoleChange={handleApprovalRoleChange}
            onDepartmentsChange={setApprovalDepartments}
            onCustomRoleChange={setApprovalCustomRoleId}
            onCompanyNameChange={setCompanyName}
            onInvitationChange={setSendApprovalInvitation}
            onTemporaryPasswordChange={setApprovalTemporaryPassword}
            onGeneratePassword={generateApprovalPassword}
          />
        </ModalShell>
      )}
      {/* Delete User Modal */}
      {userToDelete && (
        <ModalShell
          labelledBy={deleteMemberTitleId}
          onClose={() => setUserToDelete(null)}
          overlayClassName="z-[60]"
          panelClassName="max-w-sm "
        >
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h2 id={deleteMemberTitleId} className="mb-2 text-lg font-semibold text-slate-950">Delete user account</h2>
              <p className="text-sm text-slate-500">
                Are you sure you want to permanently delete this user? They will immediately lose access to the system, and their assigned tasks will become unassigned. This action cannot be undone.
              </p>
              {deleteUserError && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                  {deleteUserError}
                </div>
              )}
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
      {confirmation && (
        <ConfirmDialog
          labelledBy={confirmationTitleId}
          title={confirmation.title}
          description={confirmation.description}
          confirmLabel={confirmation.confirmLabel}
          tone={confirmation.tone}
          busy={isActionSaving}
          onClose={() => setConfirmation(null)}
          onConfirm={async () => {
            await confirmation.action();
            setConfirmation(null);
          }}
        />
      )}
    </div>
  );
};

export default Approvals;
