# InvoiceApp / Engoryx Development & Agent Rules

These rules apply only to this repository. The repository may still be named `InvoiceApp`; use the current Engoryx product naming and live repository state.

## Architecture baseline

Engoryx is permanently designed as:

`one deployment -> one client company -> active membership/RBAC -> permitted workflows`

Each client company receives a separate deployment, Supabase project/database, Storage, environment configuration, and users. Do not add unrelated-company switching or tenant selection to the client app.

Keep `company_id`, company-prefixed Storage paths, RLS, membership checks, permission checks, and company-bound foreign-key validation as defense in depth.

## Current product mode: CORE HARDENING FREEZE

Until the user explicitly lifts this freeze, do not implement new planned/future modules such as Scheduling/Gantt/CPM or other roadmap expansion.

Prioritize completion and hardening of features that already exist:

1. deployment-company profile and first-run setup;
2. invitation delivery and membership lifecycle;
3. per-member permission customization;
4. safe correction/removal semantics;
5. Assistant parity with authorized deterministic workflows;
6. CRUD/lifecycle completeness;
7. RBAC/RLS/security and financial-integrity audits;
8. browser/mobile/UX and production-readiness regression work.

See `docs/ENGORYX_CORE_HARDENING_PLAN.md` for the active sequence.

## Lead and tool routing

Use the least expensive tool that can safely complete the work.

- **ChatGPT with authorized GitHub access**: default lead, investigator, reviewer, integrator, CI reviewer, straightforward GitHub editor, and finisher.
- **Codex**: reserve for difficult multi-file reasoning, local execution, Supabase CLI/Docker, migration replay, complex tests, or runtime debugging where that capability materially helps.
- **Antigravity**: prefer for browser-driven UI/UX, responsive work, screenshots, and visual QA.
- **Kilo/OpenRouter/free models**: prefer for tightly bounded mechanical Tier 0 and low-risk Tier 1 changes with an established pattern.

Do not spend Codex/Luna usage on mechanical edits, documentation-only work, CI polling, broad repository rereads, or routine browser checks that another available tool can safely perform.

Kilo/free models must not independently design RLS, authentication/authorization, destructive operations, production migrations, payroll-history semantics, finalized financial history, tenant isolation, or other high-risk shared contracts.

## Repository freshness

Before implementation:

1. inspect the current branch and HEAD;
2. inspect recent `main` and relevant open PR/CI state;
3. inspect working-tree status when local access exists;
4. never rely on an old prompt SHA or previous-chat snapshot when the repository has moved.

Do not overwrite newer work. Do not reset/recreate an active implementation branch unless explicitly required.

## WM-5 is the primary navigation layer

For substantial feature-scoped implementation, debugging, security, financial, or architecture work, use WM-5 to establish the working set before broad source exploration.

Example:

```text
npm.cmd run workflow-map:context -- --domain workforce --query "worker removal" --hops 1 --budget 8000
```

The purpose of WM-5 is to avoid rediscovering architecture through repository-wide search. Treat it as the default dependency/navigation index, not as a ceremonial first step.

### Required orientation sequence

1. Run **one narrow packet first**. Prefer an exact node, route, file, or domain+query selector.
2. Default to **0-1 hops** and about **6,000-10,000 characters**. Increase toward 12,000 only when the first packet is genuinely insufficient. Never use the 20,000-character maximum merely to avoid choosing a better selector.
3. From the packet, establish a compact working set: primary source files, permission/RLS boundary, persistence/RPC boundary, key invariants, and focused tests.
4. Inspect actual source before editing, but start inside that working set with exact symbols, targeted `rg`, and bounded line ranges.
5. Repository-wide search is a fallback for a **specific unresolved symbol/dependency**, not a normal second orientation phase.
6. Open a second WM-5 packet only when the first packet reveals a concrete adjacent boundary that matters to correctness.
7. Do not load complete `docs/architecture/APP_WORKFLOW_MAP.md` or `docs/architecture/workflow-map.json` for scoped work. Those generated artifacts are for broad architecture work and validation, not ordinary agent context.
8. Do not read many architecture documents “at minimum” when WM-5 plus canonical source answers the task.
9. If a task expands across unrelated domains, split it into PR-sized waves rather than growing one session indefinitely.

WM-5 is advisory context, not a substitute for source, CI, runtime evidence, RLS, migration replay, or database validation.

### Changed-surface review

After implementation, prefer a **diff-driven** review instead of rediscovering the feature from scratch:

1. inspect changed-file names/statistics;
2. review changed hunks and shared contracts;
3. use focused tests;
4. if mapped architecture changed, use WM-5 with changed-file selectors or the relevant node to verify the affected boundary;
5. then run the required broader validation.

Do not perform a second broad repository audit merely because targeted tests passed. Re-expand only when the diff, a failure, or a concrete safety concern justifies it.

## Context and output discipline

Expensive local agents must actively limit context growth without reducing correctness.

- Do not dump whole large files when a symbol/range is sufficient.
- Do not ingest full successful test/build logs. Retain command, exit status, counts, and relevant warnings only.
- On failure, inspect the failing step and the smallest useful error region first.
- Do not repeatedly reopen unchanged files or replay unchanged logs.
- Use targeted tests during iteration; run broader validation after the narrow issue is fixed.
- Prefer `git diff`, changed hunks, and focused contract checks over rereading every touched file in full.
- Do not repeatedly inspect generated workflow-map outputs after the map checks are green.
- Do not continuously watch GitHub CI after a PR is pushed.
- A successful browser QA pass should not trigger a new broad source audit unless it found a concrete defect.

A failed command is debugging evidence, not a reason to blindly rerun it:

`inspect -> diagnose -> make a justified change -> rerun the narrow check -> run broader validation`

Never retry an unchanged failure in a loop.

### Context-pressure guardrails

When the environment exposes context-window usage, use it as an operational signal, not as an arbitrary correctness cutoff:

- **Around 50-60%**: stop speculative exploration; summarize established facts and keep new reads targeted.
- **Around 65-75%**: reassess scope. Prefer finishing the known implementation/validation path, or split a newly discovered adjacent problem into a follow-up.
- **Above ~75% with substantial unresolved work**: compact or hand off a concise continuation state before opening another broad workstream.
- Security, financial integrity, RLS, migration, or concurrency evidence may justify further inspection; do not skip required proof merely to satisfy a percentage target.

Compaction is a context-management tool, not a reason to repeat earlier discovery after compaction. Continue from the preserved summary and reread only what is necessary.

## Session and PR scope

Use one cohesive implementation objective per agent run and per PR whenever practical.

Do not turn a focused fix into a repository-wide audit. Adjacent issues should be fixed immediately only when required for correctness/safety; otherwise record them for the next wave.

If the changed-file set or reasoning surface grows materially beyond the original objective, reassess and split the work rather than continuing to accumulate context.

For expensive local runs, a large changed-file count is a **scope warning**, not proof of bad work. If a focused task unexpectedly reaches roughly 25-30+ changed files, explicitly verify that each cluster is required by the objective before continuing. Generated map/docs/test fixtures may legitimately inflate the count.

## Subagent hard limit and usage policy

Maximum **2 concurrent subagents**.

Do **not** spawn subagents by default. A focused wave should normally use the lead alone unless there are genuinely separable, non-overlapping investigations that materially reduce risk or elapsed time.

If subagents are useful:

- maximum 2 concurrently;
- give each a narrow, non-overlapping file/domain boundary;
- prevent both agents from rereading the same broad architecture surface;
- require concise findings/decisions, not raw file dumps or full command logs;
- the lead owns architecture, shared contracts, conflict-heavy files, migrations spanning domains, security-sensitive integration, final diff review, validation, push/PR integration, and handoff;
- reuse the same agents sequentially if more workstreams exist.

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

Deterministic UI/API authorization, server/RPC checks, RLS, and Assistant tools must resolve the same effective permissions. The Assistant never receives broader authority than the current user.

Destructive or consequential Assistant mutations must preserve the prepare/validate/human-confirm/execute boundary.

## Database, migration, and history safety

Protect approved/finalized payroll, verified invoice history, settlement history, engineering history, project cost allocations, committed import provenance, and audit trails.

Once a migration has successfully reached a shared/protected environment, do not edit it in place. Add a forward migration. The only exception is a migration proven never to have applied anywhere and whose failed transaction fully rolled back.

For critical migrations/RLS/security changes, static review alone is insufficient when clean replay/upgrade validation is available.

Never weaken RLS or permission checks merely because a deployment contains one company.

## Git and publishing safety

Prefer focused branches/PRs for non-trivial work. Never force-push by default or rewrite production history.

If a local agent cannot push because of policy/network restrictions, stop retrying after identifying the blocker. Leave a clean local commit and hand publishing to the GitHub-native lead/user.

Do not merge a critical security/data PR until required exact-head CI has been reviewed.

After pushing a PR, a local Codex/Luna run should normally stop. GitHub-native tooling/lead handles CI monitoring. Resume the expensive local run only when CI exposes a failure that actually requires local implementation/debugging.

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

For significant user-facing work, perform actual browser interaction and responsive QA when the assigned environment supports it. Test the changed workflow and its important responsive states; do not turn browser QA into an unrelated whole-app audit unless requested.

Do not claim a runtime/browser/database check passed when it was skipped or unavailable.

### Windows local commands

The verified local environment is Windows PowerShell. Plain `npm`/`npx` may resolve to blocked `.ps1` shims, so prefer:

```text
npm.cmd ...
npx.cmd ...
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
- validation unavailable or skipped;
- remaining limitations/follow-up;
- WM-5 selector(s) used and whether scope expanded;
- tools/subagents used.

If Codex subagents were used, report their count and confirm all were Luna.

## Repository learning rule

`AGENTS.md` is persistent operational memory, not a transcript. Keep it concise. Persist only verified, reusable rules. Do not add one-off failures, long incident narratives, provider quota events, or temporary environment noise.

When a rule becomes obsolete, replace or remove it instead of appending another contradictory paragraph.

## Definition of done

A substantial task is done only when current repository state was verified, scope stayed disciplined, implementation preserves security/history semantics, changed files were reviewed, appropriate validation was actually obtained, CI was checked when applicable, and the final handoff clearly states what did and did not pass.
