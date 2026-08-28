# Engoryx Workflow Map, QA & Agent Context Infrastructure

## Purpose

This is a **development infrastructure track**, not a customer-facing Engoryx product module. Its purpose is to give humans and coding agents a fast visual and machine-readable understanding of how Engoryx works across routes, domain workflows, guarded transitions, data boundaries, and important cross-module links.

The primary goal is a repository-native workflow map that can be rendered as an interactive node graph similar to a visual workflow editor while remaining useful to agents as plain structured data. The same map can support targeted QA and defect discovery using repository code and existing CI/local tooling.

## Status and sequencing

- **Status:** **QA-1 Structured Browser Evidence is IMPLEMENTED. WM-1 Canonical Workflow Graph is IMPLEMENTED. WM-2 Visual Workflow Canvas is IMPLEMENTED. WM-3 Graph Consistency Validation is IMPLEMENTED. WM-4 Browser Evidence Overlay is NEXT / PLANNED. WM-5 Bounded Agent Context Generation remains PLANNED.**
- **Priority:** Immediate engineering-infrastructure work, before or alongside Product Phase 2.
- **Product roadmap effect:** This track does **not** renumber the Engoryx customer-facing phases. Product Phase 2 remains Project Scheduling & Gantt.
- **Hosting requirement:** None. The first useful version must work from the repository and existing CI/local tooling without a paid automation service.
- **Implementation rule:** The workflow map is documentation and QA infrastructure. It must not become a second source of business truth that silently drifts from the actual code.

| Infrastructure stage | Status |
| --- | --- |
| QA-1 — Structured Browser Evidence | IMPLEMENTED |
| WM-1 — Canonical Workflow Graph | IMPLEMENTED |
| WM-2 — Visual Workflow Canvas | IMPLEMENTED |
| WM-3 — Graph Consistency Validation | IMPLEMENTED |
| WM-4 — Browser Evidence Overlay | NEXT / PLANNED |
| WM-5 — Bounded Agent Context Generation | PLANNED |

## Current project baseline

As of the roadmap refresh on 2026-08-28:

- Phase 0 core operations are established across multi-tenant RBAC, Cash & Banking, Invoices, Projects, Expenses, Payroll, Reports, and the guarded Engoryx Assistant.
- Phase 1A Engineering Documents, Phase 1B RFIs & Technical Submittals, and Phase 1C Daily Site Logs are implemented and merged to `main`.
- The Financial Settlement Integration layer is implemented across Cash & Banking, supplier invoices, payroll, demo fixtures, and the Assistant while preserving project-cost and payroll-source semantics.
- The next customer-facing product phase is **Phase 2: Project Scheduling & Gantt**.

WM-1 now maintains one versioned, typed graph contract in `scripts/workflow-map/graph.ts`. It describes meaningful product workflows, states, actions, routes, guards, authoritative/derived data, and cross-domain relationships without attempting to dump every component or SQL function.

The committed outputs are generated from that source:

- `docs/architecture/workflow-map.json` — machine-readable graph for agents and deterministic checks;
- `docs/architecture/APP_WORKFLOW_MAP.md` — generated route/source/test index plus Mermaid diagrams for the whole platform, Projects + Engineering, Invoice + Cash Settlement, Workforce + Payroll, and Assistant guarded mutations.

Run `npm.cmd run workflow-map:generate` after a graph change, `npm.cmd run workflow-map:check` to fail on generated-output drift, and `npm.cmd run workflow-map:consistency` to compare selected graph metadata with authoritative source contracts. These commands are repository-local and do not require GitDiagram, Supabase, a database, Gemini, a browser, or production credentials.

## Workflow graph contract

Prefer a machine-readable source such as TypeScript data, JSON, or YAML plus generated Mermaid/interactive rendering. The exact representation should follow repository conventions, but the graph should support at least:

### Node fields

- stable node ID;
- label;
- feature/domain;
- node type (`route`, `screen`, `workflow`, `state`, `action`, `data`, `derived-data`, `guard`, `external-boundary`);
- canonical route or relevant file references when applicable;
- short description;
- lifecycle/status metadata when applicable;
- permission or confirmation requirements when important;
- related tests where useful;
- company/project/demo scope, source classification, high-risk invariant IDs, and deterministic QA-1 scenario IDs where the mapping is useful.

### Edge fields

- stable edge ID;
- source node;
- target node;
- relationship type and edge kind;
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

The graph also records stable diagram node selections and the limited exploratory role of GitDiagram. Mermaid, future React Flow/xyflow rendering, agent context, and QA overlays must consume this graph rather than maintain separate relationship definitions.

The graph should stay bounded to meaningful workflows. It must not attempt to represent every function call or every component in the repository.

## Visual rendering — WM-2 Visual Workflow Canvas

WM-1 generates a readable Mermaid view for documentation. **WM-2 delivers an interactive, read-only visual workflow canvas** built with `@xyflow/react` and a deterministic Dagre layout engine.

### Launch and developer access

The visual workflow canvas is dedicated developer and agent tooling. It is completely isolated from production customer navigation and authentication:

- Open `/workflow-map`, `/dev/workflow-map`, or `/?view=workflow-map` in any browser while the development server is running (`npm.cmd run dev` or `npx.cmd tsx server.ts`);
- No Supabase login, session, or credentials required;
- Zero customer navigation links, RBAC permissions, or business mutation endpoints mounted;
- Consumes the canonical graph directly from `scripts/workflow-map/graph.ts` (183 nodes, 208 edges, 11 invariants).

### Canvas capabilities

1. **View presets**: Curated diagram views (Whole-platform overview, Projects & Engineering, Invoice & Cash Settlement, Workforce & Payroll, Assistant guarded mutations), individual domain views, and full architecture view.
2. **Deterministic layout**: Left-to-right (`rankdir: LR`) workflow progression with stable coordinates across views.
3. **Interactive search & filtering**: Fast real-time search across node labels, IDs, routes, statuses, invariants, and descriptions. Domain and node type filter toggles.
4. **Neighborhood focus**: Highlight 1-hop or 2-hop connected dependencies with dimmed unrelated nodes, or isolate strictly to the neighborhood.
5. **Node details drawer**: Full inspection of node scope, route paths, lifecycle state progressions, required permissions, human confirmation gates, attached high-risk invariants, copyable source and test file paths, and clickable incoming/outgoing dependencies.
6. **High-risk invariants catalog**: Dedicated reference sheet for all 11 architectural invariants protecting financial and system integrity.
7. **URL state synchronization**: Shareable preset, domain, node, and search query parameters.
8. **Read-only guarantee**: authoring, edge creation, and graph mutation tools are disabled. Node dragging is permitted for temporary exploration without modifying the canonical graph source.

WM-3 Graph Consistency Validation is implemented as a repository-local, deterministic contract check. It does not grant access to production data or mutate the graph.

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

### Current repository startup contract

WM-1 adds the stable instruction to `AGENTS.md`: before substantial implementation, debugging, or architecture work, read `docs/architecture/APP_WORKFLOW_MAP.md` and `docs/architecture/workflow-map.json`, identify the affected workflow/domain, inspect neighboring nodes and invariants, and then verify the actual source, guards, permissions, and tests. High-risk mapped domains require explicit inspection of their invariants and neighboring flows.

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

The structured-evidence producer is implemented now. WM-1 adds stable `qaScenarioIds` to selected graph nodes so a later stage can attach manifest records without dynamically reading CI artifacts in the graph generator.

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

This creates a useful bridge between architecture understanding and actual rendered behavior without introducing another service.

## Proposed implementation stages

### Stage WM-1: Canonical workflow graph — IMPLEMENTED

The versioned graph at `scripts/workflow-map/graph.ts` documents the most important existing Engoryx flows: Projects, Engineering Documents, RFIs, Submittals, Site Logs, Invoices, Cash/Settlement, Expenses, Workforce/Payroll, Reports, and the guarded Assistant. The generated JSON and Mermaid Markdown outputs are checked for deterministic drift, broken references, and selected high-risk semantic boundaries.

GitDiagram was accessed for WM-1 discovery only. Its inferred map was checked against current routes, domain code, lifecycle guards, permissions, persistence/RPC boundaries, tests, and documented invariants before the curated graph was committed.

### Stage WM-2: Visual workflow canvas — IMPLEMENTED

The read-only developer canvas is available at `/workflow-map`, `/dev/workflow-map`, `/dev/architecture`, and `/?view=workflow-map`. It consumes the canonical graph, provides deterministic Dagre layout, presets, search, filters, node details, neighborhood focus, invariant inspection, and URL state without mounting production authentication or mutation paths.

### Stage WM-3: Graph consistency validation — IMPLEMENTED

WM-3 is the lightweight graph-to-source consistency lane. Run `npm.cmd run workflow-map:consistency` locally or in the dedicated `Workflow Map Consistency` GitHub Actions workflow. It validates, using injected pure contracts and no network/database/browser/secrets:

- canonical route IDs, paths, patterns, and selected deep-link query keys;
- selected route build/parse round trips using synthetic UUID-like identifiers;
- supported permission keys and active feature/route availability;
- RFI, Technical Submittal, Daily Site Log, and payroll-run statuses/transitions exported by production domain code;
- stable settlement confirmed/reversed history statuses;
- Assistant confirmation policy and persisted prepared-action status metadata;
- demo/production/workflow-map application-mode separation;
- QA-1 scenario references and normalized route correspondence;
- selected high-risk graph/test coverage, bounded graph orphans, and WM-2 diagram integrity.

The graph remains advisory. WM-3 imports or receives authoritative constants/helpers; it does not copy lifecycle arrays, route tables, permission matrices, financial calculations, payroll calculations, or Assistant execution logic. A failure identifies the graph node, edge, invariant, or scenario plus the conflicting contract and expected/current values where useful. `workflow-map:check` remains the separate generated-output and WM-1 structural/semantic integrity check.

To add a consistency contract, first expose the smallest node-safe pure contract from the production module and keep production code using it. Then add only the graph-node-to-contract adapter needed to identify the mapping, a focused pure validator assertion, a positive test, and a synthetic drift test. Do not parse broad TypeScript source text or connect the validator to Supabase, provider credentials, or browser state.

When a mapped route, deep link, lifecycle, permission, guard, Assistant mutation, QA mapping, or high-risk cross-domain boundary changes, update the production contract and `scripts/workflow-map/graph.ts` together when workflow meaning changed, regenerate the committed outputs, and run both `npm.cmd run workflow-map:check` and `npm.cmd run workflow-map:consistency`.

### Stage WM-4: Browser evidence overlay — NEXT / PLANNED

Connect the implemented structured Playwright/browser manifest to relevant workflow nodes/scenarios so agents can see which paths have runtime evidence and where failures occurred.

### Stage WM-5: Bounded agent context generation — PLANNED

Generate compact feature-scoped context from the graph plus live repository metadata. Do not maintain an unlimited agent-memory database and do not copy chat transcripts into the repository.

WM-5 may later generate smaller feature-scoped packets from the same graph. The map remains advisory context; agents must still inspect current `main`, current CI, and the actual source.

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

- require an external workflow-automation subscription;
- replace GitHub Actions;
- replace deterministic tests with diagrams;
- automatically infer every business rule from source code;
- create a second routing or lifecycle system;
- give a visualization permission to mutate production data;
- store unlimited chat transcripts as engineering memory;
- automatically let an agent fix every issue it finds;
- change the customer-facing Engoryx phase numbering.

## Overall track acceptance criteria

QA-1 and WM-1 through WM-3 are complete. The remaining workflow-map track stages are complete when:

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
