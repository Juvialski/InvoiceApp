# InvoiceApp / Engoryx Development & Agent Rules

These rules apply only to this repository. The repository may still be named `InvoiceApp`; use the current Engoryx product naming and live repository state.

## Architecture baseline

Engoryx is permanently designed as:

`one deployment -> one client company -> active membership/RBAC -> permitted workflows`

Each client company receives a separate deployment, Supabase project/database, Storage, environment configuration, and users. Do not add unrelated-company switching or tenant selection to the client app.

Keep `company_id`, company-prefixed Storage paths, RLS, membership checks, permission checks, and company-bound foreign-key validation as defense in depth.

## Current product mode: CORE HARDENING FREEZE

Until the user explicitly lifts this freeze, do not implement new planned/future product modules such as Scheduling/Gantt/CPM or other roadmap expansion.

Prioritize completion and hardening of features that already exist:

1. editable deployment-company profile and first-run setup;
2. real user invitation delivery and invitation lifecycle;
3. per-member permission customization using the existing granular permission vocabulary;
4. safe correction/removal semantics for accidental inputs;
5. Assistant parity with authorized deterministic workflows;
6. CRUD/lifecycle completeness across existing modules;
7. RBAC/RLS/security and financial-integrity audits;
8. browser/mobile/UX completion and production-readiness regression work.

See `docs/ENGORYX_CORE_HARDENING_PLAN.md` for the active hardening sequence.

## Lead and tool routing

Use the least expensive tool that can safely complete the work.

- **ChatGPT with authorized GitHub access**: default lead, investigator, reviewer, integrator, CI reviewer, straightforward GitHub editor, and finisher.
- **Codex**: use when difficult multi-file reasoning, local execution, Supabase CLI/Docker, migration replay, complex tests, or runtime debugging materially helps.
- **Antigravity**: prefer for browser-driven UI/UX, responsive work, screenshots, and visual QA.
- **Kilo/OpenRouter/free models**: prefer for tightly bounded mechanical Tier 0 and low-risk Tier 1 changes with an established pattern.

Do not spend Codex/Luna usage on mechanical edits, CI polling, documentation-only work, or broad repository rereads that the lead can handle.

Kilo/free models must not independently design RLS, authentication/authorization, destructive operations, production migrations, payroll-history semantics, finalized financial history, tenant isolation, or other high-risk shared contracts.

## Repository freshness

Before implementation:

1. inspect the current branch and HEAD;
2. inspect recent `main` and relevant open PR/CI state;
3. inspect working-tree status when local access exists;
4. never rely on an old prompt SHA or previous-chat snapshot when the repository has moved.

Do not overwrite newer work. Do not reset/recreate an active implementation branch unless explicitly required.

## Mandatory bounded WM-5 context workflow

For substantial feature-scoped implementation, debugging, security, financial, or architecture work, WM-5 is the default orientation path.

### Start narrow

Before broad source inspection, run one targeted packet such as:

```text
npm.cmd run workflow-map:context -- --domain workforce --query "worker removal" --hops 1 --budget 12000
```

or use an exact node/route/file selector when known.

Rules:

1. Default to **1 hop** and about **10,000-12,000 characters**. Never exceed WM-5's 20,000-character maximum merely to avoid choosing a better query.
2. Record the selector/query and packet size in the working notes or final handoff for substantial Codex runs.
3. Use the packet to identify the smallest relevant set of routes, guards, permissions, invariants, source files, and tests.
4. Inspect actual source before editing, but prefer targeted `rg`, exact symbols, and bounded line ranges over whole-file dumps.
5. Open a second narrow WM-5 packet only when the first packet reveals a genuine adjacent boundary. Do not compensate for uncertainty by scanning the entire repository.
6. Do not load complete `docs/architecture/APP_WORKFLOW_MAP.md` or `docs/architecture/workflow-map.json` for scoped work. Full-map loading is reserved for genuinely broad architecture work.
7. Do not read many architecture documents “at minimum” when a bounded packet plus the canonical source can answer the task.
8. If a task expands across multiple unrelated domains, split it into separate PR-sized waves instead of continuing one ever-growing session.

WM-5 is advisory context, not a substitute for source, CI, runtime evidence, RLS, or migration validation.

### Context/output discipline

Expensive local agents must actively limit context growth:

- do not dump whole large files when a symbol/range is sufficient;
- do not ingest full successful test/build logs; retain the command, exit status, counts, and relevant warnings only;
- on failure, inspect the failing step and the smallest useful error region first;
- do not repeatedly reopen unchanged files or replay unchanged logs;
- use targeted tests during iteration, then broader validation once the narrow failure is fixed;
- do not continuously watch GitHub CI after a PR is pushed.

After pushing a PR, a local Codex/Luna run should normally hand CI monitoring to the GitHub-native lead/user and end. Resume local work only when CI exposes a failure that actually requires local implementation/debugging.

A failed command is debugging evidence, not a reason to blindly rerun it. Use:

`inspect -> diagnose -> make a justified change -> rerun the narrow check -> run broader validation`

Never retry an unchanged failure in a loop.

## Session and PR scope

Use one cohesive implementation objective per agent run and per PR whenever practical.

Do not turn a focused fix into a repository-wide audit. Adjacent issues should be fixed immediately only when required for correctness/safety; otherwise record them for the next hardening wave.

If the changed-file set or reasoning surface grows materially beyond the original objective, reassess and split the work rather than continuing to accumulate context.

## Subagent hard limit

Maximum **2 concurrent subagents**.

If more than two workstreams exist, process them in waves and reuse agents sequentially. The lead owns architecture, shared contracts, conflict-heavy files, security-sensitive integration, migrations spanning domains, final diff review, validation, push/PR integration, and handoff.

### Codex subagents: Luna only

When Codex itself spawns subagents, every subagent must use **Luna at the highest reasoning level available**.

Never substitute Terra, Sol, Opus, Gemini, automatic fallback models, or another non-Luna model. If Luna is unavailable, reuse an available Luna sequentially or let the Codex lead do the work.

## Existing-data correction and removal policy

For current Engoryx modules, use this lifecycle principle unless a stricter domain rule already exists:

- **Unused accidental record**: guarded permanent delete may be appropriate when no dependent/auditable history exists.
- **Used operational record**: archive, deactivate, offboard, cancel, or equivalent reversible lifecycle state.
- **Finalized/auditable financial or engineering history**: void, reverse, supersede, or deliberate correction; never silently erase history.

Do not add raw Delete buttons that bypass dependency/history checks.

## RBAC and Assistant parity

Authorization vocabulary is permission-based, not role-name-based. Existing roles are presets; do not infer access solely from labels such as FINANCE or PAYROLL.

When per-member overrides are implemented, deterministic UI/API authorization, server/RPC checks, RLS, and Assistant tools must resolve the same effective permissions. The Assistant never receives broader authority than the current user.

Destructive or consequential Assistant mutations must preserve the existing prepare/validate/human-confirm/execute boundary.

## Database, migration, and history safety

Protect approved/finalized payroll, verified invoice history, settlement history, engineering history, project cost allocations, committed import provenance, and audit trails.

Once a migration has successfully reached a shared/protected environment, do not edit it in place. Add a forward migration. The only exception is a migration proven never to have applied anywhere and whose failed transaction fully rolled back.

For critical migrations/RLS/security changes, static review alone is insufficient when clean replay/upgrade validation is available.

Never weaken RLS or permission checks merely because a deployment contains one company.

## Git and publishing safety

Prefer focused branches/PRs for non-trivial work. Never force-push by default or rewrite production history.

If a local agent cannot push because of policy/network restrictions, stop retrying after identifying the blocker. Leave a clean local commit and hand publishing to the GitHub-native lead/user.

Do not merge a critical security/data PR until required exact-head CI has been reviewed.

## Validation

Use the actual scripts in current `package.json`. Typical substantial validation includes:

```text
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run test:migrations
```

When workflow-map contracts change, also run the relevant generation/check/consistency/tests.

For migration/RLS work, prefer clean Supabase replay, pgTAP/invariant tests, and historical upgrade-path validation when available.

For significant user-facing work, perform actual browser interaction and responsive QA when the assigned environment supports it. Do not claim a runtime/browser/database check passed when it was skipped or unavailable.

### Windows local commands

The verified local environment is Windows PowerShell. Plain `npm`/`npx` may resolve to blocked `.ps1` shims, so prefer:

```text
npm.cmd ...
npx.cmd ...
```

Common commands:

```text
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run test:migrations
npx.cmd supabase start
npx.cmd supabase db reset
npx.cmd supabase test db
npx.cmd tsx scripts/test-migration-upgrade.ts
```

Check for an existing dev server before starting another one.

## Background process cleanup

Local agents must track and stop all dev servers, watchers, Supabase processes they own, and spawned subagents before final handoff.

For applicable local runs, include:

```text
Background commands/processes started by this run remaining: 0
```

## Final handoff

For substantial work, report concisely:

- starting/base SHA;
- branch and final SHA;
- PR status/link;
- major changes and migrations;
- tests actually run and results;
- lint/build/migration/browser results as applicable;
- validation that was unavailable or skipped;
- remaining limitations or follow-up;
- tools/subagents used.

If Codex subagents were used, report their count and confirm all were Luna.

## Repository learning rule

`AGENTS.md` is persistent operational memory, not a transcript. Keep it concise. Persist only verified, reusable rules. Do not add one-off failures, long incident narratives, provider quota events, or temporary environment noise.

When a rule becomes obsolete, replace or remove it instead of appending another contradictory paragraph.

## Definition of done

A substantial task is done only when current repository state was verified, scope stayed disciplined, implementation preserves security/history semantics, changed files were reviewed, appropriate validation was actually obtained, CI was checked when applicable, and the final handoff clearly states what did and did not pass.
