# HydroQualiSense Agent Execution Efficiency

This document defines the repository-native low-context workflow for ChatGPT + Codex/Luna execution. It complements `AGENTS.md`; correctness, security, financial truth, RLS, migration safety, runtime evidence, and exact-head CI remain higher priority than speed.

## Goal

Accelerate the pre-demo push for **Thursday, September 10, 2026** without duplicating discovery, tests, logs, or architecture decisions.

Default accelerated flow:

1. trust the exact green `main` baseline from the previous merged phase;
2. generate one bounded lead `agent:context` packet;
3. inspect only the supplied working set and exact symbols needed;
4. keep Codex as the lead implementation/integration owner;
5. split genuinely independent work across Luna subagents when useful;
6. use up to **5 concurrent Luna subagents** during the authorized pre-demo sprint;
7. integrate early rather than waiting for every subagent to finish;
8. run new/focused tests;
9. run `npm.cmd run test:affected:agent` on the integrated branch;
10. run lint/build/browser/Workflow Map checks only when relevant;
11. run Docker-backed local Supabase validation when DB contracts change;
12. open the PR and use exact-head CI as the final automated gate.

## 1. Single bounded lead context packet

Use `agent:context` before broad exploration for substantial scoped work.

Example:

```text
npm.cmd run agent:context -- --task "warehouse inventory project allocation" --domain projects --hops 1 --budget 10000
```

Normal first-pass budget:

- one lead packet;
- 0-1 workflow hops;
- roughly 8k-12k characters;
- about 6-8 primary source files;
- exact symbols/ranges instead of whole-file dumps.

Do not make every Luna subagent independently rediscover the repository. The lead should turn the source-of-truth context into narrow assignments containing only the files/contracts each subagent needs.

If no Workflow Map node matches, accept the changed-file/impact fallback packet. Do not retry speculative keyword variants simply to force a match.

Workflow Map is advisory navigation only. Source, runtime behavior, migrations, RLS, tests, and CI remain authoritative.

## 2. Accelerated lead + Luna execution

### Lead

Codex remains the default lead and owns:

- implementation on the critical/shared path;
- shared-file integration;
- architecture/source-of-truth decisions;
- financial and inventory semantics;
- migration/RLS/RPC/trigger decisions;
- final diff review;
- integrated validation;
- commit/push/PR.

The lead must continue working while Luna subagents run. Do not turn the lead into an idle coordinator.

### Luna subagents

Luna is explicitly enabled for the current pre-demo sprint.

Hard maximum: **5 concurrent Luna subagents**.

Use them for genuinely independent bounded work such as:

- separate UI surfaces;
- isolated service/helper implementations;
- focused regression tests;
- bounded code audits tied to the active scope;
- browser QA of separate workflows;
- documentation or migration-test support that does not compete for shared ownership.

Each assignment should state:

- exact objective;
- owned files or domain;
- acceptance criteria;
- relevant invariants;
- tests/checks expected;
- explicit stop boundary.

Avoid:

- five agents solving the same issue;
- duplicate repository-wide audits;
- competing edits to central routing/providers/shared financial helpers;
- multiple agents independently deciding migration/RLS/financial semantics;
- broad speculative improvements just because capacity is available.

A subagent may investigate security/financial/DB behavior, but the lead owns the final interpretation and integration.

Stop stalled or low-value subagents instead of restarting the same broad assignment repeatedly.

## 3. Integration-first parallelism

Parallelism only helps if results integrate cleanly.

- Prefer independent vertical slices or non-overlapping file ownership.
- Integrate completed useful work as soon as practical.
- Review the actual subagent diff before retaining it.
- Resolve shared-contract conflicts centrally in the lead branch.
- Run final validation against the integrated branch, not only inside isolated subagent worktrees.
- If a task is too coupled to divide safely, keep it with the lead even if Luna capacity is unused.

## 4. Compact affected-test execution

Use:

```text
npm.cmd run test:affected:agent
```

On success retain only selected file count, pass/fail/skipped counts, elapsed time, database/fallback state, and bounded warnings.

On failure retain the failing command, smallest useful error neighborhood, and final summary.

If impact selection safely falls back to the full regression contract, let it run once. Do not rerun the full suite again merely because the fallback already did so.

Do not have multiple subagents run the same expensive broad validation unless there is a specific reason.

## 5. Compact failure handling

For large CI/local logs use:

```text
npm.cmd run ci:failure-context -- --file path/to/log.txt --workflow "Application Validation" --step "Affected tests"
```

Failure loop:

`inspect -> diagnose -> justified change -> narrow rerun -> continue validation ladder`

Never loop an unchanged failure.

## 6. Validation path for non-DB work

For normal UI/application work:

1. new/edited tests;
2. focused domain tests;
3. `npm.cmd run test:affected:agent`;
4. `npm.cmd run lint` after code stabilizes;
5. `npm.cmd run build` when production/runtime/UI integration is affected;
6. targeted browser QA for significant user-facing changes;
7. Workflow Map checks only when mapped contracts/generated inputs changed;
8. exact-head PR CI.

Luna subagents may perform targeted checks in parallel, but the lead must still confirm the integrated branch satisfies the applicable ladder.

Do not start Docker/Supabase for UI-only, documentation-only, or unrelated non-DB work.

## 7. Docker-backed database validation

Use the real local Supabase stack when changes affect:

- `supabase/migrations/**`;
- RLS policies/grants;
- RPC / SECURITY DEFINER behavior;
- triggers and constraints;
- financial lifecycle DB guards;
- inventory balance/movement/allocation guards;
- company-bound integrity;
- migration upgrade behavior;
- DB concurrency/row-locking invariants.

Applicable Windows commands:

```text
docker info
npx.cmd supabase start
npx.cmd supabase db reset --local --no-seed --yes
npx.cmd supabase test db --local
npm.cmd run test:migrations
npm.cmd run test:migrations:upgrade
```

Add targeted runtime/RPC/concurrency tests required by the changed contract.

Static migration/string tests are not equivalent to replay, pgTAP, or runtime behavior.

If Docker/Supabase is unavailable, report the blocker once, run the strongest remaining checks, and state exactly which DB runtime validation was not performed.

Do not close Docker Desktop itself.

## 8. Full-suite rule

Do not run `npm.cmd run test:full` at the start of a phase from a just-merged green `main`.

Run it only when:

- impact selection falls back to it;
- a broad shared/root contract changed and safe isolation cannot be proven;
- architecture/toolchain/test infrastructure changed unusually broadly;
- the user explicitly requests it;
- release/deep-regression work requires it;
- targeted validation or CI indicates broader coverage is needed.

Parallel capacity is not a reason to run unnecessary full suites.

## 9. Review path

Review diff-first:

- acceptance criteria;
- changed filenames/hunks;
- touched shared contracts;
- bounded lead context packet;
- subagent assignments and returned diffs/findings;
- focused/affected validation results.

Expand scope only for a concrete dependency, financial/security boundary, or failure.

## 10. Prompt-creation default during the pre-demo sprint

Future implementation prompts through the September 10 presentation should use wording equivalent to:

> Start from current latest `main` and confirm the exact green base SHA. Read `AGENTS.md` and the current HydroQualiSense active roadmap first. Do not use retired Engoryx roadmap phases as implementation authority. Generate one bounded `npm.cmd run agent:context -- ...` packet for the lead. Codex owns the critical path, shared contracts, integration, final diff review, and validation. Luna is explicitly available for this accelerated sprint: use up to five concurrent Luna subagents for genuinely independent bounded work, with non-overlapping ownership and explicit stop boundaries. Keep the lead implementing while subagents run; do not duplicate repository discovery or broad tests across agents. Run focused/new tests while iterating, then `npm.cmd run test:affected:agent` on the integrated branch. For migrations, RLS, RPCs, triggers, DB contracts, financial DB guards, inventory DB guards, or concurrency changes, use Docker Desktop/local Supabase for clean replay, pgTAP, migration upgrade, and relevant runtime/concurrency checks before PR completion. Do not start Docker for UI-only/non-DB work. Run lint/build/browser/Workflow Map checks only when relevant. Open the PR but do not merge it; the GitHub-native lead will review exact-head CI and merge when safe.

After the September 10 presentation, explicitly reassess whether five-Luna parallelism should remain before carrying this policy into later work.

## 11. Efficiency evidence

Useful per-PR metrics:

- changed-file count;
- context packet size;
- Luna subagents started/completed/stopped;
- each subagent's bounded assignment;
- selected test files / total test files;
- impact fallback yes/no + reason;
- Docker/Supabase suite required yes/no;
- DB replay/pgTAP/upgrade results when required;
- affected-test elapsed time;
- full-suite elapsed time only when legitimately run;
- browser/Workflow Map checks triggered yes/no;
- CI failure excerpt size vs source log size.

Keep measured and estimated values separate. Do not claim exact token/usage savings unless the platform exposes real accounting.