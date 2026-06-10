export type Role = 'Admin' | 'Staff' | 'Client';
export type Department = 'Operation' | 'Management' | 'Videoshooting' | 'Ads Management' | 'Account & Finance' | 'Designer' | 'Editor' | 'Client';
export type ServiceType = 'Social Media' | 'Design' | 'Video' | 'Website' | 'SEO' | 'Ads' | 'Branding';
export type Priority = 'Low' | 'Medium' | 'High' | 'Urgent';
export type TaskStatus = string;
export type ClientApprovalStatus = 'Pending' | 'Approved' | 'Rejected';
export type RecurrenceFrequency = 'None' | 'Daily' | 'Weekly' | 'Monthly';
export type RolePermissionKey =
  | 'viewDashboard'
  | 'viewTasks'
  | 'viewCalendar'
  | 'viewProjects'
  | 'viewReports'
  | 'viewApprovals'
  | 'viewSettings'
  | 'createTasks'
  | 'editTasks'
  | 'createProjects'
  | 'manageUsers'
  | 'approveRegistrations'
  | 'deleteUsers'
  | 'clientReview';

export type RolePermissions = Record<RolePermissionKey, boolean>;

export interface CustomRole {
  id: string;
  name: string;
  description?: string;
  baseRole: Role;
  permissions: RolePermissions;
  isProtected?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  name: string;
  email?: string;
  password?: string; // Optional for backward compatibility; new users start with a default password
  role: Role;
  department: Department;
  avatar?: string;
  companyName?: string; // Used specifically for linking Clients to their projects
  isSuperAdmin?: boolean; // System-owner flag, currently reserved for Boss Koo
  mustResetPassword?: boolean;
  customRoleId?: string;
  customRoleName?: string;
  permissions?: RolePermissions;
}

export interface AppNotification {
  id: string;
  targetUserId?: string; // e.g., assignee
  targetRole?: Role;     // e.g., 'Admin'
  targetClient?: string; // e.g., 'TechNova'
  title: string;
  message: string;
  link: string;
  isRead: boolean;
  readByUserIds?: string[];
  createdAt: string;
  iconType: 'task' | 'status' | 'success' | 'alert';
}

export interface TaskComment {
  id: string;
  userId: string;
  text: string;
  createdAt: string;
}

export interface TaskApprovalEvent {
  id: string;
  userId: string;
  status: ClientApprovalStatus;
  note?: string;
  createdAt: string;
}

export interface Registration {
  id: string;
  name: string;
  email: string;
  phone: string;
  password?: string; // Backward compatibility only; approved users start with the default password
  jobPosition: string;
  requestedRole: Role; // What they want to apply for
  status: 'Pending' | 'Approved' | 'Rejected';
  createdAt: string;
}

export interface Project {
  id: string;
  clientName: string;
  projectName: string;
  services: ServiceType[];
  startDate: string; // New field for Finance to track
  deadline: string;
  totalTasks: number;
  completedTasks: number;
}

export interface Task {
  id: string;
  projectId?: string;
  clientName: string;
  customerDetails?: string;
  facebookPage?: string;
  website?: string;
  projectName?: string;
  serviceType: ServiceType;
  title: string;
  description: string;
  department: Department;
  assignedTo: string; // User ID
  createdBy: string; // User ID
  startDate: string; // ISO Date String
  dueDate: string; // ISO Date String
  priority: Priority;
  status: TaskStatus;
  completionPercentage: number;
  attachmentLink?: string;
  attachmentName?: string;
  notes?: string;
  isCompleted: boolean;
  revisionCount: number;
  clientApprovalStatus: ClientApprovalStatus;
  isRecurring: boolean;
  recurrenceFrequency?: RecurrenceFrequency;
  dueReminderSent?: boolean;
  comments?: TaskComment[];
  approvalHistory?: TaskApprovalEvent[];
}
