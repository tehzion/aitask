# HOD workflow deep dive — 7 October 2026

Reviewed the department workbench, dashboard scopes, task details, delegation, dependency warnings, access helpers, store assignment guards, and checked-in Supabase assignment rules. Changes are local frontend fixes; no database policy, production data, deployment, or account permission was changed.

## Confirmed findings and fixes

| Finding | Fix |
| --- | --- |
| Delegating a task from My assignments removed it from the scope's task array and dismissed its open editor. | Resolve open task details from the authorized visible task set. List scope continues to filter rows independently. |
| A visible department task linked from a notification/bookmark could fail to open when the URL selected My assignments. | Apply access rules to the linked task independently of list scope. Unrelated foreign tasks still fail closed. |
| The Video Editor filter excluded tasks saved with the legacy Editor department name and exposed duplicate department choices. | Normalize filter values, option names, and comparisons with the existing department normalizer. Legacy bookmarked values also work. |
| A hidden predecessor still present in local state suppressed the unavailable-dependency warning. Duplicate dependency IDs could inflate that warning. | Compute unavailable dependencies against authorized visible tasks, deduplicate IDs, and display only a generic count in both detail views. Completed and cancelled tasks do not receive dependency warnings. |
| A dashboard with only Waiting Approval tasks said the department queue was clear. | Display Waiting for review and the waiting count. |
| Workbench deadline buckets stayed cached after the local date changed and the page rerendered. | Include the current local day in queue memo dependencies. This does not add a midnight timer; the queue refreshes on the next render. |

Dashboard Open work links now carry the selected HOD scope into the workbench. Task URL updates retain other active URL filters.

## Validation

- Reproduced the first five scenarios in browser tests before fixing them; all five initially failed at the expected assertions.
- Full unit suite: **423 passed across 62 files**.
- Combined HOD, task-authorization, and Staff save-recovery browser run: **30 passed**.
- Final targeted browser run: **2 passed**, covering hidden dependency warnings in both detail views and a clock-controlled local-day rollover. This brings coverage to 31 distinct browser scenarios across the two successful runs.
- TypeScript, lint, strict translation coverage, production build, whitespace checks, and bundle budgets passed. The validated build's eager JavaScript graph was approximately **299.8 KiB gzip** against the 300 KiB cap.

The assignment review retained the existing limits: same-department delegation requires creator ownership or current assignment plus the management permission; department oversight alone does not grant reassignment; creator ownership remains immutable. These backend conclusions are based on repository rules/tests, not a fresh production query. No local Supabase stack was running, so database suites were not executed during this review.

Other work was being edited concurrently in this shared checkout. This review preserves those changes and does not claim them as HOD fixes.
