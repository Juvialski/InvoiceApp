# Wave 7 Goal State

## Status

Wave 7 implementation is published in PR #47 from `codex/wave7-production-readiness`, based on `main` at `237d1c4549e925b8c540a5250539cef6f5885cf4`. The initial published head `301c4f11e6ee2528ff72936315d29f1447273946` completed all three exact-head GitHub workflows successfully. A reviewer follow-up then hardened the finalized-payroll source invariant against caller RLS visibility; any subsequent head remains subject to the same exact-head gates before merge.

PR #47 remains intentionally unmerged.

## Repository and ownership

- Branch: `codex/wave7-production-readiness`
- Base `main`: `237d1c4549e925b8c540a5250539cef6f5885cf4`
- WM-5 selector: `node=platform-shell`, `hops=1`, `budget=9000`
- Lead: shared contracts, security/RLS interpretation, Wave 6/Wave 7 checkpoints, integration, final validation, browser QA, commit/push/PR
- Agent 1 (Luna): database/migration/replay/invariant audit slot; the lead completed the database lane after the agent left no complete patch
- Agent 2 (Luna): demo/runtime-support, feature registry/help/status truth, focused tests
- Maximum concurrent subagents used: 2; both were Luna at maximum available reasoning

## Confirmed baseline

- PR #46 / Wave 6B final head `7c672874f159f233a3c1156118c3feed152ba65f` merged into `main` as `237d1c4549e925b8c540a5250539cef6f5885cf4`.
- The Wave 7 branch was created from that current `main` state.
- Scheduling/Gantt/CPM and other roadmap expansion remain frozen.

## Confirmed Wave 7 evidence

Local/implementation evidence:

- `npm.cmd test`: 789 tests, 788 passed, 0 failed, 1 explicit live-database skip.
- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed; existing Inter-font, dynamic-import, and chunk-size notices remain.
- `npm.cmd run test:migrations`: 75 static migration/invariant tests passed; the optional local live phase could not connect to `127.0.0.1:54322`.
- Local strict upgrade replay failed closed with `ECONNREFUSED` because PostgreSQL/Supabase was unavailable in that environment.
- Workflow-map generation/check/consistency stayed aligned at 200 nodes, 240 edges, 13 invariants, and 5 diagrams; workflow-map tests: 59 passed.
- Focused RBAC/Assistant regressions: 53 passed, 0 failed.
- Structured Chromium QA: 28 routes, 4 viewport classes (1440, 1366, 768, 390), 15 interactions, and 35 screenshots; no console, page, request, overflow, or scenario failures.

GitHub exact-head evidence for initial published head `301c4f11e6ee2528ff72936315d29f1447273946`:

- Workflow Map Consistency: passed.
- Demo Visual QA: passed, including lint/typecheck, full application tests, production build, preview startup, structured browser capture, workflow-map evidence overlay, and artifact upload.
- Database Migration & Invariant Tests: passed.
- Isolated Supabase startup: passed.
- Clean `supabase db reset`: passed.
- pgTAP database suite: passed.
- Historical upgrade-path migration suite with database required: passed.

The GitHub database run supersedes the local environment limitation for isolated fresh replay, pgTAP, and historical upgrade validation. It does not substitute for authenticated production-provider evidence.

## Confirmed findings and fixes

- Added forward-only `20260831003455_wave7_engineering_revision_authority.sql`. Revision creation is deployment-bound, restricts new revision lifecycle state to `UNDER_REVIEW` / `PENDING_REVIEW`, rejects archived or superseded parents, and keeps the authenticated RPC on a pinned empty `search_path`.
- Extended finalized-payroll source protection to holiday dates and both old/new period/date values, including the missing `payroll_holidays` trigger.
- Reviewer follow-up changed the finalized-payroll source trigger function to narrowly scoped `SECURITY DEFINER` execution with an empty `search_path` and revoked direct execution. This is required because the RBAC model intentionally allows `payroll.manage` independently of `payroll.summary.read`; the invariant must still see finalized periods even when caller RLS hides payroll summaries.
- Added static/database contract coverage for the Wave 7 guards.
- Replaced ambiguous planned-feature availability language with explicit `Planned — not available` status and corrected stale roadmap/Phase 1 documentation.
- Regenerated the committed Engoryx UI CSS through the current theme build; lint/build/browser QA remained green on the initial published head.

## Remaining release evidence boundary

Authenticated production/live-provider evidence remains environment-dependent and was not established by the local or isolated CI runs. This includes production email/provider behavior and any production-only Auth/Storage/Realtime/provider integration that cannot be reproduced by the isolated workflow.

Do not present unavailable production-provider evidence as tested. Do not merge PR #47 until the final current head has completed the repository's exact-head CI gates and final diff review.

## Hardening exit audit

Wave 7 closes the repository-defined production-readiness audit surfaces that can be validated in source, isolated Supabase, CI, and browser/demo environments. The feature registry continues to mark planned features as unavailable, Assistant authority remains permission-bound with confirmation for consequential actions, and the existing correction/history protections remain in place.

The hardening freeze should only be reconsidered using the actual final PR state and any required authenticated production evidence. Scheduling/Gantt/CPM remains frozen unless explicitly lifted.
