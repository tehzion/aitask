# Client feature alignment

Client-facing parity review against source commit `924da1f` and the local changes on 3 October 2026. The reviewed batch includes client-safe report exports and stage-consistent tracker badges.

| Recent internal feature/change | Client behavior | Implementation |
| --- | --- | --- |
| PM service-scope revisions | Home and Services select the latest Active or Paused plan revision; drafts and ended plans are excluded. | Shared `getClientServicePlan` selector. |
| Published delivery cycles | Home and Overview retain today's cycle when future work is published. Past and upcoming fallbacks agree across both screens. | Shared `getClientCurrentCycle` selector. |
| Approval and feedback saving | Client delivery reviews and comments use the existing mutation/acknowledgement and pending-save recovery path. Newer text typed during a save is retained. | `ClientDeliveryFocus`. |
| Unsaved-work protection and local draft recovery | Approval notes and feedback warn before closing; reload offers explicit recovery for the same account and delivery. Existing recovery expires after 24 hours and clears on logout. | Shared unsaved-change and recoverable-form hooks. |
| Consistent delivery details | Tracker task links use the same client review panel as Deliveries, including approval history and draft protection. | Client branch in `TaskDetailsModal`; re-reads the current authorized task. |
| Chinese coverage | Delivery-stage labels, cycle badges and progress counts follow the selected language. User-authored names and text remain intact. | Existing locale helpers and parameterized messages. |
| Session, permission, notification and file reliability | These remain shared infrastructure used by both internal and client screens. | Existing store, access rules, notification page and service-file download helper; no backend changes in this patch. |

PM editing, assignment, company administration, internal prices and private records remain governed by existing role boundaries. Client parity means the relevant published outcomes and shared reliability improvements, not permission elevation.

## Verification

- Existing full unit suite passed before the final plan-selector addition; its new selector tests passed afterward.
- Client browser regression covers approvals, requested changes, persisted history, foreign-company rejection, mobile layout, Chinese labels and accessibility.
- Additional regressions cover note recovery after reload, cancelling discard, feedback edits during a delayed save, and the tracker using the client review panel.
- TypeScript, lint, production build and diff whitespace checks pass.
- Hosted account, database and production deployment verification are outside this local code change.

## Follow-up client enhancements

- Reports show agency completion and recorded client approval separately for the
  same four-week due-work cohort. The timing metric uses agency completion;
  missing dates remain unknown, and client CSV includes both timestamps and review
  stage without internal assignee or department metadata.
- Tracker search filters actual records before recalculating progress. Searching
  a company shows that company's work; task matches retain linked delivery context.
- Home displays the complete review count, including the highlighted delivery,
  with a counted link to the full review queue.
- The authenticated staging client test uses the current review controls.
  Hosted verification could not run: `STAGING_E2E_BASE_URL`,
  `STAGING_QA_CLIENT_EMAIL`, and `STAGING_QA_CLIENT_PASSWORD` are not configured
  in this environment. No hosted deployment or real-account mutation was performed.
