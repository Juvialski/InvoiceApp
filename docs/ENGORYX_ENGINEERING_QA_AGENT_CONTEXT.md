# Engoryx Engineering QA & Agent Context Infrastructure

## Purpose

This is a **development infrastructure track**, not a customer-facing Engoryx product module. Its purpose is to make repository QA more continuous and to preserve useful engineering context across Codex, ChatGPT, Antigravity, Kilo, and other implementation runs.

The system should reduce repeated rediscovery of the same defects, prevent regressions from being forgotten, and give each new agent run a compact record of what was previously found, fixed, deferred, or protected by an invariant.

## Status and sequencing

- **Status:** Planned.
- **Priority:** Immediate engineering-infrastructure work, before or alongside the start of Product Phase 2.
- **Product roadmap effect:** This track does **not** renumber the Engoryx customer-facing phases. Product Phase 2 remains Project Scheduling & Gantt.
- **Implementation rule:** Introduce the orchestration layer incrementally without replacing existing GitHub Actions, repository tests, or source-of-truth documentation.

## Current project baseline

As of the roadmap refresh on 2026-08-28:

- Phase 0 core operations are established across multi-tenant RBAC, Cash & Banking, Invoices, Projects, Expenses, Payroll, Reports, and the guarded Engoryx Assistant.
- Phase 1A Engineering Documents, Phase 1B RFIs & Technical Submittals, and Phase 1C Daily Site Logs are implemented and merged to `main`.
- The Financial Settlement Integration layer is implemented across Cash & Banking, supplier invoices, payroll, demo fixtures, and the Assistant while preserving project-cost and payroll-source semantics.
- The next customer-facing product phase is **Phase 2: Project Scheduling & Gantt**.

## Recommended architecture

The orchestration layer should coordinate existing tools rather than becoming the source of truth itself.

```text
GitHub PR / push / manual trigger
              |
              v
         n8n orchestration
              |
       +------+-------+
       |              |
       v              v
 GitHub Actions    Playwright QA
 tests/build/db    routes/viewports
       |              |
       |        screenshots + console
       |        + network/runtime data
       |              |
       +-------+------+
               v
        AI defect analysis
               |
        deduplicate/classify
               |
       +-------+--------+
       |                |
       v                v
 GitHub Issues/docs   Supabase QA store
       |                |
       +-------+--------+
               v
        next agent context
```

### Responsibilities

- **GitHub Actions** remains authoritative for deterministic repository verification: tests, lint/typecheck, build, migration replay, pgTAP/invariants, and existing visual-QA jobs.
- **Playwright** performs browser interaction, responsive viewport sweeps, screenshot capture, console inspection, failed-request capture, and repeatable route/workflow checks.
- **n8n** orchestrates triggers, artifact collection, AI review, deduplication, persistence, and reporting. It must not replace CI pass/fail semantics.
- **Gemini or another approved model** may classify visual/semantic defects from evidence, but must not silently mutate production data or code.
- **Supabase** may hold detailed QA history and structured findings.
- **GitHub Issues and repository documentation** remain the durable human- and agent-facing record for actionable defects, architecture decisions, and regression constraints.

## Persistent finding model

A structured QA record should support at least:

- finding ID;
- commit SHA and branch;
- route and feature/module;
- viewport/device class;
- severity and category;
- expected behavior;
- observed behavior;
- reproducible steps;
- screenshot or artifact reference;
- console/runtime/network evidence;
- first detected and last detected timestamps;
- status (`OPEN`, `CONFIRMED`, `FIXED`, `WONT_FIX`, `DUPLICATE`);
- related GitHub issue/PR;
- fixed-by commit;
- regression-test reference where applicable.

Detailed artifact history belongs in the QA store. Repository-facing summaries must stay compact.

## Agent context contract

Agents should not receive an unbounded dump of historical QA data. Before a substantial implementation run, the context layer should produce a small, feature-scoped brief containing:

1. recently fixed defects relevant to the requested feature;
2. still-open defects in the same route/domain;
3. architecture or financial/security invariants that must not regress;
4. the most relevant tests and files;
5. related issues/PRs and the latest verified commit state.

Example:

```text
PAYROLL CONTEXT

Previously fixed
- Period generation skipped a valid interval.
- Desktop calendar period ribbons collapsed on continuation days.

Still open
- PAY-034: mobile overtime column clips at 375px.

Regression constraints
- Do not recreate persisted payroll periods.
- Approved/paid payroll history is immutable.
- Project labor cost and employee net-pay settlement are distinct concepts.

Relevant tests
- payroll period tests
- payroll workspace/deep-link tests
```

Generated summaries may be written to a bounded repository document such as `docs/QA_CURRENT.md` or supplied dynamically to the agent. `AGENTS.md` must remain a stable rulebook and should not grow into a defect database.

## Proposed workflow stages

### Stage QA-1: Structured browser evidence

Extend existing Playwright/visual QA so each important route can produce a machine-readable manifest containing viewport, screenshot path, console errors, page errors, failed requests, overflow checks, and tested interaction state.

### Stage QA-2: n8n orchestration

Add n8n as an optional orchestration service triggered by PR, push, or manual execution. It should collect CI/browser artifacts and normalize them into one QA run.

### Stage QA-3: AI-assisted defect review

Send bounded screenshots and runtime evidence to the approved model for classification of issues such as clipping, alignment problems, inconsistent spacing, weak hierarchy, empty states, confusing workflows, or obvious visual regressions. AI findings are advisory until confirmed by deterministic checks or human review.

### Stage QA-4: Persistent findings and deduplication

Store findings in Supabase or an equivalent structured store. Match new observations against existing finding IDs/routes/signatures to avoid reopening the same defect as a new item on every run.

### Stage QA-5: GitHub reporting

Post one concise PR QA summary rather than many comments. New confirmed defects may create or update GitHub Issues. Fixed defects should retain links to the fixing PR/commit and regression coverage.

### Stage QA-6: Agent context retrieval

Before implementation, generate a compact domain-specific context packet from current repository state plus relevant historical findings. The lead agent remains responsible for checking live `main`, current CI, and actual source code instead of trusting stored context blindly.

## Security and data boundaries

- Do not send secrets, credentials, private banking details, payroll PII, or production documents to an external model as QA context.
- Prefer demo/test fixtures for screenshot-based automated review.
- Redact or omit sensitive production values before persistence or model submission.
- n8n credentials must be stored in its credential system or deployment secrets, never in workflow JSON committed to the repository.
- Production writes remain governed by existing Engoryx RLS/RPC and human-confirmation rules. This infrastructure must not create a bypass path.

## Non-goals

This track does not:

- replace GitHub Actions;
- replace deterministic tests with AI judgment;
- give n8n authority over production financial/payroll mutations;
- store unlimited chat transcripts as engineering memory;
- automatically let an agent implement every detected issue;
- change the customer-facing Engoryx phase numbering.

## Acceptance criteria

The first usable version is complete when:

- a PR or manual trigger can produce a structured QA run;
- desktop/tablet/mobile browser evidence is captured for the configured routes;
- new findings are deduplicated against previous findings;
- one compact PR/report summary is generated;
- relevant findings can be retrieved as a bounded feature-scoped agent context packet;
- existing CI remains authoritative and unchanged in meaning;
- no sensitive production data is required for the workflow.
