# Approvals UI/UX Audit — 2026-09-19

## Scope

Audited `/approvals` for the Boss Koo approval workflow at desktop and mobile widths. The review preserves existing authorization, local/Supabase command behavior, registration data shape, and the Calm Operations visual language. No Supabase schema, RLS policy, or approval command was changed.

Affected workflow: Boss Koo → registrations → applicant review → approve/reject. Secondary surfaces reviewed: Members, Roles, and History.

## Findings and remediation

| Severity | Finding / evidence | Affected routes and roles | Remediation and acceptance evidence |
| --- | --- | --- | --- |
| P1 | The previous approval form was rendered as an overflow-hidden modal without a dedicated scroll body; long mobile requests could hide fields and actions. | `/approvals`; Boss Koo | Added a reusable `RegistrationReviewPanel` with one scroll body and a safe-area-aware sticky footer. Desktop uses a queue/detail split; mobile uses a full-height sheet with close, Escape, and focus restoration from `ModalShell`. |
| P1 | The mobile sheet was hidden with CSS but still mounted at desktop widths; `ModalShell` consequently applied its global inert/focus-trap state and blocked pointer events in the visible split panel. | `/approvals`; desktop Boss Koo review | Mount the mobile `ModalShell` only when the viewport is below the desktop breakpoint. Desktop and mobile now have one active review surface at a time. |
| P1 | The review form visually hardcoded Staff even when the registration requested another canonical role. | `/approvals`; Boss Koo | Role selection now initializes from the request and supports Project Manager, HOD, Staff, and Client. Department and company fields follow the selected role; custom roles are filtered to the selected base role. |
| P2 | Registrations, members, roles, and history were stacked into one long workflow, making pending access requests difficult to prioritize. | `/approvals`; Boss Koo | Added query-backed Registrations, Members, Roles, and History tabs. Registrations is the default and exposes pending/aging/active/recent metrics. |
| P2 | Pending requests had no search, explicit oldest-first ordering, aging indicator, or selected-review state. | `/approvals`; Boss Koo | Added search across name, email, phone, position, requested role, and onboarding mode; oldest-first ordering; waiting-age badges; empty/no-result states; desktop detail placeholder; `registrationId` query restoration and stale-ID cleanup. |
| P2 | Approval, reject, selection, and icon controls were inconsistent below touch-target guidance. | `/approvals`; Boss Koo | New queue and review actions use the shared `Button`/`IconButton` primitives and 44px minimum targets with visible focus rings and 8px action spacing. |
| P2 | History and members were difficult to scan on narrow screens. | `/approvals`; Boss Koo | History now has disclosure-style mobile cards and a wide-screen table. Member search/filter controls and no-result state are retained in the Members tab. |
| P2 | The review eyebrow used the brand accent at a contrast ratio below WCAG AA for small text. | Review sheet/split panel; Boss Koo | Changed the eyebrow to semantic ink text. Focused axe verification reports no violations for the mobile dialog. |
| P3 | Registration review markup was duplicated between desktop and mobile, increasing layout drift. | `/approvals`; Boss Koo | Desktop split view and mobile sheet now share `RegistrationReviewPanel`, including validation, onboarding, errors, and action footer. |
| P3 | Selected applicants were not addressable or restorable through a URL. | `/approvals`; Boss Koo | Added `?tab=` and `?registrationId=` state. Valid pending IDs restore after refresh; stale or non-pending IDs are cleared safely. |
| P3 | Visible Boss Koo identity still used the legacy “Super Admin” display label in the shared role name. | Shared workspace header and approvals context | Display resolver now presents `Boss Koo`; technical `isSuperAdmin`/secure command identifiers remain unchanged. |

## Authorization preservation

- The route remains Boss Koo-only through the existing `RoleRoute` and `viewApprovals`/Boss Koo checks.
- Existing bulk approval/rejection confirmation flows remain in place.
- Existing secure invitation, temporary-password, local approval, member, role, and permission mutation paths remain unchanged.
- No password is rendered in the applicant detail panel.
- The selected review resets only when the registration ID changes; live registration refreshes do not discard role, department, company, invitation, or password drafts.

## Verification

Passed:

- `pnpm test -- --runInBand` — 41 files, 266 tests passed.
- `pnpm exec tsc --noEmit` — passed.
- `pnpm lint` — passed.
- `git diff --check` — passed.
- Focused Playwright approvals suite — 2 tests passed at desktop and 390px mobile, including queue ordering, waiting-age visibility, URL selection/restoration, custom validation retention, no horizontal overflow, sticky footer visibility, Escape close, query cleanup, and axe dialog scan with no violations.

The browser fixture explicitly clears the local demo password-setup and release overlays before and after route navigation. Screenshot baselines were not updated.

## Remaining follow-up

- Run the full approval responsive matrix at 320/375/390/414/768/1024/1440px, landscape, Chinese, dark theme, and reduced motion on the supported Node 22/pnpm 10.4.1 toolchain.
- Run the existing app-smoke and responsive suites with the proper Playwright runner after the local demo bootstrap is stable.
- Run authenticated Supabase role/RLS probes separately; this UI change intentionally does not alter schema or policies.
- Do not update visual baselines until the desktop flow and accessibility assertions pass without bootstrap overlays.
