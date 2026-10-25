import { History, ShieldCheck, UserCheck, Users } from 'lucide-react';
import '../../../shared/i18n/actionFeedbackCopy';
import { type Role, type RolePermissions } from '../../../shared/types/index';
export const ROLES: Role[] = ['Project Manager', 'HOD', 'Staff', 'Client'];

export const BUILTIN_ROLE_DESCRIPTIONS: Record<Role, string> = {
  'Project Manager': 'Portfolio-scoped operational access. Account and role administration stays with Boss Koo.',
  HOD: 'Editable department lead role. Sees and edits work in their own departments.',
  Staff: 'Standard employee access to assigned work.',
  Client: 'Reviews and approves their company work.',
};

export const APPROVAL_TABS = ['registrations', 'members', 'roles', 'history'] as const;

export type ApprovalTab = typeof APPROVAL_TABS[number];

export const approvalTabItems = [
  { id: 'registrations' as const, label: 'Registrations', compactLabel: 'Queue', icon: UserCheck },
  { id: 'members' as const, label: 'Members', compactLabel: 'Members', icon: Users },
  { id: 'roles' as const, label: 'Roles', compactLabel: 'Roles', icon: ShieldCheck },
  { id: 'history' as const, label: 'History', compactLabel: 'History', icon: History },
];

export const isApprovalTab = (value: string | null): value is ApprovalTab => Boolean(value && APPROVAL_TABS.includes(value as ApprovalTab));

export const clonePermissions = (permissions: RolePermissions): RolePermissions => ({ ...permissions });

export type ConfirmationState = {
  title: string;
  description: string;
  confirmLabel: string;
  action: () => void | Promise<void>;
  tone?: 'danger' | 'primary';
};
