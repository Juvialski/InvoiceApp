# Wave 5 Goal State

Status: focused implementation checkpoint complete; live database, browser, and exact-head CI evidence remain for the next Goal Mode session.

- Branch: `hardening/wave5-financial-integrity`
- Base SHA: `f28e6a22fc3d35eca4bde105355624d993c497ee` (refreshed from `origin/main` before implementation)
- Scope held to confirmed Wave 5 findings; no Scheduling/Gantt/CPM, tenant switching, or unrelated refactors were added.
- PR: not opened, per the continuation instruction.

## Confirmed findings closed

- Payroll finalization now requires effective `payroll.approve` at the database boundary; supporting period statuses cannot act as a second finalization path; approved/paid payloads and entry financial bounds are guarded.
- Payroll source revisions are date/period scoped, internal period refreshes preserve the initiating permission context, and calculation replacement is locked and bound to the expected source revision.
- Historical payroll currency cannot be relabeled by changing the deployment default after payroll history exists.
- Invoice cash basis is capped at gross evidence, VOID settlement targets remain historical but non-active, and VOID payroll rows are excluded from project dashboard/report cost surfaces.
- Invoice edits, invoice allocation replacement, and expense edits use database freshness tokens; stale writes fail closed.
- Assistant project-cost summaries use canonical amount/percentage allocation semantics.

## Evidence obtained

- Focused Wave 5 regression suite: 8 passed.
- `npm.cmd test`: 761 tests, 760 passed, 1 skipped; the skip is an existing live payroll-reset test requiring `PAYROLL_RESET_DB_URL`.
- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed. Existing warnings remain for the unloaded Inter font, a mixed static/dynamic `companyApi` import, and large chunks.
- `npm.cmd run test:migrations`: 73 static migration invariants passed. Live upgrade-path validation was skipped because PostgreSQL at `127.0.0.1:54322` was unavailable (`ECONNREFUSED`).
- `npm.cmd run workflow-map:check`: passed (200 nodes, 240 edges).
- `npm.cmd run workflow-map:consistency`: passed (200 nodes, 240 edges, 13 invariants, 5 diagrams).
- `git diff --check`: passed; Git reported normal LF-to-CRLF working-copy warnings only.

## Database and runtime limits

The new pgTAP file is present at `supabase/tests/database/10_core_hardening_wave5_financial_integrity.test.sql`, but clean replay, live pgTAP, upgrade replay, authenticated browser probes, and exact-head CI were not obtained in this checkpoint. Local Docker was unavailable, and no production or linked database was mutated.

WM-5 selectors used: `--query "project costing payroll settlement"`, `--file src/utils/projectCosting.ts`, and `--node payroll-run`. The workflow-map source and generated outputs were not changed.

## Next Goal Mode checkpoint

Run the clean Supabase replay/pgTAP/upgrade suite and targeted authenticated browser QA for the changed invoice, payroll, allocation, and project-cost workflows; review branch CI; then decide whether to open the PR.
