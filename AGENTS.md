# InvoiceApp / Engoryx Development & Agent Rules

These rules apply only to this repository. The repository may still be named `InvoiceApp`; use current Engoryx naming and live repository state.

## Architecture baseline

Engoryx is permanently:

`one deployment -> one client company -> active membership/RBAC -> permitted workflows`

Each client company gets its own deployment, Supabase project/database, Storage, environment configuration, and users. Do not add unrelated-company switching or tenant selection.

Keep `company_id`, company-prefixed Storage paths, RLS, membership checks, permission checks, and company-bound foreign-key validation as defense in depth.

## Current product direction

Authoritative product direction:

- `docs/ENGORYX_PROJECT_CONTROLS_PRODUCT_DIRECTION.md`
- `docs/ENGORYX_ACTIVE_ROADMAP.md`

Engoryx remains an Engineering Operations Platform focused on **Project Controls + Finance + Field Operations + Engineering Documents**.

Permanent product rules:

1. Project is the operational hub, but Finance, Payroll, Engineering, and document provenance remain separate authoritative domains.
2. Preserve `projects.contract_value` and `projects.project_budget` as distinct concepts.
3. Derive Actual Cost from authoritative lifecycle-eligible allocations/expenses/payroll and approved downstream sources; never invent a competing total.
4. Committed Cost is distinct from Actual Cost.
5. Client billing is distinct from supplier/vendor invoices and Actual Cost.
6. **Collected to Date derives from authoritative `RECORDED` client collections.** Bank/Cash settlement linkage is separate reconciliation evidence and must not redefine or double-count collection truth.
7. Never silently sum mixed currencies or invent FX.
8. Forecast/EAC/Margin require explicit authoritative source semantics; do not infer them from Actual + Committed unless the product contract explicitly says so.
9. Project payroll aggregates must never broaden unauthorized payroll-detail visibility.
10. Keep Engineering Documents, immutable revisions, RFIs, Submittals, and later engineering-control workflows first-class.
11. Do not delete mature modules merely because one deployment hides them. Feature visibility is not authorization.
12. Scheduling/Gantt/CPM requires a separately prioritized wave.

Approximate implementation order remains **P1 Project Controls Foundation -> P2 Procurement + Commercial Operations -> P3 Project Operations UX / Field Operations / Engineering integration**, with bounded infrastructure follow-up separate.

## Tool and model policy — Codex only by default

The user currently intends to use **Codex only** for implementation work.

- **ChatGPT with GitHub access** is the repository-level investigator, reviewer, PR/CI reviewer, GitHub editor, prompt creator, merger, and finisher.
- **Codex** is the local implementation owner for feature work, debugging, browser/runtime work, Supabase CLI/Docker, migrations, tests, and validation.
- Do **not** assume Luna, Gemini, Antigravity, OpenRouter, Kilo, or other paid/external implementation agents are available.
- Do not invoke or recommend another paid coding agent unless the user explicitly says it is available again.
- Existing historical references to Luna/Gemini/Antigravity are not current execution policy.

### Codex subagents

**Hard maximum: 2 concurrent subagents.**

Default: **zero subagents**. The Codex lead owns continuous implementation, integration, shared-file edits, final review, validation, commit, push, and PR delivery.

If the Codex environment supports internal subagents under the same Codex workflow, use at most two only for genuinely independent, tightly bounded workstreams with non-overlapping ownership. The lead must not become blocked waiting for them.

Do not spawn subagents for:

- documentation-only work;
- CI polling;
- duplicate repository discovery;
- broad independent re-audits;
- tiny one-file fixes;
- work the lead can finish more cheaply than coordinating another agent.

If a subagent stalls or does not return a usable result after bounded waits, stop it and continue locally. Never restart the same broad stalled assignment repeatedly.

The lead always owns:

- architecture and source-of-truth decisions;
- financial semantics;
- migrations/RLS/RPC/trigger interpretation;
- destructive lifecycle policy;
- App/router/provider/shared-file integration;
- final diff review;
- validation scope;
- PR handoff.

## Repository freshness and trusted baseline

Before implementation:

1. inspect current branch/HEAD;
2. inspect latest `main` and relevant PR/CI state;
3. inspect working-tree status when local access exists;
4. never rely on an old prompt SHA or stale chat snapshot.

A newly started phase normally begins from a `main` commit already validated before the prior PR was merged. Treat that green main SHA as the trusted baseline.

**Do not begin every phase by rerunning the full historical suite.** Run baseline tests before editing only when there is concrete reason to distrust the baseline: failed/missing CI, environment/toolchain changes, uncertain repository state, or explicit request.

## Agent context / Workflow Map

For substantial feature, debugging, security, financial, or architecture work, generate one bounded repository-native packet first:

```text
npm.cmd run agent:context -- --task "<objective>" --domain <domain> --hops 1 --budget 10000
```

Default orientation:

- one bounded packet;
- 0-1 workflow hops;
- roughly 8,000-12,000 characters;
- normally 6-8 primary source files on first pass;
- exact symbols/ranges instead of whole-file dumps;
- repository-wide search only for a named unresolved dependency.

If no Workflow Map node matches, accept the documented changed-file/impact fallback. Do not retry speculative keyword variants merely to force a map match.

Workflow Map is navigation only. Current source, migrations, runtime behavior, RLS, tests, and exact-head CI remain authoritative.

Detailed execution guidance lives in `docs/AGENT_EXECUTION_EFFICIENCY.md`.

## Diff-driven implementation and review

Keep one cohesive objective per implementation run and PR whenever practical.

After implementation:

1. inspect changed filenames/statistics;
2. review changed hunks and shared contracts;
3. run new/edited tests;
4. run focused domain tests;
5. run compact affected validation;
6. escalate only when the changed surface or a failure justifies it;
7. use exact-head PR CI as the final automated merge gate.

Do not turn a focused feature into a repository-wide audit. Fix adjacent issues immediately only when required for correctness/safety; otherwise record them for a later wave.

## Context and log discipline

- Do not dump whole large files when symbols/ranges are enough.
- Do not ingest full successful logs; retain command, exit status, counts, and relevant warnings.
- Prefer `npm.cmd run test:affected:agent` for compact agent-facing application validation.
- On failure, inspect the failed command/step and smallest useful error region first.
- Use `npm.cmd run ci:failure-context -- --file <log>` for oversized saved logs.
- Do not repeatedly reopen unchanged files, logs, generated maps, or CI pages.
- Prefer `git diff`, changed hunks, exact symbols, and focused contract checks.
- Never loop an unchanged failure.

Failure loop:

`inspect -> diagnose -> justified change -> rerun narrow check -> continue validation ladder`

## Existing-data correction and removal

- **Unused accidental record**: guarded permanent delete may be appropriate only when no dependent/auditable history exists.
- **Used operational record**: archive, deactivate, offboard, cancel, or equivalent reversible lifecycle state.
- **Finalized/auditable financial or engineering history**: void, reverse, supersede, or deliberate correction; never silently erase history.

Do not add raw Delete paths that bypass dependency/history checks.

## RBAC and Assistant parity

Authorization is permission-based, not role-name-based. Existing roles are presets.

Deterministic UI/API authorization, server/RPC checks, RLS, and Assistant tools must resolve the same effective permissions. The Assistant never receives broader authority than the current user.

Consequential Assistant mutations preserve prepare/validate/human-confirm/execute boundaries.

## Database, migration, and history safety

Protect approved/finalized payroll, verified invoice history, collection/settlement history, engineering history, project cost allocations, committed import provenance, and audit trails.

Once a migration reached a shared/protected environment, do not edit it in place. Add a forward migration unless it is proven never to have applied anywhere and its failed transaction fully rolled back.

Never weaken RLS because a deployment contains one company.

## Docker / local Supabase validation contract

The user's laptop normally keeps **Docker Desktop available** specifically so Codex can run real local Supabase validation when needed.

### When Docker is required

For changes affecting any of the following, Codex should use the real local Supabase stack before PR completion:

- `supabase/migrations/**`;
- RLS policies or grants;
- SECURITY DEFINER / RPC behavior;
- triggers or database constraints;
- financial lifecycle guards;
- cross-company/company-bound integrity;
- migration upgrade behavior;
- database concurrency / row-locking invariants.

Typical Windows commands:

```text
docker info
npx.cmd supabase start
npx.cmd supabase db reset --local --no-seed --yes
npx.cmd supabase test db --local
npm.cmd run test:migrations
npm.cmd run test:migrations:upgrade
```

Run targeted runtime/RPC/concurrency tests in addition when the changed contract requires them.

### What Docker-backed validation proves

Use the local stack to verify real PostgreSQL/Supabase behavior such as:

- clean migration replay;
- pgTAP schema/invariant assertions;
- RLS and authenticated/unauthorized access behavior;
- RPC lifecycle transitions;
- trigger/constraint enforcement;
- cross-company rejection;
- immutable/finalized history guards;
- overbilling/overcollection/settlement ceilings;
- concurrent transaction and row-lock behavior;
- historical-data upgrade compatibility;
- backup/restore drills when that infrastructure is the task.

Static SQL/migration string tests are useful but **do not substitute for runtime DB validation**.

### When Docker should NOT be started

Do not start Supabase containers merely because Docker is available for:

- UI-only changes;
- documentation-only changes;
- isolated client-side formatting/filtering;
- unrelated application logic with no DB contract change.

Use the cheapest sufficient changed-surface validation.

### If Docker/runtime validation is unavailable

If Docker Desktop, Supabase CLI, ports, or local containers are unavailable:

- report the exact blocker once;
- run the strongest remaining static/focused checks;
- explicitly state which DB runtime checks were **not run**;
- never claim static tests are equivalent to replay/pgTAP/runtime validation;
- exact-head GitHub DB CI remains the final automated gate, but local runtime absence must be disclosed for DB-affecting work.

Do not close Docker Desktop itself. Stop only repo-specific servers/containers started by the run when cleanup is appropriate; if the user intentionally keeps the local Supabase stack running, report that fact rather than shutting down their environment unexpectedly.

## Test execution and validation optimization

Engoryx uses impact-based selection. `npm test` / `npm run test:full` remains the complete historical regression suite but is not the default per-phase command.

### Validation ladder

1. new/edited tests directly;
2. focused domain tests;
3. `npm.cmd run test:affected:agent`;
4. `npm.cmd run test:smoke` when useful;
5. `npm.cmd run lint` after implementation stabilizes;
6. `npm.cmd run build` for production/runtime/UI integration or PR handoff when relevant;
7. Docker/Supabase DB validation only for database-affecting changes;
8. Workflow Map checks only when mapped contracts/generated inputs changed;
9. targeted browser QA for significant user-facing changes;
10. full regression only when justified.

### Full-suite rule

Run `npm.cmd run test:full` locally only when at least one is true:

- impact analysis explicitly falls back to full coverage;
- a broad shared/root contract changed and the selector cannot prove safe isolation;
- architecture changed unusually broadly;
- dependency/toolchain/test-runner infrastructure changed;
- the user/lead explicitly requests it;
- preparing a release/deep regression outside normal phase work;
- exact-head CI or targeted validation indicates wider coverage is needed.

Do not run the full suite at the start of a phase from just-merged green `main`, and do not run it repeatedly during implementation.

## Browser scope

For significant user-facing work, test the changed workflow and important responsive states in a capable environment. Do not turn targeted browser QA into a whole-app crawl.

Never claim a runtime/browser/database check passed when it was skipped or unavailable.

## Windows local commands

Verified local environment is Windows PowerShell. Prefer `npm.cmd` / `npx.cmd` because plain shims may be blocked. Check for an existing dev server or local Supabase stack before starting another.

## Git and publishing safety

Prefer focused branches/PRs. Never force-push by default or rewrite production history.

Local Codex should push/open the PR and report exact validation. The GitHub-native lead reviews exact-head CI, fixes/coordinates concrete failures, and merges when safe under the current conversation workflow.

Do not merge critical security/data work until required exact-head CI is reviewed.

## Prompt-creation rules for future phases

Every new phase prompt should:

1. start from current latest green `main` and report its SHA;
2. avoid ritual full-suite baseline reruns;
3. state objective, acceptance criteria, financial/security invariants, and explicit out-of-scope items;
4. require one bounded `agent:context` packet first;
5. tell the **Codex lead to implement the phase itself**;
6. assume **no Luna/Gemini/Antigravity/external paid agent** unless the user explicitly re-enables one;
7. default to zero subagents, never more than two concurrent Codex-internal subagents if genuinely useful;
8. require focused tests then `test:affected:agent`;
9. require Docker-backed Supabase runtime validation for DB/RPC/RLS/trigger/migration changes;
10. skip Docker for UI-only/non-DB work;
11. require lint/build/browser/Workflow Map only when relevant;
12. reserve `test:full` for justified escalation/fallback;
13. require concise diff review and exact validation results;
14. tell local Codex to open the PR but not merge it; the GitHub-native lead handles review/merge.

### Default phase-prompt wording

Use wording equivalent to:

> Start from current latest `main` and confirm the exact green base SHA. Do not rerun the historical full suite before implementation unless the baseline is genuinely untrusted. Generate one bounded `npm.cmd run agent:context -- ...` packet and use it as the initial working set. The Codex lead owns the implementation and continues work itself; do not assume Luna, Gemini, Antigravity, or another external paid coding agent is available. Use zero subagents by default and never more than two concurrent internal Codex subagents for genuinely independent bounded work. Run focused/new tests while iterating, then `npm.cmd run test:affected:agent`. If migrations, RLS, RPCs, triggers, database contracts, or concurrency rules change, use the available Docker Desktop/local Supabase stack for clean replay, pgTAP, upgrade-path and relevant runtime/concurrency checks before PR completion; if Docker is unavailable, disclose exactly what could not be run. Do not start Docker for UI-only/non-DB work. Run lint/build/browser/Workflow Map checks only when the changed surface requires them. Open the PR but do not merge it; exact-head CI is the final automated gate and the GitHub-native lead will review/merge when safe.

## Background process cleanup

Stop dev servers, watchers, and repo-specific processes/containers started by the run when appropriate. Do not shut down the user's Docker Desktop application.

For substantial local runs report whether background processes started by the run remain.

## Final handoff

For substantial work report concisely:

- starting/base SHA;
- branch/final SHA and PR;
- major changed files/migrations;
- tests/checks actually run and results;
- Docker/Supabase runtime checks run, or exact unavailable blocker;
- browser/Workflow Map results when relevant;
- skipped validation;
- remaining limitations/follow-up;
- agent-context selector used;
- subagents used, if any.

## Repository learning rule

`AGENTS.md` is persistent operational memory, not a transcript. Keep it compact. Persist reusable rules and remove obsolete/contradictory guidance instead of layering new instructions on top.

## Definition of done

A substantial task is done when current repository state was verified, scope stayed disciplined, financial/security/history semantics were preserved, changed files were reviewed, appropriate changed-surface validation was obtained, required Docker/Supabase runtime evidence was obtained for DB-affecting work when available, exact-head CI was checked, and the handoff clearly states what did and did not pass.
