import type { LocalizedCopy } from './tutorials';

export interface WorkflowGuideStage {
  id: string;
  role: LocalizedCopy;
  title: LocalizedCopy;
  action: LocalizedCopy;
  outcome: LocalizedCopy;
  tutorialId: string;
}

export interface WorkflowGuide {
  id: string;
  title: LocalizedCopy;
  summary: LocalizedCopy;
  stages: WorkflowGuideStage[];
  rules: LocalizedCopy[];
}

const copy = (en: string, zh: string): LocalizedCopy => ({ en, zh });

export const workflowGuides: WorkflowGuide[] = [
  {
    id: 'website-design-project',
    title: copy('Website Design Project', '网站设计项目'),
    summary: copy('A practical handoff from project scope to client review.', '从项目范围到客户审核的实际交接流程。'),
    stages: [
      { id: 'pm', role: copy('Project Manager', '项目经理'), title: copy('Set the scope', '设定范围'), action: copy('Create the project and task brief, dates, department, and review expectation.', '创建项目和任务简报、日期、部门及审核要求。'), outcome: copy('The department receives work with enough context to start.', '部门收到足够背景的工作。'), tutorialId: 'create-project' },
      { id: 'hod', role: copy('HOD', '部门主管'), title: copy('Accept the department handoff', '接收部门交接'), action: copy('Review the brief, confirm eligibility, and delegate the task to the right staff member.', '检查简报、确认资格，并将任务分配给合适的员工。'), outcome: copy('The task has an accountable staff owner.', '任务有明确的员工负责人。'), tutorialId: 'delegate-task-to-staff' },
      { id: 'staff', role: copy('Staff', '员工'), title: copy('Produce and submit', '制作并提交'), action: copy('Update progress, attach the deliverable, and submit it for approval.', '更新进度、添加交付成果并提交审批。'), outcome: copy('Reviewable evidence is available to the configured reviewer.', '配置的审核人可以看到可审核证据。'), tutorialId: 'submit-work-for-approval' },
      { id: 'review', role: copy('HOD reviewer', '部门主管审核人'), title: copy('Review the submission', '审核提交内容'), action: copy('Check the brief and evidence, then approve or request a revision.', '检查简报和证据，然后批准或请求修订。'), outcome: copy('The work is approved internally or returned with a clear next action.', '工作获得内部批准，或带着明确下一步返回。'), tutorialId: 'review-submitted-work' },
      { id: 'client', role: copy('Client', '客户'), title: copy('Review the shared result', '审核共享成果'), action: copy('Inspect the visible deliverable and approve it or request changes.', '检查可见交付成果，批准或请求修改。'), outcome: copy('Client feedback is recorded without exposing internal controls.', '客户反馈被记录，内部控件不会暴露。'), tutorialId: 'review-client-deliverables' },
    ],
    rules: [copy('Each handoff is permission-aware; the guide never creates, assigns, submits, or approves a record.', '每次交接都受权限控制；教程不会创建、分配、提交或批准记录。')],
  },
  {
    id: 'task-revision',
    title: copy('Task Revision', '任务修订'),
    summary: copy('Keep the review loop explicit when submitted work needs a change.', '提交的工作需要修改时，保持审核循环清晰可追踪。'),
    stages: [
      { id: 'submit', role: copy('Staff', '员工'), title: copy('Submit work', '提交工作'), action: copy('Attach the output and send the task for review.', '添加成果并将任务送审。'), outcome: copy('The reviewer can inspect the current evidence.', '审核人可以检查当前证据。'), tutorialId: 'submit-work-for-approval' },
      { id: 'request', role: copy('Reviewer', '审核人'), title: copy('Request a revision', '请求修订'), action: copy('Describe the exact change needed and use the revision action when available.', '说明需要的具体修改，并在可用时使用修订操作。'), outcome: copy('The next owner knows what must change.', '下一位负责人知道需要修改什么。'), tutorialId: 'request-task-revision' },
      { id: 'update', role: copy('Staff', '员工'), title: copy('Update and resubmit', '更新并重新提交'), action: copy('Address the note, update the work, and submit it again.', '处理说明、更新工作并再次提交。'), outcome: copy('The reviewer receives a new, traceable submission.', '审核人收到新的、可追踪的提交。'), tutorialId: 'respond-to-revision-requests' },
      { id: 'review-again', role: copy('Reviewer', '审核人'), title: copy('Review again', '再次审核'), action: copy('Check the new evidence and approve or request another focused revision.', '检查新证据，批准或再次请求明确修订。'), outcome: copy('The task moves forward only through an allowed workflow transition.', '任务只通过允许的工作流程转换继续前进。'), tutorialId: 'review-submitted-work' },
    ],
    rules: [copy('Revision is permission- and workflow-dependent. Waiting Approval, Approved, Completed, and Cancelled are not presented as generally reopenable.', '修订取决于权限和工作流程。“等待审批”“已批准”“已完成”和“已取消”不会被描述为可以普遍重新打开。')],
  },
  {
    id: 'task-reassignment',
    title: copy('Task Reassignment', '任务重新分配'),
    summary: copy('Move eligible work to the right owner while respecting the assignment lock.', '在尊重分配锁定的前提下，将符合条件的工作交给正确负责人。'),
    stages: [
      { id: 'receive', role: copy('HOD', '部门主管'), title: copy('Receive the task', '接收任务'), action: copy('Open the department task and read its current status, brief, and assignment.', '打开部门任务，查看当前状态、简报和负责人。'), outcome: copy('You know whether the task is eligible for reassignment.', '您知道任务是否可以重新分配。'), tutorialId: 'receive-assigned-tasks' },
      { id: 'eligibility', role: copy('HOD', '部门主管'), title: copy('Check eligibility', '检查资格'), action: copy('Confirm the department and choose an eligible staff member.', '确认部门并选择符合条件的员工。'), outcome: copy('The next owner is valid for the department and workflow.', '下一位负责人符合部门和工作流程要求。'), tutorialId: 'change-assigned-staff' },
      { id: 'reassign', role: copy('HOD', '部门主管'), title: copy('Reassign and confirm', '重新分配并确认'), action: copy('Save the reassignment, then confirm the assignment and notification.', '保存重新分配，然后确认负责人和通知。'), outcome: copy('The task has one clear accountable owner.', '任务有明确的负责人。'), tutorialId: 'delegate-task-to-staff' },
    ],
    rules: [copy('Assignment is allowed in Pending, In Progress, and Revision. It is locked in Waiting Approval, Approved, Completed, and Cancelled.', '“待处理”“进行中”和“修订”允许分配；“等待审批”“已批准”“已完成”和“已取消”锁定分配。')],
  },
];

export const getWorkflowGuideById = (id: string) => workflowGuides.find(guide => guide.id === id);
