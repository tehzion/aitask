# AiTask Tutorial Test Report

**Final test date:** 2026-10-19
**Environment:** local development build, Chromium via Playwright, demo-only application data, and a disposable local Supabase stack for database-policy tests.

## Final passing evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Type safety | Pass | `pnpm check` |
| Lint | Pass | `pnpm lint` |
| Unit tests | Pass | `111` files, `848` tests: `pnpm test` |
| Strict localization | Pass | `0` findings across `180` source files: `pnpm verify:i18n:strict` |
| Migration file integrity | Pass | `116` non-empty SQL migrations: `pnpm verify:migrations` |
| Patch hygiene | Pass | `git diff --check` |
| Production build | Pass | `pnpm build` (PWA build completed) |
| Tutorial browser suite | Pass | `10/10` Playwright tests in `2.9m` |
| Tutorial feedback RLS behavior | Pass | `19` pgTAP tests on an isolated, migrated local Supabase stack |
| Remote Supabase security preflight | Pass | `pnpm verify:supabase` confirmed anonymous callers cannot execute protected RPCs or read workspace data |

## Browser scenarios exercised

- Super Admin: authenticated local seeded account, every applicable guide, protected admin tutorial routes, and target/fallback behavior.
- Project Manager: first-login Start/Back/Next/Skip/Finish/restart persistence; dashboard, projects, tasks, reports, and Help onboarding routes; tutorial search and guided navigation.
- HOD and Staff: every applicable guide, assignments/review workflow targets or safe fallbacks.
- Client: first-login visibility boundary, client-workspace route, Chinese search, denial of internal Help links/direct tutorial selection, and every applicable client guide.
- Cross-cutting: related-link role enforcement, malicious/injected custom-event payload rejection, Simplified-Chinese switch during an active guide, keyboard Next/Escape behavior, and compact overlay behavior.
- Responsive sizes covered in the release-audit browser spec: 320 px compact, 375 px, 390 px, 768 px, 1024 px, 1440 px, and 700 × 320 landscape. The covered guide checked for no horizontal overflow.

## Database-test setup

The pre-existing local Supabase stack did not match the current migration history. To avoid altering shared local state, testing used a copied temporary Supabase directory on isolated ports. The stack was migrated, `supabase/tests/database/tutorial_feedback.test.sql` ran to **19 passing tests**, then the stack was stopped and the exact temporary directory was removed. No production or shared business data was touched.

## Known warnings and limits

- The production build and browser server warn that `caniuse-lite` is about six months old. This did not fail compilation or behavior tests.
- Vite reports a `workspaceRuntime` chunk above its 500 kB warning threshold (554.09 kB minified / 161.78 kB gzip). The Help/tutorial code is lazy-loaded as a separate 128.93 kB minified chunk.
- Automated browser testing used Chromium. Manual screen-reader validation and physical-device touch validation were not performed in this audit.
- Custom-HOD persona selection is unit-tested, but no separate persisted custom-role browser account was available in the local demo fixture. Exercise that account in the authorized pre-production smoke test.
- Production deployment smoke tests were not run: no production deployment URL or release artifact was supplied for `pnpm verify:release-provenance --url …` or `--file …`.

## Release-gate checks that correctly did not pass

| Check | Result | Reason |
| --- | --- | --- |
| `pnpm verify:supabase:rollout` | Blocked | The current repository migration tail does not match the immutable production-verification manifest. The manifest must not be edited to make the check pass. |
| `pnpm verify:release-db-alignment` | Blocked | Latest repository migration is not identified as applied in the production manifest. |
| `pnpm verify:release-provenance` | Not run to pass | The command requires exactly one authorized deployment URL or release-artifact file; neither was available. |

These are release-control blockers, not local tutorial implementation failures.
