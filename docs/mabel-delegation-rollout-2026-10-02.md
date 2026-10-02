# Mabel assigned-task delegation — 2 October 2026

Applied the existing repository migration `20260930110000_hod_assigned_task_delegation` to production project `ohjhwyiffgzyatcmmdql`. The connector recorded generated version `20261002064719`; do not rewrite migration history or replay this migration based only on its local timestamp.

The database now matches the current interface: a department-scoped HOD with `manageCreatedTasks` can delegate a task assigned to them. Creator ownership stays immutable, and valid-assignee/department checks remain enforced. This corrects direct delegation; it does not introduce an assignment approval workflow.

Read-only assertions using Mabel's authentication context passed for delegation of an assigned Video Editor task and reassignment of a created task. Unrelated tasks, missing assignees, wrong-department targets and creator changes were rejected. No task assignment was changed for testing. Direct authenticated execution of the private validator remains denied. These are server-rule checks, not a browser login as Mabel or a full production RPC mutation test.

Video Shooting currently has no Staff recipients. Video Editor has eligible Staff recipients. No account departments or permissions were changed.

Security advisors were reviewed after rollout. They report RPC security-definer warnings, four policy-free RLS tables and disabled leaked-password protection. The changed private validator was not reported. This rollout does not assert that the project is free of other security findings; unrelated authentication and policy configuration was left unchanged.

Other audit migrations and staging release gates remain pending according to the existing manifest. This targeted production fix does not deploy the full audit frontend release.
