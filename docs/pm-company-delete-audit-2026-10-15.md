# Project Manager company deletion audit — 15 October 2026

**Production update — 15 October 2026, 22:12 MYT:** Following the user's explicit instruction, all 18 companies listed in the historical-ownership finding below were transferred from Boss Koo to Ting Ting. Live verification confirms Ting Ting can view, edit, and pass the deletion authorization check for all 18. Her owned company profile count is now 36. The counts below describe the earlier audit snapshot. Evidence: `audit-evidence/ting-ting-ownership-transfer-2026-10-15/verification.json`.

The PM role has company deletion capability. Current production authorization permits deletion of companies owned by the caller and denies ordinary foreign-owned companies. The reported “80% cannot delete” rate was not reproduced: the user specified a role rather than an individual account or failed company. Two concrete problems were found: historical owner attribution and duplicate company profiles.

## Read-only production checks

Project: AiTask (`ohjhwyiffgzyatcmmdql`), workspace `aitask-main`. Evaluated the deployed `private.aitask_can_view_client` and `private.aitask_can_mutate_entity` helpers for both ordinary PM accounts against all 79 company profiles. Each evaluation verified the resolved actor matched the intended member. JWT request settings were transaction-local; no company command, delete, account update, or ownership transfer was submitted.

| PM | Owned profiles | Visible profiles | Delete predicate allows | Owned profiles denied by backend |
| --- | ---: | ---: | ---: | ---: |
| jing yi thee | 20 | 21 | 21 | 0 |
| Ting Ting | 18 | 37 | 19 | 0 |

The extra allowed foreign profile in each row is a duplicate-name authorization defect, not an intended PM grant. These figures evaluate permission helpers, not successful deletion transactions or the users' browser sessions.

## Findings

### Historical company ownership blocks 18 visible Ting Ting companies

These profiles are recorded as owned by Boss Koo, although Ting Ting created linked tasks for all 18:

AirCare Cooling Singapore Services & Maintenance; Bao Sheng Travel; Bid Manager; Car Master; Cece Beauty; Dr Cermin; Eden Confinement Centre; Eyseph Image Consultancy; Jean Yip; JW De Maison Bountique; Luxe's Clinic; Mango Kim; Melodies Homestay; Pmax; Poh Shun Motors; Prostyle Hair Studio; 安合中医; 聚香阁美食中心.

All have the same historical insertion timestamp, `2026-08-24T18:16:48.782268+00:00`, and no company insertion audit event. The old ownership backfill prefers a linked plan creator, then project creator, then task creator. Its inferred owner is not proof of the original human creator. Bid Manager's linked project is recorded as created by Ting Ting while its company owner is Boss Koo. This supports reviewing historical attribution, but does not establish that every company should be transferred.

The application also uses `createdBy` for the current transferable owner (`assignClientOwner`), further limiting its use as creation provenance. Current JSON and indexed owner columns agree; this is not a JSON/column synchronization failure. No extant Boss-owned company with a retained insertion audit event was found to have a different insertion actor.

### Duplicate names can hide deletion for a PM's own company

Production has two profiles with normalized key `lumea skin lab sdn bhd`:

| Profile | Owner |
| --- | --- |
| `CL-1789636987542-u8qh6` — Lumea Skin Lab Sdn Bhd | Boss Koo |
| `CL-1790583083252-76vlv` — LUMEA SKIN LAB SDN BHD | jing yi thee |

The snapshot loads profiles by entity ID. The Companies page retains the last matching profile for its summary, but `canDeleteClientProfile` checks the first profile with the same normalized name. With this production ordering, the summary selects jing yi thee's own profile while the guard finds Boss Koo's first and returns false. The source helper reproduces this denial locally. The deployed backend permission predicate allows both rows because it tests ownership of any profile with the same key.

### Duplicate names also permit the wrong company target

Production has two `le motor` profiles:

| Profile | Owner |
| --- | --- |
| `CL-1792042519625-t499q` — Le Motor | Ting Ting |
| `CL-migrated-79a8ac767300c08a4ba67c18` — Le Motor | Boss Koo |

In snapshot ordering, the guard finds Ting Ting's profile first and allows deletion, while the summary retains Boss Koo's later profile as the submitted ID. The production backend also allows that foreign target because of its name-based ownership lookup. Its cascade derives deletion scope from both ID and normalized name, so source inspection indicates both same-name company profiles and their work can fall into the deletion set. No destructive command was run to test that consequence.

## Recommended correction

1. Authorize company deletion against the exact selected company ID and its canonical owner in both interface/store and database. Do not authorize a foreign profile merely because the actor owns another profile sharing its name.
2. Protect cascade scope from duplicate normalized names. Prefer canonical IDs; handle legacy name-only links explicitly. Review and consolidate the two duplicate groups while preserving linked work before introducing uniqueness constraints.
3. Review disputed historical owners using available project/task history and the user's named examples. Do not automatically transfer all Boss-owned companies or widen every PM's deletion rights. Preserve creation provenance separately from transferable ownership.

## Verification and limits

- Existing focused tests: **59 passed** across `access.test.ts`, `clientPermissions.test.ts`, and `hodPermissionParity.test.ts`.
- Local helper reproduction uses the observed duplicate records and production snapshot ordering. Run `node docs/audit-evidence/pm-company-delete-2026-10-15/reproduce.mjs`.
- Production permission evaluation covered **158 company/actor pairs**. Each PM's currently owned profiles passed the backend predicate.
- No production data, ownership, permissions, or application source was modified. No live browser session or successful deletion was exercised. This audit adds only this report and its local reproduction script.

Source: `src/lib/access.ts` (`canDeleteClientProfile`); `src/pages/Clients.tsx` (company summaries and deletion target); `src/lib/secureWorkspace.ts` (snapshot ordering); `src/store/index.ts` (`assignClientOwner`, `deleteClientProfile`); deployed definitions of `private.aitask_can_mutate_entity` and `private.aitask_delete_client_cascade`; `supabase/migrations/20260923120000_client_ownership_backfill.sql`.
