# Excel-Native Projects and Project Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the proven Excel-native register/workbook flow to the Projects portfolio and project cost-code controls while closing the RFQ/PO and project/cost-code optimistic-concurrency gaps.

**Architecture:** Keep project and cost-code authority in their existing parent/domain paths. Add one forward migration with version-aware RFQ/PO/project mutations and one transaction-group RPC for a project plus its proposed cost-code state. Build a domain-specific Projects workbook adapter on top of `operationsWorkbook.ts`; upload produces typed review proposals, and Apply invokes only the version-aware authoritative callbacks/RPCs. Replace only desktop project and cost-code tables with `OperationsGrid`; keep filters, lifecycle/editor actions, financial derivation, and mobile cards in their current parents.

**Tech Stack:** React 19, TypeScript 5.8, SheetJS `xlsx` 0.20.3, Supabase/PostgreSQL RPCs and pgTAP, Node test runner with `tsx`, existing Tailwind/Astryx UI primitives.

**Spec:** `docs/superpowers/specs/2026-09-18-excel-native-operations-ux-design.md` plus the user-provided Projects & Project Controls Excel-Native Rollout brief.

## Global Constraints

- Base is `ffc46dc8e3972bc53de48190dd02b86e11b957d0`; do not merge the feature PR.
- Procurement, Projects, and project controls are the only changed Excel-native domains; Expenses, Finance, Inventory, Equipment, Workforce, Payroll, Documents, and Communications remain out of scope.
- Workbook upload creates proposals only; no workbook cell directly updates a table or bypasses a domain mutation boundary.
- Existing project and cost-code creation remain supported only through existing application paths; workbook rows without stable IDs are proposed-but-unsupported, and missing rows never imply deletion.
- Project lifecycle status/archive/reactivation/deletion, derived Actual Cost, Committed Cost, billing/collection, settlement, receiving, inventory, payroll, and audit/history fields remain protected.
- `projects.contract_value` and `projects.project_budget` remain separate concepts; original currencies and unavailable/partial mixed-currency states remain truthful.
- Every existing-record Apply mutation carries an expected authoritative `updated_at` token and fails closed with an explicit stale/concurrency error when it no longer matches.
- A project workbook Apply group updates the project and affected cost codes in one authoritative transaction; final active cost-code allocation is checked against the locked project budget before commit.
- Hidden workbook metadata is comparison evidence only. Company scope, permissions, RLS, parent identity, and lifecycle authority remain server/domain authoritative.
- Reuse `OperationsGrid`, `operationsWorkbook.ts`, and the procurement proposal/review pattern; do not add another grid library or universal spreadsheet-to-database writer.

## Review Focus

- A stale project and cost-code group must reject atomically without changing either record; covered by the grouped RPC contract and client adapter tests.
- A workbook with a changed hidden ID, cross-company ID, duplicate identity, unknown parent, or parent-redirection attempt must fail closed; covered by Projects workbook security tests.
- Two simultaneous budget edits that would exceed the approved project budget must not both commit; covered by the final-state group validation and pgTAP/runtime concurrency tests.
- Protected project lifecycle/financial fields and derived cost columns must remain non-editable even when rendered in a grid/workbook; covered by schema/grid and import-review tests.
- RFQ/PO stale saves must reject after a fresh review and before mutation; covered by version-aware RPC/source-contract regressions.

---

### Task 1: Authoritative version-aware database contracts

**Files:**
- Create: `supabase/migrations/20260919120000_excel_project_concurrency_and_apply.sql`
- Create: `supabase/tests/database/41_excel_project_concurrency.test.sql`
- Create: `tests/projectsExcelConcurrencyMigration.test.ts`
- Test: existing `tests/rfqMigrationSafety.test.ts`, `tests/purchaseOrdersMigrationSafety.test.ts`, `tests/migrationInvariants.test.ts`

**Interfaces:**
- Produces `save_rfq(jsonb,jsonb,uuid[],timestamptz)`, `save_purchase_order(jsonb,jsonb,timestamptz)`, `save_project(jsonb,timestamptz)`, and `apply_project_cost_control_group(uuid,timestamptz,jsonb,jsonb)` with authenticated grants and explicit stale-version errors.
- The grouped project RPC accepts one project payload and a JSON array of existing cost-code proposals containing stable IDs and expected `updatedAt` values; it locks the project, validates company/permission/parent identity, checks every expected version, validates the final active budget sum, and mutates the project plus affected cost codes in one transaction.

- [ ] **Step 1: Write failing SQL/static tests** asserting the new migration contains exact version-precondition checks, row locks, project/cost-code parent protection, grouped final-budget validation, authenticated grants, no delete path, and RFQ/PO preservation. Add pgTAP cases for stale project, stale cost code, cross-company/unknown IDs, and a successful grouped update.
- [ ] **Step 2: Run `npx.cmd tsx --test tests/projectsExcelConcurrencyMigration.test.ts tests/rfqMigrationSafety.test.ts tests/purchaseOrdersMigrationSafety.test.ts` and verify the new migration/API assertions fail because the migration is absent.
- [ ] **Step 3: Implement the forward migration without editing prior migrations. Preserve existing lifecycle triggers, RFQ/PO line replacement behavior, permissions, audit triggers, and create-vs-update semantics; use `FOR UPDATE` plus an `IS NOT DISTINCT FROM` expected timestamp check before every existing-record mutation.
- [ ] **Step 4: Rerun the focused static tests and inspect the SQL diff for overload/grant correctness.
- [ ] **Step 5: Run the pgTAP file against the clean local database when Docker is available; verify stale failures leave no partial project/cost-code mutation.

### Task 2: Client mutation contracts and Procurement concurrency propagation

**Files:**
- Modify: `src/lib/rfqs.ts`
- Modify: `src/lib/purchaseOrders.ts`
- Modify: `src/lib/projects.ts`
- Modify: `src/lib/projectCostCodes.ts`
- Modify: `src/features/procurement/useProcurementController.ts`
- Modify: `src/features/projects/useProjectController.ts`
- Modify: `src/app/routes/ProjectsRoute.tsx`
- Modify: `src/components/procurement/ProcurementPage.tsx`
- Modify: `src/components/projects/ProjectsPage.tsx`
- Create/modify: `tests/projectsExcelConcurrency.test.ts`

**Interfaces:**
- `saveRFQ`, `savePurchaseOrder`, and `saveProject` accept an optional expected `updatedAt` and pass it to the version-aware RPC for existing records; ordinary form saves use the record’s current token.
- Cost-code persistence exposes `applyProjectCostControlGroupToSupabase(project, expectedProjectUpdatedAt, costCodes, expectedCostCodeVersions)` and returns authoritative project/cost-code rows.
- Existing UI callbacks remain source-compatible for ordinary create/edit/lifecycle flows; workbook Apply can pass the explicit expected tokens.

- [ ] **Step 1: Add failing client contract tests** proving RFQ/PO/project updates pass expected version tokens, stale errors are surfaced rather than retried blindly, cost-code parent IDs cannot change, and grouped Apply does not call independent blind upserts.
- [ ] **Step 2: Run `npx.cmd tsx --test tests/projectsExcelConcurrency.test.ts` and verify the new assertions fail against the current client contracts.
- [ ] **Step 3: Implement the narrow client wrappers and optional handler parameters. Keep guest/local storage behavior unchanged and keep lifecycle actions on their existing guarded RPCs.
- [ ] **Step 4: Rerun the focused client tests and the existing project/RFQ/PO persistence tests.

### Task 3: Projects workbook schema, proposal review, and grouped Apply adapter

**Files:**
- Create: `src/lib/projectsWorkbook.ts`
- Create: `tests/projectsWorkbook.test.ts`

**Interfaces:**
- Produces `PROJECTS_WORKBOOK_SCHEMA`, `exportProjectsWorkbook`, `buildProjectsImportReview`, `applyProjectsImport`, `ProjectsImportReview`, `ProjectsProposal`, and typed project/cost-code proposal/group status types.
- Consumes `operationsWorkbook.ts`, `Project`, `ProjectCostCode`, project financial summaries, and a context containing authorized company ID, projects, cost codes, `canWrite`, and an `applyGroup` callback.
- Workbook sheets are `Projects`, `Cost Codes`, and hidden `_HydroQualiSense`; metadata records stable project/cost-code IDs, company identity, exported fingerprints, parent IDs, and `updatedAt` tokens.

- [ ] **Step 1: Write failing adapter tests** for editable/protected field classification, `contract_value` versus `project_budget`, dates/numbers/currency, stable IDs, duplicate/unknown/cross-company metadata, parent redirection, stale project/cost-code conflicts, mixed-currency/protected derived values, missing rows, unsupported new rows, grouped budget validation, review-only upload, explicit Apply, and re-export of authoritative values.
- [ ] **Step 2: Run `npx.cmd tsx --test tests/projectsWorkbook.test.ts` and verify the adapter API is absent.
- [ ] **Step 3: Implement deterministic export and review. Editable project fields are limited to the existing project editor’s safe master-data/commercial fields; status/archive metadata, derived project financials, and all source-domain totals are protected. Cost-code edits are limited to code/name/description/approved budget/forecast; stable IDs, project ownership, status, actuals, committed values, and audit metadata are protected. New rows are unsupported and omissions are preserved.
- [ ] **Step 4: Implement project-level review grouping and `applyProjectsImport` so each selected project group is revalidated against fresh context, then sent once to `applyGroup`; stale or invalid groups fail without applying unrelated groups.
- [ ] **Step 5: Rerun the focused adapter suite and verify an exported → edited → reviewed → applied → re-exported real `.xlsx` round trip preserves authoritative values and protected fields.

### Task 4: Human-reviewed Projects workbook UI

**Files:**
- Create: `src/components/projects/ProjectsWorkbookPanel.tsx`
- Modify: `src/components/projects/ProjectsPage.tsx`
- Modify: `src/app/routes/ProjectsRoute.tsx`
- Modify: `tests/projectsWorkbookUx.test.tsx`

**Interfaces:**
- `ProjectsWorkbookPanel` consumes current projects/cost codes, permission state, an authoritative refresh callback, and the grouped Apply callback. It provides export, upload, review/diff, per-group selection, explicit confirmation, truthful read-only messaging, and post-apply refresh.

- [ ] **Step 1: Add failing SSR/contract assertions** for Export, Import, review-only upload, unchanged/proposed/conflict/protected/unsupported states, project-level budget effect, explicit confirmation, and no save call during file selection.
- [ ] **Step 2: Run `npx.cmd tsx --test tests/projectsWorkbookUx.test.tsx` and verify the new controls are absent.
- [ ] **Step 3: Implement the panel by following `ProcurementWorkbookPanel` while grouping proposals by project and never invoking Apply without permission, selected valid groups, and an explicit confirmation.
- [ ] **Step 4: Wire the panel through `ProjectsRoute` using fresh project/cost-code refresh data and the atomic grouped callback; keep route/deep-link and detail workspace behavior unchanged.
- [ ] **Step 5: Rerun the focused UI suite and verify read-only users can review but cannot Apply.

### Task 5: Projects portfolio `OperationsGrid` integration

**Files:**
- Modify: `src/components/projects/ProjectPortfolioRegisterSection.tsx`
- Modify: `tests/projectsPageArchitecture.test.ts`
- Modify: `tests/projectManagementUX.test.ts`

**Interfaces:**
- The desktop register consumes existing `ProjectManagementView` rows and parent-owned filters/actions. The mobile/tablet card branch remains the responsive fallback.

- [ ] **Step 1: Add failing assertions** for `data-operations-grid`, stable columns, numeric right alignment, protected financial cells, row selection/activation, sticky/grid semantics, and preserved Open/Edit/Lifecycle actions plus mobile cards.
- [ ] **Step 2: Run the focused Projects UI tests and verify the shared grid assertions fail.
- [ ] **Step 3: Replace only the desktop table with `OperationsGrid`, retaining the current attention/health information and all parent callbacks. Mark Contract Value/Budget and every derived financial column protected/read-only; keep sort/filter derivation parent-owned.
- [ ] **Step 4: Rerun the focused UI tests and verify desktop grid and mobile fallback contracts pass.

### Task 6: Project cost-code `OperationsGrid` integration

**Files:**
- Modify: `src/components/projects/ProjectBudgetControlPanel.tsx`
- Modify: `tests/projectCostCodesAndBudgetControl.test.ts`
- Modify: `tests/projectCostCodeGrid.test.tsx`

**Interfaces:**
- The grid consumes `CostCodeFinancialSummary` rows and preserves the existing modal, archive/reactivate callbacks, search/status filters, financial calculation utility, mixed-currency indicators, and mobile cards.

- [ ] **Step 1: Write failing grid assertions** for Code, Work Package, Status, Approved Budget, Actual, Committed, Forecast, Variance, utilization/attention, protected derived cells, actions, and mobile fallback.
- [ ] **Step 2: Run `npx.cmd tsx --test tests/projectCostCodeGrid.test.tsx tests/projectCostCodesAndBudgetControl.test.ts` and verify the shared grid assertions fail.
- [ ] **Step 3: Replace only the desktop/tablet cost-code table with `OperationsGrid`; keep all financial values read-only and preserve existing editor/lifecycle action buttons and mobile cards.
- [ ] **Step 4: Rerun the focused cost-code tests and the project-costing suite.

### Task 7: Documentation synchronization and final risk validation

**Files:**
- Modify: `docs/superpowers/specs/2026-09-18-excel-native-operations-ux-design.md`
- Modify: `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`
- Modify: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`
- Modify: `AGENTS.md` only if the final reconciled sequence/status requires it
- Modify: `docs/superpowers/plans/2026-09-19-excel-native-projects-controls.md`

- [ ] **Step 1: Update the authoritative status to state exactly what is implemented: procurement RFQ/PO atomic version preconditions, Projects and cost-code grids, workbook shape/editable fields, protected fields, creation/deletion policy, grouped transaction behavior, and remaining limitations. Do not claim app-wide Excel completion or hosted/production certification.
- [ ] **Step 2: Run the new/edited focused suites, then once on the integrated final diff run `npm.cmd run test:affected:agent`, `npm.cmd run lint`, `npm.cmd run build`, and the applicable Docker/Supabase ladder because the migration/RPC contract changed.
- [ ] **Step 3: Run targeted browser QA for Projects desktop/mobile when the local harness is available; otherwise record it as not tested. Run Workflow Map checks only if mapped source contracts changed.
- [ ] **Step 4: Review the complete diff for direct workbook persistence, stale-write races, company/RBAC bypasses, lifecycle bypass, cost-code budget races, financial conflation, mixed-currency regression, duplicated workbook/grid infrastructure, and out-of-scope changes.
- [ ] **Step 5: Commit the integrated branch, push `codex/projects-excel-native`, open a PR against current `main`, and report exact base/head SHAs, migration/RPC strategy, real `.xlsx` evidence, focused/affected/DB/browser evidence, skipped checks, known limitations, and that the PR was not merged.

## Implementation outcome

The plan was executed inline on `codex/projects-excel-native`. Tasks 1-6 are
implemented and recorded in the branch ledger under
`.superpowers/sdd/2026-09-19-excel-native-projects-controls/progress.md`.
The final status is: version-aware RFQ/PO/project/cost-control contracts;
Projects and cost-code `OperationsGrid` surfaces; controlled Projects/Cost Codes
workbook export-review-apply; update-only existing-record semantics; atomic
per-project Apply groups; protected lifecycle/financial/mixed-currency fields;
and no workbook-cell direct persistence. Docker/Supabase replay and pgTAP
remain not tested because the local Docker daemon was unavailable.
