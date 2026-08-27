# Engoryx Workflow Map, QA & Agent Context Infrastructure

## Purpose

This is a **development infrastructure track**, not a customer-facing Engoryx product module. Its purpose is to give humans and coding agents a fast visual and machine-readable understanding of how Engoryx works across routes, domain workflows, guarded transitions, data boundaries, and important cross-module links.

The primary goal is a repository-native workflow map that can be rendered as an interactive node graph similar to a visual workflow editor while remaining useful to agents as plain structured data. The same map can later support targeted QA and defect discovery without requiring a hosted orchestration service.

## Status and sequencing

- **Status:** Planned.
- **Priority:** Immediate engineering-infrastructure work, before or alongside Product Phase 2.
- **Product roadmap effect:** This track does **not** renumber the Engoryx customer-facing phases. Product Phase 2 remains Project Scheduling & Gantt.
- **Hosting requirement:** None. The first useful version must work from the repository and existing CI/local tooling without n8n or another paid automation service.
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

External tools such as GitDiagram or repository-wiki generators may be useful for quick architecture exploration, but they are not authoritative because they infer structure and may miss Engoryx business semantics.

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

Existing Playwright/browser QA remains useful and independent.

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

### Stage WM-1: Canonical workflow graph

Create the versioned machine-readable graph contract and document the most important existing Engoryx flows: Projects, Engineering Documents, RFIs, Submittals, Site Logs, Invoices, Cash/Settlement, Expenses, Workforce/Payroll, Reports, and the guarded Assistant.

### Stage WM-2: Visual workflow canvas

Render the graph for humans using Mermaid and/or a lightweight interactive React Flow/xyflow developer view. Support domain filtering, pan/zoom, clickable node details, and stable layout/grouping.

### Stage WM-3: Graph consistency validation

Add deterministic tests that validate node/edge integrity, known route references, lifecycle transitions, required high-risk guards, and selected test references.

### Stage WM-4: Browser evidence overlay

Connect existing Playwright/browser QA results to relevant workflow nodes/scenarios so agents can see which paths have runtime evidence and where failures occurred.

### Stage WM-5: Bounded agent context generation

Generate compact feature-scoped context from the graph plus live repository metadata. Do not maintain an unlimited agent-memory database and do not copy chat transcripts into the repository.

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

- require n8n or another workflow-automation subscription;
- replace GitHub Actions;
- replace deterministic tests with diagrams;
- automatically infer every business rule from source code;
- create a second routing or lifecycle system;
- give a visualization permission to mutate production data;
- store unlimited chat transcripts as engineering memory;
- automatically let an agent fix every issue it finds;
- change the customer-facing Engoryx phase numbering.

## Acceptance criteria

The first useful version is complete when:

- Engoryx's major product workflows are represented in one versioned machine-readable graph;
- the graph has a clear human-readable visual rendering;
- nodes link back to useful routes/files/tests where practical;
- domain filtering makes a large graph understandable;
- deterministic checks catch broken graph references and selected workflow-contract inconsistencies;
- an agent can receive a compact feature-scoped workflow/context brief without reading the entire history of the project;
- the system works locally and in the repository without a paid orchestration service;
- existing CI remains authoritative and unchanged in meaning.
