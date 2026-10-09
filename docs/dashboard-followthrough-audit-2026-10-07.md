# Dashboard follow-through audit — 7 October 2026

Five additional gaps were fixed after the main dashboard accuracy changes. The fixes remain local and uncommitted; production data and deployments were not changed.

| Gap | Previous behavior | Correction |
| --- | --- | --- |
| Overdue drilldown and quick filter | A Completed task with an old false completion flag, or a task with an invalid deadline, could appear as overdue. The quick Overdue button also used an inclusive date cutoff that admitted due-today and closed work. | Both entry points use a shared open-task/valid-deadline predicate. Quick filters clear contradictory date periods while retaining other URL scope. |
| Relative task periods | A Today or This week task page retained its initial date bounds across midnight or Monday. | The date bounds and task filtering depend on the local-day hook. The quick Today button uses the relative Today route rather than a permanently captured date. |
| Reports | Outcome totals and the four-week cohort window retained their initial date until task data or locale changed. | Reports refresh their date-dependent calculation at the local day boundary. |
| Completed-task presentation | A historical Completed task with a false completion flag could have red overdue styling or a day-overdue label. | Row styling and due labels honor the common completion rule: the flag or Completed status closes the task. |
| Company operations progress | The detailed company workspace chose the latest cycle regardless of its plan or dates. A future cycle could replace the current one. | The selected cycle belongs to the displayed plan and covers today. Current draft cycles remain visible for internal planning; client/dashboard callers continue to require Published or Completed cycles. The company view also refreshes at midnight. |

Implementation is in [Tasks](/Users/user/Downloads/aitask-master/src/pages/Tasks.tsx), [Reports](/Users/user/Downloads/aitask-master/src/pages/Reports.tsx), [OperationsGlance](/Users/user/Downloads/aitask-master/src/components/OperationsGlance.tsx), [company operations](/Users/user/Downloads/aitask-master/src/pages/ClientWorkspace.tsx), [dashboard helpers](/Users/user/Downloads/aitask-master/src/lib/dashboardData.ts), [task reporting](/Users/user/Downloads/aitask-master/src/lib/taskReporting.ts) and [due-date labels](/Users/user/Downloads/aitask-master/src/lib/utils.ts).

## Verification

- All **479 unit tests passed across 69 files** in a frozen copy of the current workspace.
- All **16 distinct browser checks passed**: the seven original dashboard regressions, eight follow-through checks, and Account report visibility/accessibility coverage.
- The isolated server initially blocked fonts resolved through its linked dependency directory. After allowing that dependency directory, completion presentation, both company-cycle checks, and desktop/mobile report accessibility passed again with normal fonts loaded.
- TypeScript, scoped ESLint, translation coverage, production build and whitespace checks passed.
- Own implementation and test files were compared byte-for-byte against the verified snapshot.

The initial shared-workspace run encountered test-data drift while other source edits were in progress. A later unit run also saw two newly introduced client-notification assertions fail; the frozen current source passed both along with the full suite. Final verification used a copied workspace with hot reload disabled and a separate dependency cache. The snapshot excluded environment files and used the local backend with synthetic records.

Regression cases are retained in [browser coverage](/Users/user/Downloads/aitask-master/e2e/dashboard-followthrough.spec.ts), [task reporting tests](/Users/user/Downloads/aitask-master/src/lib/taskReporting.test.ts), [due-label tests](/Users/user/Downloads/aitask-master/src/lib/utilsDueDate.test.ts) and [cycle-selection tests](/Users/user/Downloads/aitask-master/src/lib/dashboardData.test.ts).

Other client-role changes already present in the workspace were preserved. In particular, the existing `canOpenServiceClient` project-scope argument in `ClientWorkspace.tsx` is separate from this audit's cycle/date changes.

## Remaining verification

The fixes establish consistent frontend calculations and navigation for the tested flows. Live production record completeness, RLS-visible totals and backend freshness still need reconciliation against an authenticated production session before claiming that every displayed business total is complete. The previously observed intermittent task Escape/logout timeout was not independently diagnosed by this follow-up.
