# InvoiceApp / Engoryx Development & Agent Rules

These instructions apply only to this repository.

The repository may still be named `InvoiceApp` while the product evolves under the Engoryx brand. Agents must use the current repository state and current product naming found in code rather than assuming older names or architecture.

## Default development workflow

Use a capability-aware workflow. The strongest or most expensive agent should not automatically receive every task.

Default responsibility order:

1. **ChatGPT with authorized GitHub access** — default lead engineer, planner, reviewer, integrator, and finisher.
2. **Codex** — complex local implementation and validation specialist.
3. **Antigravity** — UI, browser, visual QA, and medium-complexity implementation specialist.
4. **VS Code + Kilo Code / OpenRouter** — free or low-cost bounded execution for mechanical and low-risk work.

The lead must choose the least expensive/capability-lightest tool that can safely complete a task. Cost savings never override financial integrity, security, migration safety, or correctness.

## ChatGPT / GitHub-native lead role

When an authorized GitHub integration is available, ChatGPT should be treated as the default repository lead and finisher for work it can safely complete remotely.

Typical responsibilities:

- inspect the latest `main`, current HEAD, recent commits, PRs, and CI state;
- investigate bugs and determine root cause;
- design implementation plans and contracts;
- edit repository files directly;
- create focused branches;
- create commits and pull requests;
- review diffs and integrate delegated work;
- inspect CI results and fix straightforward CI failures;
- maintain repository instructions/documentation;
- merge low-risk or adequately validated work when authorized and appropriate;
- identify when local execution is required and delegate only that portion.

A GitHub-native agent must not claim local/runtime validation it did not perform. GitHub access is not equivalent to access to the user's Windows machine, localhost, Docker, Supabase CLI, browser state, or local environment variables.

When a change requires those capabilities, delegate the missing validation or implementation portion to Codex, Antigravity, or Kilo as appropriate.

## Task routing by difficulty and risk

Classify work before delegating it.

### Tier 0 — Mechanical / low-risk

Prefer **Kilo Code with OpenRouter/Nemotron or another free model** when the task can be tightly bounded.

Good examples:

- copy/text changes;
- renaming clearly identified symbols;
- repetitive markup cleanup;
- applying an already-defined spacing/style pattern;
- extracting a simple component with no business-rule changes;
- adding straightforward tests from an exact specification;
- replacing duplication with an existing helper;
- documentation updates;
- mechanical type cleanup.

Tier 0 tasks should normally specify exact files and exact expected behavior.

### Tier 1 — Standard implementation

Prefer **ChatGPT/GitHub**, **Antigravity**, or a stronger Kilo/OpenRouter model depending on environment needs.

Examples:

- isolated CRUD behavior;
- small components;
- straightforward service adapters;
- bounded bug fixes;
- normal UI state changes;
- simple refactors with clear tests.

### Tier 2 — Complex

Prefer **ChatGPT as lead** and use **Codex** when local execution or deeper multi-file reasoning materially helps.

Examples:

- payroll calculations and period logic;
- invoice extraction and review workflows;
- cross-domain state bugs;
- complex project/accounting behavior;
- large multi-file refactors;
- AI assistant actions and tool orchestration;
- non-trivial data synchronization;
- engineering document persistence flows.

### Tier 3 — Critical / high-risk

Use **ChatGPT as lead/reviewer** with **Codex/local validation** whenever possible.

Examples:

- Supabase migrations;
- RLS and tenant isolation;
- authentication/authorization;
- destructive or irreversible operations;
- approved/paid payroll history;
- verified financial history;
- production data migrations;
- security-sensitive integrations;
- schema changes affecting historical meaning.

Do not assign Tier 3 architecture or implementation ownership to a weak/free model solely to save usage.

## Kilo Code / OpenRouter execution policy

Kilo is an execution assistant, not the default architect.

For weaker/free models such as Nemotron:

- give **one cohesive task per prompt**;
- specify exact files whenever practical;
- define the expected before/after behavior;
- define commands it should run;
- prohibit unrelated cleanup;
- prefer tasks with an existing implementation pattern to copy;
- require a diff review before completion.

Kilo/Nemotron must not independently design or modify:

- RLS policies;
- authentication/authorization architecture;
- production migrations;
- payroll-history semantics;
- finalized financial history;
- tenant isolation;
- secrets management;
- high-risk shared contracts;
- destructive operations.

Do not allow a weaker agent to edit `App.tsx`, central shared types, schema/migration files, or security-sensitive services unless the lead provides a narrow explicit specification and plans to review every change.

If the task becomes ambiguous or expands beyond the given specification, the weaker agent should stop and return the unresolved issue rather than invent behavior.

## Antigravity role

Prefer Antigravity for tasks that benefit from browser-driven or visual work, including:

- UI/UX iteration;
- spacing, balance, typography, and responsive fixes;
- screenshot-based audits;
- browser interaction and workflow verification;
- medium-complexity frontend implementation;
- visual regression investigation.

Antigravity should not become the default owner of financial history, migrations, RLS, or security architecture unless explicitly directed and subsequently reviewed by the lead.

## Codex role

Use Codex where premium local reasoning or local machine access justifies the usage, including:

- difficult multi-file implementation;
- root-cause debugging requiring local execution;
- Supabase CLI and Docker validation;
- migration replay/upgrade testing;
- complex test work;
- browser/runtime debugging when Codex has the required tools;
- Windows-specific environment issues;
- difficult integration failures.

Do not spend Codex usage on purely mechanical edits that a lower-cost agent can safely complete.

## Repository freshness

Before any repository implementation work:

- Inspect the current branch.
- Inspect the current HEAD.
- Inspect recent commits.
- Inspect working-tree status when local access exists.
- Inspect relevant open PR/CI state when remote GitHub access exists.
- Use the current codebase rather than relying on an older conversation snapshot.

Never overwrite newer work because a prompt references an older commit or prior chat.

## Workflow graph context

Before substantial implementation, debugging, or architecture work:

1. inspect current `main` and current CI;
2. use `docs/architecture/APP_WORKFLOW_MAP.md` for orientation;
3. identify the affected domain/workflow;
4. search/filter `docs/architecture/workflow-map.json` for that workflow and its neighboring nodes;
5. inspect relevant guards, permissions, invariants, routes, files, and tests;
6. inspect the actual source implementation;
7. load the complete graph only for genuinely broad or cross-domain architecture work;
8. treat the workflow map as advisory context, never as a replacement for source inspection.

When a change materially alters a mapped workflow, lifecycle, route, guard, permission, cross-domain relationship, or high-risk invariant, update `scripts/workflow-map/graph.ts` and regenerate both committed outputs in the same PR. Trivial CSS and internal refactors that do not change workflow meaning do not require graph edits.

When a change materially alters a mapped route, deep-link contract, lifecycle, permission, guard, Assistant mutation contract, QA scenario mapping, or high-risk cross-domain boundary, run `npm.cmd run workflow-map:check` and `npm.cmd run workflow-map:consistency`.

## Session startup / resumption protocol

When returning to this project after a break:

1. Read this `AGENTS.md`.
2. Inspect latest `main` and its recent commits.
3. Check current PRs and CI state when accessible.
4. Inspect the files relevant to the next requested feature/bug.
5. Do not resume an old implementation from memory if the repository has moved.
6. Classify the task by tier and select the appropriate execution tool.
7. Keep the lead responsible for final integration and validation boundaries.

## Subagent concurrency — hard limit

A maximum of **two concurrent subagents** may be used by a lead environment that supports subagents.

Never create three or more concurrent subagents. If more than two workstreams exist, process them in waves.

Preferred structure:

- Agent 1 owns one cohesive group of files or features.
- Agent 2 owns another cohesive group of files or features.
- The lead owns architecture, shared integration files, conflict-heavy files such as `App.tsx`, migrations affecting multiple workstreams, final regression review, validation, and final handoff.

Reuse agents sequentially for later workstreams instead of creating additional concurrent agents.

This concurrency rule applies to subagents spawned inside an agent environment. It does not require simultaneously running every external tool listed in this document.

## Codex-specific subagent model — Luna only

When **Codex itself** spawns subagents, every Codex subagent must use Luna at the highest thinking/reasoning level available for Luna in that environment.

Never let Codex spawn Terra, Sol, Opus, Gemini, another model, an automatic fallback model, or a default non-Luna subagent.

Before spawning a Codex subagent, verify that the selected model is Luna. If Luna is unavailable, unsupported, capacity-limited, or fails model validation, do not substitute another model; reuse an available Luna agent sequentially or have the Codex lead perform the work.

This Luna-only restriction does not prohibit the project lead from intentionally assigning separate bounded work to ChatGPT, Antigravity, or Kilo/OpenRouter under the routing rules above.

## Lead ownership and delegated file boundaries

The lead owns the final result even when another tool performs implementation.

The lead should normally own or reconcile:

- architecture and cross-domain contracts;
- shared types;
- `App.tsx` and other conflict-heavy files;
- shared data/services;
- authentication/authorization;
- security-sensitive files;
- migrations affecting multiple domains;
- final diff review;
- final CI/validation assessment;
- branch/PR integration.

Avoid giving multiple agents overlapping file ownership at the same time. When parallel work is useful, give each agent a cohesive, non-overlapping scope.

## Git and push safety

Before repository work, inspect branch and HEAD. When local access exists, also inspect working tree and origin.

For remote publishing:

1. Prefer an authorized, verified native GitHub integration when available for branch creation, commits, PRs, reviews, and merges.
2. A GitHub-native lead may publish directly when authorized and the change is appropriately validated for its risk level.
3. Local agents may fetch or pull when permitted, create branches, edit files, run commands and validation, stage changes, and create commits.
4. Do not repeatedly attempt shell `git push` when the local environment reports an unverified destination, sensitive egress, auto-review denial, network/policy restriction, or blocked private-repository destination.
5. If a local agent cannot publish, finish implementation and validation, create the local commit, verify the working tree is clean, report branch/final SHA, and hand publishing back to the GitHub-native lead or user.
6. Do not retry a policy-blocked push.
7. Never bypass sandbox restrictions, network security, credential protection, or auto-review.
8. Never force-push unless explicitly requested and safe.

A blocked local push does not mean implementation failed when implementation is complete, validation passed, and a clean local commit exists.

## Branch safety

Do not create unnecessary branches for tiny routine work, but prefer a focused branch/PR for non-trivial or review-worthy changes.

Use a dedicated feature branch for high-risk changes such as:

- multi-tenancy;
- RLS/security redesign;
- destructive database migrations;
- major payroll-history changes;
- authentication/authorization architecture;
- broad financial-data changes.

Never rewrite Git history unnecessarily, force-push by default, delete production history, or auto-merge a critical security/data branch without appropriate validation and authorization.

## Database and financial-history safety

InvoiceApp/Engoryx contains financial and payroll data. Never destructively modify approved or finalized historical data merely to simplify implementation.

Protect:

- Verified invoice history.
- Invoice extraction snapshots.
- Review history.
- Approved payroll.
- Paid payroll.
- Locked payroll periods.
- Historical payroll entries.
- Project cost allocations.
- Committed import provenance.

Migrations should be additive, backfilled, and preserve financial meaning whenever possible.

## Applied migration immutability

Once a migration has successfully reached a shared or protected Supabase environment such as production `main` or staging, do not edit it in place. Always resolve schema corrections, index updates, or data fixes with a new additive migration.

Exception: a migration that has never successfully applied anywhere and is currently the failing unapplied deployment blocker may be corrected in place only after confirming that the failed transaction rolled back completely and no partial objects remain.

## Validation

Before declaring implementation complete, run the relevant validation available in the environment.

Normally include:

```text
npm test
npm run lint
npm run build
npm run test:migrations
```

Use the actual scripts in `package.json` and the environment-specific commands documented later in this file.

Do not claim a command passed if it was not run successfully.

### Validation ownership by environment

**GitHub-native lead:**

- inspect CI/checks when available;
- review diff and repository-level test coverage;
- do not claim local runtime/browser/Supabase validation unless actually performed;
- request local validation for tasks where CI cannot prove the required behavior.

**Local Codex/Antigravity/Kilo execution:**

- run the applicable local commands;
- perform browser/runtime validation when assigned and tools permit;
- report exact results to the lead;
- do not present skipped checks as passes.

For critical migrations/RLS/security changes, static review alone is insufficient when a live/local replay path is available.

## Human-like browser and visual validation

For significant user-facing changes, automated tests alone may not be enough.

When browser tools are available, validate relevant workflows by:

- loading the actual page;
- interacting with buttons/forms/modals;
- checking navigation;
- checking responsive layout;
- testing loading/empty/error states;
- checking refresh/persistence behavior when relevant;
- inspecting console/runtime errors when possible;
- capturing/inspecting screenshots for visual-quality tasks.

Do not claim browser validation if the UI was never rendered.

## Final implementation handoff

For substantial implementation tasks, report:

- Starting SHA.
- Branch.
- Final commit SHA.
- Major changes.
- Migrations added.
- Tests added.
- Tests actually run and results.
- Lint/typecheck result.
- Build result.
- Migration validation result when relevant.
- Runtime/browser validation actually performed.
- Remaining manual or deployment steps.
- Whether remote publishing/PR/merge succeeded or requires handoff.
- Which execution tools were used and for what scope.

For local agent runs that start background processes, also include the exact confirmation line:

```text
Background commands/processes started by this run remaining: 0
```

If Codex subagents were used, also report the number of subagents, Luna model/tier, visible reasoning level when available, and confirmation that no non-Luna Codex subagent was created.

## Background process and command cleanup

All background processes, dev servers, watchers, subagents, and long-running shell commands launched by a local agent during a task run MUST be explicitly tracked and terminated before completing that local run.

### Cleanup protocol

1. **Agent lifecycle tracking**: every local subagent/lead tracks background processes it starts.
2. **Subagent cleanup**: subagents terminate their own dev servers, tasks, and watchers before returning completion.
3. **Lead final sweep**: before local handoff, perform a final sweep (for example task-list and port inspection) to ensure no orphaned processes remain.
4. **Mandatory confirmation line for applicable local runs**:

```text
Background commands/processes started by this run remaining: 0
```

GitHub-native edits that do not start local processes do not need to pretend this check was performed.

## Verified local execution / agent runbook

This section contains the exact previously verified commands and procedures for the user's Windows PowerShell environment. Future local agents MUST use these commands first unless they verify that the environment has changed.

### Environment

- **OS / Shell**: Windows 11 / PowerShell (`pwsh` / `powershell.exe`).
- **Executable Resolution**: Plain `npm` and `npx` resolve to `npm.ps1` and `npx.ps1`, which fail with `PSSecurityException: UnauthorizedAccess` because PowerShell script execution is restricted.
- **Mandatory Suffix**: use `npm.cmd` and `npx.cmd` in PowerShell tool commands (for example `npm.cmd test`, `npx.cmd tsx server.ts`).

### Development server

- **Working Directory**: `c:\Users\Al\Documents\InvoiceApp`
- **Command**: `npx.cmd tsx server.ts` (or `npm.cmd run dev`)
- **Execution Mode**: run as a daemon/background support process when the agent environment supports that (`IsDaemon: true`, `WaitMsBeforeAsync: 3000`).
- **Port**: default `3000` (from `PORT || 3000`), listening on `http://0.0.0.0:3000`.
- **Readiness Check**: verify server readiness with a request to `http://localhost:3000/` or the current startup message emitted by the repository.
- **Reuse Existing Server**: before spawning a new server, check whether port 3000 or an existing background task is already active.

### Tests

**Full suite:**

```text
npm.cmd test
```

or directly via Node when appropriate:

```text
node --test --experimental-strip-types tests/*.test.ts
```

**Targeted test:**

```text
node --test --experimental-strip-types tests/<test-file-name>.test.ts
```

Example:

```text
node --test --experimental-strip-types tests/cashBanking.test.ts
```

**Targeted pattern:**

```text
node --test --experimental-strip-types tests/payroll*.test.ts
```

This repository uses the Node.js native test runner (`node:test`). Do not supply Jest/Vitest-only flags such as `--run`, `--watch=false`, or `-t` unless the repository test setup changes and is verified.

### Validation

**Lint / typecheck:**

```text
npm.cmd run lint
```

Historically this runs `tsc --noEmit`; verify `package.json` if scripts change.

**Build:**

```text
npm.cmd run build
```

Historically this runs Vite plus the bundled server build; verify `package.json` if scripts change.

**Database migration validation:**

```text
npm.cmd run test:migrations
```

This performs static migration invariants and may attempt live replay/upgrades if local Supabase/PostgreSQL is available.

### Database migration testing procedures

1. **Local pre-push migration test**

```powershell
npm.cmd run test:migrations
```

2. **Local Supabase startup (requires Docker)**

```powershell
npx.cmd supabase start
```

3. **Clean migration replay/reset**

```powershell
npx.cmd supabase db reset
```

4. **Database schema/invariant assertions (pgTAP)**

```powershell
npx.cmd supabase test db
```

5. **Upgrade-path suite with historical seed rows**

```powershell
npx.cmd tsx scripts/test-migration-upgrade.ts
```

6. **GitHub Actions check**

- `Database Migrations & Upgrade Suite` is defined in `.github/workflows/database-tests.yml` and should remain required in branch protection for `main` when that workflow is present and active.

### Known command pitfalls

1. **`npm: PSSecurityException`**: plain `npm` may call `npm.ps1`; use `npm.cmd`.
2. **`npx: PSSecurityException`**: plain `npx` may call `npx.ps1`; use `npx.cmd`.
3. **Line endings in regex**: Windows checkouts may use CRLF (`\r\n`). Tests inspecting source should use `\r?\n` or `\s+` instead of assuming raw `\n`.
4. **Dev server is long-running**: do not treat a server as failed merely because it does not exit immediately; manage it as a tracked background process.

## Anti-retry guidance

Never retry an unchanged failed command blindly.

After any command fails:

1. Read the actual error and exit code.
2. Determine whether the cause is syntax, executable resolution, shell behavior, working directory, environment, process lifecycle, port/readiness, network/policy, or source code.
3. Make one informed, targeted retry only after changing the relevant condition.

This applies equally to local commands, GitHub writes, CI fixes, and external-agent delegation.

## Repository learning rule

`AGENTS.md` is the repository's persistent operational memory.

If a future agent discovers that a documented execution command, architecture assumption, tool role, or procedure is obsolete:

1. verify the replacement successfully or verify the new repository state;
2. determine why the old instruction no longer applies;
3. update `AGENTS.md` in the same implementation session when appropriate;
4. mention the update in the final handoff.

Do not persist transient sandbox, network, provider, quota, or one-off failures as permanent repository rules.

## Scope discipline

Fix the requested problem first.

Agents may identify adjacent issues, but should not automatically expand a task into unrelated cleanup. Fix adjacent issues immediately only when necessary for correctness or safety; otherwise report them for follow-up.

Keep diffs reviewable and preserve working behavior.

## Definition of done

A substantial task is complete only when the lead has:

1. inspected the current repository state;
2. selected the appropriate execution tier/tool;
3. implemented or integrated the requested behavior;
4. preserved unrelated working behavior and historical meaning;
5. reviewed all changed files/diffs;
6. reconciled delegated work;
7. run or obtained the applicable validation for the risk level;
8. clearly identified any validation that could not be performed;
9. checked CI when applicable;
10. prepared a concise final handoff with branch/commit/PR status.

The lead remains responsible for the final result regardless of which tool performed the individual edits.
