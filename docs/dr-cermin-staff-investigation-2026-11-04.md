# Dr Cermin cycle and Staff permission investigation

Production was inspected read-only on 4 November 2026. No production business
records were changed and no fix was deployed.

Dr Cermin's active September plan was created at 12:14 MYT on 4 November,
with nextCycleStart 16 October; its only existing cycle covers 16 September–15
October. The daily cycle cron runs at 00:05 Asia/Kuala_Lumpur and last succeeded
at 00:05 on 4 November, before this plan existed. Thus the first opportunity for
the daily catch-up is 00:05 on 5 November; its outcome remains to be observed.
The October revision currently has status Draft and revisionScheduleStatus
`draft`, effective date 16 November, and last changed at 17:31:50 MYT. Audit
records identify the actor and changes but do not contain old/new values, so
they do not establish why or when it returned from scheduled to draft. It must
be reviewed and explicitly scheduled after verifying its billing boundary;
a Draft is not guaranteed to activate on 16 November.

The JEAN YIP task is assigned to Gan khuan. The production permission helpers,
evaluated read-only with the Staff identity, report can_view and can_edit true
for its current state. The task is now Waiting Approval; audit records show
Ting Ting performed the status changes at 15:21:42 and 15:23:11 MYT. This is
not evidence Gan khuan's action succeeded. The production PostgREST logs had
timeout messages around the screenshot's time, but do not identify the user's
specific error or establish its cause. Gan khuan's authenticated UI and exact
button remain necessary to reproduce the reported denial; the current task is
no longer in the screenshot's In Progress state.

Local, rollback-only pgTAP checks passed 95 assertions across revision
scheduling, renewal integrity, task stage progress, staff command authorization,
staff workflow recovery, and workflow guards. Three targeted Vitest files
passed 53 tests. These use local or mocked data, not a production login. No
schema or application change was made because the specific denial and reason
for the revision's status change have not been reproduced.
