# HydroQualiSense Agent Execution Efficiency

This is the compact execution policy for the recurring workflow:

`ChatGPT prompt -> Codex implementation + PR -> ChatGPT review/fix/merge -> next ChatGPT prompt`

Correctness, security, financial truth, RLS, migration safety, runtime evidence, and production boundaries remain higher priority than speed. The purpose of this guide is to remove duplicated work, not safeguards that apply to the changed risk domain.

## 1. Codex implementation fast-start

For a normal fresh implementation task, Codex should spend almost no time proving that its old checkout is stale or current.

1. `git fetch origin main`
2. switch to `main`
3. `git pull --ff-only origin main`
4. record `git rev-parse HEAD` once
5. create the task branch from that updated main
6. read `AGENTS.md` and only task-relevant roadmap/handoff/phase/runbook material
7. generate at most one bounded `agent:context` packet when useful
8. inspect the relevant implementation and start coding

If local work must be preserved, use a clean worktree/branch from current `origin/main`; never destroy local-only work just to synchronize.

Do not spend implementation startup time on:

- old PRs or old CI;
- historical branch/merge state;
- reconfirming the previous prompt SHA;
- a repo-wide audit;
- a baseline full regression suite.

The freshly fetched/pulled `origin/main` is authoritative.

## 2. Context and agent limits

Use one bounded lead context packet for substantial scoped work, normally 0-1 workflow hops, roughly 8k-12k characters, and only the primary source files/symbols needed.

Codex is the lead implementation/integration owner. Default to **zero subagents**; hard maximum **2 concurrent Codex subagents** for genuinely independent bounded work. The lead keeps implementing while subagents run and owns architecture, shared integration, financial/security/DB interpretation, final diff, validation, push, and PR.

Do not use spare agent capacity for duplicate audits or speculative scope expansion.

## 3. Implementation validation ladder

After changes, use the smallest applicable ladder:

1. new/edited tests;
2. focused domain tests;
3. `npm.cmd run test:affected:agent`;
4. lint/build/browser/Workflow Map only when the changed domain requires them;
5. exact final diff review;
6. push and open PR; Codex must not merge its own PR.

Do not run `test:full` unless impact selection falls back to it, a broad shared contract genuinely requires it, failures justify it, release/deep-regression work requires it, or the user explicitly requests it.

## 4. Database validation

Use Docker/local Supabase only when changes affect migrations, RLS/grants, RPC/SECURITY DEFINER behavior, triggers/constraints, financial or inventory DB guards, company-bound integrity, upgrade behavior, or DB concurrency/locking.

Applicable validation includes clean local replay, pgTAP, migration tests, upgrade-path tests, and relevant runtime/RLS/RPC/concurrency tests.

Do not start Docker/Supabase for documentation-only, UI-only, or unrelated non-DB work.

## 5. Failure handling

Use:

`inspect -> diagnose -> justified change -> narrow rerun -> continue applicable validation`

Read the smallest useful failure region first. Use `ci:failure-context` for oversized logs. Never rerun an unchanged failure merely to see it fail again.

## 6. ChatGPT PR review — diff-first proportional validation

ChatGPT starts with the exact current PR head, changed-file list, and complete relevant diff, then classifies risk before doing expensive validation.

### Documentation / agent-policy only

If every change is non-executable documentation/policy text and there are no workflow, package, test, migration, schema, source, generated-runtime, deployment, or configuration changes:

- review the exact diff once;
- check source-of-truth consistency;
- do not run or manually inspect app tests, build, browser QA, Docker/Supabase, migrations, hosted QA, Render, providers, or production;
- do not wait for or repeatedly poll CI just because protected statuses exist;
- enable auto-merge when available, then continue immediately to the next requested task;
- if auto-merge is unavailable, inspect status only when needed to perform the merge.

Documentation synchronization should normally ride in the implementation PR that requires it rather than creating a second PR and CI cycle.

### Application / UI

Review the exact diff and verify only the exact-head application/browser/contract checks applicable to what changed. Do not investigate database/release/provider/production state without a concrete reason.

### Database / security / financial / inventory integrity

Use the strict exact-head validation appropriate to those domains, including applicable runtime database evidence. Do not optimize away integrity or authorization checks.

### CI / release orchestration

Review the workflow/config change itself and prove the changed validation/release contract with relevant exact-head evidence. Do not rerun unrelated product QA merely because CI plumbing changed.

## 7. Protected-check fast-pass design

Branch protection keeps stable required check names. Each required workflow classifies the changed files first and performs expensive work only when its own domain is relevant.

Expected behavior:

- `Application Validation & Build` — heavy for application/test/script/public/package/TypeScript inputs;
- `Database Migrations & Upgrade Suite` — heavy for migration/database-invariant/package inputs;
- `chromium-demo-qa` — heavy for UI/demo/browser-QA inputs;
- `Graph and Source Contract Consistency` — heavy for workflow-map/source-contract inputs.

For irrelevant PRs, the required job should fast-pass after lightweight classification without `npm ci`, build, Supabase startup, migration replay, or Chromium installation. An irrelevant fast-pass does not require manual ChatGPT inspection.

Do not replace required checks with `pull_request.paths` filters alone: a required workflow that never reports can leave branch protection waiting indefinitely. Keep the required job reporting and skip its expensive steps internally.

## 8. Prompt template

Every normal ChatGPT -> Codex implementation prompt should begin with wording equivalent to:

> **FIRST ACTION:** fetch and fast-forward local `main` from `origin/main`, record the resulting SHA once, create the task branch, and proceed immediately. Do not spend startup time checking whether the old checkout was current, old PRs/CI/history, or the previous prompt SHA. Read `AGENTS.md` and only task-relevant material, use at most one bounded context packet when useful, then start implementation.

After implementation: focused/new tests -> affected tests -> only relevant extra validation -> exact diff -> PR. Codex does not self-merge.

## 9. Efficiency evidence

Useful evidence is compact: changed-file count, applicable risk domain, tests actually selected, affected-test result, whether DB/browser/Workflow Map validation was required, and any real blocker. Do not collect metrics that cost more time than they save.
