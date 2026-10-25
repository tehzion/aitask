import { ArrowLeft, CheckCircle2, X } from 'lucide-react';
import React from 'react';
import { getAssignableCustomRoles } from '../../../shared/authorization/access';
import { useI18n } from '../../../shared/components/I18nProvider';
import SystemMessage from '../../../shared/components/SystemMessage';
import { Badge, Button, IconButton } from '../../../shared/components/ui';
import { fieldLabel, inputBase } from '../../../shared/components/uiTokens';
import '../../../shared/i18n/actionFeedbackCopy';
import { formatLocalizedDate } from '../../../shared/i18n/i18n';
import { type CustomRole, type Department, type Registration, type Role } from '../../../shared/types/index';
import { cn } from '../../../shared/utils/utils';
import DepartmentMultiSelect from '../components/DepartmentMultiSelect';
import { ROLES } from '../hooks/userAdministrationOptions';
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

export const RegistrationReviewPanel: React.FC<RegistrationReviewPanelProps> = ({
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
  const { locale, t } = useI18n();
  const descriptionId = `approval-review-description-${registration.id}`;
  const errorId = `approval-review-error-${registration.id}`;
  const roleNeedsDepartments = role === 'Staff' || role === 'HOD';

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line/80 bg-inset/50 px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold tracking-wide text-ink">{t('Registration review')}</p>
            <Badge tone="amber">{t('Pending')}</Badge>
            {waitingDays >= 7 && <Badge tone="red">{waitingDays}d {t('waiting')}</Badge>}
          </div>
          <h2 id={`approval-review-title-${registration.id}`} className="mt-2 truncate text-xl font-semibold tracking-[-0.025em] text-ink sm:text-2xl">{registration.name}</h2>
          <p id={descriptionId} className="mt-1 text-sm leading-6 text-muted">{t('Review identity, requested access, and onboarding before approving this account.')}</p>
        </div>
        <IconButton label={t('approval.closeReview')} onClick={onClose} disabled={isSaving} className="shrink-0">
          <X className="h-5 w-5" aria-hidden="true" />
        </IconButton>
      </header>

      <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col" aria-describedby={descriptionId}>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {error && (
            <div id={errorId} className="mb-5 rounded-control border border-red-200 bg-red-50 px-3 py-3 text-sm leading-6 text-red-800" role="alert" aria-live="assertive">
              <SystemMessage message={error} />
            </div>
          )}

          <section aria-labelledby={`applicant-details-${registration.id}`} className="rounded-panel border border-line/80 bg-surface p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 id={`applicant-details-${registration.id}`} className="text-sm font-semibold text-ink">{t('approval.applicantDetails')}</h3>
              <span className="text-xs text-muted">{t({ id: 'approval.applied', values: { date: formatLocalizedDate(new Date(registration.createdAt), locale) } })}</span>
            </div>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="min-w-0"><dt className="text-xs font-medium text-muted">{t('Email')}</dt><dd data-i18n-skip className="mt-1 break-words text-sm font-medium text-ink">{registration.email || t('approval.noEmail')}</dd></div>
              <div className="min-w-0"><dt className="text-xs font-medium text-muted">{t('Phone')}</dt><dd data-i18n-skip className="mt-1 break-words text-sm font-medium text-ink">{registration.phone || t('approval.noPhone')}</dd></div>
              <div className="min-w-0"><dt className="text-xs font-medium text-muted">{t('Requested position')}</dt><dd data-i18n-skip className="mt-1 break-words text-sm font-medium text-ink">{registration.jobPosition || t('approval.notSpecified')}</dd></div>
              <div className="min-w-0"><dt className="text-xs font-medium text-muted">{t('Onboarding')}</dt><dd className="mt-1 text-sm font-medium text-ink">{registration.onboardingMode === 'legacy_invite' ? t('approval.invitation') : t('approval.selfSignup')}</dd></div>
            </dl>
          </section>

          <section aria-labelledby={`access-details-${registration.id}`} className="mt-4 rounded-panel border border-line/80 bg-surface p-4 sm:p-5">
            <div>
              <h3 id={`access-details-${registration.id}`} className="text-sm font-semibold text-ink">{t('approval.accessAssignment')}</h3>
              <p className="mt-1 text-sm leading-6 text-muted">{t('approval.assignSmallestAccess')}</p>
            </div>

            <div className="mt-5 space-y-5">
              <div>
                <label htmlFor={`approval-role-${registration.id}`} className={fieldLabel}>{t('System role')}</label>
                <select
                  id={`approval-role-${registration.id}`}
                  className={cn(inputBase, 'px-3 py-2.5')}
                  value={role}
                  onChange={event => onRoleChange(event.target.value as Role)}
                  disabled={isSaving}
                >
                  {ROLES.map(option => <option key={option} value={option}>{option}</option>)}
                </select>
                <p className="mt-1 text-xs leading-5 text-muted">{t('Requested role:')} <span data-i18n-skip className="font-medium text-ink">{registration.requestedRole}</span></p>
              </div>

              {role === 'Client' ? (
                <div>
                  <label htmlFor={`approval-company-${registration.id}`} className={fieldLabel}>{t('Client company')}</label>
                  <input
                    id={`approval-company-${registration.id}`}
                    className={cn(inputBase, 'px-3 py-2.5')}
                    value={companyName}
                    onChange={event => onCompanyNameChange(event.target.value)}
                    placeholder={t('Choose or enter a company')}
                    disabled={isSaving}
                    aria-required="true"
                  />
                  <p className="mt-1 text-xs leading-5 text-muted">{t('The client account will only see work linked to this company.')}</p>
                </div>
              ) : (
                <DepartmentMultiSelect
                  value={departments}
                  onChange={onDepartmentsChange}
                  disabled={isSaving}
                  label={t(roleNeedsDepartments ? 'Departments' : 'Departments (optional)')}
                  description={t(roleNeedsDepartments ? 'Select every department this member can receive assignments from.' : 'Add departments when this Project Manager needs a narrower portfolio scope.')}
                />
              )}

              <div>
                <label htmlFor={`approval-custom-role-${registration.id}`} className={fieldLabel}>{t('Custom role')}</label>
                <select
                  id={`approval-custom-role-${registration.id}`}
                  className={cn(inputBase, 'px-3 py-2.5')}
                  value={customRoleId}
                  onChange={event => onCustomRoleChange(event.target.value)}
                  disabled={isSaving}
                >
                  <option value="">{t('Base role only')}</option>
                  {getAssignableCustomRoles(role, rolePermissions).filter(customRole => !customRole.isBuiltin).map(customRole => <option key={customRole.id} value={customRole.id}>{customRole.name}</option>)}
                </select>
                <p className="mt-1 text-xs leading-5 text-muted">{t('Custom roles are limited to the selected system role.')}</p>
              </div>
            </div>
          </section>

          {secureAccounts && (
            <section aria-labelledby={`onboarding-details-${registration.id}`} className="mt-4 rounded-panel border border-line/80 bg-inset/60 p-4 sm:p-5">
              <h3 id={`onboarding-details-${registration.id}`} className="text-sm font-semibold text-ink">{t('Onboarding')}</h3>
              <label className="mt-3 flex min-h-11 items-start gap-3 text-sm text-ink">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-line text-accent focus:ring-accent/40"
                  checked={sendInvitation}
                  onChange={event => onInvitationChange(event.target.checked)}
                  disabled={isSaving}
                />
                <span>
                  <span className="block font-medium">{t(registration.onboardingMode === 'legacy_invite' ? 'Send email invitation' : 'Require verified email')}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted">{t(sendInvitation ? 'Approval waits for email delivery or verification.' : 'Approve without SMTP using the member\'s existing password.')}</span>
                </span>
              </label>

              {registration.onboardingMode === 'legacy_invite' && !sendInvitation && (
                <div className="mt-4">
                  <label htmlFor={`approval-password-${registration.id}`} className={fieldLabel}>{t('Temporary password')}</label>
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
                    <Button type="button" variant="secondary" className="shrink-0" onClick={onGeneratePassword} disabled={isSaving}>{t('Generate & copy')}</Button>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted">{t('Share it privately. AiTask does not store the password.')}</p>
                </div>
              )}

              {!sendInvitation && registration.onboardingMode !== 'legacy_invite' && (
                <div className="mt-4 rounded-control border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-900" role="note">
                  {t("Confirm the applicant's identity before approving. Without email verification, approval activates the password chosen during signup.")}
                </div>
              )}
            </section>
          )}
        </div>

        <footer className="modalFooter shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}><ArrowLeft className="h-4 w-4" aria-hidden="true" />{t('Back to queue')}</Button>
          <Button type="submit" disabled={isSaving}>{isSaving ? t('Saving…') : t('Confirm & approve')}<CheckCircle2 className="h-4 w-4" aria-hidden="true" /></Button>
        </footer>
      </form>
    </div>
  );
};
