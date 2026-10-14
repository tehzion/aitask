# Staff and HOD UI/action audit — 14 October 2026

## Outcome

Staff and HOD action messages now follow persistence acknowledgement, describe the actual action, and distinguish task review from client approval. English and Simplified Chinese use the same feedback meanings. Existing permissions, ownership, notification recipients, database schemas, and stored status values are unchanged.

The verified flow is UI action → existing store mutation → save/retry acknowledgement → submitted-result verification → one confirmation. Global workspace retries and editor retries share confirmations. Inline calendar/company confirmations consume their pending feedback without also producing a toast.

## Corrections

| Area | Before | After |
| --- | --- | --- |
| Task creation, edits, priority, assignment, output links, revisions | Success could appear during an optimistic mutation | Feedback is queued with an account/session/record predicate and emitted once after the acknowledged snapshot matches |
| Comments, assignment acceptance, help, blockers | Silent success | Brief, specific confirmations |
| Editor confirmations | Toasts were behind the modal overlay and outside its accessible content | Feedback renders inside the active dialog, remains visible, and uses polite status announcements |
| Completion | A second weekly celebration toast | One task-completion confirmation |
| Review enquiry | A request for review progress opened a blocker | The request saves as a normal comment; status, assignment, and blocker state remain unchanged |
| Task review | Approval wording could be confused with client approval | Staff/HOD labels say waiting for review / review approved; notification titles distinguish department review from client review |
| Failed or discarded attempts | Generic retry instructions; an editor could close without confirming restoration | Real button names, classified rejection handling, guarded restoration, and retained errors/drafts on failure |
| Navigation | “Discard” described simply leaving | Leaving with unsaved changes is distinct from discarding a draft or restoring saved data |
| Unavailable links | No task sheet or unexplained company redirect | A neutral unavailable-work notice with an accessible destination and no hidden record details |
| Draft/browser storage | Failed writes were ignored or could still report success | A persistent form warning preserves in-memory input; failed local persistence does not emit success and can be retried |
| Upload recovery | A generic successful check could leave unresolved uploads; clearing a reference counted as deleting a file | Separate cleared-entry, deleted-file, remaining-upload, and failed-check counts; partial outcomes keep unresolved files visible |
| File activity/downloads | Mixed feedback tones; late downloads could affect another client | Distinct upload/save stages, typed feedback tones, guarded client/account context, and “Download started” only after triggering it |
| Notifications | Raw English system copy; read sounds and alert severity differed between surfaces | Shared presentation for inbox/preview/popups, preserved user text, contextual category translation, calm acceptance/clearance icons, and unread/account-aware sound eligibility |
| Popup timing/read failures | Popups could disappear during interaction | Dismissal pauses during hover, focus, saving, or an owned read failure; errors remain actionable |
| Shared dialogs/profile | Untranslated busy/default labels; prepared photos looked saved | Translated labels and neutral unsaved photo preparation feedback |
| Empty states/company selection | Sentence fragments or instructions referring to unavailable controls | Complete queue-specific messages and company choices described by actual availability |
| Translation checks | Conditional JSX/default labels were missed | The static audit now examines display expressions and shared defaults |

User-authored names, task titles, comments, filenames, and custom labels remain verbatim. Recognized notification templates translate only system text; unknown/freeform notification bodies stay unchanged.

## Verification

| Check | Evidence and result |
| --- | --- |
| Full unit suite | **619 tests / 85 files passed**, including acknowledgement, deduplication, account/session changes, discarded attempts, localized enums, notification templates, upload counts, and guarded downloads |
| Staff/HOD feedback browser suite | **14 scenarios passed**: both roles and languages, delayed acknowledgements, one visible confirmation inside the editor, preserved newer input, review enquiries without blocker changes, unavailable links, failed draft/local storage, successful retry, and focused notification popups |
| Existing functional browser coverage | The broad **87-scenario** run passed 83 initially. All four failures were resolved and verified by targeted reruns: popup fixture setup, the existing Chinese read-button label, and two obsolete Staff completion assumptions. Current tests preserve the existing review/completion permission rules. The additional HOD handoff scenario passed |
| Recovery and related flows | Broad coverage includes the existing 11 focused recovery scenarios plus task/edit/retry/discard, calendar, company, profile, service-file, notification/inbox, and review flows. Transport-injection failures exercise the actual UI/store; real persistence is checked separately below |
| Visual checks | **3 snapshot scenarios passed** on the final non-update run; five desktop/mobile/light/Chinese-dark baselines were inspected. Staff/HOD editor confirmations and mobile notification screenshots were also inspected |
| Static checks | TypeScript and full lint passed. Strict translation audit found **0 findings across 150 source files**; conditional display expressions and shared default labels are included |
| Build and distribution | Production build and PWA checks passed. Eager JavaScript is **299.8 KiB gzip**, within the unchanged **300 KiB** limit; other existing bundle limits passed |
| Disposable backend | **47 database files / 685 assertions passed** in the focused copy. Actual authenticated Staff/HOD saves, lost-confirmation retries, reload, private Storage outcomes, and Auth recovery passed. The separate full-gate fixture failure is described below |

Reviewed evidence: [Staff English](audit-evidence/staff-hod-ui/Staff-en-feedback.png), [Staff Chinese](audit-evidence/staff-hod-ui/Staff-zh-feedback.png), [HOD English](audit-evidence/staff-hod-ui/HOD-en-feedback.png), [HOD Chinese](audit-evidence/staff-hod-ui/HOD-zh-feedback.png), [mobile English popup](audit-evidence/staff-hod-ui/popup-en-mobile.png), and [mobile Chinese popup](audit-evidence/staff-hod-ui/popup-zh-mobile.png).

The browser totals above include overlapping focused reruns; they are not a claim that every scenario passed in one uninterrupted invocation. The remaining database fixture prevents reporting the full rollout gate as successful. No hosted authenticated QA is claimed.

Before committing, the audit-only staged tree was also checked in a disposable directory, with unrelated client-delivery/privacy changes excluded. Its **614 unit tests / 85 files**, TypeScript, lint, strict translation audit, and build passed. Eager JavaScript measured **299.4 KiB gzip**. The higher full-workspace count above includes tests belonging to the concurrent work.

## Separate database gate failure

The full disposable database gate stops at `task_signed_review_readiness.test.sql`: its pgTAP plan declares 10 assertions but runs only 4. This SQL fixture was not changed by this UI audit.

A temporary disposable copy excluded only that fixture. The remaining **47 database files / 685 assertions passed**, followed by real authenticated Staff/HOD action saves, reverse-linked delivery saves, lost-confirmation retry/reload, private Storage reference protection and cleanup recovery, and Auth/onboarding recovery. The temporary stacks were stopped and removed. This focused success does not make the full database gate green.

## Boundaries

No production records, database migrations, or deployments were performed. Concurrent workspace changes were preserved. Browser transport-injection scenarios are identified separately from real local Auth/REST/Storage checks; no hosted authenticated QA is claimed.
