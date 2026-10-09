import { createHash } from 'node:crypto';

export const RECOVERY_COMMAND_ID = '00000000-0000-4000-8000-000000007901';
export const RECOVERY_FILE_PATH = 'aitask-main/CL-release-qa/SC-release-qa/account-recovery.pdf';
export const recoveryFixture = superAdminEmail => {
  const suffix = createHash('sha256').update(superAdminEmail.trim().toLowerCase()).digest('hex').slice(0,16);
  const email = `aitask-qa-recovery-${suffix}@example.test`;
  return {
    email, changedEmail: `aitask-qa-recovered-${suffix}@example.test`,
    payload: { name: 'Release QA recoverable invitation', email, role: 'Staff', departments: ['Designer'],
      companyName: null, customRoleId: null, customRoleName: null, memberId: null, registrationId: null,
      workerType: 'freelancer', sendInvitation: false },
  };
};
