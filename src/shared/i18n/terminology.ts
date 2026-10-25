/**
 * Product terminology for Simplified Chinese. Keep the context distinction
 * explicit: client-facing review is 审阅, internal review is 审核, and the
 * approval workflow/action is 审批.
 */
export const zhTerminology = {
  review: { client: '审阅', internal: '审核', approval: '审批' },
  revision: '修订',
  client: '客户',
  company: '公司',
  package: '配套',
  plan: '方案',
  workspace: '工作区',
  deliverable: '交付物',
  formalAddress: '您',
} as const;
