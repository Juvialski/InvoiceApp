# Wave 7 Goal State

## Status

Wave 7 implementation and local validation are complete; publishing and exact-head CI remain pending. The branch is based on the freshly fast-forwarded `main` at `237d1c4549e925b8c540a5250539cef6f5885cf4`.

## Repository and ownership

- Branch: `codex/wave7-production-readiness`
- Current head at the pre-commit checkpoint: `237d1c4549e925b8c540a5250539cef6f5885cf4`; the final branch head is recorded in the handoff.
- WM-5 selector: `node=platform-shell`, `hops=1`, `budget=9000`
- Lead: shared contracts, security/RLS interpretation, Wave 6/Wave 7 checkpoints, integration, final validation, browser QA, commit/push/PR
- Agent 1 (Luna): database/migration/replay/invariant audit slot; stopped after leaving no complete patch, so the lead completed the database lane
- Agent 2 (Luna): demo/runtime-support, feature registry/help/status truth, focused tests

## Confirmed baseline

- PR #46 / Wave 6B final head `7c672874f159f233a3c1156118c3feed152ba65f` merged into `main` as `237d1c4549e925b8c540a5250539cef6f5885cf4`.
- PR #46 exact-head Database Migrations & Upgrade Suite, Application Tests/Lint/Build, Graph and Source Contract Consistency, and Demo Visual QA passed. Supabase Preview was skipped.
- The worktree was clean before the Wave 7 branch was created.
- Scheduling/Gantt/CPM and other roadmap expansion remain frozen.

## Confirmed Wave 7 evidence

- `npm.cmd test`: 789 tests, 788 passed, 0 failed, 1 explicit live-database skip.
- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed; existing Inter-font, dynamic-import, and chunk-size notices remain.
- `npm.cmd run test:migrations`: 75 static migration/invariant tests passed; optional live upgrade phase skipped because `127.0.0.1:54322` refused the connection.
- `npx.cmd tsx scripts/test-migration-upgrade.ts --require-db`: attempted and failed closed with `ECONNREFUSED` because PostgreSQL was unavailable.
- `npm.cmd run workflow-map:generate`, `workflow-map:check`, and `workflow-map:consistency`: generated outputs unchanged; 200 nodes, 240 edges, 13 invariants, 5 diagrams. `npm.cmd run test:workflow-map`: 59 passed.
- Focused RBAC/Assistant regressions: 53 passed, 0 failed, covering deployment membership, company isolation, route permissions, custom effective authorization paths, allowlisted tools, confirmation gating, settlement/reversal, lifecycle, and UI-only boundaries.
- Structured Chromium QA: 28 routes, 4 viewport classes (1440, 1366, 768, 390), 15 interactions, and 35 screenshots; 0 console errors, page errors, failed requests, overflow failures, or failed scenarios. Manual in-app browser QA also covered the major dashboard, project/engineering, finance, payroll, reports, settings, and Assistant paths at 1280x720, including Back/Forward and prepare-before-confirm behavior.

## Confirmed findings and fixes

- Added the missing forward-only `20260831003455_wave7_engineering_revision_authority.sql` migration. Revision creation is now deployment-bound, normalizes new revisions to `UNDER_REVIEW`/`PENDING_REVIEW`, rejects archived or superseded parents, and keeps the RPC authenticated with a pinned empty `search_path`.
- Rebound finalized payroll source protection to include holiday dates and both old/new period/date values, and added the missing `payroll_holidays` finalized-source trigger.
- Added static and pgTAP contract coverage for the Wave 7 database guards.
- Replaced ambiguous planned-feature availability language with explicit `Planned — not available` status and corrected stale roadmap/Phase 1 documentation.

## Evidence still to obtain

- Fresh local Supabase reset, pgTAP, and historical upgrade-path replay, or explicit unavailable evidence.
- Final changed-file review, exact-head CI for the Wave 7 PR, and remaining release blockers.

## Findings and fixes

All bounded Wave 7 findings identified in this local audit have been fixed and covered by focused contracts.

## Outstanding limitations

Clean Supabase replay, pgTAP, and live historical upgrade validation were unavailable: the Supabase CLI is not installed locally and Docker Desktop's Linux engine was not running. Authenticated/live-provider evidence, including production email/provider behavior, remains unavailable and must stay separate from local/demo/static evidence. Wave 7 exact-head CI has not yet run because the PR is not published.
