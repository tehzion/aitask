# Boss Koo dashboard accuracy — 7 October 2026

The three reproduced calculation discrepancies and the date-refresh issue have now been corrected and verified. The original audit used synthetic data and a fixed local date of 7 October 2026 at 14:00. The implementation remains local; no production data was queried or changed.

## Original reproduced discrepancies

| Display | Observed result | Expected result | Cause |
| --- | --- | --- | --- |
| Agency pulse → Overdue now | An open task due 6 October produces **0**. The same task appears in Needs attention. | **1** overdue task. | `getAgencyPulseMetrics` compares the due date with the start of the work week, rather than the start of today. All tasks that became overdue within the current week are omitted. |
| Overview → Monthly deliverables | With an active plan and only a completed September cycle, the component renders **1/1** delivered with **1–30 September** dates under Monthly deliverables on 7 October. | Indicate that there is no published cycle covering the current period. | `ServiceRoleDashboard` takes the latest Published/Completed cycle by client ID without checking the current date or the active plan ID. |
| Overview → Renewals in 30 days | A contract ending **7 November** is shown as **30 days** away and included. | It is **31 calendar days** from 7 October. | `differenceInDays` calculates full elapsed days from a date-only deadline at midnight to the current time. Use calendar-day distance for date-only contract deadlines. |

Source locations:

- [Overdue calculation](/Users/user/Downloads/aitask-master/src/lib/taskReporting.ts:142).
- [Cycle selection](/Users/user/Downloads/aitask-master/src/components/ServiceRoleDashboard.tsx:105).
- [Renewal calculation](/Users/user/Downloads/aitask-master/src/pages/Dashboard.tsx:190).

## Other accuracy considerations

Before the fix, date-dependent memoized figures had no date dependency or midnight refresh. Boss briefing and team workload could remain stale across a day/week boundary until their data changed or their components remounted. They now use a stable local-day value that refreshes at midnight and when the app regains focus or visibility. Browser checks verified daily and weekly rollover without a task mutation.

Delivered outputs counts all historical Delivered records in scope. Completed all time also includes historical completed tasks without a reliable completion timestamp. Period completion charts use `completedAt`, and intentionally exclude those untracked historical completions. These are different time scopes, so their totals need not match.

The Boss overdue overview and open/completed predicates correctly exclude cancelled/open versus completed work in the reviewed examples. Active clients counts active plans; the activation action currently prevents more than one active plan per client. Contracted monthly value sums stored pricing snapshots for active plans, rather than actual collected payments.

## Original audit verification

- **22 existing tests passed** across task reporting, task completion, work-week boundaries and service-plan lifecycle.
- **Three diagnostic checks passed**, asserting the current incorrect overdue result, the renewal off-by-one, and rendered September cycle content under the monthly heading. The rendering check used the real `ServiceRoleDashboard` component with a synthetic store and server rendering.
- The temporary diagnostic test was removed after verification. It deliberately asserted existing incorrect behavior and should not become a permanent regression expectation.
- Live record completeness, backend sync freshness and production database totals remain unverified. These findings concern the frontend calculations, rather than a claim that current production records are missing or corrupt.

## Implementation and final verification

- Agency pulse now counts every open task due before the start of today, including tasks overdue earlier this week. Completed and cancelled work remain excluded.
- Monthly delivery progress selects a Published/Completed cycle for the active plan and client whose date range covers today. Historical, future, other-plan and draft cycles cannot supply the current progress. Billing cycles spanning months are supported, including both boundary days.
- Renewal counts and days-left labels use calendar-day differences. A contract 30 days away is included, a contract 31 days away is excluded, and invalid or absent dates do not become today.
- [Local-day refresh hook](/Users/user/Downloads/aitask-master/src/hooks/useLocalToday.ts) schedules the next local midnight using calendar arithmetic, catches up on focus/visibility, and cleans up its timer and listeners when unmounted. Overview, service dashboard, Agency pulse and team workload use it; selected member task groups also refresh.
- Weekly fallback statistics now use the existing Monday-to-Saturday reporting range, and personal/recent task predicates use the common open-task rule.

**Verification:** 450 unit tests passed across 66 files; all seven new browser regressions passed. TypeScript, scoped ESLint, translation coverage, production build and whitespace checks passed. The browser suite covers desktop/mobile reconciliation, expired cycles, midnight renewal and billing-cycle turnover, Agency pulse turnover, Monday workload/group reset, suspended-tab recovery through both focus and visibility, and a 23-hour daylight-saving day.

Regression coverage is saved in [dashboard helpers](/Users/user/Downloads/aitask-master/src/lib/dashboardData.test.ts), [task reporting](/Users/user/Downloads/aitask-master/src/lib/taskReporting.test.ts) and [browser flows](/Users/user/Downloads/aitask-master/e2e/dashboard-accuracy.spec.ts). No database migration, deployment or production-record mutation was needed. Production totals still require live reconciliation before asserting that every business record is complete.

A subsequent [follow-through audit](/Users/user/Downloads/aitask-master/docs/dashboard-followthrough-audit-2026-10-07.md) fixed overdue navigation, relative task-period refresh, report rollover, completed-task labels/styling and the detailed company-cycle summary. The company operations caller explicitly allows current draft cycles for internal planning; dashboard/client defaults remain limited to Published/Completed cycles.
