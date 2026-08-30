# Wave 5 Goal State

Status: focused implementation, validation, and diff review complete; the Wave 5 PR is opened from the final validation head and remains unmerged. Live database and authenticated browser evidence remain unavailable in this local environment.

- Branch: `hardening/wave5-financial-integrity`
- Base SHA: `f28e6a22fc3d35eca4bde105355624d993c497ee` (refreshed from `origin/main` before implementation)
- Implementation checkpoint: `9882d2397a2375a88f390eabf6aa40fa9d28905f`
- Scope held to confirmed Wave 5 findings; no Scheduling/Gantt/CPM, tenant switching, Cash/reconciliation re-audit, Engineering re-audit, or unrelated refactors were added.
- PR: opened after the final validation push; merge intentionally not performed.

## Confirmed findings closed

- Payroll finalization now requires effective `payroll.approve` at the database boundary; supporting period statuses cannot act as a second finalization path; approved/paid payloads and entry financial bounds are guarded.
- Payroll source revisions are date/period scoped, internal period refreshes preserve the initiating permission context, and calculation replacement is locked and bound to the expected source revision.
- Historical payroll currency cannot be relabeled by changing the deployment default after payroll history exists.
- Invoice cash basis is capped at gross evidence, VOID documents expose a non-active settlement state, and VOID payroll rows are excluded from project dashboard/report cost surfaces.
- Invoice edits, invoice allocation replacement, and expense edits use database freshness tokens; stale writes fail closed without a vendor side effect, and invoice lifecycle/save flows retain the fresh token returned by persistence.
- Assistant project-cost summaries use the shared canonical amount/percentage allocation normalization and exclude VOID invoices.

## Evidence obtained

- Focused Wave 5 regression suite: 9 passed, including fresh-token retention and stale-vendor-side-effect regressions.
- `npm.cmd test`: 762 tests, 761 passed, 1 skipped; the skip is the existing live payroll-reset test requiring `PAYROLL_RESET_DB_URL`.
- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed. Existing warnings remain for the unloaded Inter font, a mixed static/dynamic `companyApi` import, and large chunks.
- `npm.cmd run test:migrations`: 74 static migration invariants passed. Its non-strict upgrade phase skipped because PostgreSQL was unavailable.
- `npm.cmd run workflow-map:check`: passed (200 nodes, 240 edges).
- `npm.cmd run workflow-map:consistency`: passed (200 nodes, 240 edges, 13 invariants, 5 diagrams).
- `npm.cmd run test:workflow-map`: 59 passed.
- `git diff --check`: passed; Git reported normal LF-to-CRLF working-copy warnings only.
- Browser QA on the local demo: launched the populated demo, opened invoice correction options, voided a sample invoice with a required reason, confirmed the directory showed `Voided record` and the detail was read-only, and checked mobile payroll/invoice views at 390x844 with no horizontal overflow and no console errors or warnings.

## Database and runtime limits

- Supabase CLI 2.116.0 was available through `npx`, but Docker could not connect to `npipe:////./pipe/dockerDesktopLinuxEngine` because the daemon was unavailable.
- `npx.cmd supabase start` and `npx.cmd supabase db reset` therefore failed before starting/replaying the local database.
- `npx.cmd supabase test db` failed to connect to PostgreSQL at `127.0.0.1:54322` with `ECONNREFUSED`; live Wave 5 pgTAP assertions were not obtained.
- `npm.cmd run test:migrations:upgrade -- --require-db` failed with the same `ECONNREFUSED`; historical upgrade-path validation was not obtained.
- `.env` injected zero variables during browser-server startup, and no authenticated Supabase session was available. Authenticated RBAC/RLS, stale-write race, valid-current-write, Assistant/database, and production-provider probes were not claimed.
- No production or linked database was mutated.

WM-5 selectors used: `--node payroll-run` and `--file src/utils/projectCosting.ts`. The workflow-map source and generated outputs were not changed.

## Remaining bounded risks

Clean Supabase replay, live pgTAP, historical upgrade replay, authenticated browser probes, and exact-head CI remain required external evidence. The final branch SHA, PR URL, and unmerged status are recorded in the final handoff.
