# HydroQualiSense Agent Execution Efficiency

This document defines the repository-native low-context workflow for ChatGPT + Codex execution. It complements `AGENTS.md`; correctness, security, financial truth, RLS, migration safety, runtime evidence, and exact-head CI remain higher priority than speed.

## Goal

Optimize the recurring workflow:

`ChatGPT prompt -> Codex implementation + PR -> ChatGPT review/fix/merge -> next ChatGPT prompt`

ChatGPT owns the expensive live-repository PR review/merge confirmation. A fresh Codex implementation run should not repeat that remote-history work. Its first action is to synchronize its local checkout to current remote `main`, confirm the resulting SHA once, and start the assigned task.

Default accelerated flow:

1. fetch/pull the latest remote `main` before inspecting stale local implementation state;
2. record the resulting exact `main` SHA once;
3. read `AGENTS.md` and only the task-relevant product/workflow documents;
4. generate one bounded lead `agent:context` packet when useful;
5. inspect only the supplied working set and exact symbols needed;
6. keep Codex as the lead implementation/integration owner;
7. default to zero subagents and use at most 2 Codex subagents only for genuinely independent bounded work;
8. integrate early rather than waiting for every subagent to finish;
9. run new/focused tests;
10. run `npm.cmd run test:affected:agent` on the integrated branch;
11. run lint/build/browser/Workflow Map checks only when relevant;
12. run Docker-backed local Supabase validation when DB contracts change;
13. open the PR and use exact-head CI as the final automated gate during ChatGPT review.

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

Do not make every subagent independently rediscover the repository. The lead should turn the source-of-truth context into narrow assignments containing only the files/contracts each subagent needs.

If no Workflow Map node matches, accept the changed-file/impact fallback packet. Do not retry speculative keyword variants simply to force a match.

Workflow Map is advisory navigation only. Source, runtime behavior, migrations, RLS, tests, and CI remain authoritative.

## 2. Accelerated Codex execution

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

The lead must continue working while any subagents run. Do not turn the lead into an idle coordinator.

### Optional Codex subagents

Default to **zero subagents**.

Hard maximum: **2 concurrent Codex subagents**.

Use them only for genuinely independent bounded work such as:

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

- multiple agents solving the same issue;
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
- If a task is too coupled to divide safely, keep it with the lead even if subagent capacity is unused.

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

Optional Codex subagents may perform targeted checks in parallel, but the lead must still confirm the integrated branch satisfies the applicable ladder.

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

Do not run `npm.cmd run test:full` at the start of a phase from a just-pulled green `main`.

Run it only when:

- impact selection falls back to it;
- a broad shared/root contract changed and safe isolation cannot be proven;
- architecture/toolchain/test infrastructure changed unusually broadly;
- the user explicitly requests it;
- release/deep-regression work requires it;
- targeted validation or CI indicates broader coverage is needed.

Parallel capacity is not a reason to run unnecessary full suites.

## 9. Review path

For **Codex implementation**, review diff-first after implementation:

- acceptance criteria;
- changed filenames/hunks;
- touched shared contracts;
- bounded lead context packet;
- optional subagent assignments and returned diffs/findings;
- focused/affected validation results.

Expand scope only for a concrete dependency, financial/security boundary, or failure.

For **ChatGPT PR review/fix/merge**, the repository-native exact-head review rules still apply in full: inspect the live PR/head, complete relevant diff, exact-head CI, blockers, mergeability, and unresolved review state before merging.

## 10. Prompt-creation default — pull first, then work

Every normal ChatGPT -> Codex implementation prompt should begin with wording equivalent to:

> **FIRST ACTION: synchronize this local checkout to the latest remote `main`.** Run `git fetch origin main`, switch to `main`, and `git pull --ff-only origin main` (or use a clean worktree from current `origin/main` if local work must be preserved). Record the resulting `main` SHA once, create the task branch from it, then proceed immediately. Do not spend startup time inspecting whether the pre-pull local checkout was current, checking old PRs/CI/history, or reconfirming the previous prompt SHA. After syncing, read `AGENTS.md` and only the documents/files needed for this task, generate at most one bounded `agent:context` packet when useful, inspect the relevant implementation, and start coding.

Prompt rules:

- Do not ask Codex to independently discover the latest remote `main` through a long GitHub/CI audit before pulling it.
- Do not require open-PR inspection at implementation startup unless the task actually depends on another open PR.
- Do not make Codex re-check historical CI from the previous merged phase. ChatGPT already owns PR review/merge validation.
- Include an exact starting SHA in the prompt as useful handoff evidence when available, but treat it as informational only. The freshly fetched/pulled `origin/main` is authoritative if ChatGPT made another remote correction before Codex starts.
- One post-pull SHA check is enough for ordinary implementation startup.
- Preserve local uncommitted/local-only work rather than resetting it destructively; use a clean worktree/branch from `origin/main` when necessary.
- After the pull, proceed directly to task-specific inspection and implementation. No ritual repository-wide audit or baseline full-suite run.
- Default to zero subagents; hard maximum 2 concurrent Codex subagents for genuinely independent bounded work.
- Run focused/new tests while iterating, then `npm.cmd run test:affected:agent` on the integrated branch.
- For migrations, RLS, RPCs, triggers, DB contracts, financial DB guards, inventory DB guards, or concurrency changes, use Docker Desktop/local Supabase for clean replay, pgTAP, migration upgrade, and relevant runtime/concurrency checks before PR completion.
- Do not start Docker for UI-only/non-DB work.
- Run lint/build/browser/Workflow Map checks only when relevant.
- Open the PR but do not merge it. ChatGPT will perform the live exact-head PR review, fix concrete issues if necessary, verify CI, and merge when safe.

This section intentionally separates the two jobs:

`Codex = pull latest main -> implement -> validate -> open PR`

`ChatGPT = inspect live PR -> review/fix -> verify exact head -> merge -> prepare next prompt`

## 11. Efficiency evidence

Useful per-PR metrics:

- changed-file count;
- context packet size;
- subagents started/completed/stopped;
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