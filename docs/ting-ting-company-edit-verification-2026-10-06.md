# Ting Ting company edit verification — 6 October 2026

Read-only production checks identify Ting Ting as Project Manager (Management), not HOD. All 83 company profiles were checked under Ting Ting's authentication context using the deployed visibility and edit predicates. Of these, 40 are visible: the frontend ownership rule allows 22 and blocks 18.

The frontend `canEditClientProfile` returns false for an existing company profile created by someone else, even if Ting Ting created or is assigned a task for that company. Both the company menu and profile dialog use this predicate to hide Edit details. The current production build-info endpoint reports v2.6.1 at commit `ba17f7fb8e0951d805882a80f9ba601f65a59355`; its source contains this rule.

The deployed database `private.aitask_can_edit_client` instead allows a Project Manager who owns the company **or** created/is assigned a linked task. It returns true for all 18 companies blocked by the interface. This confirms a frontend/database authorization mismatch; the screenshot's AirCare case matches it. Refreshing the current production build will not remove this ownership restriction.

## Companies with Edit details hidden

Every company below is owned by Boss Koo. The frontend returns false and the database edit predicate returns true for Ting Ting.

| Company |
| --- |
| AirCare Cooling Singapore Services & Maintenance |
| Bao Sheng Travel |
| Bid Manager |
| Car Master |
| Cece Beauty |
| Dr Cermin |
| Eden Confinement Centre |
| Eyseph Image Consultancy |
| Jean Yip |
| JW De Maison Bountique |
| Luxe's Clinic |
| Mango Kim |
| Melodies Homestay |
| Pmax |
| Poh Shun Motors |
| Prostyle Hair Studio |
| 安合中医 |
| 聚香阁美食中心 |

## Resolution and verification limits

Align the frontend and database company-edit rules. If linked-task responsibility is intended to grant company contact editing, the frontend needs to allow that same scope for existing profiles. If editing should be exclusive to the company creator, the database rule needs tightening instead. Changing Ting Ting's role is unnecessary to explain this issue.

No account permissions or production records were changed. Checks evaluated the live authorization predicates and the frontend source; no save was submitted and Ting Ting's actual browser session/build was not inspected. The 22 allowed companies are permission results, not 22 successful save tests. Unrelated local changes were preserved.
