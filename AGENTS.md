# InvoiceApp / Engoryx Development & Agent Rules

These rules apply only to this repository. The repository may still be named `InvoiceApp`; use current Engoryx naming and live repository state.

## Architecture baseline

Engoryx is permanently:

`one deployment -> one client company -> active membership/RBAC -> permitted workflows`

Each client company gets its own deployment, Supabase project/database, Storage, environment configuration, and users. Do not add unrelated-company switching or tenant selection.

Keep `company_id`, company-prefixed Storage paths, RLS, membership checks, permission checks, and company-bound foreign-key validation as defense in depth.

## Current product direction

Current priority is defined by:

- `docs/ENGORYX_PROJECT_CONTROLS_PRODUCT_DIRECTION.md`
- `docs/ENGORYX_ACTIVE_ROADMAP.md`

Engoryx remains an Engineering Operations Platform focused on **Project Controls + Finance + Field Operations + Engineering Documents**.

Permanent rules:

1. Treat Project as the operational hub without collapsing Finance, Payroll, Engineering, or document provenance into a giant project row.
2. Preserve `projects.contract_value` and `projects.project_budget` as distinct concepts.
3. Derive Actual Cost from authoritative allocations/expenses/payroll and later procurement/subcontract postings; never invent a competing total.
4. Do not double count Invoice, Expense, Payroll, Procurement, Subcontract, Billing, or Settlement sources.
5. Keep Engineering Documents, immutable revisions, RFIs, Submittals, and later engineering-control workflows first-class.
6. Do not delete mature modules just because one deployment hides them. Feature flags are not authorization.
7. Scheduling/Gantt/CPM requires a separately prioritized wave.
8. Storage S1-S4 are complete. S5 remains bounded infrastructure follow-up work.

Approximate implementation order: **P1 Project Controls Foundation -> P2 Procurement + Commercial Operations -> P3 Project Operations UX / Field Operations / Engineering integration**, with S5 separate.

Do not revive the old blanket hardening freeze because historical docs still mention it.

## Lead and tool routing

Use the least expensive capable tool.

- **ChatGPT with GitHub access**: default lead, investigator, reviewer, integrator, CI reviewer, straightforward GitHub editor, prompt creator, and finisher.
- **Codex/Luna**: reserve for difficult multi-file implementation, local execution, Supabase CLI/Docker, migration replay, complex tests, or runtime debugging where local capability materially helps.
- **Antigravity**: prefer for browser-driven UI/UX, responsive work, screenshots, and visual QA.
- **Kilo/OpenRouter/free models**: prefer for tightly bounded mechanical Tier 0 / low-risk Tier 1 work with an established pattern.
- **Medium-capability coding models** may implement bounded, well-specified waves, but the lead retains shared architecture, financial truth, migrations/RLS/security, destructive lifecycle policy, and final validation decisions.

Do not spend Luna time on documentation-only edits, CI polling, broad repository rereads, routine browser checks, mechanical formatting, or tests that current green-main evidence already covers.

Lower-capability agents must not independently redefine RLS, auth, destructive operations, production migrations, payroll-history semantics, finalized financial history, tenant isolation, or other high-risk shared contracts.

## Repository freshness and trusted baseline

Before implementation:

1. inspect current branch/HEAD;
2. inspect current `main` and relevant open PR/CI state;
3. inspect working-tree status when local access exists;
4. never rely on an old prompt SHA or stale chat snapshot.

### Green-main baseline rule

A newly started phase normally begins from a `main` commit that was already fully validated before the previous PR was merged. Treat that exact green `main` SHA as the trusted regression baseline.

**Do not start a new phase by rerunning the full test suite merely to prove the unchanged baseline again.**

At phase start, verify the baseline cheaply:

- current `main`/base SHA matches the intended green head;
- relevant required CI on that SHA was green;
- working tree/branch is clean or understood;
- then begin scoped implementation.

Run baseline tests before editing only when there is concrete reason to distrust the baseline: CI was not green, the environment materially changed, dependencies/toolchain changed outside the validated commit, the user explicitly requests it, or repository state is otherwise uncertain.

Do not overwrite newer work or recreate an active implementation branch without reason.

## WM-5 is the primary navigation layer

For substantial feature, debugging, security, financial, or architecture work, use WM-5 before broad exploration.

Example:

```text
npm.cmd run workflow-map:context -- --domain workforce --query "worker removal" --hops 1 --budget 8000
```

Required orientation:

1. Run **one narrow packet first** using an exact node, route, file, or domain+query selector.
2. Default to **0-1 hops** and roughly **6,000-10,000 characters**. Increase only when the first packet is genuinely insufficient.
3. Establish a compact working set: primary source files, permission/RLS boundary, persistence/RPC boundary, key invariants, and focused tests.
4. Inspect actual source before editing, but use exact symbols, targeted `rg`, and bounded ranges inside that working set.
5. Repository-wide search is fallback for a specific unresolved dependency, not routine orientation.
6. Open a second WM-5 packet only for a concrete adjacent boundary.
7. Do not load complete generated workflow maps for ordinary scoped work.
8. If scope expands across unrelated domains, split the work into PR-sized waves.

WM-5 is navigation context, not a substitute for source, CI, runtime evidence, RLS, migration replay, or database validation.

### Cross-agent use

- Give Codex/Luna, Antigravity, and lower-cost agents the already identified working set; do not make each agent rediscover the repository.
- Antigravity should browser-test exact affected pages/components rather than crawl the whole app.
- Lower-cost agents should stay inside the supplied file/symbol boundary unless a concrete dependency requires escalation.
- The lead owns scope expansion and supplies another narrow packet when necessary.

## Diff-driven implementation and review

After implementation:

1. inspect changed filenames/statistics;
2. review changed hunks and shared contracts;
3. run focused/new tests;
4. run impact-selected validation;
5. run only broader checks justified by the changed surface;
6. rely on exact-head CI as the final automated PR gate.

Do not perform a second broad repository audit after targeted tests pass unless the diff, a failure, or a concrete safety concern justifies it.

## Context and token discipline

All agents must actively minimize context and output without reducing correctness.

- Do not dump whole large files when symbols/ranges are enough.
- Do not ingest full successful logs; retain command, exit status, counts, and relevant warnings.
- On failure, inspect only the failing step and smallest useful error region first.
- Do not repeatedly reopen unchanged files, logs, generated maps, or CI pages.
- Prefer `git diff`, changed hunks, exact symbols, and focused contract checks.
- Do not continuously watch GitHub CI after push; the GitHub-native lead handles CI monitoring.
- Do not ask another agent to repeat discovery already performed by the lead.
- Do not ask subagents for long reports when a short result + changed files + risks is sufficient.
- Do not create speculative tests or documentation unrelated to the current acceptance criteria.
- Do not run browser QA across unaffected modules.

A failed command is evidence:

`inspect -> diagnose -> justified change -> rerun narrow check -> continue validation ladder`

Never loop an unchanged failure.

### Context-pressure guardrails

- Around **50-60%**: stop speculative exploration and keep reads targeted.
- Around **65-75%**: finish known work or split newly discovered adjacent work.
- Above **~75%** with substantial unresolved work: compact/handoff before opening another broad workstream.

Security, financial integrity, RLS, migration, or concurrency evidence may justify additional context. Compaction must not trigger repeated discovery.

## Session and PR scope

Use one cohesive objective per implementation run and PR whenever practical.

Do not turn a focused feature/fix into a repository-wide audit. Fix adjacent issues immediately only when required for correctness or safety; otherwise record them for a later wave.

If a focused task unexpectedly reaches roughly 25-30+ changed files, verify every cluster is required. Generated maps/docs/fixtures may legitimately inflate counts.

## Codex subagent execution

**Hard maximum: 2 concurrent subagents.**

For substantial work with two genuinely independent workstreams, use both slots early **after** the lead establishes the shared contract and narrow working set. Assign non-overlapping ownership and ask subagents to implement + add focused tests, not merely investigate.

Do not spawn subagents for tiny one-file fixes, documentation-only work, CI polling, or work the lead can complete more cheaply than coordinating agents.

Lead owns:

- shared architecture/contracts;
- App.tsx/router/providers/shared primitives and conflict-heavy integration files;
- security/RLS interpretation;
- integration and diff review;
- validation-scope decisions;
- final regression assessment;
- commit/push/PR.

If additional work remains, reuse the same two slots sequentially. Never create a third concurrent subagent.

### Codex subagents: Luna only

Every Codex-spawned subagent must use **Luna at the highest reasoning level available**. Never substitute Terra, Sol, Opus, Gemini, or automatic fallback models. If Luna is unavailable, reuse an available Luna sequentially or let the lead do the work.

Because Luna is expensive/slow, prompts must give Luna an already bounded working set, acceptance criteria, relevant tests, and explicit out-of-scope items. Do not ask Luna to “audit the whole repo first.”

## Existing-data correction and removal

- **Unused accidental record**: guarded permanent delete may be appropriate when no dependent/auditable history exists.
- **Used operational record**: archive, deactivate, offboard, cancel, or equivalent reversible lifecycle state.
- **Finalized/auditable financial or engineering history**: void, reverse, supersede, or deliberate correction; never silently erase history.

Do not add raw Delete paths that bypass dependency/history checks.

## Project Controls financial truth

- `contract_value` is client-facing contract value; `project_budget` is internal approved cost budget.
- Actual Cost derives from lifecycle-eligible invoice allocations, expenses, payroll allocations, and later posted procurement/subcontract costs.
- Committed Cost is distinct from Actual Cost.
- Client billing is distinct from supplier/vendor invoices and Actual Cost.
- Collected values come from actual settlement/payment records.
- Forecast Margin uses explicit contract/variation and forecast-cost semantics.
- Never silently sum mixed currencies.
- Project payroll aggregates must not broaden unauthorized payroll-detail visibility.

## RBAC and Assistant parity

Authorization is permission-based, not role-name-based. Existing roles are presets.

Deterministic UI/API authorization, server/RPC checks, RLS, and Assistant tools must resolve the same effective permissions. The Assistant never receives broader authority than the current user.

Consequential Assistant mutations preserve the prepare/validate/human-confirm/execute boundary.

## Database, migration, and history safety

Protect approved/finalized payroll, verified invoice history, settlement history, engineering history, project cost allocations, committed import provenance, and audit trails.

Once a migration reached a shared/protected environment, do not edit it in place. Add a forward migration unless it is proven never to have applied anywhere and its failed transaction fully rolled back.

Critical migration/RLS/security changes require runtime/replay evidence when available. Never weaken RLS because a deployment contains one company.

## Git and publishing safety

Prefer focused branches/PRs. Never force-push by default or rewrite production history.

If a local agent cannot push because of policy/network restrictions, identify the blocker once, leave a clean local commit, and hand publishing to the GitHub-native lead/user.

Do not merge critical security/data work until required exact-head CI is reviewed.

After pushing a PR, local Codex/Luna should normally stop. Resume it only if exact-head CI reveals a failure that genuinely requires local implementation/debugging.

## Test execution and validation optimization

Engoryx uses impact-based selection. `npm test` / `npm run test:full` remains the complete historical regression suite, but it is **not** the default per-phase or per-iteration command.

### Validation ladder

Use the cheapest sufficient step and escalate only as evidence requires:

1. **New/edited tests directly**: run newly authored or modified test files first.
2. **Focused domain tests**: run the smallest existing tests that prove the changed contract.
3. **Affected suite**: `npm.cmd run test:affected`.
4. **Smoke suite when useful**: `npm.cmd run test:smoke` for quick core invariant coverage.
5. **Lint/typecheck**: `npm.cmd run lint`, normally once after the implementation stabilizes rather than after every edit.
6. **Build**: `npm.cmd run build` when production/runtime/UI integration is affected or before PR handoff when required by the workflow.
7. **Database validation only for database-affecting changes**: migration/static invariants first; Supabase replay/pgTAP/upgrade drill when migrations/RLS/database contracts changed.
8. **Workflow-map checks only when mapped contracts/generated map inputs changed**.
9. **Full regression only when justified** by the rules below or by scheduled/manual CI.

### Full-suite rule

Run `npm.cmd run test:full` locally only when at least one is true:

- impact analysis explicitly falls back to full coverage;
- a broad shared/root contract changed and the selector cannot prove safe isolation;
- architecture changed unusually broadly;
- dependency/toolchain/test-runner infrastructure changed;
- the user/lead explicitly requests a full run;
- preparing a release/deep regression outside normal phase work;
- exact-head CI or targeted validation provides evidence that wider regression coverage is needed.

**Do not run a full suite at the start of a phase when the base is the just-merged green `main`. Do not run it repeatedly during implementation. Do not run it both locally and again manually merely because exact-head CI will already provide the required gate.**

A prior green test does not need manual rerun when neither it nor its dependency graph/contracts changed.

### Database scope

Full database replay (`supabase start`, `supabase db reset`, `supabase test db`, `test:migrations:upgrade`) is mandatory only when migrations/RLS/database contracts require it. Do not start Supabase containers for UI-only or unrelated application changes.

### Browser scope

For significant user-facing work, test the changed workflow and important responsive states in a capable environment. Do not convert targeted browser QA into a whole-app regression crawl.

Never claim a runtime/browser/database check passed when it was skipped or unavailable.

### Windows local commands

Verified local environment is Windows PowerShell. Prefer `npm.cmd` / `npx.cmd` because plain shims may be blocked. Check for an existing dev server before starting another.

## Prompt-creation rules for future phases

Every new phase/continuation prompt must optimize for a trusted green baseline and avoid ritual validation.

A good implementation prompt should:

1. Tell the agent to pull/inspect the current latest `main` and confirm the starting SHA/CI state.
2. State that the previous phase was merged only after green validation, so **do not begin by rerunning the full historical suite** unless the baseline is untrusted.
3. Give the phase objective, acceptance criteria, and explicit out-of-scope items before asking for exploration.
4. Tell the agent to use one narrow WM-5 packet and inspect only the resulting working set.
5. Name likely files/tests when the lead already knows them; do not make Luna rediscover known context.
6. Require focused/new tests during implementation and `test:affected` after integration.
7. Require lint/build/database/browser checks only when relevant to the changed surface.
8. Reserve `test:full` for impact fallback, broad shared-contract change, explicit request, or other justified escalation.
9. Tell Codex to use at most 2 concurrent Luna subagents and only when there are real independent implementation workstreams.
10. Tell subagents to return concise implementation results, changed files, tests, and blockers instead of long narrative reports.
11. Tell the lead to review diffs, integrate shared files, push the PR, then stop local Luna; GitHub-native tooling handles CI monitoring.
12. Treat exact-head CI as the final automated gate. Fix only concrete failures; do not launch another broad audit after green CI.

### Default phase-prompt validation wording

Use wording equivalent to:

> Start from the current latest `main`. Confirm the base SHA and that its required CI is green. Because this phase starts from an already validated merged baseline, do **not** run the full historical test suite before implementation. Use focused/new tests while iterating, then `npm.cmd run test:affected` after integration. Run lint/build/database/workflow-map/browser checks only when the changed surface requires them. Run `npm.cmd run test:full` only if impact analysis falls back, a broad shared contract changed, or concrete evidence requires wider regression coverage. Exact-head PR CI is the final automated gate.

This rule applies to ChatGPT-generated Codex prompts as well as instructions written by repository agents.

## Additional execution-speed rules

- Parallelize only real independent implementation; parallelizing duplicate investigation wastes tokens.
- Give each subagent exact ownership and forbid broad scope expansion without lead approval.
- Prefer one implementation pass + one integration review over repeated “audit then re-audit” cycles.
- Run expensive commands after code stabilizes, not after every small edit.
- Cache/reuse already established architecture facts within the same phase.
- When CI fails, inspect only the failed exact-head job/step first.
- If CI failure is infrastructure/test-runner-only, patch that path without reopening product-domain review unless evidence points there.
- Keep PR descriptions and handoffs factual and compact; avoid repeating the entire roadmap or unchanged architecture.

## Background process cleanup

Local agents must stop dev servers, watchers, Supabase processes they started, and spawned subagents before handoff. For applicable runs report:

```text
Background commands/processes started by this run remaining: 0
```

## Final handoff

For substantial work report concisely:

- starting/base SHA;
- branch/final SHA and PR status;
- major changes/migrations;
- tests/checks actually run and results;
- skipped/unavailable validation;
- remaining limitations/follow-up;
- WM-5 selector(s) used and scope expansion if any;
- tools/subagents used.

If Codex subagents were used, report count and confirm all were Luna.

## Repository learning rule

`AGENTS.md` is persistent operational memory, not a transcript. Keep it compact. Persist only reusable rules; remove obsolete or contradictory guidance instead of appending more layers.

## Definition of done

A substantial task is done when current repository state was verified, scope stayed disciplined, security/history semantics were preserved, changed files were reviewed, appropriate **changed-surface** validation was obtained, required exact-head CI was checked, and the handoff clearly states what did and did not pass.
