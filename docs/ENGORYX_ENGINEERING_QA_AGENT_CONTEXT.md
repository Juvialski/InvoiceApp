# Engoryx Engineering QA & Agent Context Infrastructure

## Purpose

This is a **development infrastructure track**, not a customer-facing Engoryx product module. Its purpose is to make repository QA more continuous and to preserve useful engineering context across Codex, ChatGPT, Antigravity, Kilo, and other implementation runs.

The system should reduce repeated rediscovery of the same defects, prevent regressions from being forgotten, and give each new agent run a compact record of what was previously found, fixed, deferred, or protected by an invariant.

## Status and sequencing

- **Status:** QA-1 implemented; QA-2 planned next.
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

## QA-1 implementation — structured browser evidence

Stage QA-1 is implemented in the existing Chromium demo visual-QA lane. It is a
producer-only evidence contract: it does not require n8n, external credentials,
Supabase, production authentication, or a remote QA service.

### Local command and artifact layout

For a local run, build the app, install the QA-only browser package, install
Chromium, start the existing preview in one terminal, then run:

```text
npm.cmd run build
npm.cmd install --no-save --package-lock=false playwright@1.55.0
npx.cmd playwright install chromium
# terminal 1
npx.cmd vite preview --host 127.0.0.1 --port 4173
# terminal 2
npm.cmd run qa:demo
```

The runner uses the isolated `/demo` application mode and writes to:

```text
artifacts/demo-visual-qa/
├── manifest.json
├── screenshots/
│   └── <stable-scenario-id>.png
└── logs/qa.log
```

The generated directory is ignored by Git. `DEMO_QA_BASE_URL` and
`DEMO_QA_OUTPUT_DIR` may override the preview URL and output directory for
local/CI use. The runner opens a fresh browser context for every scenario so
demo session state and interactions cannot leak between evidence records.

### Manifest contract

`manifest.json` has `schemaVersion: 1` and contains:

- `run`: `commitSha`, `branch`, `timestamp`, `trigger`, and `appMode: "demo"`;
- `summary`: route, viewport, interaction, screenshot, console, page-error,
  failed-request, overflow, navigation-failure, ignored-evidence, and failed-
  scenario counts;
- `scenarios`: stable `scenarioId`, feature, route ID/canonical path, requested
  and final paths, interaction state, viewport dimensions, screenshot path,
  normalized console/page/network evidence, overflow dimensions/tolerance,
  navigation result, deterministic assertions, duration, timestamp, status,
  and bounded failure reasons; and
- `artifacts`: relative manifest, screenshot-directory, and log paths so a
  later consumer can collect the complete run without understanding Playwright.

Browser messages are whitespace-normalized and bounded. Request evidence keeps
only the endpoint path, method, resource type, status/classification, and a
bounded failure message; request bodies, headers, cookies, HTML, arbitrary
browser history, and request query data are not persisted. Safe navigation
parameters in the tested route path remain available for state analysis, while
credential-shaped fragments are redacted before persistence.

The default failure policy has no ignored patterns. If a genuinely benign
browser condition needs to be allowed later, it must be added as a narrow,
reviewable regex pattern in the scenario definition and remains visible in the
normalized evidence with `ignored: true`.

### Scenario coverage

The declarative scenario catalog currently covers the isolated Meridian demo
across desktop (`1440px`), laptop (`1366px`), tablet (`768px`), and mobile
(`390px`) viewports, including:

- Dashboard, mobile navigation, and Demo Tour;
- Projects directory, selected project, Project Overview, Project Documents,
  and the deterministic demo drawing preview used by the guest document adapter;
- Engineering Documents, RFIs and RFI detail, Technical Submittals and round
  detail, and Daily Site Logs/register/detail;
- Cash & Banking, a settlement allocation deep link, Invoices, invoice detail,
  and invoice review;
- Payroll, a payroll-run deep link, Expenses, Reports, and the Assistant.

The stateful scenarios use only safe local interactions (navigation, opening a
viewer, opening the Demo Tour, and opening mobile navigation). They do not
confirm financial, payroll, engineering, or workforce mutations.

### CI behavior

The existing `Demo Visual QA` workflow remains authoritative for browser
evidence. It builds the production bundle, installs Playwright only for this
QA job, starts the Vite preview, runs `npm run qa:demo`, uploads
`artifacts/demo-visual-qa` even when the runner fails, and then stops the
preview. The job fails for deterministic failures: navigation/load failure,
uncaught page error, non-ignored console error, non-ignored failed request,
required no-overflow violation, failed deterministic assertion, interaction
failure, or screenshot failure. Visual attractiveness is not evaluated by this
stage; AI review belongs to QA-3.

QA-1 does not replace unit/domain tests, lint/typecheck, production build,
migration validation, pgTAP, or security checks.

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

### Stage QA-1: Structured browser evidence — implemented

The existing Playwright/visual QA now produces a machine-readable manifest for
the configured demo routes, containing viewport, screenshot path, console
errors, page errors, failed requests, overflow checks, and tested interaction
state.

### Stage QA-2: n8n orchestration — next

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

## Overall track acceptance criteria

These criteria describe completion of the full QA-1 through QA-6 engineering
track. QA-1 is the structured-evidence stage only; the later orchestration,
AI-review, persistence, reporting, and context-retrieval stages remain planned.

The first usable version is complete when:

- a PR or manual trigger can produce a structured QA run;
- desktop/tablet/mobile browser evidence is captured for the configured routes;
- new findings are deduplicated against previous findings;
- one compact PR/report summary is generated;
- relevant findings can be retrieved as a bounded feature-scoped agent context packet;
- existing CI remains authoritative and unchanged in meaning;
- no sensitive production data is required for the workflow.
