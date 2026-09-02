import { createClient } from '@supabase/supabase-js';

const WORKSPACE_ID = 'aitask-main';
const WORKSPACE_NAME = 'Release QA';
const FIXTURE_PREFIX = 'release-qa-';
const NOW = '2026-09-02T00:00:00.000Z';
const TODAY = '2026-09-02';

const ids = Object.freeze({
  client: 'CL-release-qa',
  foreignClient: 'CL-release-qa-foreign',
  project: 'PRJ-release-qa',
  foreignProject: 'PRJ-release-qa-foreign',
  workflow: 'SWT-release-qa',
  package: 'PKG-release-qa',
  plan: 'PLN-release-qa',
  cycle: 'SC-release-qa',
  deliverable: 'DEL-release-qa',
  pricing: 'PRICE-release-qa',
  operationTask: 'TASK-release-qa-operation',
  productionTask: 'TASK-release-qa-client',
  approvalTask: 'TASK-release-qa-approval',
  accountTask: 'TASK-release-qa-account',
  foreignTask: 'TASK-release-qa-foreign',
  notification: 'NOT-release-qa-client',
});

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const mode = process.argv[2];
if (!['seed', 'cleanup'].includes(mode)) {
  throw new Error('Usage: node scripts/reset-staging-qa.mjs <seed|cleanup>');
}

const stagingUrl = required('STAGING_SUPABASE_URL').replace(/\/$/, '');
const serviceRoleKey = required('STAGING_SUPABASE_SERVICE_ROLE_KEY');
const expectedProjectRef = required('STAGING_SUPABASE_PROJECT_REF');
const productionUrl = required('PRODUCTION_SUPABASE_URL').replace(/\/$/, '');
const parsedStagingUrl = new URL(stagingUrl);

if (parsedStagingUrl.protocol !== 'https:' || parsedStagingUrl.hostname !== `${expectedProjectRef}.supabase.co`) {
  throw new Error('The staging Supabase URL does not match STAGING_SUPABASE_PROJECT_REF.');
}
if (stagingUrl === productionUrl) {
  throw new Error('Refusing to run the staging fixture against production Supabase.');
}

const roles = [
  { key: 'SUPER_ADMIN', id: `${FIXTURE_PREFIX}super-admin`, name: 'Release QA Super Admin', role: 'Admin', department: 'Management', departments: ['Management'], isSuperAdmin: true, clientName: null },
  { key: 'OPERATION', id: `${FIXTURE_PREFIX}operation`, name: 'Release QA Operation', role: 'Staff', department: 'Operation', departments: ['Operation'], isSuperAdmin: false, clientName: null },
  { key: 'PRODUCTION', id: `${FIXTURE_PREFIX}production`, name: 'Release QA Production', role: 'Staff', department: 'Video Editor', departments: ['Video Editor'], isSuperAdmin: false, clientName: null },
  { key: 'ACCOUNT', id: `${FIXTURE_PREFIX}account`, name: 'Release QA Account', role: 'Staff', department: 'Account & Finance', departments: ['Account & Finance'], isSuperAdmin: false, clientName: null },
  { key: 'CLIENT', id: `${FIXTURE_PREFIX}client`, name: 'Release QA Client User', role: 'Client', department: 'Client', departments: ['Client'], isSuperAdmin: false, clientName: 'Release QA Client' },
].map((role) => ({
  ...role,
  email: required(`STAGING_QA_${role.key}_EMAIL`).toLowerCase(),
  password: required(`STAGING_QA_${role.key}_PASSWORD`),
}));

if (new Set(roles.map((role) => role.email)).size !== roles.length) {
  throw new Error('Staging QA account emails must be unique.');
}
if (roles.some((role) => role.password.length < 12)) {
  throw new Error('Every staging QA password must contain at least 12 characters.');
}

const supabase = createClient(stagingUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const assertOk = (error, action) => {
  if (error) throw new Error(`${action}: ${error.message}`);
};

const listAuthUsers = async () => {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    assertOk(error, 'Unable to list staging Auth users');
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
};

const deleteNamedQaUsers = async () => {
  const qaEmails = new Set(roles.map((role) => role.email));
  const users = await listAuthUsers();
  for (const user of users.filter((candidate) => candidate.email && qaEmails.has(candidate.email.toLowerCase()))) {
    const { error } = await supabase.auth.admin.deleteUser(user.id, true);
    assertOk(error, `Unable to delete staging QA Auth user ${user.id}`);
  }
};

const resetWorkspace = async () => {
  const { data: workspace, error: readError } = await supabase
    .from('aitask_workspaces')
    .select('id,name')
    .eq('id', WORKSPACE_ID)
    .maybeSingle();
  assertOk(readError, 'Unable to inspect the staging QA workspace');
  if (workspace && !['AiTask', WORKSPACE_NAME].includes(workspace.name)) {
    throw new Error(`Refusing to delete unexpected workspace name: ${workspace.name}`);
  }
  if (workspace) {
    const { error } = await supabase.from('aitask_workspaces').delete().eq('id', WORKSPACE_ID);
    assertOk(error, 'Unable to reset the staging QA workspace');
  }
};

await deleteNamedQaUsers();
await resetWorkspace();

if (mode === 'cleanup') {
  console.log('[staging-qa] Named QA users and Release QA workspace removed.');
  process.exit(0);
}

const { error: workspaceError } = await supabase.from('aitask_workspaces').insert({
  id: WORKSPACE_ID,
  name: WORKSPACE_NAME,
  version: 1,
  sync_protocol_version: 1,
});
assertOk(workspaceError, 'Unable to create the Release QA workspace');

const members = [];
for (const role of roles) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: role.email,
    password: role.password,
    email_confirm: true,
    app_metadata: { aitask_fixture: WORKSPACE_NAME },
  });
  assertOk(error, `Unable to create ${role.key} staging Auth user`);
  members.push({
    id: role.id,
    workspace_id: WORKSPACE_ID,
    auth_user_id: data.user.id,
    name: role.name,
    email: role.email,
    role: role.role,
    department: role.department,
    departments: role.departments,
    client_name: role.clientName,
    is_super_admin: role.isSuperAdmin,
    must_reset_password: false,
    permissions: {},
    version: 1,
    updated_at: NOW,
  });
}

const { error: memberError } = await supabase.from('aitask_members').insert(members);
assertOk(memberError, 'Unable to create staging QA members');

const memberId = Object.fromEntries(roles.map((role) => [role.key, role.id]));
const clientName = 'Release QA Client';
const foreignClientName = 'Release QA Foreign Company';
const serviceItem = {
  id: 'SI-release-qa',
  name: 'Release QA Social Content',
  platforms: ['Instagram'],
  unit: 'item',
  quantity: 1,
  unitPriceMinor: 0,
  workflow: {
    templateId: ids.workflow,
    templateRevision: 1,
    templateName: 'Release QA Delivery Workflow',
    name: 'Release QA Delivery Workflow',
    steps: [
      { id: 'STEP-release-qa-operation', order: 1, title: 'Prepare content', department: 'Operation', dueOffsetDays: 1, kind: 'work', clientVisible: false, required: true },
      { id: 'STEP-release-qa-production', order: 2, title: 'Client review', department: 'Video Editor', dueOffsetDays: 2, kind: 'client_approval', clientVisible: true, required: true },
      { id: 'STEP-release-qa-account', order: 3, title: 'Account follow-up', department: 'Account & Finance', dueOffsetDays: 3, kind: 'work', clientVisible: false, required: true },
    ],
  },
};
const row = (entityType, entityId, data, columns = {}) => ({
  workspace_id: WORKSPACE_ID,
  entity_type: entityType,
  entity_id: entityId,
  data,
  version: 1,
  created_at: NOW,
  updated_at: NOW,
  ...columns,
});

const baseTask = {
  clientId: ids.client,
  projectId: ids.project,
  serviceCycleId: ids.cycle,
  deliverableId: ids.deliverable,
  clientName,
  projectName: clientName,
  serviceType: 'Social Media',
  description: 'Deterministic staging release verification task.',
  startDate: TODAY,
  dueDate: '2026-09-05',
  priority: 'High',
  status: 'Pending',
  completionPercentage: 0,
  isCompleted: false,
  revisionCount: 0,
  clientApprovalStatus: 'Pending',
  isRecurring: false,
  recurrenceFrequency: 'None',
  generatedFromDeliverable: true,
  workflowTemplateId: ids.workflow,
  workflowTemplateRevision: 1,
  updatedAt: NOW,
};

const entities = [
  row('client', ids.client, { id: ids.client, clientName, contactPerson: 'Release QA Contact', email: roles.find((role) => role.key === 'CLIENT').email, createdAt: NOW, updatedAt: NOW }, { client_key: clientName.toLowerCase(), client_id: ids.client }),
  row('client', ids.foreignClient, { id: ids.foreignClient, clientName: foreignClientName, createdAt: NOW, updatedAt: NOW }, { client_key: foreignClientName.toLowerCase(), client_id: ids.foreignClient }),
  row('project', ids.project, { id: ids.project, clientId: ids.client, createdBy: memberId.SUPER_ADMIN, clientName, projectName: clientName, services: ['Social Media'], startDate: TODAY, deadline: '', totalTasks: 4, completedTasks: 1, updatedAt: NOW }, { parent_id: ids.client, client_key: clientName.toLowerCase(), client_id: ids.client, created_by: memberId.SUPER_ADMIN }),
  row('project', ids.foreignProject, { id: ids.foreignProject, clientId: ids.foreignClient, createdBy: memberId.SUPER_ADMIN, clientName: foreignClientName, projectName: foreignClientName, services: ['Social Media'], startDate: TODAY, deadline: '', totalTasks: 1, completedTasks: 0, updatedAt: NOW }, { parent_id: ids.foreignClient, client_key: foreignClientName.toLowerCase(), client_id: ids.foreignClient, created_by: memberId.SUPER_ADMIN }),
  row('service_workflow_template', ids.workflow, { id: ids.workflow, name: 'Release QA Delivery Workflow', description: 'Deterministic release workflow.', serviceTypes: ['Social Media'], revision: 1, isActive: true, steps: serviceItem.workflow.steps, createdAt: NOW, updatedAt: NOW }),
  row('service_package', ids.package, { id: ids.package, name: 'Release QA Package', description: 'Deterministic release package.', revision: 1, currency: 'MYR', serviceItems: [{ ...serviceItem, unitPriceMinor: 80000 }], discountType: 'none', discountValue: 0, taxRateBps: 0, isActive: true, createdAt: NOW, updatedAt: NOW }),
  row('client_plan', ids.plan, { id: ids.plan, clientId: ids.client, clientName, name: 'Release QA Active Plan', origin: 'standard', sourcePackageId: ids.package, sourcePackageRevision: 1, revision: 1, status: 'Active', currency: 'MYR', serviceItems: [serviceItem], discountType: 'none', discountValue: 0, taxRateBps: 0, startDate: TODAY, billingDay: 2, nextCycleStart: '2026-10-02', createdBy: memberId.SUPER_ADMIN, createdAt: NOW, updatedAt: NOW }, { parent_id: ids.client, client_key: clientName.toLowerCase(), client_id: ids.client, plan_id: ids.plan, created_by: memberId.SUPER_ADMIN }),
  row('service_pricing_snapshot', ids.pricing, { id: ids.pricing, clientId: ids.client, parentType: 'client_plan', parentId: ids.plan, currency: 'MYR', itemPrices: [{ serviceItemId: serviceItem.id, unitPriceMinor: 80000 }], discountType: 'none', discountValue: 0, taxRateBps: 0, subtotalMinor: 80000, discountMinor: 0, taxMinor: 0, totalMinor: 80000, createdAt: NOW, updatedAt: NOW }, { parent_id: ids.plan, client_key: clientName.toLowerCase(), client_id: ids.client, plan_id: ids.plan }),
  row('service_cycle', ids.cycle, { id: ids.cycle, clientId: ids.client, clientName, planId: ids.plan, planRevision: 1, periodStart: TODAY, periodEnd: '2026-10-01', status: 'Published', currency: 'MYR', serviceItems: [serviceItem], addonSnapshots: [], discountType: 'none', discountValue: 0, taxRateBps: 0, publishedAt: NOW, createdAt: NOW, updatedAt: NOW }, { parent_id: ids.plan, client_key: clientName.toLowerCase(), client_id: ids.client, plan_id: ids.plan, cycle_id: ids.cycle, period_start: TODAY }),
  row('deliverable', ids.deliverable, { id: ids.deliverable, clientId: ids.client, clientName, planId: ids.plan, cycleId: ids.cycle, serviceItemId: serviceItem.id, sequence: 1, title: 'Release QA Social Content 1', status: 'Ready', taskIds: [ids.operationTask, ids.productionTask, ids.approvalTask, ids.accountTask], attachments: [], workflowGeneratedAt: NOW, workflowGenerationId: 'release-qa-generation', primaryTaskId: ids.productionTask, createdAt: NOW, updatedAt: NOW }, { parent_id: ids.cycle, client_key: clientName.toLowerCase(), client_id: ids.client, plan_id: ids.plan, cycle_id: ids.cycle }),
  row('task', ids.operationTask, { ...baseTask, id: ids.operationTask, visibility: 'internal', workflowStepId: 'STEP-release-qa-operation', workflowStepOrder: 1, workflowStepRequired: true, predecessorTaskIds: [], title: 'Release QA prepare content', department: 'Operation', assignedTo: memberId.OPERATION, createdBy: memberId.SUPER_ADMIN, status: 'Completed', completionPercentage: 100, isCompleted: true, completedAt: NOW }, { parent_id: ids.project, client_key: clientName.toLowerCase(), client_id: ids.client, plan_id: ids.plan, cycle_id: ids.cycle, assigned_to: memberId.OPERATION, created_by: memberId.SUPER_ADMIN }),
  row('task', ids.productionTask, { ...baseTask, id: ids.productionTask, visibility: 'client-visible', workflowStepId: 'STEP-release-qa-production', workflowStepOrder: 2, workflowStepRequired: true, predecessorTaskIds: [ids.operationTask], title: 'Release QA delivery ready', department: 'Video Editor', assignedTo: memberId.PRODUCTION, createdBy: memberId.SUPER_ADMIN, status: 'Waiting Approval', completionPercentage: 100 }, { parent_id: ids.project, client_key: clientName.toLowerCase(), client_id: ids.client, plan_id: ids.plan, cycle_id: ids.cycle, assigned_to: memberId.PRODUCTION, created_by: memberId.SUPER_ADMIN }),
  row('task', ids.approvalTask, { ...baseTask, id: ids.approvalTask, visibility: 'client-visible', workflowStepId: 'STEP-release-qa-approval', workflowStepOrder: 2, workflowStepRequired: true, predecessorTaskIds: [ids.operationTask], title: 'Release QA approval sample', department: 'Video Editor', assignedTo: memberId.PRODUCTION, createdBy: memberId.SUPER_ADMIN, status: 'Waiting Approval', completionPercentage: 100 }, { parent_id: ids.project, client_key: clientName.toLowerCase(), client_id: ids.client, plan_id: ids.plan, cycle_id: ids.cycle, assigned_to: memberId.PRODUCTION, created_by: memberId.SUPER_ADMIN }),
  row('task', ids.accountTask, { ...baseTask, id: ids.accountTask, visibility: 'internal', workflowStepId: 'STEP-release-qa-account', workflowStepOrder: 3, predecessorTaskIds: [ids.productionTask], title: 'Release QA account follow-up', department: 'Account & Finance', assignedTo: memberId.ACCOUNT, createdBy: memberId.SUPER_ADMIN }, { parent_id: ids.project, client_key: clientName.toLowerCase(), client_id: ids.client, plan_id: ids.plan, cycle_id: ids.cycle, assigned_to: memberId.ACCOUNT, created_by: memberId.SUPER_ADMIN }),
  row('task', ids.foreignTask, { ...baseTask, id: ids.foreignTask, clientId: ids.foreignClient, projectId: ids.foreignProject, serviceCycleId: undefined, deliverableId: undefined, visibility: 'client-visible', clientName: foreignClientName, projectName: foreignClientName, title: 'Foreign company delivery', department: 'Video Editor', assignedTo: memberId.PRODUCTION, createdBy: memberId.SUPER_ADMIN }, { parent_id: ids.foreignProject, client_key: foreignClientName.toLowerCase(), client_id: ids.foreignClient, assigned_to: memberId.PRODUCTION, created_by: memberId.SUPER_ADMIN }),
  row('notification', ids.notification, { id: ids.notification, targetUserId: memberId.CLIENT, targetClient: clientName, title: 'Release QA delivery ready', message: 'A delivery is ready for review.', route: { page: 'tasks', entityId: ids.productionTask }, isRead: false, readByUserIds: [], unreadByUserIds: [], createdAt: NOW, updatedAt: NOW, iconType: 'task', category: 'review', importance: 'action' }, { target_user_id: memberId.CLIENT, target_client_key: clientName.toLowerCase(), client_key: clientName.toLowerCase(), client_id: ids.client }),
];

const { error: entityError } = await supabase.from('aitask_entities').insert(entities);
assertOk(entityError, 'Unable to create staging QA entities');

console.log(JSON.stringify({
  workspaceId: WORKSPACE_ID,
  workspaceName: WORKSPACE_NAME,
  clientId: ids.client,
  clientName,
  clientTaskId: ids.productionTask,
  foreignTaskId: ids.foreignTask,
}));
