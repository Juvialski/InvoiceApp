# Engoryx Workflow Map, QA & Agent Context Infrastructure

## Purpose

This is a **development infrastructure track**, not a customer-facing Engoryx product module. Its purpose is to give humans and coding agents a fast visual and machine-readable understanding of how Engoryx works across routes, domain workflows, guarded transitions, data boundaries, and important cross-module links.

The primary goal is a repository-native workflow map that can be rendered as an interactive node graph similar to a visual workflow editor while remaining useful to agents as plain structured data. The same map can support targeted QA and defect discovery without requiring a hosted orchestration service.

## Status and sequencing

- **Status:** Structured browser evidence is implemented. The next immediate stage is **WM-1: Canonical Workflow Graph**, using GitDiagram as an exploratory aid plus direct code/document inspection before committing the authoritative graph.
- **Priority:** Immediate engineering-infrastructure work, before or alongside Product Phase 2.
- **Product roadmap effect:** This track does **not** renumber the Engoryx customer-facing phases. Product Phase 2 remains Project Scheduling & Gantt.
- **Hosting requirement:** None. The first useful version must work from the repository and existing CI/local tooling without a paid automation service.
- **Implementation rule:** The workflow map is documentation and QA infrastructure. It must not become a second source of business truth that silently drifts from the actual code.

## Current project baseline

As of the roadmap refresh on 2026-08-28:

- Phase 0 core operations are established across multi-tenant RBAC, Cash & Banking, Invoices, Projects, Expenses, Payroll, Reports, and the guarded Engoryx Assistant.
- Phase 1A Engineering Documents, Phase 1B RFIs & Technical Submittals, and Phase 1C Daily Site Logs are implemented and merged to `main`.
- The Financial Settlement Integration layer is implemented across Cash & Banking, supplier invoices, payroll, demo fixtures, and the Assistant while preserving project-cost and payroll-source semantics.
- The next customer-facing product phase is **Phase 2: Project Scheduling & Gantt**.

## Core concept: one canonical workflow graph

The infrastructure should maintain a small versioned graph contract in the repository. The graph describes important product areas, states, actions, routes, guards, and cross-domain relationships.

Conceptually:

```text
                              ENGORYX
                                 |
        +------------------------+-------------------------+
        |                        |                         |
        v                        v                         v
     PROJECTS                 FINANCE                  WORKFORCE
        |                        |                         |
  +-----+------+          +------+-------+          +------+------+
  |     |      |          |      |       |          |      |      |
 Docs  RFIs  Site Logs  Invoices Cash  Expenses  Attendance OT Payroll
  |     |      |          |      |                  |      |      |
  +-----+------+----------+------+------------------+------+------+
        |                        |                         |
        +------------------------+-------------------------+
                                 |
                          GUARDED ASSISTANT
```

A more detailed graph can show lifecycle paths such as:

```text
Invoice
  -> AI extraction
  -> human verification
  -> verified project allocation
  -> settlement candidate
  -> confirmed cash settlement
  -> settlement reversal history

Payroll
  -> attendance/overtime/leave sources
  -> payroll period
  -> draft run
  -> approved run
  -> project labor allocation
  -> net-pay settlement evidence

RFI
  -> DRAFT
  -> OPEN
  -> ANSWERED
  -> CLOSED
       \
        -> VOID where allowed

Daily Site Log
  -> DRAFT
  -> SUBMITTED
  -> FINALIZED
```

## Workflow graph contract

Prefer a machine-readable source such as TypeScript data, JSON, or YAML plus generated Mermaid/interactive rendering. The exact representation should follow repository conventions, but the graph should support at least:

### Node fields

- stable node ID;
- label;
- feature/domain;
- node type (`route`, `screen`, `state`, `action`, `data`, `guard`, `external`);
- canonical route or relevant file references when applicable;
- short description;
- lifecycle/status metadata when applicable;
- permission or confirmation requirements when important;
- related tests where useful.

### Edge fields

- stable edge ID;
- source node;
- target node;
- relationship/action label;
- optional condition or guard;
- whether the edge is read-only, navigation, prepared action, confirmed mutation, or derived-data flow;
- relevant invariant/test reference when the relationship is high-risk.

### Graph metadata

- schema version;
- generated/updated commit SHA where practical;
- product phase/module tags;
- last reviewed date;
- whether an element is code-derived, curated, or mixed.

The graph should stay bounded to meaningful workflows. It must not attempt to represent every function call or every component in the repository.

## Visual rendering

The human-facing view should resemble a workflow canvas:

- pan and zoom;
- grouped domains or swimlanes;
- readable directional edges;
- click a node to reveal route/file/test/context details;
- filter by domain such as Payroll, Invoices, Engineering, Cash, or Assistant;
- optionally highlight one end-to-end workflow at a time;
- export or render a static representation for documentation/CI artifacts.

A repository-native renderer may use **Mermaid** for low-maintenance documentation and/or **React Flow / xyflow** for a richer interactive developer view. The visualization must consume the canonical graph contract instead of maintaining its own duplicated relationships.

External tools such as GitDiagram or repository-wiki generators are useful for quick architecture exploration, but they are not authoritative because they infer structure and may miss Engoryx business semantics. For WM-1, GitDiagram should be used as an initial map to accelerate discovery, then the graph must be corrected against current routes, domain code, lifecycle guards, permissions, tests, and documented invariants before it becomes repository context.

## Structured browser evidence — implemented foundation

Structured browser evidence is implemented in the existing Chromium demo visual-QA lane. It is a producer-only evidence contract: it does not require external credentials, Supabase, production authentication, or a remote QA service.

### Local command and artifact layout

For a local run, build the app, install the QA-only browser package, install Chromium, start the existing preview in one terminal, then run:

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

The generated directory is ignored by Git. `DEMO_QA_BASE_URL` and `DEMO_QA_OUTPUT_DIR` may override the preview URL and output directory for local/CI use. The runner opens a fresh browser context for every scenario so demo session state and interactions cannot leak between evidence records.

### Manifest contract

`manifest.json` has `schemaVersion: 1` and contains:

- `run`: `commitSha`, `branch`, `timestamp`, `trigger`, and `appMode: "demo"`;
- `summary`: route, viewport, interaction, screenshot, console, page-error, failed-request, overflow, navigation-failure, ignored-evidence, and failed-scenario counts;
- `scenarios`: stable `scenarioId`, feature, route ID/canonical path, requested and final paths, interaction state, viewport dimensions, screenshot path, normalized console/page/network evidence, overflow dimensions/tolerance, navigation result, deterministic assertions, duration, timestamp, status, and bounded failure reasons; and
- `artifacts`: relative manifest, screenshot-directory, and log paths so a later consumer can collect the complete run without understanding Playwright.

Browser messages are whitespace-normalized and bounded. Request evidence keeps only the endpoint path, method, resource type, status/classification, and a bounded failure message; request bodies, headers, cookies, HTML, arbitrary browser history, and request query data are not persisted. Safe navigation parameters in the tested route path remain available for state analysis, while credential-shaped fragments are redacted before persistence.

The default failure policy has no ignored patterns. If a genuinely benign browser condition needs to be allowed later, it must be added as a narrow, reviewable regex pattern in the scenario definition and remains visible in the normalized evidence with `ignored: true`.

### Scenario coverage

The declarative scenario catalog currently covers the isolated Meridian demo across desktop (`1440px`), laptop (`1366px`), tablet (`768px`), and mobile (`390px`) viewports, including:

- Dashboard, mobile navigation, and Demo Tour;
- Projects directory, selected project, Project Overview, Project Documents, and the deterministic demo drawing preview used by the guest document adapter;
- Engineering Documents, RFIs and RFI detail, Technical Submittals and round detail, and Daily Site Logs/register/detail;
- Cash & Banking, a settlement allocation deep link, Invoices, invoice detail, and invoice review;
- Payroll, a payroll-run deep link, Expenses, Reports, and the Assistant.

The stateful scenarios use only safe local interactions (navigation, opening a viewer, opening the Demo Tour, and opening mobile navigation). They do not confirm financial, payroll, engineering, or workforce mutations.

### CI behavior

The existing `Demo Visual QA` workflow remains authoritative for browser evidence. It builds the production bundle, installs Playwright only for this QA job, starts the Vite preview, runs `npm run qa:demo`, uploads `artifacts/demo-visual-qa` even when the runner fails, and then stops the preview. The job fails for deterministic failures: navigation/load failure, uncaught page error, non-ignored console error, non-ignored failed request, required no-overflow violation, failed deterministic assertion, interaction failure, or screenshot failure.

Visual attractiveness or semantic UX quality is not a deterministic pass/fail rule in this stage. Screenshot review and future workflow-map evidence overlays may surface those issues separately.

Structured browser evidence does not replace unit/domain tests, lint/typecheck, production build, migration validation, pgTAP, or security checks.

## Agent context contract

The graph should improve agent startup without replacing live repository inspection.

Before a substantial implementation run, a bounded context packet may be produced from the workflow graph and current repository state containing:

1. the relevant workflow path;
2. neighboring modules affected by the change;
3. guarded state transitions and permissions;
4. financial/security invariants that must not regress;
5. canonical routes and high-value files;
6. the most relevant tests;
7. known issues or recently fixed regressions if those are already recorded in repository/GitHub context.

Example:

```text
PAYROLL CONTEXT

Workflow
Attendance / Overtime / Leave
  -> Payroll Period
  -> Payroll Run
  -> Approval
  -> Project Labor Allocation
  -> Net-Pay Settlement Evidence

Protected boundaries
- Approved/paid payroll history is immutable.
- Attendance/overtime sources are not rewritten by settlement.
- Project labor cost and employee net-pay settlement are distinct concepts.
- Assistant mutations require PREPARE -> human confirmation -> guarded execution.

Relevant surfaces
- Payroll route/workspace
- payroll domain/controller
- settlement integration
- payroll deep-link tests
```

Generated context is advisory. Every agent still starts by checking current `main`, current CI, and the actual implementation.

## Defect discovery from the graph

The workflow map can help find **structural defects**, but it is not a replacement for runtime/browser testing.

Useful automated checks include:

- edge points to a missing/renamed route;
- lifecycle state exists in one layer but is absent from the documented transition graph;
- a mutation path lacks the expected permission or confirmation guard metadata;
- an Assistant action has no matching guarded execution path;
- a deep link exists without a corresponding route/parser path;
- a high-risk workflow is missing a referenced regression test;
- an orphaned workflow node is no longer reachable from a canonical entry point;
- a cross-domain relationship conflicts with documented accounting or payroll invariants.

These checks should fail only on deterministic contract violations. A workflow graph should never claim that a UI is visually correct merely because its nodes are connected.

## Browser QA relationship

The structured-evidence producer is implemented now; a later workflow-map stage may attach its manifest records to graph nodes or paths.

A later enhancement may attach browser evidence to workflow nodes or paths:

```text
Workflow node: Payroll Run Detail
  - desktop: checked
  - tablet: checked
  - mobile: checked
  - console errors: 0
  - horizontal overflow: 0
  - screenshot artifact: <relative CI artifact reference>
```

This creates a useful bridge between architecture understanding and actual rendered behavior without introducing a separate hosted orchestration system.

## Proposed implementation stages

### Stage WM-1: Canonical workflow graph — next

Create the versioned machine-readable graph contract and document the most important existing Engoryx flows: Projects, Engineering Documents, RFIs, Submittals, Site Logs, Invoices, Cash/Settlement, Expenses, Workforce/Payroll, Reports, and the guarded Assistant.

Use GitDiagram as an exploratory starting point, not as the source of truth. Review its inferred map against the actual current repository, then encode the curated graph in repository-native structured data with stable IDs, routes, file/test references, lifecycle metadata, guards, and high-risk invariants.

### Stage WM-2: Visual workflow canvas

Render the graph for humans using Mermaid and/or a lightweight interactive React Flow/xyflow developer view. Support domain filtering, pan/zoom, clickable node details, and stable layout/grouping.

### Stage WM-3: Graph consistency validation

Add deterministic tests that validate node/edge integrity, known route references, lifecycle transitions, required high-risk guards, and selected test references.

### Stage WM-4: Browser evidence overlay

Connect the implemented structured Playwright/browser manifest to relevant workflow nodes/scenarios so agents can see which paths have runtime evidence and where failures occurred.

### Stage WM-5: Bounded agent context generation

Generate compact feature-scoped context from the graph plus live repository metadata. Do not maintain an unlimited agent-memory database and do not copy chat transcripts into the repository.

At WM-5, update `AGENTS.md` so substantial implementation/debugging runs automatically read the canonical workflow map and the relevant domain context before editing code. The map remains advisory context; agents must still inspect current `main`, current CI, and the actual source.

## Context persistence

Use existing durable engineering sources first:

- repository documentation for architecture and invariants;
- the canonical workflow graph for current relationships;
- regression tests for executable contracts;
- GitHub Issues/PRs for actionable defects and history;
- small generated context summaries only when they add value.

Do not introduce Supabase or another database solely to store workflow/agent context unless future scale proves repository/GitHub storage inadequate.

`AGENTS.md` remains the stable rulebook and should not become a defect database or generated workflow dump.

## Security and data boundaries

- Do not place credentials, banking details, payroll PII, real invoice documents, or private employee information in the workflow graph.
- Describe sensitive domains structurally rather than storing sensitive values.
- Workflow visualization does not grant mutation authority and must never bypass Engoryx RLS/RPC boundaries.
- Production writes remain governed by existing company isolation, permission checks, lifecycle guards, and human-confirmation rules.
- Generated context must preserve the distinction between demo/test evidence and production behavior.

## Non-goals

This track does not:

- require a hosted workflow-automation subscription;
- replace GitHub Actions;
- replace deterministic tests with diagrams;
- automatically infer every business rule from source code;
- create a second routing or lifecycle system;
- give a visualization permission to mutate production data;
- store unlimited chat transcripts as engineering memory;
- automatically let an agent fix every issue it finds;
- change the customer-facing Engoryx phase numbering.

## Overall track acceptance criteria

Structured browser evidence is complete. The workflow-map track is complete when:

- Engoryx's major product workflows are represented in one versioned machine-readable graph;
- the graph has a clear human-readable visual rendering;
- nodes link back to useful routes/files/tests where practical;
- domain filtering makes a large graph understandable;
- deterministic checks catch broken graph references and selected workflow-contract inconsistencies;
- browser evidence can be associated with the relevant workflow nodes/scenarios;
- an agent can receive a compact feature-scoped workflow/context brief without reading the entire history of the project;
- substantial future agents are instructed to load the relevant workflow context automatically;
- the system works locally and in the repository without a paid orchestration service;
- existing CI remains authoritative and unchanged in meaning.
