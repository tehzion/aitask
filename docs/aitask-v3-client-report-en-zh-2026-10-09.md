# AiTask v3.0 — English & 简体中文

## English version

# AiTask v3.0 — Client Feature and Improvement Report

**Report date:** 9 October 2026

AiTask v3 brings clearer delivery visibility, more dependable daily workflows,
and improved reporting for clients and the team serving them. The update
consolidates task management, company records, service plans, delivery reviews,
and role-based workspaces into a more consistent experience.

## Features available in v3

| Feature | What it provides | Benefit |
| --- | --- | --- |
| Client workspace | Home, Services, Deliveries, delivery tracking, and Reports in one workspace. | Review service progress and outstanding actions more easily. |
| Delivery review and approval | Feedback, approval notes, review history, and a full count of pending reviews. | Understand what needs attention and keep a record of decisions. |
| Service plan and cycle visibility | Current delivery progress follows the selected plan and current delivery period; past and upcoming cycles remain available. | Separate today's commitments from future planning. |
| Delivery tracking and search | Search and period filters narrow the displayed work and recalculate totals. | Find relevant work and assess its progress without misleading totals. |
| Client reports and CSV exports | Completion dates, client approval dates, review stages, and an explained on-time completion metric. | Distinguish agency delivery performance from the timing of client approval. |
| Company and project management | Linked company profiles, project identity, ownership, contacts, service plans, and editable lifecycle dates. | Keep operational records connected and easier to maintain. |
| Role-based workspaces | Project Managers work across their portfolios, HODs coordinate department work, and Staff focus on assigned responsibilities. | Give each team member a clearer view of the work they manage. |
| English and Simplified Chinese interface | Broader translation coverage across navigation, forms, statuses, notifications, and reporting. | Support everyday work in the preferred interface language. |

## What we improved

### More reliable saves and recovery

Task edits, company changes, approvals, and feedback retain drafts more
consistently when a save is interrupted. Retry and reload recovery also protect
newer edits made while a previous request is still completing. Mixed saves keep
their ordered changes together, and uncertain responses are reconciled with
saved results to reduce duplicate actions and unnecessary re-entry.

Company deletion and ownership updates have improved recovery and clearer
handling of uncertain outcomes. Success messages follow confirmed results.

### Clearer client reviews

Delivery details opened from the tracker use the same review experience as the
Deliveries page. Feedback and approval notes are validated before submission,
and recoverable drafts are scoped to the relevant account and delivery.
Outstanding reviews remain visible across reporting periods.

Client-facing stage labels now reflect the review process. Reports and CSV
exports separate agency completion from client approval, and client exports
exclude internal assignee and department details.

### More accurate dashboards, dates, and reporting

Overdue totals and their linked work lists follow a consistent rule: completed
and cancelled tasks are excluded, and invalid deadlines do not count as overdue.
Staff metrics follow assigned work and stable company identities.

Daily views, calendars, workload figures, renewal summaries, and delivery
tracking refresh at local midnight and when an inactive tab resumes. Calendar
validation rejects impossible deadlines, while plan, project, and add-on date
defaults use local dates. Current delivery summaries keep the current period
visible when future cycles are published.

### Better team coordination and administration

Project Manager portfolio management, task reassignment, HOD delegation, and
Staff task updates have more consistent permissions and save behavior. Dependency
warnings help identify blocked work while respecting access boundaries.

Administrators can manage default role permission templates, with protected
account-management controls reserved for the Super Admin. Permission refreshes
are handled more carefully during active edits. Notifications are directed to
the relevant recipients rather than unrelated team members.

Member onboarding now records a stable request and saves membership, registration
approval, and worker type together. Recovery preserves prepared accounts when a
successful response is lost, reducing the risk of onboarding leaving an account
without a working login.

### A smoother everyday interface

Search behavior, responsive reporting, keyboard navigation, touch controls, and
Simplified Chinese coverage are more consistent. The installable web app has
improved recovery from stale files after an update. Startup code loads selected
features on demand, and the current build passes the existing bundle-size limits.

## Validation performed

- The current source build passed TypeScript compilation, bundle-size checks,
  and static installable-web-app checks.
- Supabase rollout validation passed 578 database assertions, plus real local
  Storage, authenticated Staff/HOD saves, and onboarding recovery checks.
- The hosted database passed 15 onboarding assertions. Anonymous access
  restrictions and invitation endpoint JWT rejection checks passed.
- Existing production member and workspace data matched the rollout baseline.

## Recommended first use

1. Open the Client workspace and review the pending delivery count.
2. Check the current service plan and delivery period.
3. Submit feedback or approval from the delivery review panel.
4. Use Reports to compare recorded completion and approval dates, or export CSV.
5. For internal teams, review portfolio or department queues and role permissions.

V3's practical focus is dependable daily work: clearer responsibilities,
less re-entry after interrupted saves, and delivery information that is easier
to review and act on.

---

## 简体中文版本

# AiTask v3.0 — 客户功能与改进报告

**报告日期：** 2026年10月9日

AiTask v3 提供更清晰的交付进度、更稳定的日常工作流程，以及更完善的客户和团队报表。本次更新将任务管理、公司资料、服务计划、交付审核和角色工作区整合为更一致的使用体验。

## v3 功能概览

| 功能 | 提供的内容 | 使用价值 |
| --- | --- | --- |
| 客户工作区 | 在同一工作区查看首页、服务、交付、交付追踪和报表。 | 更方便地了解服务进度及待处理事项。 |
| 交付审核与批准 | 提交反馈、填写批准备注、查看审核历史及完整的待审核数量。 | 明确需要处理的交付，并保留决策记录。 |
| 服务计划与周期展示 | 当前交付进度对应所选计划及当前交付周期，同时保留历史和未来周期。 | 清楚区分当前交付安排与未来计划。 |
| 交付追踪与搜索 | 搜索和周期筛选会同步更新显示的工作及统计总数。 | 更准确地查找相关工作并评估进度。 |
| 客户报表与 CSV 导出 | 展示完成日期、客户批准日期、审核阶段，以及有明确说明的按时完成率。 | 区分服务团队的交付表现与客户批准时间。 |
| 公司与项目管理 | 关联公司资料、项目、负责人、联系人、服务计划及可编辑的相关日期。 | 保持业务资料之间的关联，方便维护。 |
| 按角色划分的工作区 | 项目经理管理负责的项目组合，部门主管协调部门工作，员工专注于分配给自己的任务。 | 让每位成员更清楚自己的工作范围。 |
| 英文与简体中文界面 | 导航、表单、状态、通知和报表的翻译覆盖更完整。 | 支持使用熟悉的语言开展日常工作。 |

## 本次改进

### 更可靠的保存与恢复

任务编辑、公司资料修改、审批和反馈在保存中断时，能够更稳定地保留草稿。重试及重新加载后的恢复机制，也会保护用户在上一笔请求尚未完成时继续输入的新内容。涉及多项操作的保存会保留修改顺序，并核对已经保存的结果，减少重复操作和重新填写。

公司删除及负责人更新的恢复流程也得到改善。当操作结果暂时无法确认时，系统会更清楚地处理这一状态；成功提示以已确认的结果为依据。

### 更清晰的客户审核体验

从交付追踪页面打开详情时，客户会使用与交付页面一致的审核界面。反馈和批准备注会在提交前进行校验，可恢复的草稿会对应到具体账号和交付项目。跨报表周期仍未完成的审核会继续显示。

客户看到的阶段标签更贴合实际审核流程。报表及 CSV 导出分别展示服务团队完成日期和客户批准日期，客户导出内容不包含内部执行人员及部门资料。

### 更准确的仪表板、日期与报表

逾期统计与对应的任务列表使用一致的规则：已完成和已取消的任务不计入逾期，无效截止日期也不会被当作逾期。员工统计依据实际分配的工作及固定的公司标识，减少因名称变化造成的统计偏差。

每日视图、日历、工作量、续期摘要和交付追踪会在本地时间跨日，以及重新切回闲置页面时更新。日历会拒绝不存在的截止日期，服务计划、项目和附加服务的默认日期采用本地日期。即使提前发布未来周期，当前交付摘要仍会保持当前周期可见。

### 更顺畅的团队协作与管理

项目经理的项目组合管理、任务重新分配、部门主管的任务委派，以及员工的任务更新，采用更一致的权限与保存逻辑。任务依赖提示有助于识别受阻工作，同时遵守访问权限边界。

管理员可管理默认角色权限模板，受保护的账号管理权限仍由超级管理员掌握。系统在用户编辑期间更谨慎地处理权限刷新，并将通知发送给相关人员，减少无关通知。

成员开户流程会记录可重复核对的请求，并将成员资料、注册审批状态和用工类型一并保存。即使成功响应在网络传输中丢失，恢复机制也会保留已准备好的账号，降低开户后无法正常登录的风险。

### 更顺畅的日常界面

搜索、适配不同屏幕的报表、键盘导航、触控操作和简体中文覆盖更加一致。可安装的网页应用改善了更新后旧文件失效时的恢复体验。部分功能采用按需加载，当前构建也通过了既定的代码包体积检查。

## 已完成的验证

- 当前源码构建通过 TypeScript 编译、代码包体积检查及可安装网页应用的静态检查。
- Supabase 上线验证通过 578 项数据库断言，并通过真实本地存储、已登录员工及部门主管的保存操作，以及开户恢复检查。
- 托管数据库通过 15 项开户断言；匿名访问限制及邀请接口对无效 JWT 的拒绝检查均通过。
- 现有生产环境的成员及工作区数据与上线前基准一致。

## 建议首次使用步骤

1. 打开客户工作区，查看待审核交付数量。
2. 确认当前服务计划及交付周期。
3. 在交付审核面板提交反馈或批准。
4. 使用报表比较记录的完成日期和批准日期，或导出 CSV。
5. 内部团队可检查项目组合或部门任务队列，并确认角色权限。

V3 着重提升日常工作的可靠性：职责更清晰、保存中断后减少重新填写，以及更容易查看和处理交付信息。
