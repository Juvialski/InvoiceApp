# Agent Execution Efficiency — HydroQualiSense

Current workflow reference (2026-10-12). **`AGENTS.md` is authoritative.** This file is a short operational companion, not another source of dated overrides. Domain contracts and deployment safety remain unchanged.

## Normal implementation path

`ChatGPT scope -> Codex implementation + PR -> ChatGPT exact-head review/fix/safe merge -> next scope`

1. `git fetch origin main`, fast-forward clean local `main` and record the SHA once; protect divergent local work.
2. Read `AGENTS.md`, `docs/ACTIVE_DEVELOPMENT_BRIEF.md`, and only relevant contracts/source.
3. Inspect current code and focused tests. Generate **zero or one** bounded `agent:context` packet only if a complicated cross-module search benefits. Do not reread unrelated docs or old PRs.
4. Lead Codex implements a coherent, bounded task. Default **zero subagents**, absolute maximum **two** concurrent independent ones; none for late reviews.
5. Run new/changed tests while editing. Once the executable diff stabilizes, run focused domain checks then `npm.cmd run test:affected:agent` normally **once**.
6. Run lint/typecheck, build, Workflow Map, browser QA, local Supabase and provider/hosted checks **only for applicable risk**, and avoid locally duplicating equivalent protected CI. DB/security/financial/migration work keeps mandatory runtime evidence.
7. Review exact diff and the applicable evidence, update only materially changed product truth, run `git diff --check`, then commit/push/open PR. Codex does **not** self-merge.
8. ChatGPT examines the exact PR head and diff, fixes concrete problems, verifies relevant checks at the current head, and merges automatically when safe.

## Optional development aids, not gates

- `npm.cmd run agent:context`: deterministic bounded discovery for broad or unfamiliar cross-module changes.
- `workflow-map:context`, Repository Intelligence: dependency/ownership/permission tracing when useful. Keep `workflow-map:check` and source-consistency checks for relevant graph/contract changes.
- `npm.cmd run typesafe -- ...` (TypeSafe/Jev): **optional experiments only** for a difficult candidate-ranking or noisy-CI triage question. Never install/retry an optional advisory tool to start coding. No mandatory start, test-triage, completion, benchmark, doctor, or diagnostic logging checkpoints.
- `npm.cmd run ci:failure-context`: use when CI logs are too large to inspect normally.

None of these replaces direct source inspection, deterministic affected-test selection, runtime DB proof, lead final review, exact-head CI, or authorization policy.

## Risk-based validation matrix

| Change | Local proof | Protected/independent proof |
| --- | --- | --- |
| Documentation/agent policy only | Full policy diff + source-of-truth consistency | Required check names report; skip heavyweight tests when irrelevant |
| UI/page/component | Focused tests; affected selection; lint/build as relevant | Applicable app and domain-browser checks on exact head |
| Shared browser harness/Workflow Map | Targeted harness/graph contracts | Applicable browser/graph check |
| Migration, RLS/RPC, finance or inventory integrity | Targeted tests plus applicable clean replay, pgTAP, upgrade, runtime authorization/concurrency checks | Exact-head DB/security checks |
| CI/release orchestration | Scope-selector and workflow-contract regressions | Relevant exact-head workflow evidence |
| Hosted QA, provider, production release | Explicit release procedure and environment-specific proof | Controlled environment certification; production authorization remains separate |

## Prevent loops

- Do not run `test:full` simply because a phase started. The weekly scheduled suite remains an independent regression net.
- Do not rerun affected tests or the browser matrix after doc-only/handoff edits.
- On failing tests, diagnose the smallest cause, rerun the failing subset, then applicable final evidence after the executable fix.
- Do not repeat `review -> documentation -> tests -> review`, or commission a new subagent for final review.
- Do not run browser automation through the user's active Chrome profiles. Use an isolated headless browser profile where browser QA is truly needed.
- At the terminal delivery point, stop expanding scope and open the PR; do not use spare time for unrelated research.

## Short delivery record

Record: base/head SHA; meaningful behavior changed; risk domain; focused/affected validation outcomes; relevant browser/DB/CI evidence; what was skipped and why; blockers; next bounded action. Update the current-state brief, active roadmap, handoff, or domain specs **only when their factual product/policy status changes**. Keep long retrospective evidence in existing history rather than growing the active documents for every small edit.
