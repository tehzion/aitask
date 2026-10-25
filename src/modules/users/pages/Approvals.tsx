import { AlertTriangle, CheckCircle2, ChevronRight, Clock3, History, Pencil, Save, Search, ShieldCheck, Trash2, UserCheck, UserPlus, Users, X, XCircle } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';
import { canDeleteUser, defaultRolePermissions, getAssignableCustomRoles, getBuiltinRoleId, getEffectiveRoleName, getGrantablePermissionGroups, getRoleDisplayName, isBossKoo, permissionLabels } from '../../../shared/authorization/access';
import { getMemberDepartments } from '../../../shared/authorization/departments';
import ConfirmDialog from '../../../shared/components/ConfirmDialog';
import ModalShell from '../../../shared/components/ModalShell';
import SystemMessage from '../../../shared/components/SystemMessage';
import { Badge, Button, IconButton, MetricCard, PageHeader, SegmentedTabs } from '../../../shared/components/ui';
import { cardBase, inputBase, pageShell } from '../../../shared/components/uiTokens';
import '../../../shared/i18n/actionFeedbackCopy';
import { formatLocalizedDate } from '../../../shared/i18n/i18n';
import { type Role, type RolePermissionKey, type User } from '../../../shared/types/index';
import { cn } from '../../../shared/utils/utils';
import DepartmentMultiSelect from '../components/DepartmentMultiSelect';
import { RegistrationReviewPanel } from '../components/RegistrationReviewPanel';
import { useUserAdministration } from '../hooks/useUserAdministration';
import { approvalTabItems, BUILTIN_ROLE_DESCRIPTIONS, ROLES } from '../hooks/userAdministrationOptions';

const Approvals: React.FC = () => {
  const { superAdmin, projectManager, t, setIsAddUserOpen, isActionSaving, backend, actionError, pendingRegs, agedRegistrationCount, activeMemberCount, historyRegs, managedProjects, activeTab, handleTabChange, filteredPendingRegs, selectedBulkRegIds, setSelectedBulkRegIds, registrationSearchInput, handleBulkApprove, handleBulkReject, setRegistrationSearch, pendingDays, handleOpenApproval, toggleBulkSelect, locale, handleRejectRegistration, selectedReg, isMobileApprovalViewport, role, approvalDepartments, approvalCustomRoleId, companyName, sendApprovalInvitation, approvalTemporaryPassword, secureAccounts, rolePermissions, closeApprovalReview, handleApprove, handleApprovalRoleChange, setApprovalDepartments, setApprovalCustomRoleId, setCompanyName, setSendApprovalInvitation, setApprovalTemporaryPassword, generateApprovalPassword, handleSaveRole, pendingRoleSave, roleForm, setRoleForm, editingBuiltinRole, handleRoleBaseChange, togglePermission, roleError, roleEditorId, roleDirty, resetRoleForm, handleEditRole, handleDeleteRole, assignmentError, memberSearchInput, memberRoleFilter, setMemberRoleFilter, visibleMembers, roleSelectValue, handleChangeRole, roleCompanyUserId, roleCompanyName, setRoleCompanyName, clients, handleConfirmClientCompany, roleDeptUserId, roleDeptValue, setRoleDeptValue, handleConfirmRoleDepartments, handleRequestDeactivation, handleEditDepartments, handleEditPermissions, currentUser, setDeleteUserError, setUserToDelete, memberDepartmentsId, editDepartmentsTitleId, setMemberDepartmentsId, setMemberDepartmentsError, handleSaveDepartments, memberDepartments, setMemberDepartments, memberDepartmentsError, retainedMemberMutation, handleRetryMemberMutation, memberPermissionsUser, editPermissionsTitleId, setMemberPermissionsId, setMemberPermissionsError, handleSaveMemberPermissions, memberPermissionsCustom, setMemberPermissionsCustom, memberPermissionKeys, memberPermissionsPreview, addedMemberPermissions, removedMemberPermissions, memberPermissionGroups, memberPermissions, toggleMemberPermission, memberPermissionsError, isAddUserOpen, addMemberTitleId, pendingNewMember, resetNewUser, handleAddUser, newUser, setNewUser, sendNewUserInvitation, setSendNewUserInvitation, addUserError, userToDelete, deleteMemberTitleId, deleteUserError, handleDeleteUser, confirmation, confirmationTitleId, setConfirmation } = useUserAdministration();

  if (!superAdmin && !projectManager) {
    return (
      <div className={pageShell}>
        <PageHeader
          title={t('Approvals — Boss Koo only')}
          description={t('Registration approvals, member management, and role controls are restricted to the Boss Koo account.')}
        />
        <section className="mt-6 rounded-panel border border-amber-200 bg-amber-50 p-6 text-amber-950" role="alert" aria-labelledby="approvals-access-denied-title">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            <div>
              <h2 id="approvals-access-denied-title" className="font-semibold">{t('Access denied')}</h2>
              <p className="mt-1 text-sm leading-6">{t('Only Boss Koo can review registrations, change member roles, or edit role permissions.')}</p>
              <Link to="/tasks" className="mt-4 inline-flex min-h-11 items-center rounded-control bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">{t('Return to work')}</Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={pageShell}>
      <PageHeader
        title={t('Approvals')}
        description={t('Review access requests and manage workspace members, roles, and decisions.')}
        onboardingTarget="approvals-overview"
        action={(superAdmin || projectManager) ? (
          <Button onClick={() => setIsAddUserOpen(true)} disabled={isActionSaving || backend.isSaving}>
            <UserPlus className="w-4 h-4" />
            {t('Add Member')}
          </Button>
        ) : undefined}
      />

      {actionError && (
        <div className="rounded-panel border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert" aria-live="assertive">
          <SystemMessage message={actionError} />
        </div>
      )}

      {superAdmin && <section aria-label={t('Approval overview')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard title={t('Pending registrations')} value={pendingRegs.length} icon={UserCheck} tone="blue" footer={t('Awaiting review')} />
        <MetricCard title={t('Aging 7+ days')} value={agedRegistrationCount} icon={Clock3} tone={agedRegistrationCount > 0 ? 'red' : 'emerald'} footer={agedRegistrationCount > 0 ? t('Prioritize these requests') : t('Queue is current')} />
        <MetricCard title={t('Active members')} value={activeMemberCount} icon={Users} tone="purple" footer={t('Workspace accounts')} />
        <MetricCard title={t('Recent decisions')} value={historyRegs.length} icon={History} tone="slate" footer={t('Approved or rejected')} />
      </section>}

      {projectManager && <section className="rounded-panel border border-line bg-surface p-5"><h2 className="font-semibold text-ink">{t('Manage team')}</h2><p className="mt-1 text-sm leading-6 text-muted">{t('Invite HOD and Staff accounts, then assign them only to projects under your authority. Shared accounts keep their other project memberships.')}</p><div className="mt-3 flex flex-wrap gap-2">{managedProjects.map(project => <Badge key={project.id} tone="slate"><span data-i18n-skip>{project.projectName}</span></Badge>)}</div></section>}

      <SegmentedTabs
        items={(superAdmin ? approvalTabItems : approvalTabItems.filter(item => item.id === 'members')).map(item => ({
          ...item,
          count: item.id === 'registrations' ? pendingRegs.length : item.id === 'members' ? activeMemberCount : item.id === 'history' ? historyRegs.length : undefined,
        }))}
        value={activeTab}
        onChange={handleTabChange}
        label={t('Approval workspace sections')}
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
              <h2 className="text-base font-semibold text-ink sm:text-lg">{t('Pending registrations')}</h2>
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
          <label htmlFor="registration-search" className="sr-only">{t('Search registrations')}</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              id="registration-search"
              type="search"
              {...registrationSearchInput.inputProps}
              placeholder={t('Search name, email, phone, or position')}
              className={cn(inputBase, 'pl-9 pr-10')}
            />
            {registrationSearchInput.value && (
              <IconButton
                label={t('Clear registration search')}
                className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2"
                onClick={() => registrationSearchInput.commit('')}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </IconButton>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">{t('Oldest requests appear first so aging access requests stay visible.')}</p>
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
            <p className="mt-3 text-sm font-semibold text-ink">{t(pendingRegs.length === 0 ? 'No pending registrations' : 'No registrations match this search')}</p>
            <p className="mt-1 text-sm text-muted">{t(pendingRegs.length === 0 ? 'New access requests will appear here.' : 'Try a different name, email, phone number, or position.')}</p>
            {pendingRegs.length > 0 && <Button type="button" variant="secondary" className="mt-4" onClick={() => setRegistrationSearch('')}>{t('Clear search')}</Button>}
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
                aria-label={t('Review registration')}
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
                        aria-label={t('Select registration')}
                      />
                    )}
                    <div className="min-w-0">
                      <p data-i18n-skip className="font-semibold text-slate-800">{reg.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{t({ id: 'approval.applied', values: { date: formatLocalizedDate(new Date(reg.createdAt), locale) } })}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {days >= 7 && (
                      <span className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">{days}d</span>
                    )}
                    <span className="inline-flex px-2 py-1 rounded-md text-xs font-bold tracking-wide bg-accent-soft text-accent">
                      {reg.requestedRole || t('Staff')}
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
                        <CheckCircle2 className="w-4 h-4 mr-1.5" /> {t('Approve')}
                      </button>
                      <button
                        onClick={event => { event.stopPropagation(); handleRejectRegistration(reg); }}
                        disabled={isActionSaving || backend.isSaving}
                        className="flex min-h-11 flex-1 items-center justify-center rounded-control border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4 mr-1.5" /> {t('Reject')}
                      </button>
                    </>
                  ) : (
                    <span className="text-xs font-medium text-muted">{t('Boss Koo approval required')}</span>
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
                    <span className="sr-only">{t('Select')}</span>
                  </th>
                  <th className="border-b border-line px-6 py-4 font-semibold">{t('Name')}</th>
                  <th className="border-b border-line px-6 py-4 font-semibold">{t('Contact')}</th>
                  <th className="border-b border-line px-6 py-4 font-semibold">{t('Requested access')}</th>
                  <th className="border-b border-line px-6 py-4 text-right font-semibold">{t('Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {filteredPendingRegs.map(reg => {
                  const days = pendingDays(reg);
                  return (
                  <tr
                    key={reg.id}
                    tabIndex={0}
                    aria-label={t('Review registration')}
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
                          aria-label={t('Select registration')}
                        />
                      ) : null}
                    </td>
                    <td className="px-6 py-4">
                      <div data-i18n-skip className="font-semibold text-slate-800">{reg.name}</div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                        {t({ id: 'approval.appliedColon', values: { date: formatLocalizedDate(new Date(reg.createdAt), locale) } })}
                        {days >= 7 && (
                        <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">{days}d {t('pending')}</span>
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
                          {reg.requestedRole || t('Staff')}
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
                            <CheckCircle2 className="w-4 h-4 mr-1.5" /> {t('Approve')}
                          </button>
                          <button
                            onClick={event => { event.stopPropagation(); handleRejectRegistration(reg); }}
                            disabled={isActionSaving || backend.isSaving}
                            className="inline-flex min-h-11 items-center rounded-control border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <XCircle className="w-4 h-4 mr-1.5" /> {t('Reject')}
                          </button>
                        </>
                      ) : (
                        <span className="text-xs font-medium text-muted">{t('Boss Koo approval required')}</span>
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

      {selectedReg && !isMobileApprovalViewport ? (
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
            <h2 className="mt-4 text-base font-semibold text-ink">{t('Select a registration to review')}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{t('Choose an applicant from the queue to inspect their request and assign access.')}</p>
          </div>
        </aside>
      )}
      </div>}

      {/* Roles & Permissions */}
      {activeTab === 'roles' && <div className={`${cardBase} overflow-hidden`}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-blue-600" />
          <div>
            <h2 className="text-lg font-semibold text-slate-800">{t('Roles & Permissions')}</h2>
            <p className="text-sm text-slate-500">{t('Manage Project Manager, HOD, Staff, and Client access. Boss Koo powers and HOD scope stay protected.')}</p>
          </div>
        </div>

        {!superAdmin && (
          <div className="border-b border-slate-100 bg-amber-50 px-6 py-3 text-sm text-amber-800" role="status">
            {t('Only Boss Koo can manage roles and members. The controls below are read-only for your account.')}
          </div>
        )}
        <fieldset disabled={!superAdmin || isActionSaving || backend.isSaving} className="p-0 m-0 border-0 min-w-0">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-0">
          <form onSubmit={handleSaveRole} className="p-6 border-b xl:border-b-0 xl:border-r border-slate-100 space-y-4">
            <fieldset disabled={pendingRoleSave} className="min-w-0 space-y-4 border-0 p-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('Role Name')}</label>
                <input
                  className={cn(inputBase, 'px-3 py-2.5')}
                  value={roleForm.name}
                  onChange={e => setRoleForm({ ...roleForm, name: e.target.value })}
                  placeholder={t('e.g. Account Manager')}
                  maxLength={60}
                  disabled={editingBuiltinRole}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('Base Role')}</label>
                <select
                  aria-label={t('Base Role')}
                  className={cn(inputBase, 'px-3 py-2.5')}
                  value={roleForm.baseRole}
                  onChange={e => handleRoleBaseChange(e.target.value as Role)}
                  disabled={editingBuiltinRole}
                >
                  {ROLES.map(r => <option key={r} value={r}>{t(getRoleDisplayName(r))}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('Description')}</label>
              <input
                className={cn(inputBase, 'px-3 py-2.5')}
                value={roleForm.description}
                onChange={e => setRoleForm({ ...roleForm, description: e.target.value })}
                placeholder={t('Short internal note')}
                maxLength={200}
              />
            </div>

            <div className="space-y-4">
              {roleForm.baseRole === 'Staff' && !editingBuiltinRole && (
                <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={roleForm.departmentScoped}
                    onChange={() => setRoleForm({ ...roleForm, departmentScoped: !roleForm.departmentScoped })}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    {t('Limit this role to its departments')}
                    <span className="mt-0.5 block text-xs text-slate-500">{t('Members only see and edit work in their own departments.')}</span>
                  </span>
                </label>
              )}
              {getGrantablePermissionGroups(roleForm.baseRole, { departmentScoped: roleForm.departmentScoped }).map(group => (
                <div key={group.title}>
                  <p className="text-xs font-semibold tracking-wide text-slate-400 mb-2">{group.title}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {group.keys.map(key => (
                      <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={roleForm.permissions[key]}
                          onChange={() => togglePermission(key)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>{permissionLabels[key]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            </fieldset>
            {roleError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                <SystemMessage message={roleError} />
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-3">
              {roleEditorId && (
                <Button type="button" variant="secondary" onClick={() => { if (!roleDirty || window.confirm(t('Discard unsaved changes?'))) resetRoleForm(); }} disabled={pendingRoleSave}>
                  {t('Cancel Edit')}
                </Button>
              )}
              <Button type="submit">
                <Save className="w-4 h-4" />
                {isActionSaving ? t('Saving…') : pendingRoleSave ? t('Retry save') : roleEditorId ? t('Update Role') : t('Create Role')}
              </Button>
            </div>
          </form>

          <div className="p-6 space-y-3">
            <div>
              <p className="mb-2 text-xs font-semibold tracking-wide text-slate-400">{t('Default roles')}</p>
              <div className="space-y-2">
                {ROLES.map(role => {
                  const template = rolePermissions.find(item => item.isBuiltin && item.baseRole === role);
                  const templateId = template?.id || getBuiltinRoleId(role);
                  const permissions = template?.permissions || defaultRolePermissions[role];
                  return (
                    <div key={templateId} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex items-center gap-2">
                        <h3 data-i18n-skip className="font-semibold text-slate-900">{t(getRoleDisplayName(role))}</h3>
                        <Badge tone="purple">{t('Editable default')}</Badge>
                        {superAdmin && <Button type="button" variant="secondary" className="ml-auto" disabled={pendingRoleSave} onClick={() => handleEditRole(templateId)}>{t('Edit permissions')}</Button>}
                      </div>
                      <p className="mt-1 text-sm text-slate-500">{t(BUILTIN_ROLE_DESCRIPTIONS[role])}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {Object.entries(permissions).filter(([, enabled]) => enabled).map(([key]) => (
                          <Badge key={key} tone="indigo">{permissionLabels[key as RolePermissionKey]}</Badge>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="pt-2 text-xs font-semibold tracking-wide text-slate-400">{t('Custom roles')}</p>
            {rolePermissions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                {t('No custom roles yet. Create one to assign it to team members.')}
              </div>
            ) : rolePermissions.filter(customRole => !customRole.isBuiltin).map(customRole => (
              <div key={customRole.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 data-i18n-skip className="font-semibold text-slate-900">{customRole.name}</h3>
                      <Badge tone="slate">{t('Base:')} {t(getRoleDisplayName(customRole.baseRole))}</Badge>
                      {customRole.isProtected && <Badge tone="purple">{t('Protected')}</Badge>}
                    </div>
                    {customRole.description && <p className="mt-1 text-sm text-slate-500">{customRole.description}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" onClick={() => handleEditRole(customRole.id)} disabled={pendingRoleSave || customRole.isProtected}>{t('Edit permissions')}</Button>
                    <Button type="button" variant="danger" onClick={() => void handleDeleteRole(customRole.id)} disabled={pendingRoleSave || isActionSaving || customRole.isProtected}>{t('Delete')}</Button>
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
              <h2 className="text-base font-semibold text-ink sm:text-lg">{t('Decision history')}</h2>
              <p className="mt-1 text-sm text-muted">{t('Review previously approved and rejected access requests.')}</p>
            </div>
            <Badge tone="slate">{historyRegs.length} {t('decisions')}</Badge>
          </div>
          {historyRegs.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <History className="mx-auto h-7 w-7 text-muted/60" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-ink">{t('No decisions yet')}</p>
              <p className="mt-1 text-sm text-muted">{t('Completed reviews will appear here.')}</p>
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
                      <span>{reg.jobPosition || t('Position not specified')}</span>
                      <span>{formatLocalizedDate(new Date(reg.createdAt), locale)}</span>
                    </div>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-inset/70 text-xs tracking-wide text-muted">
                    <tr><th className="px-5 py-3 font-semibold">{t('Applicant')}</th><th className="px-5 py-3 font-semibold">{t('Requested access')}</th><th className="px-5 py-3 font-semibold">{t('Decision')}</th><th className="px-5 py-3 font-semibold">{t('Date')}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-line/70">
                    {historyRegs.map(reg => (
                      <tr key={reg.id} className="hover:bg-inset/40">
                        <td data-i18n-skip className="px-5 py-4 font-medium text-ink"><span className="block">{reg.name}</span><span data-i18n-skip className="mt-1 block text-xs font-normal text-muted">{reg.email}</span></td>
                        <td className="px-5 py-4 text-muted">{reg.requestedRole} · {reg.jobPosition || t('Position not specified')}</td>
                        <td className="px-5 py-4"><Badge tone={reg.status === 'Approved' ? 'emerald' : 'red'}>{reg.status}</Badge></td>
                        <td className="px-5 py-4 text-muted">{formatLocalizedDate(new Date(reg.createdAt), locale)}</td>
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
            <h2 className="text-lg font-semibold text-slate-800">{t('Active System Users')}</h2>
          </div>
        </div>
        {assignmentError && (
          <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <SystemMessage message={assignmentError} />
          </div>
        )}
        <div className="flex flex-col gap-2 border-b border-line/80 bg-inset/60 px-4 py-3 sm:flex-row sm:px-5">
          <input
            type="search"
            {...memberSearchInput.inputProps}
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
            <p className="mt-3 text-sm font-semibold text-ink">{t('No members match these filters')}</p>
            <p className="mt-1 text-sm text-muted">{t('Try a different name, email, or role.')}</p>
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
                    {isBossKoo(u) && <Badge tone="purple"><span data-i18n-skip>Boss Koo</span></Badge>}
                  </div>
                  <p data-i18n-skip className="mt-1 truncate text-xs text-slate-500">{u.email || t('No email on file')}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={u.role === 'Project Manager' ? 'purple' : u.role === 'Client' ? 'amber' : 'blue'}>{t(getRoleDisplayName(u.role))}</Badge>
                {u.role === 'Client' ? (
                  <span data-i18n-skip className="text-sm font-medium text-slate-600">{u.companyName || t('No company')}</span>
                ) : getMemberDepartments(u).map(department => <Badge key={department} tone="slate">{t(department)}</Badge>)}
              </div>
              {isBossKoo(u) ? (
                <Badge tone="purple">{t('Protected Boss Koo account')}</Badge>
              ) : superAdmin ? (
                <div className="space-y-2">
                  <label className="sr-only" htmlFor={`mobile-role-${u.id}`}>{t('Role')}</label>
                  <select
                    id={`mobile-role-${u.id}`}
                    className={cn(inputBase, 'w-full px-3 py-2 text-sm')}
                    value={roleSelectValue(u)}
                    onChange={event => void handleChangeRole(u, event.target.value)}
                    disabled={isActionSaving}
                  >
                    <option value="role:project-manager">{t(getRoleDisplayName('Project Manager'))}</option>
                    <option value="role:hod">{t('HOD')}</option>
                    <option value="role:staff">{t('Staff')}</option>
                    <option value="role:client">{t('Client')}</option>
                    {rolePermissions.filter(customRole => !customRole.isBuiltin).map(customRole => (
                      <option key={customRole.id} data-i18n-skip value={`custom:${customRole.id}`}>{customRole.name}</option>
                    ))}
                  </select>
                  {roleCompanyUserId === u.id && (
                    <>
                      <label className="sr-only" htmlFor={`mobile-company-${u.id}`}>{t('Company')}</label>
                      <select
                        id={`mobile-company-${u.id}`}
                        className={cn(inputBase, 'w-full px-3 py-2 text-sm')}
                        value={roleCompanyName}
                        onChange={event => setRoleCompanyName(event.target.value)}
                        disabled={isActionSaving}
                      >
                        <option value="">{t('Choose a company…')}</option>
                        {clients.map(client => <option key={client.id} data-i18n-skip value={client.clientName}>{client.clientName}</option>)}
                      </select>
                      <Button type="button" className="w-full" onClick={() => void handleConfirmClientCompany(u)} disabled={isActionSaving || !roleCompanyName.trim()}>{t('Confirm company')}</Button>
                    </>
                  )}
                  {roleDeptUserId === u.id && (
                    <>
                      <DepartmentMultiSelect value={roleDeptValue} onChange={setRoleDeptValue} />
                      <Button type="button" className="w-full" onClick={() => void handleConfirmRoleDepartments(u)} disabled={isActionSaving || roleDeptValue.length === 0}>{t('Confirm departments')}</Button>
                    </>
                  )}
                </div>
              ) : (
                <Badge tone="slate" data-i18n-skip>{getEffectiveRoleName(u, rolePermissions)}</Badge>
              )}
              {!isBossKoo(u) && u.permissions && Object.keys(u.permissions).length > 0 && <Badge tone="indigo">{t('Custom access')}</Badge>}
              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                {projectManager && ['HOD', 'Staff'].includes(u.role) && (
                  <Button type="button" variant="secondary" onClick={() => void handleRequestDeactivation(u)} disabled={isActionSaving}>{t('Request deactivation')}</Button>
                )}
                {superAdmin && u.role !== 'Client' && !isBossKoo(u) && (
                  <Button type="button" variant="secondary" onClick={() => handleEditDepartments(u.id)} disabled={isActionSaving}>{t('Edit departments')}</Button>
                )}
                {superAdmin && ['Staff', 'HOD'].includes(u.role) && !isBossKoo(u) && (
                  <Button type="button" variant="secondary" onClick={() => handleEditPermissions(u.id)} disabled={isActionSaving}>{t('Manage access')}</Button>
                )}
                {canDeleteUser(currentUser, u, rolePermissions) ? (
                  <Button type="button" variant="danger" onClick={() => { setDeleteUserError(''); setUserToDelete(u.id); }}>{t('Remove')}</Button>
                ) : (
                  <span className="inline-flex min-h-11 items-center rounded-control bg-inset px-3 text-xs font-semibold text-muted">{isBossKoo(u) || u.id === currentUser?.id ? t('Protected account') : t('No access')}</span>
                )}
              </div>
            </article>
          ))}
        </div>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-inset text-muted text-xs tracking-wide">
                <th className="px-6 py-4 font-semibold border-b border-slate-200">{t('User')}</th>
                <th className="px-6 py-4 font-semibold border-b border-slate-200">{t('Role & Departments')}</th>
                <th className="px-6 py-4 font-semibold border-b border-slate-200">{t('Custom Role')}</th>
                <th className="px-6 py-4 font-semibold border-b border-slate-200">{t('Contact')}</th>
                <th className="px-6 py-4 font-semibold border-b border-slate-200 text-right">{t('Actions')}</th>
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
                          {isBossKoo(u) && <Badge tone="purple"><span data-i18n-skip>Boss Koo</span></Badge>}
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
                        <span data-i18n-skip className="text-sm font-medium text-slate-600">({u.companyName})</span>
                      ) : getMemberDepartments(u).map(department => (
                        <Badge key={department} tone="slate">{t(department)}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 min-w-[240px]">
                    {isBossKoo(u) ? (
                      <Badge tone="purple">{t('Protected Boss Koo account')}</Badge>
                    ) : superAdmin ? (
                      <div className="space-y-2">
                        <select
                          aria-label={t('Role')}
                          className={cn(inputBase, 'px-3 py-2 text-sm')}
                          value={roleSelectValue(u)}
                          onChange={e => void handleChangeRole(u, e.target.value)}
                          disabled={isActionSaving}
                        >
                          <option value="role:project-manager">{t(getRoleDisplayName('Project Manager'))}</option>
                          <option value="role:hod">{t('HOD')}</option>
                          <option value="role:staff">{t('Staff')}</option>
                          <option value="role:client">{t('Client')}</option>
                          {rolePermissions
                            .filter(customRole => !customRole.isBuiltin)
                            .map(customRole => (
                              <option key={customRole.id} data-i18n-skip value={`custom:${customRole.id}`}>{customRole.name}</option>
                            ))}
                        </select>
                        {roleCompanyUserId === u.id && (
                          <select
                            aria-label={t('Company')}
                            className={cn(inputBase, 'px-3 py-2 text-sm')}
                            value={roleCompanyName}
                            onChange={e => setRoleCompanyName(e.target.value)}
                            disabled={isActionSaving}
                          >
                            <option value="">{t('Choose a company…')}</option>
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
                            {t('Confirm')}
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
                              {t('Confirm')}
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <Badge tone="slate" data-i18n-skip>{getEffectiveRoleName(u, rolePermissions)}</Badge>
                    )}
                    {!isBossKoo(u) && u.permissions && Object.keys(u.permissions).length > 0 && <Badge className="mt-2" tone="indigo">{t('Custom access')}</Badge>}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {u.email || t('No email on file')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {projectManager && ['HOD', 'Staff'].includes(u.role) && (
                        <Button type="button" variant="secondary" onClick={() => void handleRequestDeactivation(u)} disabled={isActionSaving}>{t('Request deactivation')}</Button>
                      )}
                      {superAdmin && u.role !== 'Client' && !isBossKoo(u) && (
                        <button
                          type="button"
                          onClick={() => handleEditDepartments(u.id)}
                          disabled={isActionSaving}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-control text-muted transition-colors hover:bg-accent-soft hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50"
                          title={t('Edit departments')}
                          aria-label={t('Edit departments')}
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
                          title={t('Manage permissions')}
                          aria-label={t('Manage permissions')}
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
                        title={t('Remove User')}
                        aria-label={t('Remove User')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      ) : isBossKoo(u) || u.id === currentUser?.id ? (
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                        {t('Protected account')}
                      </span>
                      ) : (
                      <span className="text-xs font-medium text-slate-400">{t('No access')}</span>
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
              {t('Edit departments')}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {t('Existing task assignments remain unchanged when a department is removed.')}
            </p>
          </div>
          <form onSubmit={handleSaveDepartments} className="space-y-5 p-6">
            <DepartmentMultiSelect value={memberDepartments} onChange={setMemberDepartments} disabled={isActionSaving} />
            {memberDepartmentsError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                <SystemMessage message={memberDepartmentsError} />
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
                  {t('Retry saved change')}
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                disabled={isActionSaving}
                onClick={() => setMemberDepartmentsId(null)}
              >
                {t('Cancel')}
              </Button>
              <Button type="submit" disabled={isActionSaving || backend.isSaving}>
                {isActionSaving ? t('Saving...') : t('Save departments')}
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
            <h2 id={editPermissionsTitleId} className="text-lg font-semibold text-slate-950">
              {t('approval.manageAccessFor', { name: memberPermissionsUser.name })}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{t('Assigned tasks remain editable and deletable. Protected Boss Koo permissions are never delegated.')}</p>
          </div>
          <form onSubmit={handleSaveMemberPermissions} className="space-y-5 p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" disabled={isActionSaving} aria-pressed={!memberPermissionsCustom} onClick={() => setMemberPermissionsCustom(false)} className={cn('min-h-20 rounded-lg border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400', !memberPermissionsCustom ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50')}>
                <span className="block text-sm font-semibold text-slate-900">{t('approval.useRoleDefaults')}</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">{t('Follow {role} permissions and future role updates.', { role: getEffectiveRoleName({ ...memberPermissionsUser, permissions: undefined }, rolePermissions) })}</span>
              </button>
              <button type="button" disabled={isActionSaving} aria-pressed={memberPermissionsCustom} onClick={() => setMemberPermissionsCustom(true)} className={cn('min-h-20 rounded-lg border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400', memberPermissionsCustom ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50')}>
                <span className="block text-sm font-semibold text-slate-900">{t('approval.customAccess')}</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">{t('Save a dedicated permission set for this member.')}</span>
              </button>
            </div>

            <section aria-labelledby="effective-access-preview" className="rounded-panel border border-accent/20 bg-accent-soft/50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 id="effective-access-preview" className="text-sm font-semibold text-slate-900">{t('approval.effectivePreview')}</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {t('Preview the permissions that will apply after this choice is saved. Baseline: {role}.', { role: getEffectiveRoleName({ ...memberPermissionsUser, permissions: undefined }, rolePermissions) })}
                  </p>
                </div>
                <Badge tone="indigo">{memberPermissionKeys.filter(key => memberPermissionsPreview[key]).length} {t('enabled')}</Badge>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-semibold tracking-wide text-emerald-700">{t('Added')}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {addedMemberPermissions.length > 0 ? addedMemberPermissions.map(key => permissionLabels[key]).join(', ') : t('No additions')}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold tracking-wide text-red-700">{t('Removed')}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {removedMemberPermissions.length > 0 ? removedMemberPermissions.map(key => permissionLabels[key]).join(', ') : t('No removals')}
                  </p>
                </div>
              </div>
            </section>

            <fieldset disabled={!memberPermissionsCustom || isActionSaving} className="space-y-4 disabled:opacity-55">
              <legend className="sr-only">{t('Member permissions')}</legend>
              {memberPermissionGroups.map(group => (
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

            {memberPermissionsError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert"><SystemMessage message={memberPermissionsError} /></div>}
            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-4">
              {retainedMemberMutation?.kind === 'permissions' && retainedMemberMutation.memberId === memberPermissionsUser.id && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isActionSaving || backend.isSaving}
                  onClick={() => void handleRetryMemberMutation('permissions', memberPermissionsUser.id)}
                >
                  {t('Retry saved change')}
                </Button>
              )}
              <Button type="button" variant="secondary" disabled={isActionSaving} onClick={() => setMemberPermissionsId(null)}>{t('Cancel')}</Button>
              <Button type="submit" disabled={isActionSaving || backend.isSaving}>{isActionSaving ? t('Saving...') : memberPermissionsCustom ? t('Save custom access') : t('Reset to role defaults')}</Button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* Add Member Modal */}
      {isAddUserOpen && (
        <ModalShell
          labelledBy={addMemberTitleId}
          onClose={() => {
            if (isActionSaving) return;
            if (!pendingNewMember.current) resetNewUser();
            setIsAddUserOpen(false);
          }}
          panelClassName="max-w-lg "
        >
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h2 id={addMemberTitleId} className="text-lg font-semibold text-slate-950">{t('Add new member')}</h2>
              <p className="text-sm text-slate-500 mt-1">{t('Invite a new account. Existing Staff signups should be approved below.')}</p>
            </div>

            <form onSubmit={handleAddUser} className="p-6 space-y-4">
              <fieldset disabled={isActionSaving || Boolean(pendingNewMember.current)} className="min-w-0 border-0 p-0 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('Full Name')}</label>
                  <input
                    className={cn(inputBase, 'px-3 py-2.5')}
                    value={newUser.name}
                    onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                    maxLength={80}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('Email')}</label>
                  <input
                    type="email"
                    className={cn(inputBase, 'px-3 py-2.5')}
                    value={newUser.email}
                    onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                    data-i18n-skip
                    placeholder="member@email.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('System Role')}</label>
                  <select
                    aria-label={t('System Role')}
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
                    {(projectManager ? ROLES.filter(roleOption => roleOption === 'HOD' || roleOption === 'Staff') : ROLES).map(r => <option key={r} value={r}>{t(getRoleDisplayName(r))}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('Custom Role')}</label>
                  <select
                    aria-label={t('Custom Role')}
                    className={cn(inputBase, 'px-3 py-2.5')}
                    value={newUser.customRoleId}
                    onChange={e => setNewUser({ ...newUser, customRoleId: e.target.value })}
                  >
                    <option value="">{t('Base role only')}</option>
                    {getAssignableCustomRoles(newUser.role, rolePermissions).filter(customRole => !customRole.isBuiltin).map(customRole => <option key={customRole.id} data-i18n-skip value={customRole.id}>{customRole.name}</option>)}
                  </select>
                </div>
              </div>

              {newUser.role === 'Client' ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="text-sm font-medium text-slate-700">{t('Department')}</p>
                  <p className="mt-0.5 text-sm text-slate-600">{t('Client')}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <DepartmentMultiSelect
                    value={newUser.departments}
                    onChange={departments => setNewUser({ ...newUser, departments })}
                  />
                  {['Staff', 'HOD'].includes(newUser.role) && <label className="block text-sm font-medium text-slate-700">{t('Worker type')}<select className={cn(inputBase, 'mt-1 px-3 py-2.5')} value={newUser.workerType} onChange={event => setNewUser({ ...newUser, workerType: event.target.value as NonNullable<User['workerType']> })}><option value="employee">{t('Employee')}</option><option value="supplier">{t('Supplier')}</option><option value="freelancer">{t('Freelancer')}</option></select></label>}
                </div>
              )}

              {newUser.role === 'Client' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('Client Company')}</label>
                  <input
                    className={cn(inputBase, 'px-3 py-2.5')}
                    value={newUser.companyName}
                    onChange={e => setNewUser({ ...newUser, companyName: e.target.value })}
                    placeholder={t('e.g. UrbanEats')}
                    required
                  />
                </div>
              )}

              {projectManager && (
                <fieldset className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                  <legend className="px-1 text-sm font-medium text-slate-700">{t('Project access')}</legend>
                  <p className="mb-3 text-xs leading-5 text-slate-500">{t('Choose the projects where this HOD or Staff member should work. Existing accounts keep memberships managed by other Project Managers.')}</p>
                  <div className="space-y-2">
                    {managedProjects.map(project => (
                      <label key={project.id} className="flex min-h-11 items-center gap-3 rounded-control border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          checked={newUser.projectIds.includes(project.id)}
                          onChange={event => setNewUser(current => ({
                            ...current,
                            projectIds: event.target.checked
                              ? [...current.projectIds, project.id]
                              : current.projectIds.filter(projectId => projectId !== project.id),
                          }))}
                        />
                        <span data-i18n-skip>{project.projectName}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
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
                      <span className="block font-medium text-slate-900">{t('Send email invitation')}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{t('Enable this after SMTP is configured.')}</span>
                    </span>
                  </label>
                  {!sendNewUserInvitation && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">{t('Temporary Password')}</label>
                      <input
                        type="password"
                        autoComplete="new-password"
                        minLength={12}
                        className={cn(inputBase, 'px-3 py-2.5')}
                        value={newUser.password}
                        onChange={event => setNewUser({ ...newUser, password: event.target.value })}
                        required
                      />
                      <p className="mt-1 text-xs text-slate-500">{t('At least 12 characters. The member must change it after login.')}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('Default Password')}</label>
                  <input
                    type="text"
                    className={cn(inputBase, 'px-3 py-2.5')}
                    value={newUser.password}
                    onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                    required
                  />
                  <p className="text-xs text-slate-500 mt-1">{t('The member signs in with this password first, then resets it in Settings.')}</p>
                </div>
              )}

              </fieldset>
              {addUserError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert" aria-live="assertive">
                  <SystemMessage message={addUserError} />
                </div>
              )}

              <div className="pt-4 flex gap-3 justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    if (isActionSaving) return;
                    if (!pendingNewMember.current) resetNewUser();
                    setIsAddUserOpen(false);
                  }}
                >
                  {t('Cancel')}
                </Button>
                <Button type="submit" disabled={isActionSaving || backend.isSaving}>
                  {isActionSaving
                    ? sendNewUserInvitation ? t('Sending invitation...') : t('Creating account...')
                    : pendingNewMember.current ? t('Retry save') : t('Create member')}
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
          panelClassName="max-w-sm "
        >
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h2 id={deleteMemberTitleId} className="mb-2 text-lg font-semibold text-slate-950">{t('Delete user account')}</h2>
              <p className="text-sm text-slate-500">
                {t('Are you sure you want to permanently delete this user? They will immediately lose access to the system, and their assigned tasks will become unassigned. This action cannot be undone.')}
              </p>
              {deleteUserError && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                  <SystemMessage message={deleteUserError} />
                </div>
              )}
            </div>
            <div className="px-6 py-4 bg-slate-50 flex gap-3 justify-center">
              <button 
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
              >
                {t('Cancel')}
              </button>
              <button 
                onClick={() => void handleDeleteUser()}
                disabled={isActionSaving}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                {t('Delete user')}
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
