# ENGORYX Phase 2 - Project Scheduling and Gantt

## Status

**Phase 2A foundation contract prepared. Customer-facing scheduling remains planned until persistence, RLS, routing, and the production workspace UI are implemented and validated.**

This document defines the implementation boundary for Engoryx Phase 2. It intentionally separates scheduling domain truth from the future Gantt presentation layer.

## 1. Goal

Phase 2 adds project-scoped construction scheduling without changing the meaning of existing financial, payroll, engineering-document, RFI, submittal, or Daily Site Log records.

The target product capability is:

- project schedule task register;
- milestones;
- dependency networks;
- interactive Gantt visualization using Frappe Gantt;
- progress tracking;
- schedule baselines and baseline-versus-actual health;
- critical path method (CPM) analysis;
- stable project schedule deep links;
- guarded Assistant navigation and actions in a later integration phase.

Frappe Gantt is a presentation dependency only. Engoryx schedule records and deterministic schedule calculations remain canonical.

## 2. Delivery slices

### Phase 2A - Scheduling foundation

Phase 2A should implement the production foundation:

1. company/project-scoped schedule persistence;
2. task and milestone CRUD;
3. dependency CRUD with cycle prevention;
4. scheduling RBAC and RLS;
5. `/projects/:projectId/schedule` workspace navigation;
6. optional `taskId` deep-link context;
7. Frappe Gantt rendering from canonical schedule records;
8. list/table fallback for narrow mobile screens and accessibility;
9. deterministic demo fixtures isolated from production writes;
10. workflow-map nodes, routes, guards, permissions, tests, and QA mappings.

Phase 2A does **not** need to implement full CPM or baseline history to be considered coherent.

### Phase 2B - CPM, baselines, and schedule health

Phase 2B should add:

- forward/backward CPM passes;
- total/free float where supported by the implemented dependency model;
- critical-path identification;
- immutable named schedule baselines;
- baseline task snapshots;
- planned-versus-current variance;
- milestone slippage;
- project schedule health summaries.

### Phase 2C - Cross-module and Assistant integration

Phase 2C may add carefully bounded relationships such as:

- project overview schedule health;
- schedule-aware Daily Site Log context;
- project labor planning context without rewriting payroll truth;
- milestone references from supported commercial workflows;
- Assistant navigation/query tools;
- Assistant PREPARE/confirm/execute scheduling mutations.

Assistant write actions must preserve the existing human-confirmation rule.

## 3. Domain vocabulary

The reusable TypeScript contract lives in:

`src/features/scheduling/contracts.ts`

### Task kinds

- `TASK`
- `MILESTONE`

A milestone is zero-duration at the date level: `start_date = end_date`.

### Task statuses

- `PLANNED`
- `IN_PROGRESS`
- `COMPLETE`
- `ON_HOLD`
- `CANCELLED`

Status and progress are related operational facts but Phase 2A should not silently infer one from the other. A later product rule may add guarded convenience transitions if required.

### Dependency types

- `FINISH_TO_START`
- `START_TO_START`
- `FINISH_TO_FINISH`
- `START_TO_FINISH`

Dependencies may carry an integer `lag_days`, including negative lag if the product explicitly supports lead time. The database and UI should not invent undocumented fractional-day semantics.

## 4. Core invariants

The following rules are required before Phase 2A is activated:

1. **Tenant isolation is authoritative.** Every persisted schedule row is company-scoped and protected by RLS.
2. **Project isolation is authoritative.** A task or dependency cannot cross project boundaries.
3. **Dependencies remain acyclic.** Self-dependencies and dependency cycles are invalid.
4. **Dependency endpoints must exist in the same schedule/project.**
5. **Task dates are valid calendar dates.** For normal tasks, `end_date >= start_date`.
6. **Milestones have one schedule date.** Persisted milestone start/end dates must match.
7. **Progress remains bounded.** `progress_percent` is between 0 and 100.
8. **Frappe Gantt is not a source of truth.** Drag/resize/progress gestures must be converted into validated Engoryx mutations.
9. **Scheduling does not rewrite financial truth.** Moving a task or milestone does not create, reverse, settle, or reclassify invoices, expenses, bank transactions, or payroll.
10. **Scheduling does not rewrite field-history truth.** Submitted/finalized Daily Site Logs remain historical observations.
11. **Baseline history is immutable once created.** Phase 2B corrections should create a new baseline or explicit additive history instead of silently overwriting an earlier baseline snapshot.
12. **Demo scheduling cannot write production records.** Existing demo/production isolation rules continue to apply.

## 5. Planned persistence model

This section is a migration contract for the implementation PR. This preparation change does not create production tables.

### `project_schedule_tasks`

Recommended columns:

- `id uuid primary key`;
- `company_id uuid not null`;
- `project_id uuid not null`;
- `parent_task_id uuid null` for hierarchy/WBS grouping;
- `task_code text null`;
- `name text not null`;
- `kind text not null` constrained to task kinds;
- `status text not null` constrained to task statuses;
- `start_date date not null`;
- `end_date date not null`;
- `progress_percent numeric/integer not null` constrained to 0..100;
- `sort_order integer not null`;
- `notes text null`;
- standard actor/time audit fields consistent with current repository patterns.

Required database checks should include valid date order and milestone date equality.

If task hierarchy is included in 2A, `parent_task_id` must resolve to the same company/project and hierarchy cycles must be rejected.

### `project_schedule_dependencies`

Recommended columns:

- `id uuid primary key`;
- `company_id uuid not null`;
- `project_id uuid not null`;
- `predecessor_task_id uuid not null`;
- `successor_task_id uuid not null`;
- `dependency_type text not null` constrained to supported dependency types;
- `lag_days integer not null default 0`;
- standard actor/time audit fields.

Required constraints:

- predecessor differs from successor;
- duplicate relationship prevention for the same project/type/endpoints where appropriate;
- both endpoints belong to the same company and project;
- mutation path rejects cycles before commit.

Cycle prevention may be implemented through a guarded RPC or transaction-safe server-side validation. Do not rely only on client validation.

### Phase 2B baseline tables

Do not store baseline history as mutable columns on the live task row if historical baselines are required.

Preferred model:

- `project_schedule_baselines`
  - baseline identity, project/company scope, name, created actor/time, optional notes;
- `project_schedule_baseline_tasks`
  - immutable snapshot of task identity/code/name/kind/start/end/progress or planned progress fields required for variance calculation.

The exact baseline snapshot must remain meaningful even after the live task changes.

## 6. RLS and permission design

The frontend permission vocabulary is reserved in `src/utils/accessControl.ts`:

- `scheduling.read`
- `scheduling.manage`

These keys do not grant access by themselves. The Phase 2A migration must add them to the authoritative database permission catalog/role model using existing company-tenancy patterns.

Expected policy behavior:

- read requires active company membership plus `scheduling.read` or an explicitly approved stronger permission;
- create/update/delete requires active company membership plus `scheduling.manage`;
- all policies fail closed;
- project/company ownership must be derived/validated, not trusted from arbitrary browser payloads;
- service-role/browser bypass remains forbidden.

Before writing migrations, inspect the latest tenancy/RBAC migrations and `docs/company-tenancy-rbac-database.md`. Do not copy an outdated policy pattern from an older phase.

## 7. Routing contract for the implementation PR

Planned canonical project route:

`/projects/:projectId/schedule`

Planned detail context:

`/projects/:projectId/schedule?taskId=:taskId`

The implementation should extend the existing project workspace routing system rather than create a second router.

Expected integration points include:

- `src/utils/appRouteContracts.ts`;
- `src/utils/appRouting.ts`;
- `src/components/projects/ProjectWorkspace.tsx`;
- project workspace/deep-link tests;
- workflow-map route/source consistency.

Unknown or inaccessible `taskId` values should fail safely by showing the schedule without leaking another project/company task.

## 8. UI contract

The schedule workspace should have two synchronized representations of the same state:

1. Gantt visualization for desktop/tablet;
2. compact task list/table for mobile and accessibility.

Minimum Phase 2A task editing:

- name;
- kind;
- start/end date;
- progress;
- status;
- task code if used;
- notes if used;
- predecessor/successor dependency management.

Frappe Gantt interactions such as drag/resize/progress changes must pass through the same domain validation and persistence path as form editing.

The mobile experience must not require horizontal Gantt interaction to perform core CRUD.

## 9. Deterministic schedule calculations

Phase 2A should keep deterministic validation outside React components.

Already prepared:

- calendar-date validation;
- milestone date validation;
- progress bounds;
- dependency endpoint validation;
- self-reference rejection;
- deterministic dependency-cycle detection.

Phase 2B CPM should likewise be implemented as pure deterministic functions with focused tests before UI presentation.

## 10. Demo fixtures

When schedule UI is implemented, demo data should include at least one realistic engineering/construction sequence, for example:

- mobilization;
- site clearing;
- excavation;
- foundations;
- structural frame;
- MEP rough-in;
- envelope;
- finishes;
- testing/commissioning;
- substantial completion milestone.

Demo dependencies should be valid and acyclic and should exercise multiple dates/progress states. Demo mutations must remain isolated from production Supabase writes.

## 11. Workflow-map requirements

The implementation PR that activates scheduling routes or mutations must update the canonical workflow graph and regenerate committed workflow-map outputs.

At minimum, represent:

- project schedule route;
- schedule workspace screen;
- task register/workflow;
- task create/update actions;
- dependency mutation action;
- scheduling read/manage permission guards;
- company/project isolation invariant;
- dependency acyclic invariant;
- Frappe Gantt as a presentation boundary, not an authoritative data source;
- relevant tests and QA scenario IDs.

WM-5 packets should then be able to orient future agents on scheduling without loading the whole project history.

## 12. Required validation for Phase 2A implementation

Minimum local/CI validation should include:

```bash
npm.cmd run workflow-map:check
npm.cmd run workflow-map:consistency
npm.cmd run test:workflow-map
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run test:migrations
npm.cmd run test:migrations:upgrade
```

Browser QA should cover at least:

- empty schedule;
- populated schedule;
- task create/edit;
- milestone create/edit;
- dependency add/remove;
- invalid/cyclic dependency rejection;
- deep link to a task;
- permissions/read-only state;
- desktop/tablet/mobile rendering;
- demo isolation.

## 13. Preparation PR boundary

The Phase 2A preparation PR may safely include:

- this architecture contract;
- reusable TypeScript schedule contracts/validators;
- scheduling permission vocabulary;
- feature-registry metadata;
- deterministic unit tests.

It must **not** mark Phase 2 active, expose a production Schedule tab, or claim database/RLS support until the implementation PR supplies and validates those pieces.
