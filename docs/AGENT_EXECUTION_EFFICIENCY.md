# Engoryx Agent Execution Efficiency

This document defines the repository-native low-context workflow for ChatGPT, Codex/Luna, Antigravity, and other implementation agents. It complements `AGENTS.md`; correctness, security, financial truth, RLS, migration safety, and exact-head CI remain higher priority than speed.

## Goal

Reduce duplicate repository discovery, unnecessary test execution, and successful-log ingestion without weakening validation.

The default flow is:

1. trust the exact green `main` baseline from the prior merged phase;
2. generate one bounded agent context packet;
3. inspect only the supplied working set and exact source symbols needed for the task;
4. implement with focused/new tests;
5. run compact impact-selected validation;
6. run lint/build/database/browser checks only when the changed surface requires them;
7. use exact-head PR CI as the final automated gate;
8. on failure, ingest only the failed step and a bounded diagnostic excerpt.

## 1. Single agent context packet

Use `agent:context` before broad exploration for substantial scoped work.

Example:

```text
npm.cmd run agent:context -- --task "procurement purchase-order approval" --domain finance --hops 1 --budget 10000
```

Useful selectors:

```text
--task <objective>
--query <workflow keywords>
--node <exact workflow node>
--domain <platform-tenancy|dashboard|projects|engineering|finance|workforce|reporting|assistant>
--route <route id or path>
--file <repo path>
--changed
--changed-file <repo path>
```

The packet combines, within a hard character budget:

- base/head/branch and working-tree state;
- changed paths;
- impact-selector status and database-affecting state;
- selected-test counts;
- workflow-map seed nodes and bounded neighborhood;
- first files to inspect;
- relevant workflow tests;
- protected invariants, permissions, and guards;
- validation recommendation;
- required verification reminders.

Default packet budget is 12,000 characters. Normal task prompts should target 8,000-12,000 characters. Increase context only for a named unresolved dependency or safety boundary.

### Exploration budget

After receiving the packet, the default first-pass investigation budget is:

- one agent context packet;
- 0-1 workflow hops;
- up to about 6-8 primary source files;
- exact symbols/ranges instead of whole-file dumps;
- no repository-wide search unless a specific unresolved dependency can be named.

The packet is advisory navigation. Agents must still inspect current source before editing and must not treat generated workflow context as authoritative runtime/database truth.

## 2. Compact affected-test execution

Use:

```text
npm.cmd run test:affected:agent
```

This uses the same deterministic impact selector as `test:affected`.

On success it captures verbose TAP output and prints only:

- selected file count / total test files;
- test/pass/fail/skipped counts;
- elapsed time;
- database/fallback state;
- a bounded set of warnings, when present.

It does not replay successful assertion/TAP detail into agent context.

On failure it prints:

- the failing command;
- a bounded diagnostic neighborhood around failure markers;
- the final test summary.

If impact selection safely falls back, the command executes the repository's canonical `npm test` full-regression contract while keeping successful output compact.

`test:affected` remains available when a human explicitly wants verbose runner output.

## 3. Compact CI failure context

When a CI or local command produces a large text log, extract the useful failure region before giving it to an agent:

```text
npm.cmd run ci:failure-context -- --file path/to/log.txt --workflow "Application Validation" --step "Affected tests"
```

Or pipe a saved log through stdin.

Default failure excerpts are capped at 80 lines and 12,000 characters. The extractor includes neighborhoods around assertion/error/failure markers and the final `node:test` summary.

Do not feed a full successful CI log to Luna. For failed CI, inspect the failed exact-head job/step first and use the smallest useful excerpt.

## 4. Agent allocation

One implementation agent is the default.

Use a second concurrent Luna subagent only when there are two genuinely independent implementation workstreams with non-overlapping ownership after the lead has established the shared contract and working set.

Do not use a second agent for duplicate discovery, CI polling, documentation-only work, broad re-audits, or parallel reads of the same files.

The hard repository maximum remains two concurrent subagents.

## 5. Review path

Review is diff-first.

Give the reviewer:

- acceptance criteria;
- changed filenames/hunks;
- touched shared contracts;
- the relevant bounded context packet;
- focused/affected validation results.

The reviewer expands scope only when a changed dependency, security/financial boundary, or concrete failure justifies it. Do not perform a second whole-repository audit after a focused implementation is already green.

## 6. Validation path

A normal phase starting from recently merged green `main` must not begin with `test:full`.

Use:

1. new/edited tests directly;
2. focused domain tests while iterating;
3. `npm.cmd run test:affected:agent` after integration;
4. `npm.cmd run lint` once code stabilizes;
5. build only for production/runtime/UI integration or required PR handoff;
6. database replay only for migrations/RLS/database contracts;
7. workflow-map validation only when mapped contracts/inputs changed;
8. full regression only when the selector falls back or broader evidence requires it;
9. exact-head PR CI as the final automated gate.

## 7. Prompt-creation default

Future implementation prompts should use wording equivalent to:

> Start from current latest `main` and confirm its exact SHA and prior required green CI. Do not rerun the historical full suite before implementation. Generate one bounded `npm.cmd run agent:context -- ...` packet for this objective and use it as the initial working set. Inspect current source only inside that scope unless a concrete dependency requires expansion. Use one Luna implementation agent by default; use a second only for a genuinely independent workstream, never more than two concurrently. Run focused/new tests while iterating, then `npm.cmd run test:affected:agent` after integration. Run lint/build/database/workflow-map/browser validation only when the changed surface requires it. If CI fails, inspect only the failed exact-head step and a bounded failure excerpt. Exact-head PR CI is the final automated gate.

## 8. Efficiency evidence

When comparing workflow efficiency, keep measured and estimated values separate.

Useful per-PR metrics:

- changed-file count;
- agent context packet characters;
- workflow inspect-file count;
- selected test files / total test files;
- impact fallback yes/no + reason;
- database suite triggered yes/no;
- affected-test elapsed time;
- full-suite elapsed time when a fallback legitimately occurs;
- CI failure excerpt characters versus source log characters.

If the agent platform exposes real input/output token accounting, record it. Otherwise use packet/log characters only as a stable proxy and do not claim exact token savings.
