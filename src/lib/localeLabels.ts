import { translateUiText, type AppLocale } from './i18n';

// These sets are deliberately closed. Values outside them are user-authored
// content (custom roles, departments, services, and device names) and must be
// rendered exactly as entered.
const statuses = new Set(['Pending', 'In Progress', 'Waiting Approval', 'Completed', 'Cancelled', 'Planned', 'Ready', 'Delivered', 'Draft', 'Published', 'Active', 'Paused', 'Ended']);
const roles = new Set(['Boss Koo', 'Super Admin', 'Project Manager', 'HOD', 'Staff', 'Client', 'Operation', 'Account', 'Finance', 'Designer', 'Video Shooting', 'Video Editor']);
const departments = new Set(['Operation', 'Management', 'Designer', 'Video Shooting', 'Video Editor', 'Account', 'Finance', 'Client']);
const priorities = new Set(['Urgent', 'High', 'Medium', 'Low']);
const deliveryStages = new Set(['Needs your review', 'In delivery', 'Scheduled', 'Timing changed', 'Delivered', 'Cancelled']);
const workflowKinds = new Set(['Task', 'Approval', 'Review', 'Delivery', 'Revision']);
const devices = new Set(['Desktop', 'Mobile', 'Tablet', 'iOS', 'Android', 'Windows', 'macOS']);

const localizeBuiltIn = (value: string, locale: AppLocale, allowed: Set<string>) => (
  allowed.has(value) ? translateUiText(value, locale) : value
);

export const getLocalizedStatus = (value: string, locale: AppLocale) => localizeBuiltIn(value, locale, statuses);
export const getLocalizedRole = (value: string, locale: AppLocale) => localizeBuiltIn(value, locale, roles);
export const getLocalizedDepartment = (value: string, locale: AppLocale) => localizeBuiltIn(value, locale, departments);
export const getLocalizedPriority = (value: string, locale: AppLocale) => localizeBuiltIn(value, locale, priorities);
export const getLocalizedDeliveryStage = (value: string, locale: AppLocale) => localizeBuiltIn(value, locale, deliveryStages);
export const getLocalizedWorkflowKind = (value: string, locale: AppLocale) => localizeBuiltIn(value, locale, workflowKinds);
export const getLocalizedDevice = (value: string, locale: AppLocale) => localizeBuiltIn(value, locale, devices);
