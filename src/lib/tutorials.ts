import type { AppLocale } from './i18n';
import type { OnboardingPersona } from './onboarding';

export type TutorialCategoryId =
  | 'getting-started'
  | 'company-client'
  | 'project-management'
  | 'task-management'
  | 'department-management'
  | 'client-review'
  | 'service-delivery'
  | 'reports-monitoring';

export type LocalizedCopy = { en: string; zh: string };

export interface TutorialGuideStep {
  id: string;
  target: string;
  path?: string;
  title: LocalizedCopy;
  body: LocalizedCopy;
}

export interface Tutorial {
  id: string;
  category: TutorialCategoryId;
  roles: Array<OnboardingPersona | 'all'>;
  title: LocalizedCopy;
  summary: LocalizedCopy;
  outcome: LocalizedCopy;
  before: LocalizedCopy[];
  steps: LocalizedCopy[];
  rules: LocalizedCopy[];
  problems: LocalizedCopy[];
  related: string[];
  keywords: LocalizedCopy[];
  /** Common business language that may not appear in the visible title. */
  searchTerms?: LocalizedCopy[];
  /** Catalogue metadata for content review without requiring an editor UI. */
  updatedAt?: string;
  guide?: TutorialGuideStep[];
}

export const TUTORIAL_GUIDE_START_EVENT = 'aitask-start-tutorial-guide';

export const tutorialCategories: Array<{ id: TutorialCategoryId; label: LocalizedCopy; description: LocalizedCopy }> = [
  { id: 'getting-started', label: { en: 'Getting Started', zh: '入门' }, description: { en: 'Find your way around AiTask and understand the signals you see every day.', zh: '熟悉 AiTask，了解日常工作中看到的状态和提示。' } },
  { id: 'company-client', label: { en: 'Company & Client Management', zh: '公司与客户管理' }, description: { en: 'Keep company records, contacts, and access relationships clear.', zh: '清晰管理公司记录、联系人和访问关系。' } },
  { id: 'project-management', label: { en: 'Project Management', zh: '项目管理' }, description: { en: 'Set up a delivery scope with an owner, services, and dates.', zh: '设置负责人、服务和日期明确的交付范围。' } },
  { id: 'task-management', label: { en: 'Task Management', zh: '任务管理' }, description: { en: 'Create, assign, update, submit, review, and revise work.', zh: '创建、分配、更新、提交、审核和修订工作。' } },
  { id: 'department-management', label: { en: 'Department Management', zh: '部门管理' }, description: { en: 'Turn a handoff into reviewable department work.', zh: '将交接内容转化为可审核的部门工作。' } },
  { id: 'client-review', label: { en: 'Client Review & Approval', zh: '客户审核与批准' }, description: { en: 'Review published work and give feedback without exposing internal operations.', zh: '查看已发布工作并反馈，不暴露内部运营信息。' } },
  { id: 'service-delivery', label: { en: 'Service Plans & Deliveries', zh: '服务方案与交付' }, description: { en: 'Understand plans, cycles, deliverables, and delivery review.', zh: '了解服务方案、周期、交付成果和交付审核。' } },
  { id: 'reports-monitoring', label: { en: 'Reports & Monitoring', zh: '报表与监控' }, description: { en: 'Spot deadlines, delivery risk, and progress patterns.', zh: '发现截止日期、交付风险和进度趋势。' } },
];

const l = (en: string, zh: string): LocalizedCopy => ({ en, zh });
const guideStep = (id: string, target: string, path: string | undefined, enTitle: string, zhTitle: string, enBody: string, zhBody: string): TutorialGuideStep => ({
  id,
  target,
  ...(path ? { path } : {}),
  title: l(enTitle, zhTitle),
  body: l(enBody, zhBody),
});

const makeTutorial = (input: Tutorial): Tutorial => ({ updatedAt: '2026-10-18', ...input });

export const learningTracks: Record<OnboardingPersona, string[]> = {
  admin: ['understand-dashboard', 'create-company', 'create-project', 'create-task', 'review-completed-work', 'view-reports'],
  projectManager: ['understand-dashboard', 'create-company', 'create-project', 'create-task', 'review-completed-work', 'view-reports'],
  hod: ['understand-dashboard', 'receive-assigned-tasks', 'delegate-task-to-staff', 'monitor-staff-progress', 'review-submitted-work', 'request-revisions', 'approve-work'],
  staff: ['understand-dashboard', 'view-assigned-tasks', 'accept-task', 'update-task-progress', 'upload-deliverables', 'submit-work-for-approval', 'respond-to-revision-requests'],
  client: ['access-client-workspace', 'review-client-deliverables', 'leave-feedback', 'request-changes', 'approve-deliverables'],
};

export const getLearningTrack = (persona: OnboardingPersona) => learningTracks[persona];

export const tutorials: Tutorial[] = [
  makeTutorial({
    id: 'understand-dashboard', category: 'getting-started', roles: ['all'],
    title: l('How to read your dashboard', '如何阅读仪表板'),
    summary: l('Use the dashboard to decide what needs attention first.', '使用仪表板判断下一步最需要关注的工作。'),
    outcome: l('You will know where to find your queue, deadlines, review work, and role-specific signals without opening every task.', '您将了解在哪里查看任务队列、截止日期、审核工作和角色相关提示，而不必逐一打开任务。'),
    before: [l('You must be signed in to an active AiTask workspace.', '您必须登录有效的 AiTask 工作区。')],
    steps: [l('Open Dashboard from the main navigation.', '从主导航打开“仪表板”。'), l('Read the top summary cards for open work, overdue work, reviews, or delivery signals available to your role.', '查看顶部摘要卡片中的开放工作、逾期工作、审核或交付提示，这些内容取决于您的角色。'), l('Select a linked count or work item to open the relevant filtered page.', '选择可点击的数量或工作项，打开对应的筛选页面。'), l('Return to the dashboard after each handoff to check what changed.', '每次交接后回到仪表板，查看工作状态的变化。')],
    rules: [l('The dashboard is permission-aware. It does not imply access to records outside your scope.', '仪表板受权限控制，不代表您可以访问范围外的记录。')],
    problems: [l('If a card is missing, your role or current portfolio may not include that work. Open Help or ask the workspace administrator to confirm access.', '如果缺少某张卡片，您的角色或当前项目组合可能不包含该工作。打开帮助中心，或请工作区管理员确认访问权限。')],
    related: ['understand-task-statuses', 'read-notifications', 'monitor-task-progress'], keywords: [l('dashboard overview work queue', '仪表板 工作队列')],
    guide: [guideStep('dashboard', 'dashboard-overview', '/', 'Start at Dashboard', '从仪表板开始', 'This is the role-aware starting point for your work. Look for the signal that matches your next responsibility.', '这里是根据角色显示工作的起点。先查看与您下一步职责相关的提示。'), guideStep('follow-up', 'tasks', '/tasks', 'Open the work queue', '打开工作队列', 'Use Tasks when you need the full list, filters, and task details.', '需要完整列表、筛选和任务详情时，打开“任务”。')],
  }),
  makeTutorial({
    id: 'navigate-aitask', category: 'getting-started', roles: ['all'],
    title: l('How to navigate AiTask', '如何在 AiTask 中导航'),
    summary: l('Know which workspace to use for companies, tasks, deliveries, reports, and settings.', '了解应在哪个工作区查看公司、任务、交付、报表和设置。'),
    outcome: l('You will move between work areas without losing the context of the current job.', '您将能够在工作区之间切换，同时保持对当前工作的了解。'),
    before: [l('Sign in and make sure the main navigation is visible.', '登录并确认主导航可见。')],
    steps: [l('Use My work or Dashboard for the role-specific starting queue.', '使用“我的工作”或“仪表板”查看角色相关的起始队列。'), l('Use Tasks for assignments, statuses, comments, files, and review actions.', '使用“任务”处理分配、状态、评论、文件和审核操作。'), l('Use Companies for company records, projects, client relationships, and service plan entry points.', '使用“公司”查看公司记录、项目、客户关系和服务方案入口。'), l('Use Delivery tracker, Reports, Inbox, and Settings for monitoring, signals, account information, and preferences.', '使用“交付跟踪”“报表”“收件箱”和“设置”进行监控、查看提示、管理账户信息和偏好。'), l('Open Help & tutorials whenever you need a guide; it does not change business data.', '需要指导时打开“帮助与教程”；帮助中心不会修改业务数据。')],
    rules: [l('The navigation changes with your role and permissions. Some destinations are intentionally not shown.', '导航会根据您的角色和权限变化。某些页面不会显示是有意的。')],
    problems: [l('If you land on Access denied, return to Help and follow a guide available for your role.', '如果看到“拒绝访问”，请返回帮助中心，选择您角色可用的教程。')],
    related: ['understand-roles', 'manage-account-settings'], keywords: [l('navigation menu workspace pages', '导航 菜单 工作区 页面')],
    guide: [guideStep('help', 'help-overview', '/help', 'Use Help as your reference point', '将帮助中心作为参考入口', 'Search by an action such as “Assign task”, then open the guide that matches your role.', '按“任务分配”等操作搜索，然后打开与您角色匹配的教程。')],
  }),
  makeTutorial({
    id: 'understand-roles', category: 'getting-started', roles: ['all'],
    title: l('How roles and access work', '角色和访问权限如何工作'),
    summary: l('Understand why two people may see different pages or actions.', '了解为什么不同用户会看到不同页面或操作。'),
    outcome: l('You will be able to tell whether an unavailable action is a role boundary, a record scope issue, or a workflow rule.', '您将能够判断不可用操作是角色边界、记录范围还是工作流程规则造成的。'),
    before: [l('Know your assigned role and department, if applicable.', '了解您分配的角色和部门（如适用）。')],
    steps: [l('Use the role badge in Help to see the guide matched to your access.', '查看帮助中心中的角色标签，确认系统为您匹配的指南。'), l('Remember that Project Managers work within their portfolio, HODs work within department scope, and Staff work within assigned work.', '请记住：项目经理在项目组合范围内工作，部门主管在部门范围内工作，员工在分配给自己的工作范围内工作。'), l('Clients see client-visible projects, tasks, deliveries, and feedback surfaces only.', '客户只能看到客户可见的项目、任务、交付和反馈界面。'), l('Ask the administrator to review permissions when access does not match your responsibility.', '如果访问范围与职责不符，请管理员检查权限。')],
    rules: [l('A tutorial never grants permission. The same button may remain disabled after you read a guide.', '教程不会授予权限。阅读教程后，同一个按钮仍可能保持禁用。')],
    problems: [l('Do not work around a restricted page by using a direct URL. Ask for the correct role or owner handoff.', '不要通过直接输入网址绕过受限页面。请申请正确角色，或让负责人完成交接。')],
    related: ['understand-task-statuses', 'delegate-task-to-staff'], keywords: [l('role permissions access restricted', '角色 权限 访问 受限')],
  }),
  makeTutorial({
    id: 'understand-task-statuses', category: 'getting-started', roles: ['all'],
    title: l('How to understand task statuses', '如何理解任务状态'),
    summary: l('Use the current status to understand which handoff is allowed next.', '根据当前状态了解下一步允许的交接。'),
    outcome: l('You will know when assignment, review, completion, and revision actions are expected or locked.', '您将了解何时可以分配、审核、完成或请求修订，以及何时这些操作会被锁定。'),
    before: [l('Open a task you are allowed to view.', '打开您有权查看的任务。')],
    steps: [l('Check the status shown in the task header or task row.', '查看任务标题或任务行中显示的状态。'), l('Pending, In Progress, and Revision are assignable work states.', '“待处理”“进行中”和“修订”是可以分配的工作状态。'), l('Waiting Approval, Approved, Completed, and Cancelled lock reassignment by default.', '“等待审批”“已批准”“已完成”和“已取消”默认会锁定重新分配。'), l('Read the available action and its disabled explanation before asking for a change.', '在请求更改前，阅读当前可用操作及其禁用原因。'), l('Use Request Revision only when your role and the workflow permit it; never assume every locked state can be reopened.', '只有角色和工作流程允许时，才使用“请求修订”；不要认为所有锁定状态都可以重新打开。')],
    rules: [l('Status transitions are checked by the application and again at the save boundary.', '应用界面和保存边界都会检查状态转换。'), l('A status label does not override review permissions or required evidence.', '状态标签不会覆盖审核权限或必要的交付证据。')],
    problems: [l('If an action is unavailable, read the reason in the task panel. It may require an HOD reviewer, completed evidence, or a responsible Project Manager.', '如果操作不可用，请阅读任务面板中的原因。可能需要部门主管审核人、完成证据或负责的项目经理。')],
    related: ['request-task-revision', 'approve-work', 'submit-work-for-approval'], keywords: [l('status pending progress revision approval completed cancelled', '状态 待处理 进行中 修订 审批 已完成 已取消')],
    guide: [guideStep('tasks', 'tasks-overview', '/tasks', 'Open Tasks to inspect status', '打开“任务”查看状态', 'Choose a task yourself and read the status control. This guide never changes it for you.', '自行选择任务并阅读状态控件。本教程不会替您修改状态。'), guideStep('help', 'help-overview', '/help', 'Return to status rules', '返回状态规则', 'Use the Help Centre when you need the assignment matrix again.', '需要再次查看分配规则时，返回帮助中心。')],
  }),
  makeTutorial({
    id: 'use-search-filters', category: 'getting-started', roles: ['all'],
    title: l('How to search and filter work', '如何搜索和筛选工作'),
    summary: l('Find a company, task, delivery, or notification without scanning every row.', '无需逐行查看，即可找到公司、任务、交付或通知。'),
    outcome: l('You will narrow a list by text, status, period, client, assignee, or open-work focus where the page supports it.', '您将能够在支持的页面按文字、状态、周期、客户、负责人或开放工作进行筛选。'),
    before: [l('Open the page that owns the record you are looking for.', '打开包含目标记录的页面。')],
    steps: [l('Use the page search field and type a distinctive company, task, service, or deliverable name.', '使用页面搜索框，输入独特的公司、任务、服务或交付成果名称。'), l('On Tasks, combine search with status, priority, department, client, assignee, or period filters when available.', '在“任务”页面，可结合状态、优先级、部门、客户、负责人或周期筛选（如页面提供）。'), l('On Delivery tracker, use the period tabs and status filters to focus on open, overdue, or completed work.', '在“交付跟踪”中，使用周期标签和状态筛选，聚焦开放、逾期或已完成工作。'), l('Clear the query or filter when the expected record is missing.', '找不到预期记录时，清除搜索词或筛选条件。')],
    rules: [l('Search results are limited to records you can already access.', '搜索结果只包含您原本有权访问的记录。')],
    problems: [l('A missing record may be outside your portfolio, department, or client-visible scope. Clearing the filter cannot expand permission.', '记录可能不在您的项目组合、部门或客户可见范围内。清除筛选不会扩大权限。')],
    related: ['navigate-aitask', 'identify-overdue-tasks'], keywords: [l('search filter find task company client', '搜索 筛选 查找 任务 公司 客户')],
    guide: [guideStep('tasks-search', 'task-search', '/tasks', 'Start with the Tasks search', '从任务搜索开始', 'Type a task or company name. You can clear it without changing any record.', '输入任务或公司名称。清除搜索不会修改任何记录。')],
  }),
  makeTutorial({
    id: 'read-notifications', category: 'getting-started', roles: ['all'],
    title: l('How to use notifications and Inbox', '如何使用通知和收件箱'),
    summary: l('Turn assignment, deadline, review, feedback, and account signals into your next action.', '将分配、截止日期、审核、反馈和账户提示转化为下一步行动。'),
    outcome: l('You will know how to open a linked record, separate unread work, and mark notifications read.', '您将了解如何打开关联记录、区分未读工作并将通知标记为已读。'),
    before: [l('Have notifications available for your account or role.', '您的账户或角色需要有可用通知。')],
    steps: [l('Open Inbox from the navigation.', '从导航打开“收件箱”。'), l('Switch between All and Unread to find work that still needs attention.', '在“全部”和“未读”之间切换，查找仍需处理的工作。'), l('Select a notification to open its linked task, client, or workspace when a route is provided.', '选择通知，在有链接时打开关联任务、客户或工作区。'), l('Mark an item or the whole list as read only after you have understood the signal.', '理解提示后，再将单项或整个列表标记为已读。')],
    rules: [l('Marking a notification read does not approve, assign, or update the linked record.', '标记通知为已读不会批准、分配或更新关联记录。')],
    problems: [l('If a notification opens an unavailable record, the record may have moved outside your access scope. Ask the sender or owner for context.', '如果通知打开的记录不可用，记录可能已移出您的访问范围。请向发送人或负责人了解情况。')],
    related: ['understand-task-statuses', 'manage-account-settings'], keywords: [l('notifications inbox unread deadline assignment review', '通知 收件箱 未读 截止日期 分配 审核')],
    guide: [guideStep('notifications', 'notifications-overview', '/notifications', 'Open Inbox', '打开收件箱', 'Use Inbox to see the signals generated by work you can access.', '使用收件箱查看您有权访问的工作提示。')],
  }),
  makeTutorial({
    id: 'manage-account-settings', category: 'getting-started', roles: ['all'],
    title: l('How to manage personal account settings', '如何管理个人账户设置'),
    summary: l('Update your own profile, password, theme, and language preferences safely.', '安全更新个人资料、密码、主题和语言偏好。'),
    outcome: l('You will know where to change personal settings without changing team permissions or business records.', '您将了解在哪里更改个人设置，而不会更改团队权限或业务记录。'),
    before: [l('You must be signed in.', '您必须登录。')],
    steps: [l('Open Settings from the navigation or account menu.', '从导航或账户菜单打开“设置”。'), l('Update profile fields only when they are yours and save the change.', '只更新属于您自己的个人资料字段，然后保存更改。'), l('Use the password section to choose a private password when the account requires setup or a change.', '账户要求设置或修改密码时，使用密码区域选择私人密码。'), l('Choose language and theme preferences where available, then reload or continue using the workspace.', '在可用的情况下选择语言和主题偏好，然后重新加载或继续使用工作区。')],
    rules: [l('Settings does not grant project, task, approval, or client access.', '设置不会授予项目、任务、审批或客户访问权限。')],
    problems: [l('If a field is disabled, it is controlled by the workspace or account lifecycle. Ask an administrator rather than editing another user’s record.', '如果字段被禁用，它由工作区或账户生命周期控制。请联系管理员，不要修改其他用户的记录。')],
    related: ['understand-roles', 'read-notifications'], keywords: [l('settings password language theme profile account', '设置 密码 语言 主题 资料 账户')],
    guide: [guideStep('settings', 'settings-overview', '/settings', 'Open Settings', '打开设置', 'Review your own profile and preferences here. Team permissions remain an administrator responsibility.', '在这里查看自己的资料和偏好。团队权限仍由管理员负责。')],
  }),

  makeTutorial({
    id: 'create-company', category: 'company-client', roles: ['admin', 'projectManager'],
    title: l('How to create a company', '如何创建公司'),
    summary: l('Create the company record that anchors client contacts, projects, tasks, and service work.', '创建连接客户联系人、项目、任务和服务工作的公司记录。'),
    outcome: l('You will have a saved company profile ready for a project or service plan.', '您将得到一个已保存的公司资料，可继续创建项目或服务方案。'),
    before: [l('You need permission to add client companies.', '您需要添加客户公司的权限。'), l('Prepare the legal or working company name and any contact details you want to keep.', '准备公司法定或工作名称，以及需要保存的联系人信息。')],
    steps: [l('Open Companies and choose New client.', '打开“公司”，选择“新建客户”。'), l('Enter Company name. Add Client since, Contact person, Email, Phone, Address, Website, Facebook page, or Notes when useful.', '填写“公司名称”。需要时补充“客户开始日期”“联系人”“邮箱”“电话”“地址”“网站”“Facebook 页面”或“备注”。'), l('Choose Save client. AiTask confirms the company before offering the next actions.', '选择“保存客户”。AiTask 会先确认公司已保存，再提供下一步操作。'), l('Choose Create project, Add service plan, or Done according to the next piece of work.', '根据下一步工作选择“创建项目”“添加服务方案”或“完成”。')],
    rules: [l('Saving a company does not automatically create a login account or service plan.', '保存公司不会自动创建登录账户或服务方案。'), l('A company must be visible in your allowed scope before it can be selected for a project.', '公司必须在您的允许范围内可见，才能在项目中选择。')],
    problems: [l('If New client is missing, ask an administrator to add the company or grant the correct client-management access.', '如果缺少“新建客户”，请管理员添加公司或授予正确的客户管理权限。')],
    related: ['edit-company-information', 'create-project', 'manage-service-plans'], keywords: [l('new client company contact profile', '新建客户 公司 联系人 资料')],
    guide: [guideStep('projects', 'projects-overview', '/projects', 'Open Companies', '打开公司', 'Use the Companies page to keep the client relationship and project entry points together.', '使用“公司”页面集中管理客户关系和项目入口。'), guideStep('create-company', 'create-company', undefined, 'Choose New client', '选择“新建客户”', 'The guide stops before the form. You enter and save the company details yourself.', '教程会在表单前停止。公司信息由您自行填写和保存。')],
  }),
  makeTutorial({
    id: 'edit-company-information', category: 'company-client', roles: ['admin', 'projectManager'],
    title: l('How to edit company information', '如何编辑公司信息'),
    summary: l('Keep the company profile, contacts, and links accurate for the work that depends on it.', '保持公司资料、联系人和链接准确，让相关工作保持一致。'),
    outcome: l('You will update a company profile without changing its projects, tasks, or permissions by accident.', '您将能够更新公司资料，而不会意外更改项目、任务或权限。'),
    before: [l('You must be able to view and edit the company record.', '您必须能够查看并编辑公司记录。')],
    steps: [l('Open Companies and select the company to open its details.', '打开“公司”，选择公司以打开详情。'), l('Choose the profile edit control and update only the fields that changed.', '选择资料编辑控件，只更新发生变化的字段。'), l('Review the contact, website, Facebook page, and Notes fields before saving.', '保存前检查联系人、网站、Facebook 页面和备注字段。'), l('Save and verify that linked projects and tasks still show the intended company name.', '保存后确认关联项目和任务仍显示正确的公司名称。')],
    rules: [l('Renaming a company updates its name across linked tasks, companies, client accounts, and notifications.', '重命名公司会同步更新关联任务、公司、客户账户和通知中的名称。')],
    problems: [l('If editing is unavailable, the record may be outside your ownership or permission scope. Do not create a duplicate company to work around it.', '如果无法编辑，记录可能不属于您的所有权或权限范围。不要通过创建重复公司绕过限制。')],
    related: ['create-company', 'find-existing-companies'], keywords: [l('edit company profile rename contact details', '编辑 公司 资料 重命名 联系人 信息')],
  }),
  makeTutorial({
    id: 'find-existing-companies', category: 'company-client', roles: ['admin', 'projectManager', 'hod', 'staff'],
    title: l('How to find an existing company', '如何查找现有公司'),
    summary: l('Find the company record already connected to your work instead of creating duplicates.', '找到已连接到您工作的公司记录，避免创建重复记录。'),
    outcome: l('You will use the existing company relationship when opening projects, tasks, or delivery context.', '您将使用现有公司关系查看项目、任务或交付背景。'),
    before: [l('Know part of the company name, a linked task, or a project name.', '准备公司名称的一部分、关联任务或项目名称。')],
    steps: [l('Open Companies.', '打开“公司”。'), l('Type the company or related work into the company search field.', '在公司搜索框中输入公司名称或相关工作。'), l('Open the matching company and check its projects, services, and linked task counts.', '打开匹配的公司，检查其项目、服务和关联任务数量。'), l('If the company is not listed, clear the search and confirm that your portfolio or department scope includes it.', '如果公司未列出，清除搜索，并确认它属于您的项目组合或部门范围。')],
    rules: [l('Search does not reveal companies outside your permission or portfolio scope.', '搜索不会显示权限或项目组合范围外的公司。')],
    problems: [l('A task may contain a legacy company name without a saved profile. Ask the owner whether a company profile should be created.', '任务可能包含没有保存资料的历史公司名称。请询问负责人是否需要创建公司资料。')],
    related: ['create-company', 'understand-roles'], keywords: [l('search company existing client find', '搜索 公司 现有 客户 查找')],
    guide: [guideStep('projects', 'projects-overview', '/projects', 'Search Companies', '搜索公司', 'Use the company search before starting a new record.', '创建新记录前，先使用公司搜索。'), guideStep('company-search', 'company-search', undefined, 'Filter the company list', '筛选公司列表', 'Search is limited to the companies you are allowed to see.', '搜索结果只包含您有权查看的公司。')],
  }),

  makeTutorial({
    id: 'create-project', category: 'project-management', roles: ['admin', 'projectManager'],
    title: l('How to create a project', '如何创建项目'),
    summary: l('Create a named project under an existing company with dates and required services.', '在现有公司下创建项目，并设置日期和所需服务。'),
    outcome: l('You will have a project that gives the team a clear delivery scope and deadline.', '您将拥有一个为团队明确交付范围和截止日期的项目。'),
    before: [l('An existing company must be visible to you.', '您必须能够看到现有公司。'), l('Prepare the project name, start date, deadline, and at least one service.', '准备项目名称、开始日期、截止日期和至少一项服务。')],
    steps: [l('Open Companies and choose New project.', '打开“公司”，选择“新建项目”。'), l('Choose a company from the Companies database.', '从公司数据库中选择公司。'), l('Enter Project name, Start date, and optional Deadline.', '填写“项目名称”“开始日期”和可选的“截止日期”。'), l('Select at least one Required Service or add a custom service.', '至少选择一项“所需服务”，或添加自定义服务。'), l('Choose Create project and wait for the saved confirmation.', '选择“创建项目”，等待保存确认。')],
    rules: [l('A project must have a company, project name, start date, and at least one service.', '项目必须包含公司、项目名称、开始日期和至少一项服务。'), l('The deadline cannot be earlier than the start date.', '截止日期不能早于开始日期。')],
    problems: [l('If no company is available, add or ask an administrator to assign a company before opening the project form.', '如果没有可用公司，请先添加公司，或请管理员分配公司，再打开项目表单。')],
    related: ['create-company', 'set-project-deadlines', 'create-task'], keywords: [l('new project create project services deadline', '新建项目 创建项目 服务 截止日期')],
    guide: [guideStep('projects', 'projects-overview', '/projects', 'Open Companies', '打开公司', 'Projects live under the company workspace so the relationship stays explicit.', '项目位于公司工作区下，让关系保持清晰。'), guideStep('create-project', 'create-project', undefined, 'Choose New project', '选择“新建项目”', 'The guide stops before the form so you can select the right company and service yourself.', '教程会在表单前停止，让您自行选择正确的公司和服务。')],
  }),
  makeTutorial({
    id: 'set-project-deadlines', category: 'project-management', roles: ['admin', 'projectManager'],
    title: l('How to set and manage project deadlines', '如何设置和管理项目截止日期'),
    summary: l('Keep the project start and deadline realistic so task planning has a reliable frame.', '保持项目开始日期和截止日期合理，为任务计划提供可靠时间范围。'),
    outcome: l('You will know where the project dates live and how they relate to task deadlines.', '您将知道项目日期在哪里，以及它们如何与任务截止日期关联。'),
    before: [l('You must be able to edit the project.', '您必须能够编辑项目。')],
    steps: [l('Open Companies, select the company, and choose the project details.', '打开“公司”，选择公司，再打开项目详情。'), l('Choose Edit project for the project you own or manage.', '对您拥有或管理的项目选择“编辑项目”。'), l('Set Start date first, then choose a Deadline on or after it.', '先设置“开始日期”，再选择不早于开始日期的“截止日期”。'), l('Save changes and review related task due dates separately; changing a project date does not silently rewrite every task.', '保存更改，并单独检查相关任务截止日期；更改项目日期不会静默重写所有任务。')],
    rules: [l('The project deadline cannot precede the start date.', '项目截止日期不能早于开始日期。'), l('Task deadlines remain explicit task-level dates and should be reviewed with the responsible owner.', '任务截止日期是明确的任务级日期，应与负责人一起检查。')],
    problems: [l('If Save changes is unavailable, the project may be outside your management scope or the workspace may be waiting for sync.', '如果“保存更改”不可用，项目可能超出您的管理范围，或工作区正在等待同步。')],
    related: ['create-project', 'create-task', 'monitor-task-progress'], keywords: [l('project deadline dates start date schedule', '项目 截止日期 日期 开始日期 计划')],
  }),
  makeTutorial({
    id: 'create-task', category: 'task-management', roles: ['admin', 'projectManager', 'hod', 'staff'],
    title: l('How to create a task', '如何创建任务'),
    summary: l('Create a task brief that gives the next owner enough context to act.', '创建包含足够背景的任务简报，让下一位负责人可以行动。'),
    outcome: l('You will create a task with a clear requirement, department, deadline, and accountable person.', '您将创建包含清晰要求、部门、截止日期和负责人的任务。'),
    before: [l('You need permission to create tasks.', '您需要创建任务的权限。'), l('Prepare the company or project, requirement, department, and deadline.', '准备公司或项目、任务要求、部门和截止日期。')],
    steps: [l('Open Tasks and choose New task, or use the task entry point from Companies.', '打开“任务”并选择“新建任务”，或从“公司”进入任务创建。'), l('Choose the company/project context, then write a specific title and description.', '选择公司或项目背景，然后填写具体标题和描述。'), l('Choose the department, priority, start date, and due date.', '选择部门、优先级、开始日期和截止日期。'), l('Assign the correct person for the next handoff. Where an HOD exists, a Project Manager must hand the work to the HOD first.', '为下一次交接选择正确负责人。如果部门有主管，项目经理必须先将工作交给部门主管。'), l('Choose Create & open task and verify the saved task opens with the expected status.', '选择“创建并打开任务”，确认保存的任务以预期状态打开。')],
    rules: [l('A department is required for a task assignment.', '任务分配必须选择部门。'), l('Assignment choices are filtered by role, department, and the HOD-first rule.', '可分配人员会根据角色、部门和先交给部门主管的规则筛选。')],
    problems: [l('If a person is missing from Assignee, they may not be eligible for the department or the workflow requires an HOD handoff first.', '如果“负责人”中找不到某人，他可能不符合部门条件，或工作流程要求先交给部门主管。')],
    related: ['assign-task-to-hod', 'write-clear-task-brief', 'set-project-deadlines'], keywords: [l('new task create brief assign department deadline', '新建任务 创建 简报 分配 部门 截止日期')], searchTerms: [l('create task make task new work item assign work', '创建任务 新建任务 新工作项 分配工作')],
    guide: [guideStep('tasks', 'tasks-overview', '/tasks', 'Open Tasks', '打开任务', 'Start from Tasks. The next step is your responsibility to complete in the form.', '从“任务”开始。下一步需要您在表单中自行完成。'), guideStep('create-task', 'create-task', undefined, 'Choose New task', '选择“新建任务”', 'The walkthrough stops before saving so no business record is created by the guide.', '教程会在保存前停止，确保教程不会创建业务记录。')],
  }),
  makeTutorial({
    id: 'write-clear-task-brief', category: 'task-management', roles: ['admin', 'projectManager', 'hod', 'staff'],
    title: l('How to write a clear task brief', '如何编写清晰的任务简报'),
    summary: l('Give the next owner the context, expected result, and boundary needed to start.', '为下一位负责人提供开始工作所需的背景、预期结果和边界。'),
    outcome: l('You will reduce clarification loops and make review evidence easier to check.', '您将减少反复确认，并让审核证据更容易检查。'),
    before: [l('Know the intended deliverable and who will review it.', '明确预期交付成果和审核人。')],
    steps: [l('Use a title that describes the deliverable or decision, not only the activity.', '标题应描述交付成果或决定，不要只写活动名称。'), l('State the desired result, audience, source material, and acceptance condition in Description.', '在“描述”中写明目标结果、受众、参考材料和验收条件。'), l('Add the deadline, department, priority, and relevant client/project context.', '补充截止日期、部门、优先级和相关客户或项目背景。'), l('Use Notes or comments for changing context rather than silently replacing the original brief.', '使用备注或评论记录变化中的背景，不要静默替换原始简报。')],
    rules: [l('A clear brief does not override permission, status, or required review evidence.', '清晰的简报不会覆盖权限、状态或必要的审核证据。')],
    problems: [l('If the requirement keeps changing, use comments and a revision request so the handoff history remains visible.', '如果要求不断变化，请使用评论和修订请求，让交接历史保持可见。')],
    related: ['create-task', 'add-task-comments', 'request-task-revision'], keywords: [l('task brief requirement description acceptance criteria', '任务 简报 要求 描述 验收 条件')],
  }),
  makeTutorial({
    id: 'assign-task-to-hod', category: 'task-management', roles: ['admin', 'projectManager'],
    title: l('How to assign a task to an HOD', '如何将任务分配给部门主管'),
    summary: l('Make the department handoff explicit before staff delegation begins.', '在员工分配开始前，明确完成部门交接。'),
    outcome: l('You will assign work to an eligible department HOD without bypassing the department review path.', '您将把工作分配给符合条件的部门主管，而不会绕过部门审核路径。'),
    before: [l('The task has a department selected.', '任务已选择部门。'), l('An eligible HOD is active in that department.', '该部门有一名有效且符合条件的部门主管。'), l('The task is in Pending, In Progress, or Revision.', '任务处于“待处理”“进行中”或“修订”状态。')],
    steps: [l('Open Tasks and select the task.', '打开“任务”，选择任务。'), l('Check the department and current status in the task details.', '在任务详情中检查部门和当前状态。'), l('Open the Assignee control and choose the eligible HOD.', '打开“负责人”控件，选择符合条件的部门主管。'), l('Save the task update, then confirm the assigned person and assignment notification.', '保存任务更新，然后确认负责人和分配通知。')],
    rules: [l('When a department has an HOD, Project Managers cannot assign its task directly to staff.', '当部门有主管时，项目经理不能将该部门任务直接分配给员工。'), l('Reassignment is locked in Waiting Approval, Approved, Completed, and Cancelled.', '“等待审批”“已批准”“已完成”和“已取消”状态会锁定重新分配。')],
    problems: [l('If the HOD is not offered, verify the department membership and ask the administrator to correct the directory rather than choosing an ineligible person.', '如果没有显示部门主管，请检查部门成员关系，并请管理员修正目录，不要选择不符合条件的人员。')],
    related: ['delegate-task-to-staff', 'understand-task-statuses', 'change-assigned-staff'], keywords: [l('assign HOD department handoff task delegation', '分配 部门主管 部门 交接 任务 分配')], searchTerms: [l('assign task assign work handoff to HOD', '分配任务 分派工作 任务交接 分配给部门主管')],
    guide: [guideStep('tasks', 'tasks-overview', '/tasks', 'Open the task list', '打开任务列表', 'Select the task you are responsible for. The guide will not change its assignee.', '选择您负责的任务。教程不会修改任务负责人。'), guideStep('task-detail', 'task-delegation', undefined, 'Check task delegation controls', '检查任务分配控件', 'Use the task details panel to confirm whether the current status allows an assignment.', '使用任务详情面板确认当前状态是否允许分配。')],
  }),
  makeTutorial({
    id: 'monitor-task-progress', category: 'task-management', roles: ['admin', 'projectManager', 'hod', 'staff'],
    title: l('How to monitor task progress', '如何监控任务进度'),
    summary: l('Use task status, progress, deadlines, comments, and review signals together.', '综合使用任务状态、进度、截止日期、评论和审核提示。'),
    outcome: l('You will spot stalled, overdue, waiting-review, and revision work earlier.', '您将更早发现停滞、逾期、等待审核和修订中的工作。'),
    before: [l('You need access to the task or the relevant dashboard/report scope.', '您需要有权访问任务或相关仪表板/报表范围。')],
    steps: [l('Use Dashboard for a quick queue and Tasks for the full record.', '使用“仪表板”快速查看队列，使用“任务”查看完整记录。'), l('Filter by status, assignee, department, client, priority, or due period when available.', '在可用时按状态、负责人、部门、客户、优先级或截止周期筛选。'), l('Open a task to read progress, due dates, comments, blockers, and submission history.', '打开任务，查看进度、截止日期、评论、阻塞项和提交历史。'), l('Use Inbox for assignment, deadline, review, and feedback events that need action.', '使用“收件箱”查看需要处理的分配、截止日期、审核和反馈事件。')],
    rules: [l('Progress information is a signal; status and review permissions still control what can happen next.', '进度信息是提示；状态和审核权限仍控制下一步可执行的操作。')],
    problems: [l('If progress looks stale, open the task’s latest comments and check whether a submission or revision is waiting.', '如果进度看起来过时，请打开任务的最新评论，检查是否在等待提交或修订。')],
    related: ['identify-overdue-tasks', 'review-submitted-work', 'read-notifications'], keywords: [l('monitor progress task status deadline workload', '监控 进度 任务 状态 截止日期 工作量')],
  }),
  makeTutorial({
    id: 'review-completed-work', category: 'task-management', roles: ['admin', 'projectManager'],
    title: l('How to review completed work', '如何审核已完成的工作'),
    summary: l('Check the submitted evidence and review gate before finalising work.', '在完成工作前检查已提交证据和审核关卡。'),
    outcome: l('You will know whether work is ready for internal approval, client review, or a revision request.', '您将知道工作是否可以进入内部审批、客户审核或请求修订。'),
    before: [l('The task must be visible and have submitted work or review evidence.', '任务必须可见，并且有已提交的工作或审核证据。'), l('You must be the responsible Project Manager, eligible reviewer, or administrator.', '您必须是负责的项目经理、符合条件的审核人或管理员。')],
    steps: [l('Open the task and read the requirement, comments, files, and progress.', '打开任务，阅读要求、评论、文件和进度。'), l('Check whether the task is Waiting Approval or another review-ready state.', '检查任务是否处于“等待审批”或其他可审核状态。'), l('Use Approve only when the internal review gate and evidence are satisfied.', '只有内部审核关卡和证据满足时，才使用“批准”。'), l('If the result needs changes, use Request Revision and explain what must change.', '如果成果需要修改，使用“请求修订”并说明需要修改的内容。'), l('After approval, follow the client-visible review or completion step that your role is allowed to perform.', '批准后，继续执行您角色允许的客户可见审核或完成步骤。')],
    rules: [l('Only the configured independent department reviewer can approve submitted internal work, unless an audited administrator override is allowed.', '只有配置的独立部门审核人可以批准提交的内部工作，除非允许经过审计的管理员覆盖。')],
    problems: [l('If Approve is disabled, read the reason. The task may lack reviewer configuration, required evidence, or an independent reviewer.', '如果“批准”被禁用，请阅读原因。任务可能缺少审核人配置、必要证据或独立审核人。')],
    related: ['request-task-revision', 'approve-work', 'review-submitted-work'], keywords: [l('review completed work approve deliverable submission', '审核 已完成 工作 批准 交付 提交')], searchTerms: [l('review work inspect submission check output', '审核工作 检查提交 检查成果')],
    guide: [guideStep('tasks', 'tasks-overview', '/tasks', 'Open Tasks for review work', '打开任务查看审核工作', 'Choose a review-ready task yourself. The walkthrough will not approve or submit anything.', '自行选择可审核任务。教程不会替您批准或提交任何内容。'), guideStep('task-review', 'task-review', undefined, 'Read the review controls', '阅读审核控件', 'Look for the reason shown when an action is unavailable.', '查看操作不可用时显示的原因。')],
  }),
  makeTutorial({
    id: 'request-task-revision', category: 'task-management', roles: ['admin', 'projectManager', 'hod'],
    title: l('How to request a task revision', '如何请求任务修订'),
    summary: l('Return review-ready work to an actionable state with a clear revision note.', '用清晰的修订说明，将待审核工作返回可处理状态。'),
    outcome: l('You will request changes without implying that every locked status can be reopened.', '您将请求修改，同时不会误导用户认为所有锁定状态都可以重新打开。'),
    before: [l('You must be the responsible Project Manager or an eligible internal reviewer.', '您必须是负责的项目经理或符合条件的内部审核人。'), l('The task must show Request Revision as an available action.', '任务必须显示可用的“请求修订”操作。')],
    steps: [l('Open the task and check its current status and review permissions.', '打开任务，检查当前状态和审核权限。'), l('Read the submitted work and identify the exact change needed.', '阅读提交的工作，明确需要修改的内容。'), l('Enter a concise revision note in Revision Control.', '在“修订控制”中填写简洁的修订说明。'), l('Choose Request Revision and wait for the saved confirmation.', '选择“请求修订”，等待保存确认。'), l('Confirm that the task returns to the workflow state shown by the application before reassigning or updating it.', '确认任务返回应用显示的工作流程状态后，再重新分配或更新任务。')],
    rules: [l('Request Revision is permission- and workflow-dependent. Waiting Approval, Approved, and Completed are not automatically reopenable.', '“请求修订”取决于权限和工作流程。“等待审批”“已批准”和“已完成”不会自动重新打开。'), l('Cancelled tasks are not presented as generally reopenable through this guide.', '本教程不会将已取消任务描述为可以普遍重新打开。')],
    problems: [l('If the control is missing, ask the responsible Project Manager or configured reviewer to take the next step.', '如果缺少该控件，请负责的项目经理或配置的审核人处理下一步。')],
    related: ['understand-task-statuses', 'respond-to-revision-requests', 'review-completed-work'], keywords: [l('request revision changes reopen review task', '请求修订 修改 重新打开 审核 任务')], searchTerms: [l('request revision request changes reopen work', '申请修改 请求修订 请求更改')],
    guide: [guideStep('tasks', 'tasks-overview', '/tasks', 'Open a review-ready task', '打开可审核任务', 'Choose the task yourself and check whether Request Revision is offered.', '自行选择任务，检查是否提供“请求修订”。'), guideStep('revision', 'task-review', undefined, 'Read Revision Control', '阅读修订控制', 'The guide stops before submission. Entering a revision note and sending it remains your decision.', '教程会在提交前停止。是否填写修订说明并发送，由您决定。')],
  }),
  makeTutorial({
    id: 'manage-service-plans', category: 'service-delivery', roles: ['admin', 'projectManager'],
    title: l('How to manage service plans', '如何管理服务方案'),
    summary: l('Set a recurring service scope that can produce visible cycles and deliverables.', '设置可生成可见周期和交付成果的持续服务范围。'),
    outcome: l('You will know where plan details, service items, dates, pricing visibility, and activation live.', '您将了解服务方案详情、服务项目、日期、价格可见性和启用位置。'),
    before: [l('You need client plan management permission and an existing or new company context.', '您需要客户服务方案管理权限，以及现有或新的公司背景。'), l('Prepare the plan name, service items, dates, and billing details.', '准备方案名称、服务项目、日期和计费信息。')],
    steps: [l('Open a company and choose Add service plan, or open its Services workspace.', '打开公司，选择“添加服务方案”，或打开其“服务”工作区。'), l('Choose a standard, customized, or custom plan mode.', '选择标准、定制或自定义方案模式。'), l('Review service items, quantities, workflows, start date, billing day, contract end date, discounts, and tax settings.', '检查服务项目、数量、工作流程、开始日期、计费日、合同结束日期、折扣和税率设置。'), l('Save the plan draft, review it, then activate it only when the scope is correct.', '保存方案草稿，检查后确认范围正确，再启用方案。'), l('Open cycles after activation to see the planned delivery records.', '启用后打开周期，查看计划交付记录。')],
    rules: [l('Plan prices are internal and are not part of client-visible guidance.', '方案价格属于内部信息，不包含在客户可见指导中。'), l('Activation and future cycle behavior follow the service-management permissions and plan status.', '启用和未来周期行为遵循服务管理权限和方案状态。')],
    problems: [l('If Add service plan or Activate plan is missing, check client ownership, plan permissions, and whether the current plan is already active.', '如果缺少“添加服务方案”或“启用方案”，请检查客户所有权、方案权限，以及当前方案是否已经启用。')],
    related: ['review-service-cycles', 'monitor-task-progress', 'view-reports'], keywords: [l('service plan package activate cycles deliverables', '服务方案 套餐 启用 周期 交付成果')],
    guide: [guideStep('projects', 'projects-overview', '/projects', 'Open the company workspace', '打开公司工作区', 'Start from Companies so the plan remains attached to the right client relationship.', '从“公司”开始，让方案保持关联到正确的客户关系。'), guideStep('service-plan', 'service-plan', undefined, 'Find service plan controls', '查找服务方案控件', 'Review the plan entry point. The guide does not create or activate a plan.', '查看方案入口。教程不会创建或启用方案。')],
  }),
  makeTutorial({
    id: 'view-reports', category: 'reports-monitoring', roles: ['admin', 'projectManager', 'hod', 'staff', 'client'],
    title: l('How to view reports', '如何查看报表'),
    summary: l('Read the four-week performance view to understand deadlines, completion, and delivery timing.', '通过四周绩效视图了解截止日期、完成情况和交付时间。'),
    outcome: l('You will compare due work, on-time work, late work, upcoming work, and overdue work within your allowed scope.', '您将能够在允许范围内比较应交工作、按时工作、逾期工作、即将到期工作和过期工作。'),
    before: [l('You need Reports access.', '您需要报表访问权限。')],
    steps: [l('Open Reports from the navigation.', '从导航打开“报表”。'), l('Read the report scope and local-time range before interpreting the cards.', '解读卡片前，先查看报表范围和本地时间区间。'), l('Compare the metric cards and trend chart for deadline and completion patterns.', '比较指标卡片和趋势图中的截止日期和完成模式。'), l('Use the detailed breakdown to identify departments, assignees, or client-visible outcomes available to your role.', '使用详细分解查看角色可见的部门、负责人或客户可见结果。'), l('Export CSV only when you need an offline copy of the visible report.', '只有需要离线副本时，才导出可见报表的 CSV。')],
    rules: [l('Reports use the same visibility scope as the rest of the workspace.', '报表使用与工作区其他部分相同的可见范围。'), l('Client reports omit internal commercial and team-only details.', '客户报表不包含内部商业和团队内部详情。')],
    problems: [l('A zero value may mean no work exists in the selected period, not that access is broken. Check the report scope and date range.', '零值可能表示所选时间段没有工作，而不是访问故障。请检查报表范围和日期区间。')],
    related: ['monitor-task-progress', 'identify-overdue-tasks', 'use-search-filters'], keywords: [l('reports performance overdue deadline export CSV', '报表 绩效 逾期 截止日期 导出 CSV')],
    guide: [guideStep('reports', 'reports-overview', '/reports', 'Open Reports', '打开报表', 'Review the visible report scope and metrics. Export remains a user-initiated action.', '查看可见报表范围和指标。导出仍由您主动执行。')],
  }),

  makeTutorial({
    id: 'receive-assigned-tasks', category: 'department-management', roles: ['hod'],
    title: l('How to receive assigned tasks', '如何接收分配的任务'),
    summary: l('Find the Project Manager handoff and confirm what your department owns next.', '找到项目经理的交接，并确认部门下一步负责什么。'),
    outcome: l('You will locate incoming work without assuming it is ready for staff delegation.', '您将能够找到新工作，而不会误以为它已经可以直接分配给员工。'),
    before: [l('You must be an active HOD or department-scoped lead for the task department.', '您必须是任务所属部门的有效部门主管或部门范围负责人。')],
    steps: [l('Open Department work or All work from the navigation.', '从导航打开“部门工作”或“全部工作”。'), l('Use Inbox for assignment notifications and Tasks for the full record.', '使用“收件箱”查看分配通知，使用“任务”查看完整记录。'), l('Open the task and confirm the department, requirement, deadline, and assigned-by member.', '打开任务，确认部门、要求、截止日期和分配人。'), l('Keep the task with the department until you are ready to delegate or review it.', '在准备分配或审核前，让任务保持在部门工作范围内。')],
    rules: [l('HOD visibility is department-scoped and does not imply workspace-wide access.', '部门主管的可见范围受部门限制，不代表可以访问整个工作区。')],
    problems: [l('If a task is missing, check the department, task status, and assignment notification before asking for a duplicate.', '如果找不到任务，请先检查部门、任务状态和分配通知，不要立即要求创建重复任务。')],
    related: ['review-task-requirements', 'delegate-task-to-staff', 'read-notifications'], keywords: [l('HOD receive assignment department work handoff', '部门主管 接收 分配 部门工作 交接')],
    guide: [guideStep('tasks', 'tasks-overview', '/tasks', 'Open the department queue', '打开部门队列', 'Use the visible task list to locate the incoming handoff.', '使用可见任务列表查找收到的交接。'), guideStep('notifications', 'notifications-overview', '/notifications', 'Check Inbox for assignment signals', '在收件箱查看分配提示', 'Open the linked notification when you need the assignment context.', '需要分配背景时，打开关联通知。')],
  }),
  makeTutorial({
    id: 'review-task-requirements', category: 'department-management', roles: ['hod'],
    title: l('How to review task requirements', '如何审核任务要求'),
    summary: l('Read the brief, dates, department, and context before delegating work.', '在分配工作前阅读简报、日期、部门和背景。'),
    outcome: l('You will know whether a task is clear enough for staff and what needs clarification.', '您将知道任务是否足够清晰，可以交给员工，以及哪些内容需要澄清。'),
    before: [l('Open a task assigned to your department.', '打开分配给您部门的任务。')],
    steps: [l('Read the title and Description from the task details.', '阅读任务详情中的标题和“描述”。'), l('Check the company/project, department, priority, start date, and due date.', '检查公司/项目、部门、优先级、开始日期和截止日期。'), l('Review existing comments, links, and attachments for supporting context.', '查看现有评论、链接和附件中的支持背景。'), l('Ask for clarification through comments or return the work for revision when the current workflow permits it.', '通过评论请求澄清，或在当前流程允许时将工作返回修订。')],
    rules: [l('Do not delegate a brief you cannot explain to the staff member receiving it.', '不要分配您无法向员工解释清楚的简报。')],
    problems: [l('If the task has no department, assignee, or reviewer context, ask the Project Manager to correct the handoff.', '如果任务没有部门、负责人或审核背景，请项目经理修正交接。')],
    related: ['write-clear-task-brief', 'delegate-task-to-staff', 'add-task-comments'], keywords: [l('HOD requirements brief read handoff task details', '部门主管 要求 简报 阅读 交接 任务详情')],
  }),
  makeTutorial({
    id: 'delegate-task-to-staff', category: 'department-management', roles: ['hod'],
    title: l('How to delegate a task to staff', '如何将任务分配给员工'),
    summary: l('Move a department handoff to an eligible staff member while preserving the review path.', '在保留审核路径的同时，将部门交接分配给符合条件的员工。'),
    outcome: l('You will assign the task to a staff member in the same department when the task status allows it.', '在任务状态允许时，您将把任务分配给同一部门的员工。'),
    before: [l('You must be the HOD or department-scoped user with assignment access.', '您必须是具有分配权限的部门主管或部门范围用户。'), l('The task must be Pending, In Progress, or Revision.', '任务必须处于“待处理”“进行中”或“修订”。'), l('An eligible staff member must belong to the task department.', '符合条件的员工必须属于任务部门。')],
    steps: [l('Open Tasks and select the department task.', '打开“任务”，选择部门任务。'), l('Check the current status before opening Task Delegation.', '打开“任务分配”前检查当前状态。'), l('Open Task Delegation and choose an eligible team member.', '打开“任务分配”，选择符合条件的团队成员。'), l('Choose Assign Task and wait for the assignment confirmation.', '选择“分配任务”，等待分配确认。'), l('Confirm that the new assignee and workload are visible before closing the task.', '关闭任务前，确认新的负责人和工作量已显示。')],
    rules: [l('Assignment allowed: Pending, In Progress, Revision.', '可以分配：待处理、进行中、修订。'), l('Assignment locked: Waiting Approval, Approved, Completed, Cancelled.', '分配锁定：等待审批、已批准、已完成、已取消。')],
    problems: [l('If the status is locked, check whether Request Revision is available. Do not imply that every locked status can be reopened.', '如果状态已锁定，请检查是否提供“请求修订”。不要认为所有锁定状态都可以重新打开。'), l('If no staff member is listed, check department membership and active account status.', '如果没有员工列出，请检查部门成员关系和账户是否有效。')],
    related: ['change-assigned-staff', 'monitor-staff-progress', 'request-revisions'], keywords: [l('HOD delegate assign staff task delegation change member', '部门主管 分配 员工 任务 分配 更换成员')], searchTerms: [l('delegate task assign staff hand off work', '委派任务 分配员工 交接工作')],
    guide: [guideStep('tasks', 'tasks-overview', '/tasks', 'Open the department task', '打开部门任务', 'Choose the task yourself and check its status before changing anything.', '自行选择任务，在更改前检查状态。'), guideStep('delegation', 'task-delegation', undefined, 'Find Task Delegation', '查找“任务分配”', 'The walkthrough stops before choosing Assign Task. Your selection and save remain explicit.', '教程会在选择“分配任务”前停止。人员选择和保存由您明确完成。')],
  }),
  makeTutorial({
    id: 'change-assigned-staff', category: 'department-management', roles: ['hod'],
    title: l('How to change an assigned staff member', '如何更换任务负责人'),
    summary: l('Change a department assignee only while the work is still in an assignable state.', '只在工作仍可分配时更换部门负责人。'),
    outcome: l('You will make a controlled reassignment and understand when the application must keep the current owner.', '您将完成受控的重新分配，并了解何时应用必须保留当前负责人。'),
    before: [l('You must have assignment permission for the task.', '您必须拥有该任务的分配权限。'), l('The task must not be in a locked status.', '任务不能处于锁定状态。')],
    steps: [l('Open the task and check the current status.', '打开任务并检查当前状态。'), l('Open the Assignee control or Task Delegation area.', '打开“负责人”控件或“任务分配”区域。'), l('Choose an eligible staff member in the same department.', '选择同一部门中符合条件的员工。'), l('Save the change and confirm the new assignee in the task details and Inbox.', '保存更改，并在任务详情和收件箱中确认新负责人。')],
    rules: [l('Waiting Approval, Approved, Completed, and Cancelled lock reassignment.', '“等待审批”“已批准”“已完成”和“已取消”会锁定重新分配。'), l('A Project Manager may be required to request the revision or correct the workflow before reassignment.', '重新分配前，可能需要项目经理请求修订或修正工作流程。')],
    problems: [l('If the field is disabled, read the status explanation and do not use a direct store or URL workaround.', '如果字段被禁用，请阅读状态说明，不要通过直接操作数据或网址绕过。')],
    related: ['delegate-task-to-staff', 'understand-task-statuses', 'request-revisions'], keywords: [l('change assigned staff reassign task locked status', '更换 负责人 重新分配 任务 锁定 状态')], searchTerms: [l('change staff change assignee reassign task move work', '更换负责人 更换员工 重新分配任务 转交工作')],
  }),
  makeTutorial({
    id: 'monitor-staff-progress', category: 'department-management', roles: ['hod'],
    title: l('How to monitor staff progress', '如何监控员工进度'),
    summary: l('Use department queues, task progress, blockers, and deadlines to support staff before review.', '使用部门队列、任务进度、阻塞项和截止日期，在审核前支持员工。'),
    outcome: l('You will identify work that needs context, a deadline conversation, or a review handoff.', '您将识别需要补充背景、讨论截止日期或进入审核交接的工作。'),
    before: [l('You must have department-scoped task access.', '您必须具有部门范围的任务访问权限。')],
    steps: [l('Open Department work and review the workload summary.', '打开“部门工作”，查看工作量摘要。'), l('Filter or open tasks assigned to staff in your department.', '筛选或打开分配给部门员工的任务。'), l('Check completion percentage, current status, due date, comments, and blocker/help signals.', '检查完成百分比、当前状态、截止日期、评论和阻塞/求助提示。'), l('Use comments to clarify support needs and keep the original handoff visible.', '使用评论说明支持需求，并保持原始交接可见。')],
    rules: [l('Monitoring does not give permission to edit another department’s work.', '监控不会授予编辑其他部门工作的权限。')],
    problems: [l('If a task is not in your department queue, ask the Project Manager to check its department and assignment.', '如果任务不在部门队列中，请项目经理检查任务部门和分配。')],
    related: ['identify-overdue-tasks', 'review-submitted-work', 'report-a-blocker'], keywords: [l('HOD monitor staff workload progress blockers deadlines', '部门主管 监控 员工 工作量 进度 阻塞 截止日期')],
  }),
  makeTutorial({
    id: 'review-submitted-work', category: 'department-management', roles: ['hod'],
    title: l('How to review submitted work', '如何审核员工提交的工作'),
    summary: l('Check the brief, deliverables, comments, and evidence before internal approval.', '在内部批准前检查简报、交付成果、评论和证据。'),
    outcome: l('You will approve ready work or return it with an actionable revision note.', '您将批准已准备好的工作，或用可执行的修订说明将其退回。'),
    before: [l('The task must be submitted into the internal review state.', '任务必须已提交到内部审核状态。'), l('You must be the configured independent reviewer or an eligible HOD.', '您必须是配置的独立审核人或符合条件的部门主管。')],
    steps: [l('Open the task from Department work, Tasks, or Inbox.', '从“部门工作”“任务”或“收件箱”打开任务。'), l('Compare the submitted files and comments with the original requirement.', '将提交的文件和评论与原始要求进行比较。'), l('Check whether required evidence and workflow conditions are satisfied.', '检查必要证据和工作流程条件是否满足。'), l('Approve internal review when ready, or request a revision with a specific note.', '准备好后批准内部审核，或用具体说明请求修订。')],
    rules: [l('Approval belongs to the configured reviewer and remains subject to workflow validation.', '批准由配置的审核人负责，并且仍受工作流程验证。')],
    problems: [l('If approval is disabled, read the in-panel reason. Missing evidence, reviewer configuration, or independent cover may be required.', '如果批准被禁用，请阅读面板原因。可能需要补充证据、审核人配置或独立审核覆盖。')],
    related: ['request-revisions', 'approve-work', 'review-completed-work'], keywords: [l('HOD review submitted work internal approval files evidence', '部门主管 审核 提交 工作 内部批准 文件 证据')],
    guide: [guideStep('tasks', 'tasks-overview', '/tasks', 'Open review work', '打开审核工作', 'Choose a submitted task yourself. The guide will not approve it.', '自行选择已提交的任务。教程不会替您批准。'), guideStep('review', 'task-review', undefined, 'Read the review controls', '阅读审核控件', 'Check the evidence and the explanation beside any disabled action.', '检查证据以及禁用操作旁边的说明。')],
  }),
  makeTutorial({
    id: 'request-revisions', category: 'department-management', roles: ['hod'],
    title: l('How to request revisions as an HOD', '部门主管如何请求修订'),
    summary: l('Send work back with a review note that tells staff what to correct.', '用审核说明将工作退回，并明确员工需要修正的内容。'),
    outcome: l('You will use the revision path without treating it as a universal unlock for locked statuses.', '您将使用修订路径，同时不会把它当成解锁所有锁定状态的通用方式。'),
    before: [l('The task is review-ready and Request Revision is available to you.', '任务已准备审核，并且您可以使用“请求修订”。')],
    steps: [l('Open the submitted task and inspect the output.', '打开已提交的任务并检查成果。'), l('Write what is missing, incorrect, or not yet ready in Revision Control.', '在“修订控制”中写明缺少、错误或尚未完成的内容。'), l('Choose Request Revision.', '选择“请求修订”。'), l('After the task returns to the working state, confirm the staff member can see the request.', '任务返回工作状态后，确认员工可以看到修订请求。')],
    rules: [l('Only the current workflow and your permission determine whether Request Revision is available.', '只有当前工作流程和您的权限决定“请求修订”是否可用。'), l('Cancelled work is not presented as generally reopenable.', '已取消的工作不会被描述为可以普遍重新打开。')],
    problems: [l('If Request Revision is missing, ask the responsible Project Manager or configured reviewer to review the next transition.', '如果缺少“请求修订”，请负责的项目经理或配置的审核人检查下一次转换。')],
    related: ['review-submitted-work', 'respond-to-revision-requests', 'understand-task-statuses'], keywords: [l('HOD request revision review changes note', '部门主管 请求修订 审核 修改 说明')],
  }),
  makeTutorial({
    id: 'approve-work', category: 'department-management', roles: ['hod', 'admin'],
    title: l('How to approve work', '如何批准工作'),
    summary: l('Approve internal work only after the configured review gate and evidence are satisfied.', '只有配置的审核关卡和证据满足后，才批准内部工作。'),
    outcome: l('You will understand the approval action and the safeguards that may keep it disabled.', '您将了解批准操作，以及可能让它保持禁用的安全检查。'),
    before: [l('The task must be Waiting Approval.', '任务必须处于“等待审批”。'), l('You must be the eligible independent reviewer or authorised administrator.', '您必须是符合条件的独立审核人或授权管理员。')],
    steps: [l('Open the task and verify the status is Waiting Approval.', '打开任务，确认状态为“等待审批”。'), l('Check required files, comments, review cover, and workflow evidence.', '检查必要文件、评论、审核覆盖和工作流程证据。'), l('Choose Approve or Approve internal review only when the control is enabled.', '只有控件启用时，才选择“批准”或“批准内部审核”。'), l('Confirm the next status and notify the next owner through the normal workflow.', '确认下一状态，并通过正常工作流程通知下一位负责人。')],
    rules: [l('A PM cannot self-approve an internal review unless an explicitly audited administrator override is allowed.', '项目经理不能自行批准内部审核，除非明确允许经过审计的管理员覆盖。'), l('Approval does not silently complete client review; client-visible approval remains a separate action.', '内部批准不会静默完成客户审核；客户可见批准仍是独立操作。')],
    problems: [l('If approval is disabled, read the reason instead of changing the status through another screen.', '如果批准被禁用，请阅读原因，不要通过其他页面更改状态。')],
    related: ['review-submitted-work', 'request-revisions', 'review-client-deliverables'], keywords: [l('approve internal work HOD review approval', '批准 内部工作 部门主管 审核 批准')], searchTerms: [l('approve work approve submission internal approval', '审核工作 批准工作 审核提交 内部批准')],
    guide: [guideStep('tasks', 'tasks-overview', '/tasks', 'Find the review queue', '查找审核队列', 'The guide stops before the approval action. You remain responsible for the decision.', '教程会在批准操作前停止。决定仍由您负责。'), guideStep('review', 'task-review', undefined, 'Check the approval explanation', '检查批准说明', 'Read any disabled reason and confirm the evidence yourself.', '阅读禁用原因并自行确认证据。')],
  }),
  makeTutorial({
    id: 'manage-department-workload', category: 'department-management', roles: ['hod'],
    title: l('How to manage department workload', '如何管理部门工作量'),
    summary: l('Balance incoming work, active assignments, overdue items, and review queues.', '平衡新工作、进行中的分配、逾期项目和审核队列。'),
    outcome: l('You will know which work to delegate, support, review, or escalate first.', '您将知道应优先分配、支持、审核或升级哪些工作。'),
    before: [l('You must have department-scoped visibility.', '您必须拥有部门范围的可见权限。')],
    steps: [l('Open Department work and read the workload summary.', '打开“部门工作”，查看工作量摘要。'), l('Review open, overdue, revision, waiting-review, and help-requested signals.', '查看开放、逾期、修订、等待审核和请求帮助的提示。'), l('Use assignee filters to see whether a staff member is overloaded or waiting for context.', '使用负责人筛选，查看员工是否工作过载或正在等待背景。'), l('Rebalance only through the allowed assignment or revision workflow.', '只通过允许的分配或修订流程重新平衡工作。')],
    rules: [l('Workload visibility does not unlock tasks outside your department.', '工作量可见性不会解锁部门外的任务。')],
    problems: [l('If a task cannot be moved, treat its status as a workflow boundary and contact the responsible PM when needed.', '如果任务无法移动，请将其状态视为工作流程边界，并在需要时联系负责的项目经理。')],
    related: ['monitor-staff-progress', 'identify-overdue-tasks', 'change-assigned-staff'], keywords: [l('HOD workload department balance assignments overdue', '部门主管 工作量 部门 平衡 分配 逾期')],
  }),
  makeTutorial({
    id: 'identify-overdue-tasks', category: 'reports-monitoring', roles: ['admin', 'projectManager', 'hod', 'staff'],
    title: l('How to identify overdue tasks', '如何识别逾期任务'),
    summary: l('Use dashboard, Tasks, Delivery tracker, and Reports to find work past its due date.', '使用仪表板、任务、交付跟踪和报表查找超过截止日期的工作。'),
    outcome: l('You will find overdue work in your allowed scope and understand who owns the next conversation.', '您将找到允许范围内的逾期工作，并了解下一步应由谁沟通。'),
    before: [l('A task must have a due date to be evaluated as overdue.', '任务必须有截止日期，系统才能判断是否逾期。')],
    steps: [l('Start on Dashboard and open the overdue or deadline signal.', '从“仪表板”开始，打开逾期或截止日期提示。'), l('Use Tasks filters to narrow by assignee, department, client, priority, or overdue focus.', '使用“任务”筛选，按负责人、部门、客户、优先级或逾期焦点缩小范围。'), l('Use Delivery tracker for client-by-client overdue delivery context.', '使用“交付跟踪”查看按客户划分的逾期交付背景。'), l('Use Reports to compare overdue work with on-time and upcoming work across the visible period.', '使用“报表”在可见时间段内比较逾期、按时和即将到期工作。')],
    rules: [l('Overdue is a monitoring signal; it does not automatically change task status or deadline.', '逾期是监控提示，不会自动更改任务状态或截止日期。')],
    problems: [l('If a task is not in your overdue list, it may have no due date or be outside your access scope.', '如果任务不在逾期列表中，可能没有截止日期，或不在您的访问范围内。')],
    related: ['monitor-task-progress', 'view-reports', 'manage-department-workload'], keywords: [l('overdue late deadline due task monitor', '逾期 延迟 截止日期 任务 监控')],
    guide: [guideStep('tasks', 'tasks-overview', '/tasks?focus=overdue', 'Open overdue work', '打开逾期工作', 'The overdue filter is read-only until you choose a task action yourself.', '逾期筛选本身只读，任务操作由您自行决定。')],
  }),

  makeTutorial({
    id: 'view-assigned-tasks', category: 'task-management', roles: ['staff'],
    title: l('How to view assigned tasks', '如何查看分配给您的任务'),
    summary: l('Start from My work and move to the full task record when you need detail.', '从“我的工作”开始，需要详情时再打开完整任务记录。'),
    outcome: l('You will find your queue, deadlines, revisions, and completed work without opening unrelated tasks.', '您将找到自己的队列、截止日期、修订和已完成工作，而不会打开无关任务。'),
    before: [l('You must be signed in with an active Staff account.', '您必须使用有效的员工账户登录。')],
    steps: [l('Open My work from the navigation.', '从导航打开“我的工作”。'), l('Review the assigned queue and deadline signals.', '查看分配队列和截止日期提示。'), l('Open All work when you need search, filters, or completed history.', '需要搜索、筛选或已完成历史时，打开“全部工作”。'), l('Select a task to read its brief, status, files, comments, and next action.', '选择任务，查看简报、状态、文件、评论和下一步操作。')],
    rules: [l('Staff views are limited to assigned or otherwise permitted work.', '员工视图只包含分配给自己的或其他允许查看的工作。')],
    problems: [l('If an expected task is missing, check Inbox and ask the HOD or Project Manager to confirm the assignment.', '如果找不到预期任务，请检查收件箱，并请部门主管或项目经理确认分配。')],
    related: ['accept-task', 'understand-task-requirements', 'read-notifications'], keywords: [l('staff my work assigned tasks queue', '员工 我的工作 分配 任务 队列')],
    guide: [guideStep('dashboard', 'dashboard-overview', '/', 'Open My work', '打开我的工作', 'Start with the tasks assigned to you.', '从分配给您的任务开始。'), guideStep('tasks', 'tasks-overview', '/tasks', 'Open All work when needed', '需要时打开全部工作', 'Use the full list when you need a filter or completed history.', '需要筛选或查看已完成历史时，使用完整列表。')],
  }),
  makeTutorial({
    id: 'accept-task', category: 'task-management', roles: ['staff'],
    title: l('How to accept a task', '如何接受任务'),
    summary: l('Confirm that you understand an assignment before moving it through the work state.', '在推动工作状态前，确认您理解任务分配。'),
    outcome: l('You will know where to read the brief and how to signal that the assignment is being worked on.', '您将知道在哪里阅读简报，以及如何表示任务正在处理。'),
    before: [l('The task must be assigned to you.', '任务必须分配给您。'), l('The task must offer the relevant status control.', '任务必须提供相关状态控件。')],
    steps: [l('Open the task from My work, Tasks, or Inbox.', '从“我的工作”“任务”或“收件箱”打开任务。'), l('Read the requirement, deadline, department, files, and comments.', '阅读要求、截止日期、部门、文件和评论。'), l('Use the available status control to move the work into the next allowed state, if the workflow offers it.', '如果工作流程提供，请使用可用状态控件将工作移动到下一允许状态。'), l('Confirm the status change and begin work only after the saved state is visible.', '确认状态更改，并在保存后的状态可见后开始工作。')],
    rules: [l('The application decides which status transitions are available; Staff cannot bypass review gates.', '应用决定可用的状态转换；员工不能绕过审核关卡。')],
    problems: [l('If no accept or progress action is available, read the task status and ask the HOD for the correct handoff.', '如果没有接受或进度操作，请查看任务状态，并向部门主管询问正确交接。')],
    related: ['understand-task-requirements', 'update-task-progress', 'submit-work-for-approval'], keywords: [l('accept assignment start task in progress', '接受 分配 开始 任务 进行中')],
  }),
  makeTutorial({
    id: 'understand-task-requirements', category: 'task-management', roles: ['staff'],
    title: l('How to understand task requirements', '如何理解任务要求'),
    summary: l('Read the full task context before spending time on the deliverable.', '投入时间制作交付成果前，先阅读完整任务背景。'),
    outcome: l('You will know what to deliver, when it is due, and what evidence the reviewer will need.', '您将知道要交付什么、何时到期，以及审核人需要哪些证据。'),
    before: [l('Open a task assigned to you.', '打开分配给您的任务。')],
    steps: [l('Read the title and Description first.', '先阅读标题和“描述”。'), l('Check client/project context, department, priority, start date, and due date.', '检查客户/项目背景、部门、优先级、开始日期和截止日期。'), l('Review Notes, links, attachments, and existing comments.', '查看备注、链接、附件和现有评论。'), l('Ask a focused question in Comments when something is unclear.', '不清楚时，在“评论”中提出具体问题。')],
    rules: [l('The original brief remains the reference point even when comments add later context.', '即使评论补充了后续背景，原始简报仍是参考依据。')],
    problems: [l('If the requirement conflicts with the deadline or department, ask the HOD or Project Manager to clarify before submitting work.', '如果要求与截止日期或部门冲突，请在提交工作前向部门主管或项目经理请求澄清。')],
    related: ['write-clear-task-brief', 'add-task-comments', 'report-a-blocker'], keywords: [l('staff task requirements brief deadline deliverable', '员工 任务 要求 简报 截止日期 交付')],
  }),
  makeTutorial({
    id: 'update-task-progress', category: 'task-management', roles: ['staff'],
    title: l('How to update task progress', '如何更新任务进度'),
    summary: l('Keep the task status and progress percentage aligned with the work actually done.', '让任务状态和进度百分比与实际工作保持一致。'),
    outcome: l('Your HOD and Project Manager can see whether work is moving, blocked, or ready for review.', '部门主管和项目经理可以了解工作是在推进、受阻还是准备审核。'),
    before: [l('The task must be assigned to you and editable in the current state.', '任务必须分配给您，且当前状态允许编辑。')],
    steps: [l('Open the task and compare its current status with the work completed.', '打开任务，将当前状态与已完成工作进行比较。'), l('Update the progress field or allowed status control in the task details.', '在任务详情中更新进度字段或允许的状态控件。'), l('Add a comment when the number alone does not explain the situation.', '当数字不能说明情况时，添加评论。'), l('Save and confirm the updated progress is visible to the reviewer.', '保存并确认审核人可以看到更新后的进度。')],
    rules: [l('Progress cannot bypass submission, internal review, client review, or completion rules.', '进度不能绕过提交、内部审核、客户审核或完成规则。')],
    problems: [l('If the status control is disabled, the task may be waiting for review or locked after approval. Ask the HOD for the next transition.', '如果状态控件被禁用，任务可能正在等待审核，或已在批准后锁定。请向部门主管询问下一次转换。')],
    related: ['add-task-comments', 'submit-work-for-approval', 'respond-to-revision-requests'], keywords: [l('staff update progress percentage status', '员工 更新 进度 百分比 状态')],
  }),
  makeTutorial({
    id: 'add-task-comments', category: 'task-management', roles: ['staff', 'hod', 'projectManager', 'client'],
    title: l('How to add comments and updates', '如何添加评论和更新'),
    summary: l('Keep decisions, questions, and progress context beside the task they belong to.', '将决定、问题和进度背景保存在对应任务旁。'),
    outcome: l('You will leave a useful update that the next person can act on.', '您将留下下一位负责人可以据此行动的有效更新。'),
    before: [l('You must be allowed to comment on the task.', '您必须拥有任务评论权限。')],
    steps: [l('Open the task and scroll to Comments & Updates.', '打开任务，滚动到“评论与更新”。'), l('Write the decision, question, blocker, or progress change in plain language.', '用清晰语言写明决定、问题、阻塞或进度变化。'), l('Check that the comment is appropriate for the task visibility before sending it.', '发送前确认评论适合该任务的可见范围。'), l('Choose Send comment and wait for the saved confirmation.', '选择“发送评论”，等待保存确认。')],
    rules: [l('Clients can only see client-visible activity; internal comments remain with the operations team.', '客户只能看到客户可见活动；内部评论只对运营团队可见。')],
    problems: [l('If Send comment is disabled, the comment may be empty, the task may be inaccessible, or a save is already in progress.', '如果“发送评论”被禁用，评论可能为空、任务可能不可访问，或当前已有保存操作。')],
    related: ['report-a-blocker', 'leave-feedback', 'understand-task-requirements'], keywords: [l('comment update feedback task message', '评论 更新 反馈 任务 消息')],
  }),
  makeTutorial({
    id: 'upload-deliverables', category: 'task-management', roles: ['staff', 'hod', 'projectManager'],
    title: l('How to upload deliverables', '如何上传交付成果'),
    summary: l('Attach a review-ready output to the task without losing the upload state.', '将可审核的成果附加到任务，并保持上传状态可追踪。'),
    outcome: l('You will know when file upload is available and how to confirm the output was saved.', '您将知道何时可以上传文件，以及如何确认成果已保存。'),
    before: [l('The task must be in an editable output state.', '任务必须处于允许编辑成果的状态。'), l('Use a PDF or accepted image format within the displayed size limit.', '使用显示限制内的 PDF 或支持的图片格式。'), l('Private uploads require the Supabase backend.', '私有文件上传需要 Supabase 后端。')],
    steps: [l('Open the task and find Upload output in the task details.', '打开任务，在任务详情中找到“上传成果”。'), l('Choose the file and wait for Uploading and saving output to finish.', '选择文件，等待“正在上传并保存成果”完成。'), l('Check for Output file saved for review.', '确认显示“成果文件已保存以供审核”。'), l('Add a comment explaining what the file contains before submitting work.', '提交工作前，添加评论说明文件内容。')],
    rules: [l('Approved and Completed tasks lock output editing.', '“已批准”和“已完成”任务会锁定成果编辑。'), l('An upload is not the same as submitting work for approval.', '上传文件不等于提交工作审批。')],
    problems: [l('If the upload field is unavailable, check task status, backend mode, file type, and size. Retry the saved upload rather than selecting a different task.', '如果上传字段不可用，请检查任务状态、后端模式、文件类型和大小。请重试保存的上传，而不是改选其他任务。')],
    related: ['submit-work-for-approval', 'respond-to-revision-requests', 'add-task-comments'], keywords: [l('upload output file deliverable PDF image', '上传 成果 文件 交付 PDF 图片')],
    guide: [guideStep('tasks', 'tasks-overview', '/tasks', 'Open a task you own', '打开您负责的任务', 'Choose the task yourself. The guide will not select or upload a file.', '自行选择任务。教程不会替您选择或上传文件。'), guideStep('output', 'task-output', undefined, 'Find Upload output', '查找“上传成果”', 'Review the upload requirements before choosing a file.', '选择文件前，先查看上传要求。')],
  }),
  makeTutorial({
    id: 'submit-work-for-approval', category: 'task-management', roles: ['staff'],
    title: l('How to submit work for approval', '如何提交工作审批'),
    summary: l('Move finished work into the review path with the evidence the HOD needs.', '用部门主管需要的证据，将完成的工作提交到审核流程。'),
    outcome: l('You will know what must be ready before the task can enter internal review.', '您将知道任务进入内部审核前必须准备什么。'),
    before: [l('The requirement is complete enough to review.', '任务要求已完成到可以审核的程度。'), l('Required files, links, comments, and progress are up to date.', '必要文件、链接、评论和进度已更新。'), l('The task status control offers the review transition.', '任务状态控件提供审核转换。')],
    steps: [l('Open the assigned task and compare the output with the original brief.', '打开分配给您的任务，将成果与原始简报比较。'), l('Upload the deliverable and add a concise completion comment.', '上传交付成果并添加简洁的完成评论。'), l('Check that required evidence and progress are complete.', '确认必要证据和进度完整。'), l('Choose the available submit or review-ready status control.', '选择可用的提交或进入审核状态控件。'), l('Confirm that the task shows the review state and that the HOD can see it.', '确认任务显示审核状态，并且部门主管可以看到。')],
    rules: [l('The application may require a reviewer, evidence, or dependency completion before submission.', '提交前，应用可能要求审核人、证据或依赖任务完成。')],
    problems: [l('If submission is blocked, read the transition explanation and ask the HOD or Project Manager to correct the missing prerequisite.', '如果提交被阻止，请阅读转换说明，并请部门主管或项目经理补齐缺少的前置条件。')],
    related: ['upload-deliverables', 'review-submitted-work', 'respond-to-revision-requests'], keywords: [l('submit work approval review ready staff', '提交 工作 审批 审核 员工')], searchTerms: [l('submit work submit for approval send for review hand in', '提交工作 提交审批 送审 提交审核')],
    guide: [guideStep('tasks', 'tasks-overview', '/tasks', 'Open your assigned task', '打开分配给您的任务', 'Choose the task yourself. The walkthrough will not submit work or change its status.', '自行选择任务。教程不会提交工作或更改状态。'), guideStep('output', 'task-output', undefined, 'Check the output area', '检查成果区域', 'Review the evidence and submission requirements before taking the action yourself.', '先查看证据和提交要求，再自行决定是否操作。')],
  }),
  makeTutorial({
    id: 'respond-to-revision-requests', category: 'task-management', roles: ['staff'],
    title: l('How to respond to a revision request', '如何响应修订请求'),
    summary: l('Turn reviewer feedback into a clear updated submission.', '将审核反馈转化为清晰的更新提交。'),
    outcome: l('You will address the requested change and return the task to review with a visible history.', '您将完成要求的修改，并带着可见历史将任务返回审核。'),
    before: [l('The task must show a revision request or Revision status.', '任务必须显示修订请求或“修订”状态。')],
    steps: [l('Open the task and read the latest revision note and comments.', '打开任务，阅读最新修订说明和评论。'), l('Update the work and replace or add the relevant deliverable.', '更新工作，并替换或添加相关交付成果。'), l('Add a comment describing what changed.', '添加评论说明修改内容。'), l('Move the task through the available progress or review transition again.', '再次通过可用进度或审核转换推动任务。'), l('Confirm that the updated output is visible to the reviewer.', '确认审核人可以看到更新后的成果。')],
    rules: [l('Revision returns work to a workable state; it does not remove the original review history.', '修订会将工作返回可处理状态，但不会删除原始审核历史。')],
    problems: [l('If the task is still locked, the reviewer or Project Manager may need to make the next authorised transition.', '如果任务仍然锁定，审核人或项目经理可能需要执行下一次授权转换。')],
    related: ['upload-deliverables', 'submit-work-for-approval', 'understand-task-statuses'], keywords: [l('staff revision request update resubmit changes', '员工 修订 请求 更新 重新提交 修改')],
  }),
  makeTutorial({
    id: 'report-a-blocker', category: 'task-management', roles: ['staff'],
    title: l('How to report a blocker', '如何报告阻塞'),
    summary: l('Make a blocked task visible with enough context for the HOD to help.', '让阻塞任务可见，并提供足够背景让部门主管协助。'),
    outcome: l('You will report the missing dependency, decision, or resource without silently changing the task.', '您将报告缺少的依赖、决定或资源，而不会静默更改任务。'),
    before: [l('Open the blocked task and identify what is preventing progress.', '打开被阻塞任务，明确阻碍进度的原因。')],
    steps: [l('Add a comment in Comments & Updates that states the blocker, impact, and help needed.', '在“评论与更新”中说明阻塞、影响和需要的帮助。'), l('Use the task’s help or blocker action when it is available in your role-specific workbench.', '角色工作台提供时，使用任务中的求助或阻塞操作。'), l('Include a decision date or dependency owner when known.', '知道时，写明决策日期或依赖负责人。'), l('Watch Inbox for the response and keep the task progress honest.', '关注收件箱中的回复，并保持任务进度真实。')],
    rules: [l('Reporting a blocker does not automatically change the status, deadline, or assignee.', '报告阻塞不会自动更改状态、截止日期或负责人。')],
    problems: [l('If the blocker is caused by an unclear brief, ask the HOD or Project Manager for clarification rather than editing the original requirement yourself.', '如果阻塞来自不清晰的简报，请向部门主管或项目经理请求澄清，不要自行修改原始要求。')],
    related: ['add-task-comments', 'update-task-progress', 'read-notifications'], keywords: [l('blocker help request dependency staff', '阻塞 求助 请求 依赖 员工')],
  }),
  makeTutorial({
    id: 'track-completed-tasks', category: 'reports-monitoring', roles: ['staff'],
    title: l('How to track completed tasks', '如何跟踪已完成任务'),
    summary: l('Find your completed work and understand which result is visible to the client.', '查找已完成工作，并了解哪些结果对客户可见。'),
    outcome: l('You will use completed history for handoff context without reopening or editing protected work.', '您将使用已完成历史了解交接背景，而不会重新打开或编辑受保护的工作。'),
    before: [l('You must have access to the completed task history.', '您必须有权访问已完成任务历史。')],
    steps: [l('Open All work or Reports.', '打开“全部工作”或“报表”。'), l('Filter or search for completed work and review the completion date.', '筛选或搜索已完成工作，并查看完成日期。'), l('Open a task to read its final comments, files, and approval history.', '打开任务，查看最终评论、文件和审批历史。'), l('Use Delivery tracker when you need client-facing delivery context.', '需要客户可见交付背景时，使用“交付跟踪”。')],
    rules: [l('Completed work is protected; ask the authorised reviewer or Project Manager about a revision path.', '已完成工作受到保护；需要修改时，请向授权审核人或项目经理询问修订路径。')],
    problems: [l('If a completed item is missing, check your assigned scope and report visibility before assuming the record was deleted.', '如果找不到已完成项目，请先检查分配范围和报表可见性，不要直接认为记录已删除。')],
    related: ['view-reports', 'review-client-deliverables', 'understand-task-statuses'], keywords: [l('staff completed history finished tasks delivery', '员工 已完成 历史 完成 任务 交付')], searchTerms: [l('completed tasks finished work history closed work', '已完成任务 完成的工作 历史记录 已结束工作')],
  }),

  makeTutorial({
    id: 'access-client-workspace', category: 'client-review', roles: ['client'],
    title: l('How to access the client workspace', '如何访问客户工作区'),
    summary: l('Start from Home or Deliveries to see the work published for your company.', '从“首页”或“交付”开始，查看为您公司发布的工作。'),
    outcome: l('You will know where client-visible projects, tasks, deliveries, and feedback live.', '您将知道客户可见的项目、任务、交付和反馈在哪里。'),
    before: [l('You must be signed in with the approved client account.', '您必须使用已批准的客户账户登录。')],
    steps: [l('Open Home to see the client-visible overview.', '打开“首页”查看客户可见概览。'), l('Open Deliveries to see the company’s visible delivery work.', '打开“交付”查看公司可见的交付工作。'), l('Select a task or delivery to read the shared brief, files, comments, and review state.', '选择任务或交付，查看共享简报、文件、评论和审核状态。'), l('Use Reports for client-visible timing information when it is available.', '有可用时，使用“报表”查看客户可见时间信息。')],
    rules: [l('Client access is limited to published client-visible information for the linked company.', '客户访问仅限于关联公司已发布的客户可见信息。')],
    problems: [l('If a project or delivery is missing, the agency may not have published it yet. Contact your agency contact instead of requesting internal access.', '如果缺少项目或交付，机构可能尚未发布。请联系机构联系人，不要申请内部访问。')],
    related: ['view-shared-projects', 'track-delivery-progress', 'leave-feedback'], keywords: [l('client workspace home deliveries access', '客户 工作区 首页 交付 访问')],
    guide: [guideStep('dashboard', 'dashboard-overview', '/', 'Start at your client workspace', '从客户工作区开始', 'Only client-visible work is shown here.', '这里只显示客户可见工作。'), guideStep('clients', 'clients-overview', '/clients', 'Open Deliveries', '打开交付', 'Use Deliveries to follow shared work and review signals.', '使用“交付”跟进共享工作和审核提示。')],
  }),
  makeTutorial({
    id: 'view-shared-projects', category: 'client-review', roles: ['client'],
    title: l('How to view shared projects', '如何查看共享项目'),
    summary: l('Find the projects and services your agency has made visible to your company.', '查找机构为您公司设置为可见的项目和服务。'),
    outcome: l('You will understand project scope without seeing internal pricing, notes, or team assignment details.', '您将了解项目范围，而不会看到内部价格、备注或团队分配详情。'),
    before: [l('The agency must have published the project or delivery view.', '机构必须已发布项目或交付视图。')],
    steps: [l('Open Deliveries or the client-visible company workspace.', '打开“交付”或客户可见的公司工作区。'), l('Select the company or project card that is visible to your account.', '选择账户可见的公司或项目卡片。'), l('Read the shared services, delivery dates, and client-visible tasks.', '查看共享服务、交付日期和客户可见任务。'), l('Open a task when you need to review a submitted deliverable or leave feedback.', '需要审核提交成果或留下反馈时，打开任务。')],
    rules: [l('Internal service prices, internal notes, and team-only assignments remain private.', '内部服务价格、内部备注和团队内部任务分配保持私密。')],
    problems: [l('If a project is not visible, ask the agency to publish or share it; do not ask for an internal role.', '如果项目不可见，请机构发布或共享；不要申请内部角色。')],
    related: ['access-client-workspace', 'review-client-deliverables', 'track-delivery-progress'], keywords: [l('client project shared visible services', '客户 项目 共享 可见 服务')],
  }),
  makeTutorial({
    id: 'review-client-deliverables', category: 'client-review', roles: ['client'],
    title: l('How to review submitted deliverables', '如何审核提交的交付成果'),
    summary: l('Check the shared file, delivery context, and approval point before responding.', '回复前检查共享文件、交付背景和批准节点。'),
    outcome: l('You will know whether to approve the deliverable or request a change.', '您将知道应批准交付成果还是请求修改。'),
    before: [l('A deliverable must be published and ready for client review.', '交付成果必须已发布并准备好供客户审核。')],
    steps: [l('Open Deliveries and select the submitted task or deliverable.', '打开“交付”，选择已提交的任务或交付成果。'), l('Read the visible brief, comments, expected date, and available files.', '阅读可见简报、评论、预计日期和可用文件。'), l('Download or open the shared deliverable when you need to inspect it.', '需要检查时，下载或打开共享交付成果。'), l('Choose Approve when it meets the agreed outcome, or use Request changes with a clear note.', '符合约定结果时选择“批准”；需要修改时使用“请求更改”并写清说明。')],
    rules: [l('Client review actions affect the client approval record, not internal team permissions.', '客户审核操作影响客户批准记录，不会改变内部团队权限。')],
    problems: [l('If Approve or Request changes is unavailable, the deliverable may not yet be published or may not be at the client review stage.', '如果“批准”或“请求更改”不可用，交付成果可能尚未发布，或尚未进入客户审核阶段。')],
    related: ['leave-feedback', 'request-changes', 'approve-deliverables'], keywords: [l('client review submitted deliverable approve file', '客户 审核 提交 交付成果 批准 文件')],
    guide: [guideStep('clients', 'clients-overview', '/clients', 'Open shared deliveries', '打开共享交付', 'Choose a submitted item yourself. The guide will not approve client work.', '自行选择已提交项目。教程不会替您批准客户工作。'), guideStep('delivery-review', 'delivery-review', undefined, 'Find the review point', '查找审核节点', 'Read the visible result and choose the appropriate feedback action yourself.', '阅读可见成果，并自行选择合适的反馈操作。')],
  }),
  makeTutorial({
    id: 'download-deliverables', category: 'client-review', roles: ['client'],
    title: l('How to download available deliverables', '如何下载可用的交付成果'),
    summary: l('Open the file the agency has shared for your company and save it for review.', '打开机构为您公司共享的文件，并保存以供审核。'),
    outcome: l('You will know which files are client-visible and where to find them.', '您将知道哪些文件对客户可见，以及在哪里找到它们。'),
    before: [l('The agency must have shared a downloadable file or secure file link.', '机构必须已共享可下载文件或安全文件链接。')],
    steps: [l('Open the relevant delivery or task.', '打开相关交付或任务。'), l('Find the shared file or secure download link in the visible deliverables area.', '在可见的交付成果区域找到共享文件或安全下载链接。'), l('Open or download the file using the provided control.', '使用提供的控件打开或下载文件。'), l('Return to the task to leave feedback or approve after review.', '审核后返回任务留下反馈或批准。')],
    rules: [l('A file not published to the client view remains internal.', '未发布到客户视图的文件仍属于内部文件。')],
    problems: [l('If the link is invalid or missing, ask the agency contact to publish a corrected deliverable.', '如果链接无效或缺失，请机构联系人发布修正后的交付成果。')],
    related: ['review-client-deliverables', 'leave-feedback'], keywords: [l('client download file deliverable shared link', '客户 下载 文件 交付成果 共享 链接')],
  }),
  makeTutorial({
    id: 'leave-feedback', category: 'client-review', roles: ['client'],
    title: l('How to leave feedback on a task', '如何在任务上留下反馈'),
    summary: l('Put feedback beside the shared work so the agency can act on it.', '将反馈放在共享工作旁边，让机构可以据此行动。'),
    outcome: l('You will leave a clear client-visible comment without exposing internal notes.', '您将留下清晰的客户可见评论，而不会暴露内部备注。'),
    before: [l('You must be able to view and comment on the client-visible task.', '您必须能够查看并评论客户可见任务。')],
    steps: [l('Open the task from Deliveries.', '从“交付”打开任务。'), l('Scroll to Feedback & Updates.', '滚动到“反馈与更新”。'), l('Describe what is approved, what needs clarification, or what should change.', '说明哪些内容已认可、哪些需要澄清或哪些需要修改。'), l('Choose Send comment and check that the feedback appears in the activity area.', '选择“发送评论”，确认反馈出现在活动区域。')],
    rules: [l('Client comments are limited to the client-visible task and do not expose internal activity.', '客户评论仅限于客户可见任务，不会暴露内部活动。')],
    problems: [l('If comments are unavailable, the agency may not have opened the client feedback stage yet.', '如果无法评论，机构可能尚未开启客户反馈阶段。')],
    related: ['request-changes', 'review-client-deliverables', 'add-task-comments'], keywords: [l('client feedback comment review task', '客户 反馈 评论 审核 任务')],
  }),
  makeTutorial({
    id: 'request-changes', category: 'client-review', roles: ['client'],
    title: l('How to request changes to a deliverable', '如何请求修改交付成果'),
    summary: l('Send a focused client review request when the shared result needs changes.', '共享成果需要修改时，发送明确的客户审核请求。'),
    outcome: l('You will request changes through the visible review action instead of creating an internal task.', '您将通过可见审核操作请求修改，而不是创建内部任务。'),
    before: [l('The task must be ready for client review and show Request changes.', '任务必须准备好供客户审核，并显示“请求更改”。')],
    steps: [l('Open the submitted deliverable.', '打开已提交的交付成果。'), l('Write a clear note describing the requested change in the feedback field.', '在反馈字段中写清需要修改的内容。'), l('Choose Request changes and wait for the confirmation.', '选择“请求更改”，等待确认。'), l('Check the updated review state and wait for the agency’s next submission.', '查看更新后的审核状态，等待机构下一次提交。')],
    rules: [l('Request changes affects the client review record and does not expose internal workflow controls.', '“请求更改”会影响客户审核记录，但不会暴露内部工作流程控件。')],
    problems: [l('If the action is unavailable, the agency may need to publish the deliverable or move it to the client review stage.', '如果操作不可用，机构可能需要先发布交付成果，或将其移到客户审核阶段。')],
    related: ['leave-feedback', 'review-client-deliverables', 'track-delivery-progress'], keywords: [l('client request changes reject deliverable feedback', '客户 请求修改 拒绝 交付成果 反馈')], searchTerms: [l('request changes ask for revision client feedback', '请求修改 申请修订 客户反馈')],
  }),
  makeTutorial({
    id: 'approve-deliverables', category: 'client-review', roles: ['client'],
    title: l('How to approve a deliverable', '如何批准交付成果'),
    summary: l('Record client approval when the shared deliverable meets the agreed outcome.', '共享交付成果符合约定结果时，记录客户批准。'),
    outcome: l('You will understand the client approval action and its effect on the visible review record.', '您将了解客户批准操作及其对可见审核记录的影响。'),
    before: [l('The deliverable must be published and ready for client review.', '交付成果必须已发布并准备好供客户审核。')],
    steps: [l('Open Deliveries and select the ready deliverable.', '打开“交付”，选择准备好的交付成果。'), l('Review the visible files, comments, and result.', '查看可见文件、评论和成果。'), l('Add an optional approval note if the team needs context.', '需要时添加可选批准说明。'), l('Choose Approve and verify the approval status is shown.', '选择“批准”，确认显示批准状态。')],
    rules: [l('Client approval is separate from internal HOD approval and does not reveal internal review controls.', '客户批准独立于内部部门主管批准，不会显示内部审核控件。')],
    problems: [l('If Approve is unavailable, wait for the agency to publish the deliverable or ask the agency contact about the current stage.', '如果“批准”不可用，请等待机构发布交付成果，或向机构联系人询问当前阶段。')],
    related: ['review-client-deliverables', 'request-changes', 'track-delivery-progress'], keywords: [l('client approve final deliverable approval', '客户 批准 最终 交付成果 批准')], searchTerms: [l('approve delivery approve deliverable sign off', '审核交付 批准交付 交付审批 确认交付')],
    guide: [guideStep('clients', 'clients-overview', '/clients', 'Open Deliveries', '打开交付', 'Choose the deliverable yourself. The guide never approves it for you.', '自行选择交付成果。教程不会替您批准。'), guideStep('delivery-review', 'delivery-review', undefined, 'Review before approving', '批准前先审核', 'Check the shared result and choose Approve only when it meets the agreed outcome.', '检查共享成果，只有符合约定结果时才选择“批准”。')],
  }),
  makeTutorial({
    id: 'track-delivery-progress', category: 'service-delivery', roles: ['admin', 'projectManager', 'hod', 'staff', 'client'],
    title: l('How to track delivery progress', '如何跟踪交付进度'),
    summary: l('Follow client work across periods, tasks, deliverables, and visible statuses.', '按周期、任务、交付成果和可见状态跟进客户工作。'),
    outcome: l('You will understand whether a delivery is open, overdue, completed, or waiting for review.', '您将了解交付是开放、逾期、已完成还是等待审核。'),
    before: [l('You need Delivery tracker access or client workspace access.', '您需要交付跟踪或客户工作区访问权限。')],
    steps: [l('Open Delivery tracker or Deliveries.', '打开“交付跟踪”或“交付”。'), l('Choose Week, Month, or All work as the reporting period.', '选择“周”“月”或“全部工作”作为查看周期。'), l('Search for a company, task, service, or deliverable when the list is large.', '列表较大时，搜索公司、任务、服务或交付成果。'), l('Use Open work, Overdue, or Completed filters to focus the review.', '使用“开放工作”“逾期”或“已完成”筛选，聚焦审核。'), l('Open a task or cycle for the detailed status and next action.', '打开任务或周期，查看详细状态和下一步操作。')],
    rules: [l('Client views contain client-visible work only; internal users see the scope allowed by their role.', '客户视图只包含客户可见工作；内部用户看到角色允许的范围。')],
    problems: [l('No visible cycle may mean the agency has not published a service cycle for that period.', '没有可见周期可能表示机构尚未发布该时间段的服务周期。')],
    related: ['review-service-cycles', 'review-client-deliverables', 'identify-overdue-tasks'], keywords: [l('delivery progress cycle deliverable status tracker', '交付 进度 周期 交付成果 状态 跟踪')],
    guide: [guideStep('clients', 'clients-overview', '/clients', 'Open the delivery tracker', '打开交付跟踪', 'Use period and status filters to understand the visible delivery queue.', '使用周期和状态筛选了解可见交付队列。'), guideStep('delivery-search', 'delivery-search', undefined, 'Search delivery work', '搜索交付工作', 'Search is read-only until you explicitly open a task.', '搜索本身只读，只有您主动打开任务后才会进入详情。')],
  }),
  makeTutorial({
    id: 'review-service-cycles', category: 'service-delivery', roles: ['admin', 'projectManager', 'hod', 'client'],
    title: l('How to review service cycles and deliverables', '如何查看服务周期和交付成果'),
    summary: l('Understand what was planned for a cycle and what has been delivered.', '了解某个周期计划了什么，以及已经交付了什么。'),
    outcome: l('You will connect plan scope, cycle status, deliverables, and linked task work.', '您将把方案范围、周期状态、交付成果和关联任务联系起来。'),
    before: [l('A service plan or cycle must be visible to your role.', '您的角色必须可以看到服务方案或周期。')],
    steps: [l('Open the company Services workspace or Delivery tracker.', '打开公司的“服务”工作区或“交付跟踪”。'), l('Choose the relevant cycle or reporting period.', '选择相关周期或查看时间段。'), l('Read the cycle dates, status, planned deliverables, and progress summary.', '查看周期日期、状态、计划交付成果和进度摘要。'), l('Open linked task work when you need to inspect the delivery evidence.', '需要检查交付证据时，打开关联任务。')],
    rules: [l('Draft cycles are not the same as published client-visible delivery.', '草稿周期不等于已发布的客户可见交付。'), l('Internal users may see plan controls that clients do not.', '内部用户可能看到客户看不到的方案控件。')],
    problems: [l('If a cycle is missing, check the selected period and whether the plan or cycle has been published.', '如果缺少周期，请检查所选时间段，以及方案或周期是否已发布。')],
    related: ['manage-service-plans', 'track-delivery-progress', 'review-client-deliverables'], keywords: [l('service cycle planned deliverables published status', '服务周期 计划 交付成果 发布 状态')],
  }),
];

export const getLocalizedCopy = (copy: LocalizedCopy, locale: AppLocale) => copy[locale === 'zh' ? 'zh' : 'en'];

export const getTutorialCategory = (id: TutorialCategoryId) => tutorialCategories.find(category => category.id === id);

export const getVisibleTutorials = (persona: OnboardingPersona) => tutorials.filter(tutorial => tutorial.roles.includes('all') || tutorial.roles.includes(persona));

export const searchTutorials = (items: Tutorial[], query: string, locale: AppLocale) => {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return items;
  const tokens = normalized.match(/[a-z0-9]+|[\u3400-\u9fff]+/gi) || [normalized];
  const score = (tutorial: Tutorial) => {
    const fields = [
      tutorial.title,
      tutorial.summary,
      tutorial.outcome,
      ...(tutorial.searchTerms || []),
      ...tutorial.keywords,
      ...tutorial.before,
      ...tutorial.steps,
      ...tutorial.rules,
      ...tutorial.problems,
    ];
    const localized = fields.flatMap(copy => [copy.en, copy.zh]);
    const localizedPrimary = fields.map(copy => copy[locale === 'zh' ? 'zh' : 'en']);
    const haystack = localized.join(' ').toLocaleLowerCase();
    const primaryHaystack = localizedPrimary.join(' ').toLocaleLowerCase();
    const exactPhraseBonus = haystack.includes(normalized) ? 8 : 0;
    const primaryPhraseBonus = primaryHaystack.includes(normalized) ? 6 : 0;
    const tokenScore = tokens.reduce((total, token) => total + (haystack.includes(token) ? 2 : 0), 0);
    const titleScore = [tutorial.title.en, tutorial.title.zh].some(title => title.toLocaleLowerCase().includes(normalized)) ? 20 : 0;
    return exactPhraseBonus + primaryPhraseBonus + tokenScore + titleScore;
  };

  return items
    .map((tutorial, index) => ({ tutorial, index, relevance: score(tutorial) }))
    .filter(item => item.relevance > 0)
    .sort((left, right) => right.relevance - left.relevance || left.index - right.index)
    .map(item => item.tutorial);
};

export const getTutorialById = (id: string | null | undefined) => tutorials.find(tutorial => tutorial.id === id);
