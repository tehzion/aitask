# AiTask: checks requiring a person

Prepared for the audit on 10 November 2026. Do not enter passwords for another person. Production changes below require a separately approved plan and suitable test records.

## Old frontend against new database

- PR #16 merged at commit `4874ddac74564bb2edef0a2965e50398890ac1de` on 10 November 01:52:46 MYT. The production `/build-info.json` returned that same commit and channel `production`; the specific old-frontend/new-database mismatch is resolved. A production workflow can still fail for other reasons.
- On an approved test project, the PM signs in personally, creates a clearly identified test task, and confirms it appears after reload. Expected: one task, no rejection or pending-save warning.
- Assigned Staff signs in personally, starts it and sends it for review; the PM sees it in their review queue. Expected: each status persists after reload and the PM is the reviewer. Record timing and a sanitized error code, not passwords or task contents. This is a production write and requires approval.

## Mabel and Staff permissions

- Check that the approved test project is in Mabel's scope and has an eligible Staff member. Mabel signs in herself, opens the test task, chooses that member, and assigns it.
- The Staff member signs in themselves, starts work and sends the task for review. Expected: assignment persists after reload; the Staff action succeeds and the PM receives the review. Record the task identifier, time and any error code for investigation. These are production writes and require approval.

## Live performance

- On a representative mid-range phone and ordinary mobile connection, the account owner signs in and opens a scoped workspace with representative data. Measure cold load and warm load to usable content, noting browser, device, connection and times; do not record passwords or task contents.
- Only with approval for a production write, time an agreed test task status save from click through confirmed saved state, then reload and verify the result. Repeat under representative network conditions; report individual runs and any error. A queued or closed form is not confirmation of persistence.

## Locked phone after an outage

- On local QA accounts and local Supabase, start a save, interrupt the connection before the response, lock the phone for one hour, then reconnect and unlock it. Expected: the kept command resumes, is applied once, and the UI confirms it without asking to discard it.
- Record phone model, OS/browser version, exact offline and reconnect times, elapsed time to confirmed database state, any banner and receipt count. Repeat on iOS Safari and Android Chrome if both are in scope. Use only local test credentials.
