# HydroQualiSense Agent Execution Efficiency

This document defines the repository-native low-context workflow for ChatGPT + Codex. It complements `AGENTS.md`; correctness, security, financial truth, RLS, migration safety, runtime evidence, and exact-head CI remain higher priority than speed.

## Goal

Reduce duplicate discovery, unnecessary tests, oversized logs, and idle agent coordination without weakening validation.

Default flow:

1. trust the exact green `main` baseline from the previous merged phase;
2. generate one bounded `agent:context` packet;
3. inspect only the supplied working set and exact symbols needed;
4. have the Codex lead implement continuously;
5. run new/focused tests;
6. run `npm.cmd run test:affected:agent`;
7. run lint/build/browser/Workflow Map checks only when relevant;
8. run Docker-backed local Supabase validation when DB contracts change;
9. open the PR and use exact-head CI as the final automated gate;
10. inspect only bounded failure evidence when something fails.

## 1. Single bounded context packet

Use `agent:context` before broad exploration for substantial scoped work.

Example:

```text
npm.cmd run agent:context -- --task "project financial control dashboard" --domain projects --hops 1 --budget 10000
```

Useful selectors include:

```text
--task <objective>
--query <workflow keywords>
--node <exact workflow node>
--domain <platform-tenancy|dashboard|projects|procurement|commercial|engineering|finance|workforce|reporting|assistant>
--route <route id or path>
--file <repo path>
--changed
--changed-file <repo path>
```

Normal first-pass budget:

- one packet;
- 0-1 workflow hops;
- roughly 8k-12k characters;
- about 6-8 primary source files;
- exact symbols/ranges instead of whole-file dumps.

If no Workflow Map node matches, accept the changed-file/impact fallback packet. Do not retry speculative keyword variants to force a match.

Workflow Map is advisory navigation only. Source, runtime behavior, migrations, RLS, tests, and CI remain authoritative.

## 2. Codex-only execution

The current implementation policy is **Codex only by default**.

Do not assume Luna, Gemini, Antigravity, OpenRouter, Kilo, or another paid/external implementation agent is available. Use one only if the user explicitly says it is available again.

The Codex lead owns:

- implementation;
- shared-file integration;
- architecture/source-of-truth decisions;
- financial semantics;
- migration/RLS/RPC/trigger decisions;
- final diff review;
- validation;
- commit/push/PR.

### Subagents

Default: **zero**.

Hard maximum: **2 concurrent subagents** if the Codex environment exposes internal subagent capability and the workstreams are genuinely independent.

Do not spawn subagents for duplicate discovery, CI polling, documentation-only work, broad re-audits, or small tasks the lead can finish directly.

Subagents are never the critical path. Use bounded waits; stop a stalled subagent and continue locally rather than blocking the phase.

## 3. Compact affected-test execution

Use:

```text
npm.cmd run test:affected:agent
```

This uses the deterministic impact selector while suppressing successful TAP detail.

On success retain only:

- selected file count / total test files;
- pass/fail/skipped counts;
- elapsed time;
- database/fallback state;
- bounded warnings.

On failure retain:

- failing command;
- bounded error neighborhood;
- final summary.

If impact selection safely falls back, let it run the repository full regression contract once. Do not rerun the full suite again merely because the fallback already did so.

## 4. Compact CI failure context

When a CI/local log is large, inspect only the failed step and smallest useful excerpt.

Use:

```text
npm.cmd run ci:failure-context -- --file path/to/log.txt --workflow "Application Validation" --step "Affected tests"
```

Do not feed successful full logs back into agent context.

Failure loop:

`inspect -> diagnose -> justified change -> narrow rerun -> continue validation ladder`

Never loop an unchanged failure.

## 5. Validation path for non-DB work

For normal UI/application work:

1. new/edited tests;
2. focused domain tests;
3. `npm.cmd run test:affected:agent`;
4. `npm.cmd run lint` after code stabilizes;
5. `npm.cmd run build` when production/runtime/UI integration is affected;
6. targeted browser QA for significant user-facing changes;
7. Workflow Map checks only when mapped contracts/generated inputs changed;
8. exact-head PR CI.

Do **not** start Docker/Supabase merely because Docker Desktop is open when the task is UI-only, documentation-only, or otherwise does not change DB contracts.

## 6. Docker-backed database validation

The user's laptop normally keeps Docker Desktop available so Codex can run the real local Supabase stack when the changed surface requires it.

Treat the following as database-affecting:

- `supabase/migrations/**`;
- RLS policies/grants;
- RPC / SECURITY DEFINER behavior;
- triggers and constraints;
- financial lifecycle DB guards;
- cross-company/company-bound integrity;
- migration upgrade behavior;
- DB concurrency/row-locking invariants.

### Required local ladder for DB-affecting work

Use the applicable Windows commands:

```text
docker info
npx.cmd supabase start
npx.cmd supabase db reset --local --no-seed --yes
npx.cmd supabase test db --local
npm.cmd run test:migrations
npm.cmd run test:migrations:upgrade
```

Then run any targeted runtime/concurrency test needed by the changed contract.

Examples of behavior that should be proven against the real local DB when changed:

- RLS and unauthorized/cross-company rejection;
- guarded lifecycle RPCs;
- immutable/finalized history;
- overbilling/overcollection/settlement ceilings;
- trigger/constraint behavior;
- concurrent row-locking protection;
- historical migration upgrade compatibility.

Static migration/string tests are not equivalent to replay, pgTAP, or runtime behavior.

### Docker unavailable

If Docker Desktop, Supabase CLI, ports, or containers are unavailable:

1. report the blocker once;
2. run the strongest remaining static/focused checks;
3. state exactly which runtime DB checks were not run;
4. never claim static tests equal runtime validation;
5. rely on exact-head GitHub DB CI as the final automated runtime gate while clearly disclosing the local gap.

Do not close Docker Desktop. Stop only repo-specific processes/containers started by the run when appropriate, unless the user intentionally wants the local stack left running.

## 7. Full-suite rule

Do not run `npm.cmd run test:full` at the start of a phase from just-merged green `main`.

Run the full historical suite locally only when:

- impact selection falls back to it;
- a broad shared/root contract changed and safe isolation cannot be proven;
- architecture/toolchain/test infrastructure changed unusually broadly;
- the user explicitly requests it;
- release/deep-regression work requires it;
- targeted validation or CI indicates broader coverage is needed.

Do not run it repeatedly during implementation.

## 8. Review path

Review diff-first:

- acceptance criteria;
- changed filenames/hunks;
- touched shared contracts;
- bounded context packet;
- focused/affected validation results.

Expand scope only for a concrete dependency, financial/security boundary, or failure. Do not perform a second whole-repository audit after a focused implementation is already green.

## 9. Prompt-creation default

Future implementation prompts should use wording equivalent to:

> Start from current latest `main` and confirm the exact green base SHA. Read `AGENTS.md` and the current HydroQualiSense active roadmap first. Do not use retired Engoryx roadmap phases as implementation authority. Do not rerun the historical full suite before implementation unless the baseline is genuinely untrusted. Generate one bounded `npm.cmd run agent:context -- ...` packet and use it as the initial working set. The Codex lead owns implementation, integration, review, and validation. Do not assume Luna, Gemini, Antigravity, or another paid/external implementation agent is available. Use zero subagents by default and never more than two concurrent internal Codex subagents for genuinely independent bounded work. Run focused/new tests while iterating, then `npm.cmd run test:affected:agent`. For migrations, RLS, RPCs, triggers, DB contracts, financial DB guards, inventory DB guards, or concurrency changes, use the available Docker Desktop/local Supabase stack for clean replay, pgTAP, migration upgrade, and relevant runtime/concurrency checks before PR completion; if Docker is unavailable, disclose the exact missing validation. Do not start Docker for UI-only/non-DB work. Run lint/build/browser/Workflow Map checks only when relevant. Open the PR but do not merge it; the GitHub-native lead will review exact-head CI and merge when safe.

## 10. Efficiency evidence

Useful per-PR metrics:

- changed-file count;
- context packet size;
- selected test files / total test files;
- impact fallback yes/no + reason;
- Docker/Supabase suite required yes/no;
- DB replay/pgTAP/upgrade results when required;
- affected-test elapsed time;
- full-suite elapsed time only when legitimately run;
- subagents started/completed/stopped;
- browser/Workflow Map checks triggered yes/no;
- CI failure excerpt size vs source log size.

Keep measured and estimated values separate. Do not claim exact token savings unless the platform exposes real accounting.