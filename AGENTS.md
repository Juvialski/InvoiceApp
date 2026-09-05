# InvoiceApp / HydroQualiSense Development & Agent Rules

These rules apply only to `Juvialski/InvoiceApp`.

The repository may remain named `InvoiceApp`, but the product is **HydroQualiSense** and the canonical production domain is `https://hydroqualisense.com`.

## Architecture baseline

HydroQualiSense is permanently:

`one deployment -> one client company -> active membership/RBAC -> permitted workflows`

Keep `company_id`, company-prefixed Storage paths, RLS, membership checks, permission checks, and company-bound foreign-key validation as defense in depth. Do not add unrelated-company switching or tenant selection.

## Current product direction

Authoritative current product documents:

- `docs/HYDROQUALISENSE_PRODUCT_DIRECTION.md`
- `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`

The previous Engoryx future roadmap is cancelled as implementation authority. Historical phase/design documents may still explain already-built behavior, but no old planned/deferred/future phase is automatically authorized.

Current confirmed forward direction is limited to:

1. remove legacy product branding and make **HydroQualiSense** the exclusive application identity;
2. add a warehouse inventory system with traceable stock and project allocation/issue relationships;
3. simplify invoice workflows so supplier/company-paid invoice activity belongs directly with expenses/payables and outgoing client invoices/payment state belongs directly with client billing/receivables, rather than remaining a separate generic invoice branch;
4. wait for the client's remaining requirements before creating a detailed new implementation sequence.

Do not infer missing inventory, accounting, payment, settlement, or lifecycle rules. Preserve existing validated behavior and history until the replacement contract is explicit.

### Permanent product and financial rules

1. Project remains an important operational context, but authoritative Finance, Payroll, Procurement, Engineering, Inventory, and document history must retain explicit source semantics.
2. Preserve `projects.contract_value` and `projects.project_budget` as distinct concepts unless a later approved contract explicitly changes them.
3. Derive Actual Cost from authoritative lifecycle-eligible allocations/expenses/payroll/downstream sources; never invent a competing total.
4. Committed Cost is distinct from Actual Cost.
5. Client billing is distinct from supplier/vendor obligations and Actual Cost.
6. Collected-to-date derives from authoritative recorded client collections; bank/cash settlement linkage is separate reconciliation evidence and must not double-count collection truth.
7. Never silently sum mixed currencies or invent FX.
8. Forecast/EAC/Margin require explicit authoritative source semantics.
9. Project payroll aggregates must never broaden unauthorized payroll-detail visibility.
10. Engineering Documents and other auditable engineering history remain first-class until the client explicitly changes that requirement.
11. Inventory stock must be explainable from authoritative movements or an equally rigorous source model; project allocation must not be implemented as destructive balance editing.
12. Navigation/UX simplification is not permission to collapse or rewrite finalized financial history.
13. Do not delete mature modules merely because they are absent from the temporary requirements list; large removals wait for the complete client requirements and dependency/history review.
14. Scheduling/Gantt/CPM and other old future phases are not authorized unless the client reprioritizes them.

## Tool and model policy — accelerated pre-demo mode

HydroQualiSense is being prepared for presentation to multiple potential clients on **Thursday, September 10, 2026**. Until that presentation is complete, favor faster safe delivery over the previous single-agent default.

### Lead ownership

**Codex remains the default lead implementation engine.** The lead must continue implementation and integration rather than becoming a dispatcher that waits for subagents.

The lead owns:

- architecture and source-of-truth decisions;
- shared files and conflict-heavy integration;
- financial semantics;
- migrations/RLS/RPC/trigger interpretation;
- inventory balance and lifecycle semantics;
- destructive lifecycle policy;
- App/router/provider integration;
- final diff review;
- validation scope;
- commit/push/PR delivery.

### Luna acceleration

**Luna is explicitly available for the current accelerated sprint.** Do not treat older Codex-only wording as current policy.

- Up to **5 concurrent Luna subagents** may be used.
- The user has explicitly authorized this higher parallelism for the pre-demo push and has banked usage resets available.
- Prefer Luna subagents for genuinely parallel, bounded implementation/review/test work that does not require competing ownership of the same shared files.
- Use fewer than five when the work does not divide cleanly; five is a ceiling, not a quota.
- Do not create duplicate broad audits or five agents solving the same problem.
- Give every subagent a narrow objective, explicit owned files/domain, acceptance criteria, and stop boundary.
- Subagents must return concise findings/diffs/test evidence to the lead; the lead integrates and validates.
- Stop stalled or low-value subagents instead of repeatedly restarting them.
- Do not let parallelism weaken financial, security, RLS, migration, inventory, or history guarantees.

### Other agents

Do not assume Gemini, Antigravity, OpenRouter, Kilo, or another paid/external implementation agent is available unless the user explicitly enables it.

After the September 10 presentation, reassess whether the temporary five-Luna acceleration limit should remain before carrying it into later phases.

## Repository freshness and trusted baseline

Before implementation:

1. inspect current branch/HEAD;
2. inspect latest `main` and relevant open PR/exact-head CI state;
3. inspect working-tree status when local access exists;
4. read this `AGENTS.md`;
5. read `docs/AGENT_EXECUTION_EFFICIENCY.md` when implementation/testing workflow matters;
6. read `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md` when deciding the next phase;
7. never rely on an old prompt SHA, old roadmap, stale chat snapshot, or historical Engoryx plan.

A newly started phase normally begins from a `main` commit already validated before the prior PR was merged. Treat that green main SHA as the trusted baseline unless evidence says otherwise.

Do not rerun the historical full suite merely because a new phase starts.

## Agent context / Workflow Map

For substantial feature, debugging, security, financial, or architecture work, generate one bounded repository-native packet first:

```text
npm.cmd run agent:context -- --task "<objective>" --domain <domain> --hops 1 --budget 10000
```

Default orientation:

- one bounded packet for the lead;
- 0-1 workflow hops;
- roughly 8,000-12,000 characters;
- normally 6-8 primary source files on first pass;
- exact symbols/ranges instead of whole-file dumps;
- repository-wide search only for a named unresolved dependency.

When Luna subagents are used, the lead should derive narrow assignments from the same source-of-truth context rather than making every subagent repeat repository-wide discovery.

If no Workflow Map node matches, accept the documented changed-file/impact fallback. Do not retry speculative keyword variants merely to force a map match.

Workflow Map is navigation only. Current source, migrations, runtime behavior, RLS, tests, and exact-head CI remain authoritative.

Detailed execution guidance lives in `docs/AGENT_EXECUTION_EFFICIENCY.md`.

## Implementation workflow

For a fresh phase:

1. start from current latest green `main`;
2. do not rerun the historical full suite merely because a phase started;
3. generate one bounded `agent:context` packet;
4. inspect the existing implementation before designing;
5. split only genuinely independent work to Luna subagents, up to five concurrent during the accelerated sprint;
6. keep the lead implementing the critical/shared path continuously;
7. integrate subagent work promptly and resolve shared-contract decisions centrally;
8. run new/edited tests;
9. run focused domain tests;
10. run `npm.cmd run test:affected:agent`;
11. run lint/build/browser/Workflow Map checks only when relevant;
12. use Docker-backed local Supabase validation when DB contracts change;
13. review the final integrated diff for correctness and scope creep;
14. push a feature branch and open a PR;
15. the local implementation lead must **not merge its own PR**.

Run `test:full` only when impact analysis falls back, a broad shared contract genuinely requires it, CI/failures justify it, release/deep regression requires it, or it is explicitly requested.

## Parallel-work ownership rules

Parallelism is for throughput, not fragmented architecture.

- Prefer independent vertical slices, isolated UI surfaces, test additions, targeted audits, documentation, or bounded migration/test investigations.
- Avoid concurrent edits to central routing, shared providers, financial source-of-truth helpers, core migration files, or the same schema contract unless the lead explicitly owns and coordinates them.
- A Luna subagent may investigate financial/security/DB behavior, but the lead owns the final interpretation and integration.
- Do not merge partial subagent output without reviewing the actual diff.
- Validation occurs on the **integrated final branch**, not only inside isolated subagent worktrees.

## Diff-driven review

After implementation:

1. inspect changed filenames/statistics;
2. review changed hunks and shared contracts;
3. run new/edited tests;
4. run focused domain tests;
5. run compact affected validation;
6. escalate only when the changed surface or a failure justifies it;
7. use exact-head PR CI as the final automated merge gate.

Do not turn a focused feature into a repository-wide audit. Fix adjacent issues immediately only when required for correctness/safety; otherwise leave them for later prioritization.

## Context and log discipline

- Do not dump whole large files when symbols/ranges are enough.
- Do not ingest full successful logs; retain command, exit status, counts, and relevant warnings.
- Prefer `npm.cmd run test:affected:agent` for compact agent-facing validation.
- On failure, inspect the failed command/step and smallest useful error region first.
- Use `npm.cmd run ci:failure-context -- --file <log>` for oversized saved logs.
- Do not repeatedly reopen unchanged files, logs, generated maps, or CI pages.
- Never loop an unchanged failure.
- Do not make each Luna subagent regenerate the same context or rerun the same expensive broad checks.

Failure loop:

`inspect -> diagnose -> justified change -> rerun narrow check -> continue validation ladder`

## Existing-data correction and removal

- **Unused accidental record**: guarded permanent delete may be appropriate only when no dependent/auditable history exists.
- **Used operational record**: archive, deactivate, offboard, cancel, or equivalent reversible lifecycle state.
- **Finalized/auditable financial, inventory, engineering, or payroll history**: void, reverse, supersede, or deliberate correction; never silently erase history.

Do not add raw Delete paths that bypass dependency/history checks.

## RBAC and Assistant parity

Authorization is permission-based, not role-name-based. Existing roles are presets.

Deterministic UI/API authorization, server/RPC checks, RLS, and Assistant tools must resolve the same effective permissions. The Assistant never receives broader authority than the current user.

Consequential Assistant mutations preserve prepare/validate/human-confirm/execute boundaries.

## Database, migration, and history safety

Protect approved/finalized payroll, verified invoice/source-document history, expense/payable history, client billing/collection/settlement history, inventory movement/allocation history, engineering history, project cost allocations, committed procurement provenance, and audit trails.

Once a migration reached a shared/protected environment, do not edit it in place. Add a forward migration unless it is proven never to have applied anywhere and its failed transaction fully rolled back.

Never weaken RLS because the deployment contains one company.

## Docker / local Supabase validation contract

Docker Desktop is normally available on the user's laptop.

Use real local Supabase validation when work changes:

- migrations;
- RLS/grants;
- RPC / SECURITY DEFINER behavior;
- triggers/constraints;
- financial lifecycle guards;
- inventory balance/movement/allocation guards;
- company-bound integrity;
- migration upgrades;
- DB concurrency/row locking.

Expected applicable validation includes:

```text
docker info
npx.cmd supabase start
npx.cmd supabase db reset --local --no-seed --yes
npx.cmd supabase test db --local
npm.cmd run test:migrations
npm.cmd run test:migrations:upgrade
```

Add relevant runtime/RPC/concurrency tests for the changed contract.

Static SQL/string tests are not equivalent to runtime database validation.

Do **not** start Docker/Supabase for UI-only, documentation-only, or unrelated non-DB work.

If Docker is unavailable, state exactly which runtime checks were not performed.

Do not close Docker Desktop itself. Stop only repo-specific servers/containers started by the run when cleanup is appropriate.

## Validation ladder

1. new/edited tests directly;
2. focused domain tests;
3. `npm.cmd run test:affected:agent`;
4. `npm.cmd run test:smoke` when useful;
5. `npm.cmd run lint` after implementation stabilizes;
6. `npm.cmd run build` for production/runtime/UI integration when relevant;
7. Docker/Supabase DB validation only for database-affecting changes;
8. Workflow Map checks only when mapped contracts/generated inputs changed;
9. targeted browser QA for significant user-facing changes;
10. full regression only when justified.

Parallel subagent checks may shorten iteration, but the integrated branch must still complete the applicable validation ladder.

## Browser scope

For significant user-facing work, test the changed workflow and important responsive states in a capable environment. Do not turn targeted browser QA into a whole-app crawl.

Never claim a runtime/browser/database check passed when it was skipped or unavailable.

## Windows local commands

Verified local environment is Windows PowerShell. Prefer `npm.cmd` / `npx.cmd` because plain shims may be blocked. Check for an existing dev server or local Supabase stack before starting another.

## Git and publishing safety

Prefer focused branches/PRs. Never force-push by default or rewrite production history.

The local implementation lead should push/open the PR and report exact validation. The GitHub-native lead reviews exact-head CI, fixes or coordinates concrete failures, and merges when safe under the current conversation workflow.

Never use CI from an older PR head as proof for a newer head.

Do not merge when there is a real safety, security, data-integrity, migration, or failing-CI blocker.

## PR review / merge workflow

When the user asks ChatGPT to check, review, fix, finalize, prepare the next phase, or similar:

1. inspect the live PR and exact current head;
2. review the complete relevant diff;
3. fix concrete issues if necessary;
4. add regression coverage when appropriate;
5. re-check the new exact head;
6. verify required CI belongs to that exact head;
7. confirm base/head/mergeability and unresolved review blockers;
8. **merge automatically if safe; do not ask for separate merge confirmation**;
9. re-check `main`;
10. if the user asked for the next phase/prompt, provide it immediately after the safe merge.

## Prompt-creation rules for future phases

Do not create a new implementation prompt from an old Engoryx phase plan. The current HydroQualiSense roadmap controls scope.

During the accelerated pre-demo sprint, every implementation prompt should carry forward:

- current exact `main` SHA;
- Codex as lead implementation owner;
- **Luna explicitly enabled with up to 5 concurrent subagents**;
- lead ownership of architecture/shared contracts/integration;
- one bounded lead context packet and narrow subagent assignments;
- current financial/security/history/inventory invariants;
- explicit scope and out-of-scope boundaries;
- focused -> affected validation;
- conditional Docker validation;
- no ritual full-suite runs;
- exact integrated diff review;
- PR creation without local-agent self-merging.

For deliberately wide/unattended runs, give the lead an explicit priority order and stop boundary. Do not let spare time or spare subagent capacity turn into unrelated scope creep or an unvalidated new DB domain.

After September 10, explicitly reassess the five-Luna allowance before generating later implementation prompts.

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
- Luna/Codex subagents used, their assignments, and whether any were stopped.

## Repository learning rule

`AGENTS.md` is persistent operational memory, not a transcript. Keep it compact. Persist reusable rules and remove obsolete/contradictory guidance instead of layering new instructions on top.

## Definition of done

A substantial task is done when current repository state was verified, scope stayed disciplined, financial/security/history semantics were preserved, subagent work was integrated and reviewed, changed files were reviewed, appropriate changed-surface validation was obtained, required Docker/Supabase runtime evidence was obtained for DB-affecting work when available, exact-head CI was checked, and the handoff clearly states what did and did not pass.