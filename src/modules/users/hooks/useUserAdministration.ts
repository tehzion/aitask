import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useSaveAction } from '../../../app/hooks/useSaveAction';
import { useStore } from '../../../app/store/workspaceStore';
import { getRetainedSecureMemberMutation } from '../../../infrastructure/api/secureWorkspace';
import { shouldUseSecureSupabase } from '../../../infrastructure/database/supabaseClient';
import { defaultRolePermissions, getBuiltinRoleId, getEffectivePermissions, getGrantablePermissionGroups, isBossKoo, isDepartmentScopedUser } from '../../../shared/authorization/access';
import { getMemberDepartments, normalizeDepartment } from '../../../shared/authorization/departments';
import { useI18n } from '../../../shared/components/I18nProvider';
import { useToastStore } from '../../../shared/feedback/useToastStore';
import { useImeSafeInput } from '../../../shared/hooks/useImeSafeInput';
import { useUnsavedChanges } from '../../../shared/hooks/useUnsavedChanges';
import '../../../shared/i18n/actionFeedbackCopy';
import { msg } from '../../../shared/i18n/messages';
import { type CustomRole, type Department, type Registration, type Role, type RolePermissionKey, type RolePermissions, type User } from '../../../shared/types/index';
import { rollbackUnchangedRows } from '../../../shared/utils/actionRollback';
import { DEFAULT_USER_PASSWORD } from '../../authentication/domain/auth';
import { generateTemporaryPassword } from '../../authentication/domain/temporaryPassword';
import { ApprovalTab, clonePermissions, ConfirmationState, isApprovalTab } from './userAdministrationOptions';

/** State, derived data and user actions for the existing workspace view. */
export const useUserAdministration = () => {
  const { locale, t } = useI18n();

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
    requestMemberDeactivation,
    addUserBySuperAdmin,
    updateMemberDepartments,
    updateMemberPermissions,
    rolePermissions,
    clients,
    projects,
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
    requestMemberDeactivation: state.requestMemberDeactivation,
    addUserBySuperAdmin: state.addUserBySuperAdmin,
    updateMemberDepartments: state.updateMemberDepartments,
    updateMemberPermissions: state.updateMemberPermissions,
    rolePermissions: state.rolePermissions,
    clients: state.clients,
    projects: state.projects,
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

  const requestedTab = isApprovalTab(searchParams.get('tab')) ? searchParams.get('tab') as ApprovalTab : 'registrations';

  const registrationQueryId = searchParams.get('registrationId');

  const [registrationSearch, setRegistrationSearch] = useState('');

  const [memberSearch, setMemberSearch] = useState('');

  const registrationSearchInput = useImeSafeInput(registrationSearch, setRegistrationSearch);

  const memberSearchInput = useImeSafeInput(memberSearch, setMemberSearch);

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
    projectIds: [] as string[],
  });

  const [approvalCustomRoleId, setApprovalCustomRoleId] = useState('');

  const [sendApprovalInvitation, setSendApprovalInvitation] = useState(false);

  const [approvalTemporaryPassword, setApprovalTemporaryPassword] = useState('');

  const [roleEditorId, setRoleEditorId] = useState<string | null>(null);

  const [roleError, setRoleError] = useState('');

  const [pendingRoleSave, setPendingRoleSave] = useState(false);

  const [assignmentError, setAssignmentError] = useState('');

  const [actionError, setActionError] = useState('');

  const { busy: isActionSaving, run: runAction } = useSaveAction();

  const pendingRoleRecord = React.useRef<CustomRole | null>(null);

  const pendingNewMember = React.useRef<User | null>(null);

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

  const projectManager = currentUser?.role === 'Project Manager' && !superAdmin;

  const managedProjects = projects.filter(project => project.projectManagerIds?.includes(currentUser?.id || ''));

  const activeTab: ApprovalTab = projectManager ? 'members' : requestedTab;

  const editingBuiltinRole = Boolean(roleEditorId && rolePermissions.find(role => role.id === roleEditorId)?.isBuiltin);

  const [roleForm, setRoleForm] = useState({
    name: '',
    description: '',
    baseRole: 'Staff' as Role,
    departmentScoped: false,
    permissions: clonePermissions(defaultRolePermissions.Staff),
  });

  const roleBaseline = React.useRef(JSON.stringify(roleForm));

  const roleDirty = JSON.stringify(roleForm) !== roleBaseline.current;

  useUnsavedChanges(roleDirty || pendingRoleSave || isActionSaving);

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

  useEffect(() => {
    pendingRoleRecord.current = null;
    pendingNewMember.current = null;
    setPendingRoleSave(false); setRoleEditorId(null);
    const blankRole = { name: '', description: '', baseRole: 'Staff' as Role, departmentScoped: false, permissions: clonePermissions(defaultRolePermissions.Staff) };
    roleBaseline.current = JSON.stringify(blankRole); setRoleForm(blankRole);
    setRoleError(''); setActionError(''); setAssignmentError('');
    setSelectedReg(null); setSelectedBulkRegIds(new Set()); setConfirmation(null);
    setIsAddUserOpen(false); setAddUserError(''); setUserToDelete(null);
    setMemberDepartmentsId(null); setMemberPermissionsId(null); setRoleCompanyUserId(null); setRoleDeptUserId(null);
  }, [currentUser?.id]);

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
    const query = registrationSearchInput.value.trim().toLowerCase();
    if (!query) return pendingRegs;
    return pendingRegs.filter(registration => [
      registration.name,
      registration.email,
      registration.phone,
      registration.jobPosition,
      registration.requestedRole,
      registration.onboardingMode,
    ].some(value => value?.toLowerCase().includes(query)));
  }, [pendingRegs, registrationSearchInput.value]);

  const agedRegistrationCount = pendingRegs.filter(registration => pendingDays(registration) >= 7).length;

  const managedMemberIds = new Set(managedProjects.flatMap(project => [...(project.hodMemberIds || []), ...(project.staffMemberIds || [])]));

  const scopedUsers = projectManager ? users.filter(user => managedMemberIds.has(user.id)) : users;

  const activeMemberCount = scopedUsers.length;

  const memberPermissionsUser = memberPermissionsId
    ? users.find(user => user.id === memberPermissionsId)
    : undefined;

  const retainedMemberMutation = getRetainedSecureMemberMutation();

  const memberPermissionsDefault = memberPermissionsUser
    ? getEffectivePermissions({ ...memberPermissionsUser, permissions: undefined }, rolePermissions)
    : clonePermissions(defaultRolePermissions.Staff);

  const memberPermissionsPreview = memberPermissionsCustom ? memberPermissions : memberPermissionsDefault;

  const memberPermissionsBaseRole = memberPermissionsUser?.role === 'Staff' && memberPermissionsUser.customRoleId === getBuiltinRoleId('HOD')
    ? 'HOD'
    : (memberPermissionsUser?.role || 'Staff');

  const memberPermissionGroups = getGrantablePermissionGroups(memberPermissionsBaseRole, { departmentScoped: isDepartmentScopedUser(memberPermissionsUser, rolePermissions) });

  const memberPermissionKeys = memberPermissionGroups.flatMap(group => group.keys);

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
    if (isActionSaving) return;
    setSelectedReg(null);
    updateApprovalQuery({ registrationId: null });
  };

  const initializeApprovalFields = React.useCallback((reg: Registration) => {
    setRole(reg.requestedRole || 'Staff');
    const requestedDepartment = normalizeDepartment(reg.jobPosition);
    setApprovalDepartments(reg.requestedRole === 'Client'
      ? ['Client']
      : requestedDepartment && requestedDepartment !== 'Client' ? [requestedDepartment] : []);
    setApprovalCustomRoleId('');
    setSendApprovalInvitation(false);
    setApprovalTemporaryPassword('');
    setCompanyName('');
    setActionError('');
  }, []);

  useEffect(() => {
    // Optimistic approval removes the pending row before persistence finishes.
    if (isActionSaving) return;
    if (activeTab !== 'registrations' || !registrationQueryId) {
      setSelectedReg(null);
      return;
    }
    const registration = pendingRegs.find(item => item.id === registrationQueryId);
    if (registration) {
      if (selectedReg?.id !== registration.id) initializeApprovalFields(registration);
      setSelectedReg(current => current?.id === registration.id ? current : registration);
      return;
    }
    setSelectedReg(null);
    const next = new URLSearchParams(searchParams);
    next.delete('registrationId');
    setSearchParams(next, { replace: true });
  }, [activeTab, pendingRegs, registrationQueryId, searchParams, setSearchParams, isActionSaving, selectedReg?.id, initializeApprovalFields]);

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
    for (const id of registrationIds) {
      const localResult = rejectRegistration(id);
      if (!localResult.ok) {
        useStore.setState({ registrations: previousRegistrations });
        setSelectedBulkRegIds(new Set());
        setActionError(String(t(localResult.error || 'The registration could not be rejected.')));
        return;
      }
    }
    const submitted = useStore.getState();
    const saved = await runAction(() => commitPendingMutation());
    if (!saved) return;
    setSelectedBulkRegIds(new Set());
    if (!saved.ok) {
      useStore.setState(state => ({ registrations: rollbackUnchangedRows(state.registrations, previousRegistrations, submitted.registrations) }));
      setActionError(saved.error || 'The rejection was rolled back. Use Retry my changes to confirm it.');
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
    setActionError('');
    const failures: Registration[] = [];
    const reportFailures = () => {
      const names = failures.slice(0, 3).map(reg => reg.name).join(', ');
      const done = count - failures.length;
      useToastStore.getState().addToast(
        done > 0
          ? msg('approval.bulkApproveFailed', { approved: done, failed: failures.length, names })
          : msg('approval.bulkApproveNone', { names }),
        'error',
      );
      setActionError(`Unable to approve: ${names}${failures.length > 3 ? '…' : ''}`);
    };
    if (secureAccounts) {
      const actorId = useStore.getState().currentUser?.id;
      const saved = await runAction(async isCurrent => {
        for (const reg of targets) {
          if (!isCurrent() || useStore.getState().currentUser?.id !== actorId) return { ok: false, error: 'Your session changed. Sign in again.' };
          const requestedDepartment = normalizeDepartment(reg.jobPosition);
          const departments = requestedDepartment && requestedDepartment !== 'Client' ? [requestedDepartment] : [];
          if (departments.length === 0) { failures.push(reg); continue; }
          const result = await addUserBySuperAdmin({ name: reg.name, email: reg.email, role: 'Staff', departments, registrationId: reg.id, sendInvitation: false });
          if (!result.ok) failures.push(reg);
        }
        return { ok: true, error: undefined };
      });
      if (!saved) return;
      if (!saved.ok) { setActionError(saved.error || 'Unable to approve this member.'); return; }
      setSelectedBulkRegIds(new Set(failures.map(reg => reg.id)));
      if (failures.length > 0) { reportFailures(); return; }
      useToastStore.getState().addToast(msg('approval.registrationApproved', { count }), 'success');
      return;
    }

    const previousRegistrations = useStore.getState().registrations;
    const previousUsers = useStore.getState().users;
    targets.forEach(reg => {
      const requestedDepartment = normalizeDepartment(reg.jobPosition);
      if (!requestedDepartment || requestedDepartment === 'Client') {
        failures.push(reg);
        return;
      }
      const result = approveRegistration(reg.id, 'Staff', [requestedDepartment], undefined, undefined);
      if (!result.ok) failures.push(reg);
    });
    const submitted = useStore.getState();
    const saved = failures.length < count ? await runAction(() => commitPendingMutation()) : { ok: true };
    if (!saved) return;
    if (!saved.ok) {
      useStore.setState(state => ({ registrations: rollbackUnchangedRows(state.registrations, previousRegistrations, submitted.registrations), users: rollbackUnchangedRows(state.users, previousUsers, submitted.users) }));
      setActionError(saved.error || 'The approvals were rolled back. Use Retry my changes to confirm them.');
      return;
    }
    setSelectedBulkRegIds(new Set(failures.map(reg => reg.id)));
    if (failures.length > 0) {
      reportFailures();
    } else {
      useToastStore.getState().addToast(msg('approval.registrationApproved', { count }), 'success');
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
    if (isActionSaving) return;
    setSelectedReg(reg);
    updateApprovalQuery({ tab: 'registrations', registrationId: reg.id });
    initializeApprovalFields(reg);
  };

  const handleTabChange = (tab: ApprovalTab) => {
    if (isActionSaving) return;
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
    const generated = generateTemporaryPassword();
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
    if (secureAccounts) {
      const inviteResult = await runAction(() => addUserBySuperAdmin({
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
      }));
      if (!inviteResult) return;
      if (!inviteResult.ok) {
        setActionError(inviteResult.error || 'Unable to approve this member.');
        return;
      }
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
      setActionError(approved.error || 'Unable to approve this member.');
      return;
    }
    const submitted = useStore.getState();
    const saved = await runAction(() => commitPendingMutation(), result => {
      if (!result.ok) useStore.setState(state => ({
        registrations: rollbackUnchangedRows(state.registrations, registrationsBefore, submitted.registrations),
        users: rollbackUnchangedRows(state.users, usersBefore, submitted.users),
      }));
    });
    if (!saved) return;
    if (!saved.ok) {
      setActionError(saved.error || 'The approval is waiting to be saved. Use Retry my changes to continue.');
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
      projectIds: [],
    });
    setSendNewUserInvitation(false);
    setAddUserError('');
  };

  const resetRoleForm = (baseRole: Role = 'Staff') => {
    setRoleEditorId(null);
    const blankRole = { name: '', description: '', baseRole, departmentScoped: baseRole === 'HOD', permissions: clonePermissions(defaultRolePermissions[baseRole]) };
    roleBaseline.current = JSON.stringify(blankRole);
    setRoleForm(blankRole);
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

  const confirmRoleRecord = () => {
    const submitted = pendingRoleRecord.current;
    const latest = useStore.getState().rolePermissions.find(role => role.id === submitted?.id);
    pendingRoleRecord.current = null;
    setPendingRoleSave(false);
    if (!submitted || !latest || ['name', 'description', 'baseRole', 'departmentScoped', 'permissions'].some(key => JSON.stringify(latest[key as keyof CustomRole]) !== JSON.stringify(submitted[key as keyof CustomRole]))) {
      setRoleError(t('The pending role is no longer available. Review your draft before saving again.'));
      return false;
    }
    return true;
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isActionSaving || backend.isSaving) return;
    setRoleError('');

    if (pendingRoleSave) {
      const saved = await runAction(() => secureAccounts ? retryMutation() : commitPendingMutation());
      if (!saved) return;
      if (!saved.ok) {
        setRoleError(saved.error || 'The role is waiting to be saved. Use Retry my changes to continue.');
        return;
      }
      if (!confirmRoleRecord()) return;
      setPendingRoleSave(false);
      resetRoleForm(roleForm.baseRole);
      return;
    }

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

    pendingRoleRecord.current = useStore.getState().rolePermissions.find(role => role.id === (roleEditorId || ('id' in result ? result.id : undefined))) || null;
    setPendingRoleSave(true);
    const saved = await runAction(() => commitPendingMutation());
    if (!saved) return;
    if (!saved.ok) {
      setPendingRoleSave(true);
      setRoleError(saved.error || 'The role is waiting to be saved. Use Retry my changes to continue.');
      return;
    }

    if (!confirmRoleRecord()) return;
    resetRoleForm(roleForm.baseRole);
  };

  const handleEditRole = (customRoleId: string) => {
    if (isActionSaving || pendingRoleSave) return;
    if (roleDirty && !window.confirm(t('Discard unsaved changes?'))) return;
    const targetRole = rolePermissions.find(customRole => customRole.id === customRoleId);
    if (!targetRole) return;

    setRoleEditorId(targetRole.id);
    const draft = { name: targetRole.name, description: targetRole.description || '', baseRole: targetRole.baseRole, departmentScoped: targetRole.departmentScoped === true, permissions: clonePermissions(targetRole.permissions) };
    roleBaseline.current = JSON.stringify(draft);
    setRoleForm(draft);
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

    const submitted = useStore.getState();
    const saved = await runAction(() => commitPendingMutation());
    if (!saved) return;
    if (!saved.ok) {
      useStore.setState(state => ({ rolePermissions: rollbackUnchangedRows(state.rolePermissions, previousRoles, submitted.rolePermissions), users: rollbackUnchangedRows(state.users, previousUsers, submitted.users), deletedRoleIds: state.deletedRoleIds === submitted.deletedRoleIds ? previousDeletedRoleIds : state.deletedRoleIds }));
      setRoleError(saved.error || 'The role deletion was rolled back. Use Retry my changes to confirm it.');
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
    const result = await runAction(() => changeMemberRole(user.id, nextRole, { customRoleId, departments }));
    if (!result) return false;
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
    const result = await runAction(() => changeMemberRole(user.id, 'Client', { companyName: roleCompanyName.trim() }));
    if (!result) return;
    if (!result.ok) {
      setAssignmentError(result.error || 'Unable to change role.');
      return;
    }
    setRoleCompanyUserId(null);
    setRoleCompanyName('');
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
    const result = await runAction(() => updateMemberDepartments(memberDepartmentsId, memberDepartments));
    if (!result) return;
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
    const result = await runAction(() => updateMemberPermissions(
      memberPermissionsId,
      memberPermissionsCustom ? memberPermissions : undefined,
    ));
    if (!result) return;
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
    const result = await runAction(() => retryMutation());
    if (!result) return;
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
    const localResult = rejectRegistration(registrationId);
    if (!localResult.ok) {
      useStore.setState({ registrations: previousRegistrations });
      setActionError(String(t(localResult.error || 'The registration could not be rejected.')));
      return;
    }
    const submitted = useStore.getState();
    const saved = await runAction(() => commitPendingMutation());
    if (!saved) return;
    if (!saved.ok) {
      useStore.setState(state => ({ registrations: rollbackUnchangedRows(state.registrations, previousRegistrations, submitted.registrations) }));
      setActionError(saved.error || 'The rejection was rolled back. Use Retry my changes to confirm it.');
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

  const visibleMembers = scopedUsers.filter(user => {
    const normalizedSearch = memberSearchInput.value.trim().toLowerCase();
    const matchesSearch = !normalizedSearch || user.name.toLowerCase().includes(normalizedSearch) || (user.email || '').toLowerCase().includes(normalizedSearch);
    const matchesRole = memberRoleFilter === 'All' || user.role === memberRoleFilter;
    return matchesSearch && matchesRole;
  });

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isActionSaving) return;
    setAddUserError('');
    if (projectManager && newUser.projectIds.length === 0) {
      setAddUserError('Select at least one project for this member.');
      return;
    }
    const previousIds = new Set(useStore.getState().users.map(user => user.id));
    const result = await runAction(async isCurrent => {
      if (!pendingNewMember.current) {
        const created = await addUserBySuperAdmin({
          name: newUser.name, email: newUser.email || undefined, password: newUser.password,
          role: newUser.role, departments: newUser.role === 'Client' ? ['Client'] : newUser.departments,
          companyName: newUser.role === 'Client' ? newUser.companyName : undefined,
          customRoleId: newUser.customRoleId || undefined,
          workerType: ['Staff', 'HOD'].includes(newUser.role) ? newUser.workerType : undefined,
          sendInvitation: sendNewUserInvitation,
          projectIds: newUser.projectIds,
        });
        if (!isCurrent() || !created.ok || secureAccounts) return created;
        pendingNewMember.current = useStore.getState().users.find(user => !previousIds.has(user.id)
          && user.name === newUser.name.trim() && (user.email || '').toLowerCase() === newUser.email.trim().toLowerCase()) || null;
      }
      return commitPendingMutation();
    });
    if (!result) return;
    if (!result.ok) { setAddUserError(result.error || 'The member is waiting to be saved.'); return; }
    const submittedMember = pendingNewMember.current;
    const latestMember = useStore.getState().users.find(user => user.id === submittedMember?.id);
    if (!secureAccounts && (!submittedMember || !latestMember || ['name', 'email', 'role', 'companyName', 'customRoleId', 'workerType', 'departments'].some(key => JSON.stringify(latestMember[key as keyof User]) !== JSON.stringify(submittedMember[key as keyof User])))) {
      pendingNewMember.current = null;
      setAddUserError(t('The pending member is no longer available. Review your draft before saving again.'));
      return;
    }
    pendingNewMember.current = null;
    resetNewUser();
    setIsAddUserOpen(false);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    const previous = useStore.getState();
    const result = await runAction(() => deleteUser(userToDelete));
    if (!result) return;
    if (!result.ok) {
      setDeleteUserError(result.error || 'Unable to delete this user.');
      return;
    }

    const submitted = useStore.getState();
    const saved = secureAccounts ? { ok: true } : await runAction(() => commitPendingMutation());
    if (!saved) return;
    if (!saved.ok) {
      useStore.setState(state => ({
        users: rollbackUnchangedRows(state.users, previous.users, submitted.users),
        notifications: rollbackUnchangedRows(state.notifications, previous.notifications, submitted.notifications),
        deletedUserIds: state.deletedUserIds === submitted.deletedUserIds ? previous.deletedUserIds : state.deletedUserIds,
      }));
      setDeleteUserError(saved.error || 'The member deletion was rolled back. Use Retry my changes to confirm it.');
      return;
    }

    setDeleteUserError('');
    setUserToDelete(null);
  };

  const handleRequestDeactivation = async (user: User) => {
    const result = await runAction(() => requestMemberDeactivation(user.id));
    if (!result) return;
    if (!result.ok) {
      setAssignmentError(result.error || 'Unable to request account deactivation.');
      return;
    }
    setAssignmentError('');
    useToastStore.getState().addToast(t('Deactivation request sent to Boss Koo.'), 'success');
  };
  return { superAdmin, projectManager, t, setIsAddUserOpen, isActionSaving, backend, actionError, pendingRegs, agedRegistrationCount, activeMemberCount, historyRegs, managedProjects, activeTab, handleTabChange, filteredPendingRegs, selectedBulkRegIds, setSelectedBulkRegIds, registrationSearchInput, handleBulkApprove, handleBulkReject, setRegistrationSearch, pendingDays, handleOpenApproval, toggleBulkSelect, locale, handleRejectRegistration, selectedReg, isMobileApprovalViewport, role, approvalDepartments, approvalCustomRoleId, companyName, sendApprovalInvitation, approvalTemporaryPassword, secureAccounts, rolePermissions, closeApprovalReview, handleApprove, handleApprovalRoleChange, setApprovalDepartments, setApprovalCustomRoleId, setCompanyName, setSendApprovalInvitation, setApprovalTemporaryPassword, generateApprovalPassword, handleSaveRole, pendingRoleSave, roleForm, setRoleForm, editingBuiltinRole, handleRoleBaseChange, togglePermission, roleError, roleEditorId, roleDirty, resetRoleForm, handleEditRole, handleDeleteRole, assignmentError, memberSearchInput, memberRoleFilter, setMemberRoleFilter, visibleMembers, roleSelectValue, handleChangeRole, roleCompanyUserId, roleCompanyName, setRoleCompanyName, clients, handleConfirmClientCompany, roleDeptUserId, roleDeptValue, setRoleDeptValue, handleConfirmRoleDepartments, handleRequestDeactivation, handleEditDepartments, handleEditPermissions, currentUser, setDeleteUserError, setUserToDelete, memberDepartmentsId, editDepartmentsTitleId, setMemberDepartmentsId, setMemberDepartmentsError, handleSaveDepartments, memberDepartments, setMemberDepartments, memberDepartmentsError, retainedMemberMutation, handleRetryMemberMutation, memberPermissionsUser, editPermissionsTitleId, setMemberPermissionsId, setMemberPermissionsError, handleSaveMemberPermissions, memberPermissionsCustom, setMemberPermissionsCustom, memberPermissionKeys, memberPermissionsPreview, addedMemberPermissions, removedMemberPermissions, memberPermissionGroups, memberPermissions, toggleMemberPermission, memberPermissionsError, isAddUserOpen, addMemberTitleId, pendingNewMember, resetNewUser, handleAddUser, newUser, setNewUser, sendNewUserInvitation, setSendNewUserInvitation, addUserError, userToDelete, deleteMemberTitleId, deleteUserError, handleDeleteUser, confirmation, confirmationTitleId, setConfirmation };
};
