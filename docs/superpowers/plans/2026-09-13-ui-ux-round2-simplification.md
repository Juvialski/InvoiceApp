# UI/UX Round 2 App-Wide Usability Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every major authenticated HydroQualiSense workspace task-first and easier to scan while preserving route contracts, permission checks, financial/source semantics, history, and provider truth.

**Architecture:** Keep `AppTab`, `RouteId`, URL query contracts, and domain persistence unchanged. Improve presentation through grouped permission-filtered navigation, a small set of shared operational layout primitives, and targeted hierarchy changes. The four mandatory regression areas are changed at their owning components, while the remaining authenticated routes receive the same grammar where the existing structure exposes the same problem.

**Tech Stack:** React 19, TypeScript, Tailwind utility classes, Lucide icons, Node test runner with TypeScript stripping, Vite, existing Local-QA harness.

**Spec:** `docs/HYDROQUALISENSE_UI_UX_ROUND2_SIMPLIFICATION.md`

## Global Constraints

- Preserve all 17 canonical route IDs, existing paths/aliases, query/deep-link intent, and `AppTab` compatibility.
- Navigation visibility remains permission-based and deployment-filtered; grouping is presentation-only and never grants capability.
- Preserve Supplier Invoice evidence as distinct from linked Expense payable/cost truth.
- Preserve Client Invoice/Collection receivable truth as distinct from Cash & Banking settlement evidence.
- Preserve payroll privacy, calculation freshness, approval authority, and settlement history.
- Preserve inventory movement/allocation authority and explainability; do not add destructive balance editing.
- Preserve immutable issued/finalized document snapshots, append-only delivery history, company isolation, and Assistant human-confirmation boundaries.
- Do not add migrations, RLS, RPC, trigger, constraint, financial, inventory, or provider changes for UI convenience.
- Use human-readable business identity first; keep technical IDs/provenance available as secondary details.
- Keep original currency explicit; never invent FX or silently combine mixed currencies.
- Use zero subagents; the lead owns shared components, navigation, integration, validation, and final diff review.
- Validation proceeds focused tests -> `npm.cmd run test:affected:agent` -> relevant lint/build/browser checks; do not run `test:full` without an impact-based reason.

---

## Task 1: Lock live route inventory and grouped navigation contract

**Files:**
- Modify: `src/navigation/navigationModel.ts`
- Modify: `src/components/Header.tsx`
- Test: `tests/navigationModel.test.ts`
- Test: `tests/headerNavigation.test.ts`
- Test: `tests/navigationRoutes.test.ts`

**Interfaces:**
- Consumes: `ROUTE_DEFINITIONS`, `RouteId`, `PermissionKey`, `DeploymentModuleKey`, `getNavigationModel`, and the existing `Header` permission/deployment inputs.
- Produces: `NavigationGroupId`, `NavigationGroup`, and `NavigationModel.groups` containing only already-visible `NavigationModule` values; existing `modules`, route IDs, and child-route APIs remain available.

- [ ] **Step 1: Write the failing navigation contract tests.** Assert that the unfiltered model has non-empty groups for Operations, Finance, People, and Communications; every visible module appears exactly once; and permission filtering omits inaccessible modules and empty groups. Settings remains in its existing dedicated workspace area.

```ts
test("navigation groups expose every visible module exactly once", () => {
  const model = getNavigationModel();
  const groupedModules = model.groups.flatMap((group) => group.modules.map((module) => module.id));
  assert.deepEqual(new Set(groupedModules), new Set(model.modules.map((module) => module.id)));
  assert.equal(new Set(groupedModules).size, groupedModules.length);
  assert.deepEqual(model.groups.map((group) => group.id), ["operations", "finance", "people", "communications"]);
});
```

- [ ] **Step 2: Run the focused tests to verify they fail for the missing group contract.**

Run: `npx.cmd tsx --test tests/navigationModel.test.ts tests/headerNavigation.test.ts tests/navigationRoutes.test.ts`

Expected: failure because the current model has no grouped projection and `Header` renders one flat module list.

- [ ] **Step 3: Implement the grouped navigation projection.** Add stable presentation-only group metadata with this mapping:

```ts
const NAVIGATION_GROUPS = [
  { id: "operations", label: "Operations", moduleIds: ["dashboard", "projects", "procurement", "warehouse", "equipment"] },
  { id: "finance", label: "Finance", moduleIds: ["cash", "invoices", "expenses", "reports"] },
  { id: "people", label: "People", moduleIds: ["payroll"] },
  { id: "communications", label: "Communications", moduleIds: ["email-sms", "documents"] },
] as const;
```

Derive `groups` after route/permission/deployment filtering, omit empty groups, and leave `getNavigationModel().modules`, `getNavigationRoutes`, `getDefaultChildRoute`, `getPrimaryModuleForRoute`, route IDs, and `settingsRoute` behavior intact. The deployment key `engineering-documents` remains for embedded project surfaces and is not a new top-level navigation route.

- [ ] **Step 4: Render grouped navigation in the shell.** Update desktop and mobile navigation to show concise group labels only in expanded states. Keep collapsed-sidebar labels, invoice child disclosure, badges, focus behavior, active-route state, account actions, and mobile close behavior unchanged. Do not add role-name checks or alter permission filters.

- [ ] **Step 5: Run the focused navigation/recovery tests.**

Run: `npx.cmd tsx --test tests/navigationModel.test.ts tests/headerNavigation.test.ts tests/navigationRoutes.test.ts tests/navigationRecovery.test.ts`

Expected: PASS with existing deep-link and mobile accessibility assertions unchanged.

- [ ] **Step 6: Commit the navigation contract.**

```powershell
git add src/navigation/navigationModel.ts src/components/Header.tsx tests/navigationModel.test.ts tests/headerNavigation.test.ts tests/navigationRoutes.test.ts
git commit -m "feat: group authenticated workspace navigation"
```

## Task 2: Establish shared task-first page primitives

**Files:**
- Modify: `src/components/ui/OperationsUI.tsx`
- Modify: `src/index.css`
- Test: `tests/uiFoundation.test.ts`
- Test: `tests/uiHardeningShared.test.ts`

**Interfaces:**
- Consumes: existing `PageHeader`, `SectionHeader`, `Surface`, `StatusBadge`, `EmptyState`, `LoadingState`, and `ErrorState` call sites.
- Produces: backward-compatible header/section APIs plus small reusable `PageActionBar`, `FilterBar`, `DisclosureSection`, and `ResponsiveActionGroup` primitives with accessible labels and keyboard-reachable controls.

- [ ] **Step 1: Write failing shared grammar tests.** Assert that the source exports the named primitives, includes `aria-expanded`/controlled disclosure behavior, and retains a concise title/context/action ordering.

```ts
test("shared operational grammar exposes task-first structure", () => {
  const source = readFileSync(new URL("../src/components/ui/OperationsUI.tsx", import.meta.url), "utf8");
  assert.match(source, /export function PageActionBar/);
  assert.match(source, /export function FilterBar/);
  assert.match(source, /export function DisclosureSection/);
  assert.match(source, /aria-expanded/);
});
```

- [ ] **Step 2: Run the focused UI tests and verify the new assertions fail.**

Run: `npx.cmd tsx --test tests/uiFoundation.test.ts tests/uiHardeningShared.test.ts`

Expected: failure because the named primitives do not exist.

- [ ] **Step 3: Implement the minimal shared primitives.** Keep the current visual language and class naming, use compact spacing, one primary action slot, `details/summary` or button-controlled advanced regions, `aria-label`/`aria-expanded`/`aria-controls` where applicable, and `min-h-10` interactive targets. Preserve existing APIs.

- [ ] **Step 4: Add only targeted shared styles.** Keep `.field-input`, `.field-label`, `.ops-table`, and `.ops-scrollbar` compatible. Add CSS only for focus visibility or table/list adaptation that utility classes cannot express; do not rewrite the theme.

- [ ] **Step 5: Run the focused UI tests and commit.**

Run: `npx.cmd tsx --test tests/uiFoundation.test.ts tests/uiHardeningShared.test.ts`

Expected: PASS.

```powershell
git add src/components/ui/OperationsUI.tsx src/index.css tests/uiFoundation.test.ts tests/uiHardeningShared.test.ts
git commit -m "feat: add shared task-first workspace primitives"
```

## Task 3: Make Documents and Expenses list-first workspaces

**Files:**
- Modify: `src/app/routes/DocumentsRoute.tsx`
- Modify: `src/app/routes/ExpensesRoute.tsx`
- Modify: `src/components/expenses/ExpensesPage.tsx`
- Test: `tests/emailSmsDocumentsWorkspace.test.ts`
- Test: `tests/r3UnifiedFinancialDocuments.test.ts`
- Test: `tests/r4SupplierExpenseBridge.test.ts`

**Interfaces:**
- Consumes: existing register builders, permission visibility, settlement paths, source/evidence classification, and route navigation helpers.
- Produces: unchanged document/expense data and owner paths, but the common register/search/open/preview/continue actions precede optional summaries and source/provenance detail.

- [ ] **Step 1: Write failing hierarchy/terminology tests.** Assert Documents filters/list markup precedes summary framing, document actions use business verbs, Expenses register markup precedes supplier-document work, and primary copy avoids `owns cost` and `preserved source evidence`.

```ts
test("documents keeps the working list ahead of optional summary framing", () => {
  const source = readFileSync(new URL("../src/app/routes/DocumentsRoute.tsx", import.meta.url), "utf8");
  assert.ok(source.indexOf('aria-label="Document filters"') < source.indexOf("Visible records"));
  assert.match(source, /Search documents/);
  assert.match(source, /Preview|Open/);
});

test("expense workspace presents the register before supporting supplier evidence", () => {
  const source = readFileSync(new URL("../src/components/expenses/ExpensesPage.tsx", import.meta.url), "utf8");
  assert.ok(source.indexOf("Expense register") < source.indexOf("Supplier document work"));
  assert.doesNotMatch(source, /owns cost/);
});
```

- [ ] **Step 2: Run the focused tests and verify the order/copy assertions fail.**

Run: `npx.cmd tsx --test tests/emailSmsDocumentsWorkspace.test.ts tests/r3UnifiedFinancialDocuments.test.ts tests/r4SupplierExpenseBridge.test.ts`

Expected: failure for the current Documents summary-before-filter and Expenses supplier-work-before-register order.

- [ ] **Step 3: Reorder Documents without changing ownership or permissions.** Make the header concise, put search/common filters immediately above the list, keep only a compact result/status line visible, move low-frequency origin/module/status detail into a `More filters` disclosure, and retain every preview, owner, history, send, permission message, and immutable snapshot path. Use short business-facing ownership copy and keep deeper provenance secondary.

- [ ] **Step 4: Reorder Expenses without merging source and payable records.** Put `Expense register` and search/status controls before supplier-document work. Rename normal labels to `Expense records`, `Source documents`, `Source document on file`, `Source invoice on file`, and `Linked expense`/ `Open linked expense` where accurate. Keep FX warnings, original currency/source labels, correction paths, settlement card, permission gates, supplier review, and owner links intact.

- [ ] **Step 5: Run focused tests and inspect filtered-empty, loading, missing-record, unavailable-FX/provider, and permission-denied states.**

Run: `npx.cmd tsx --test tests/emailSmsDocumentsWorkspace.test.ts tests/r3UnifiedFinancialDocuments.test.ts tests/r4SupplierExpenseBridge.test.ts tests/appRouting.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Documents and Expenses.**

```powershell
git add src/app/routes/DocumentsRoute.tsx src/app/routes/ExpensesRoute.tsx src/components/expenses/ExpensesPage.tsx tests/emailSmsDocumentsWorkspace.test.ts tests/r3UnifiedFinancialDocuments.test.ts tests/r4SupplierExpenseBridge.test.ts
git commit -m "feat: prioritize document and expense workspaces"
```

## Task 4: Redesign project allocation decisions for readable values

**Files:**
- Modify: `src/components/projects/ProjectInvoices.tsx`
- Modify: `src/components/projects/ExistingInvoicePicker.tsx`
- Modify: `src/components/projects/ProjectWorkspace.tsx`
- Test: `tests/projectWorkspaceNavigation.test.ts`
- Test: `tests/projectAllocations.test.ts`
- Test: `tests/projectCostCodesAndBudgetControl.test.ts`

**Interfaces:**
- Consumes: allocation normalization/validation, cost-code helpers, supplier payment projections, `onSaveAllocations`, and project tab/deep-link behavior.
- Produces: the same allocation payloads, validation, and save callbacks, presented as readable decision cards/stacked fields on narrow layouts and a scan-friendly register on desktop.

- [ ] **Step 1: Write failing allocation UI guards.** Assert that the picker exposes separately labeled invoice/project identity, total, already allocated, remaining, cost code, amount, basis, and assignment action, with a `data-project-allocation-row` marker.

```ts
test("project allocation picker names every decision field", () => {
  const source = readFileSync(new URL("../src/components/projects/ExistingInvoicePicker.tsx", import.meta.url), "utf8");
  for (const label of ["Invoice total", "Allocated", "Remaining", "Cost code", "Amount to assign"]) assert.match(source, new RegExp(label));
  assert.match(source, /data-project-allocation-row/);
});
```

- [ ] **Step 2: Run focused allocation tests and verify the new marker/field guard fails.**

Run: `npx.cmd tsx --test tests/projectWorkspaceNavigation.test.ts tests/projectAllocations.test.ts tests/projectCostCodesAndBudgetControl.test.ts`

Expected: failure because the current picker has an unmarked dense table row and no distinct responsive decision grouping.

- [ ] **Step 3: Implement readable allocation presentation.** Keep the desktop table if it remains scan-friendly, but add a responsive card/list variant or equivalent stacked presentation. Each invoice must show business identity first, then currency-aware `Invoice total`, `Allocated`, and `Remaining`, then project basis/cost code/amount controls, then one explicit `Assign` action. Keep currency labels beside amounts and never combine currencies.

- [ ] **Step 4: Apply the same hierarchy to the project invoice register/editor.** Keep project identity, current project amount, remaining invoice amount, payment/review state, and owner actions visible. Demote cross-project technical IDs and use `Not assigned` instead of `Uncoded` where semantically accurate. Preserve confirmation, audit wording, partial allocation rules, cost-code selection, and invoice deep links.

- [ ] **Step 5: Run focused tests and inspect large-value, fully allocated, partial, failed-save, empty, and deep-link states.**

Run: `npx.cmd tsx --test tests/projectWorkspaceNavigation.test.ts tests/projectAllocations.test.ts tests/projectCostCodesAndBudgetControl.test.ts tests/appRouting.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit project allocation work.**

```powershell
git add src/components/projects/ProjectInvoices.tsx src/components/projects/ExistingInvoicePicker.tsx src/components/projects/ProjectWorkspace.tsx tests/projectWorkspaceNavigation.test.ts tests/projectAllocations.test.ts tests/projectCostCodesAndBudgetControl.test.ts
git commit -m "feat: simplify project allocation decisions"
```

## Task 5: Group Payroll around user workflows

**Files:**
- Modify: `src/components/payroll/PayrollPageV2.tsx`
- Modify: `src/app/routes/PayrollRoute.tsx`
- Test: `tests/payrollLifecycleUi.test.ts`
- Test: `tests/payrollScheduleWorkflowRegression.test.ts`
- Test: `tests/appRouting.test.ts`

**Interfaces:**
- Consumes: `PayrollPageV2Props`, `PayrollTab`, schedule/period state, payroll query helpers, permission booleans, and existing worker/time/attendance/run/import components.
- Produces: grouped local navigation with stable internal tab values and unchanged query-driven run/period/attendance deep links.

- [ ] **Step 1: Write failing payroll navigation tests.** Assert grouped labels for `Overview`, `People`, `Attendance & Time`, `Payroll Runs`, and `Imports & Setup`; Calendar belongs to the time group rather than a separate peer button; and existing `runId`, `periodId`, and `attendanceDate` routing remains present.

```ts
test("payroll navigation communicates workflow groups", () => {
  const source = readFileSync(new URL("../src/components/payroll/PayrollPageV2.tsx", import.meta.url), "utf8");
  assert.match(source, /Attendance &amp; Time|Attendance & Time/);
  assert.match(source, /Payroll Runs/);
  assert.match(source, /Imports &amp; Setup|Imports & Setup/);
  assert.match(source, /Calendar/);
});
```

- [ ] **Step 2: Run focused payroll and routing tests and verify grouping fails.**

Run: `npx.cmd tsx --test tests/payrollLifecycleUi.test.ts tests/payrollScheduleWorkflowRegression.test.ts tests/appRouting.test.ts`

Expected: failure because Calendar is a separate button and remaining tabs are one equal-priority strip.

- [ ] **Step 3: Implement grouped payroll local navigation.** Keep tab values and render conditions stable, but organize them into `Overview`, `People`, `Attendance & Time` (`calendar`, `attendance`, `time`), `Payroll Runs` (`runs`), and `Imports & Setup` (`import`, with schedule/setup context on Overview). Use sections/buttons that stack on mobile and retain counts.

- [ ] **Step 4: Preserve payroll safety and direct links.** Do not change period selection, automatic draft calculation, exception blocking, locked-run messaging, permission-based component visibility, or the separate Cash & Banking payment path. Missing run/period recovery must remain mutation-free.

- [ ] **Step 5: Run focused tests.**

Run: `npx.cmd tsx --test tests/payrollLifecycleUi.test.ts tests/payrollScheduleWorkflowRegression.test.ts tests/appRouting.test.ts tests/payrollCalendar.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit payroll navigation work.**

```powershell
git add src/components/payroll/PayrollPageV2.tsx src/app/routes/PayrollRoute.tsx tests/payrollLifecycleUi.test.ts tests/payrollScheduleWorkflowRegression.test.ts tests/appRouting.test.ts
git commit -m "feat: organize payroll by workflow"
```

## Task 6: Apply shared hierarchy to remaining authenticated route groups

**Files:**
- Modify: `src/app/routes/DashboardRoute.tsx`
- Modify: `src/components/projects/ProjectsPage.tsx`
- Modify: `src/components/procurement/ProcurementPage.tsx`
- Modify: `src/components/CashBankingPage.tsx`
- Modify: `src/components/inventory/WarehouseInventoryPage.tsx`
- Modify: `src/components/equipment/EquipmentPage.tsx`
- Modify: `src/components/Reports.tsx`
- Modify: `src/components/Settings.tsx`
- Modify: `src/app/routes/EmailSmsRoute.tsx`
- Modify: `src/app/routes/InvoicesRoute.tsx`
- Test: `tests/projectManagementUX.test.ts`
- Test: `tests/emailSmsDocumentsWorkspace.test.ts`
- Test: `tests/uiUxResponsive.test.ts`

**Interfaces:** Consumes existing route data/handlers and shared primitives; produces title/context -> action -> decision state -> main work -> supporting details ordering without data or authorization changes.

- [ ] **Step 1: Write failing route-order/terminology guards for routes changed.** Assert each changed route has a visible purpose heading and primary action, the main register/form is not after multiple summary-card blocks, and changed primary surfaces do not introduce UUID/hash-first identity or source-authority jargon.
- [ ] **Step 2: Run the selected UI tests and verify the guards identify the exact source-order failures.**

Run: `npx.cmd tsx --test tests/projectManagementUX.test.ts tests/emailSmsDocumentsWorkspace.test.ts tests/uiUxResponsive.test.ts`

Expected: failures only for the route structures being changed.

- [ ] **Step 3: Refactor route surfaces in small groups.** Dashboard prioritizes exceptions/next actions; Projects collapses secondary portfolio metrics; Procurement, Invoices, Cash, Warehouse, Equipment, Reports, and Settings keep primary work first; Email/SMS keeps Inbox/Intake, Compose, Sent/Delivery History, and truthful SMS status clear.
- [ ] **Step 4: Preserve every permission gate, owner link, settlement/correction/reversal guard, raw audit detail, unavailable provider/converter state, and lifecycle warning. Never replace missing data with zero or unavailable capability with an enabled action.**
- [ ] **Step 5: Run focused tests after each group.**

Run: `npx.cmd tsx --test tests/projectManagementUX.test.ts tests/emailSmsDocumentsWorkspace.test.ts tests/uiUxResponsive.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the remaining hierarchy pass.**

```powershell
git add src/app/routes/DashboardRoute.tsx src/components/projects/ProjectsPage.tsx src/components/procurement/ProcurementPage.tsx src/components/CashBankingPage.tsx src/components/inventory/WarehouseInventoryPage.tsx src/components/equipment/EquipmentPage.tsx src/components/Reports.tsx src/components/Settings.tsx src/app/routes/EmailSmsRoute.tsx src/app/routes/InvoicesRoute.tsx tests/projectManagementUX.test.ts tests/emailSmsDocumentsWorkspace.test.ts tests/uiUxResponsive.test.ts
git commit -m "feat: align authenticated workspaces around primary tasks"
```

## Task 7: Integrated route/deep-link and responsive regression coverage

**Files:**
- Modify: `tests/uiUxResponsive.test.ts`
- Modify: `tests/navigationRecovery.test.ts`
- Modify: `tests/projectWorkspaceNavigation.test.ts`
- Modify: `tests/appRouting.test.ts` only if a real compatibility assertion is missing
- Modify: `scripts/qa/localQa.ts` only when an existing scenario needs a route-preserving assertion; never create a competing harness

**Interfaces:** Consumes final route paths, grouped labels, QA markers, existing Local-QA helpers, and secure authenticated environment configuration; produces behavior-oriented desktop/tablet/phone/deep-link evidence.

- [ ] **Step 1: Add failing responsive assertions** for no document-level overflow, reachable labeled actions, readable allocation rows, Documents list-before-summary, Expenses register-before-supporting work, and Payroll grouped controls at 390px/768px/1024px/1440px classes.
- [ ] **Step 2: Run the targeted suite and verify failures before final layout changes.**

Run: `npx.cmd tsx --test tests/uiUxResponsive.test.ts tests/navigationRecovery.test.ts tests/projectWorkspaceNavigation.test.ts tests/appRouting.test.ts`

Expected: failures identify missing markers/order/compatibility behavior.

- [ ] **Step 3: Implement only required responsive adjustments and QA markers.** Use readable card/list transformations, stacked actions, `min-w-0`, `break-words`, and appropriate input widths. Preserve text labels, keyboard focus, dialog close behavior, and drawer operation.
- [ ] **Step 4: Run the targeted regression suite.**

Run: `npx.cmd tsx --test tests/uiUxResponsive.test.ts tests/navigationRecovery.test.ts tests/projectWorkspaceNavigation.test.ts tests/appRouting.test.ts`

Expected: PASS.

- [ ] **Step 5: Run production build for authenticated browser QA.**

Run: `npm.cmd run build`

Expected: exit code 0.

- [ ] **Step 6: Run the existing fail-closed authenticated Local-QA workflow.**

Run: `npm.cmd run qa:local`

Exercise supplier source -> verification -> linked Expense -> Cash & Banking; RFQ/PO -> receipt -> Warehouse; Client Invoice -> Collection -> Cash & Banking; Payroll people/time/attendance -> run/calculation -> approval navigation; Documents -> preview/open -> Compose/review without sending; project allocation; inventory/receiving; and stale/deep-link recovery. Inspect desktop, constrained laptop, tablet, and phone. Record fixture/provider limitations as blocked/not-tested.

- [ ] **Step 7: Commit integrated QA coverage/corrections.**

```powershell
git add tests/uiUxResponsive.test.ts tests/navigationRecovery.test.ts tests/projectWorkspaceNavigation.test.ts tests/appRouting.test.ts scripts/qa/localQa.ts
git commit -m "test: cover round two workspace workflows and viewports"
```

## Task 8: Final validation, documentation synchronization, and PR delivery

**Files:**
- Modify: `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`
- Modify: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`
- Modify: `docs/HYDROQUALISENSE_UI_UX_ROUND2_SIMPLIFICATION.md` only if evidence requires a contract clarification or deliberate compatibility exception
- Modify: `src/config/productFeatures.ts` only if client-facing feature status/description is materially stale

**Interfaces:** Consumes final diff and evidence; produces a truthful handoff that keeps UI/UX Round 2 active/incomplete unless the full acceptance gate is evidenced, keeps Wave 4D incomplete and Worker Registration paused, and identifies Wave 4D messaging-provider integration/completion as the next unfinished phase.

- [ ] **Step 1: Review the complete integrated diff and changed-file list.** Confirm no route, permission gate, financial/source boundary, history action, provider state, deep link, or important user action was removed; classify as application/UI with no DB contract change unless the diff proves otherwise.
- [ ] **Step 2: Run the affected selector.**

Run: `npm.cmd run test:affected:agent`

Expected: zero failures; record any justified fallback.

- [ ] **Step 3: Run final lint and production build.**

Run: `npm.cmd run lint`

Run: `npm.cmd run build`

Expected: both exit code 0.

- [ ] **Step 4: Run Workflow Map checks only if mapped/generated contracts changed.** Run `npm.cmd run workflow-map:consistency` when applicable; otherwise record the no-contract-change skip.
- [ ] **Step 5: Reconcile the roadmap, current handoff, approved design, and client-facing Settings truth.** Mark only evidenced changes complete. Keep Wave 4D incomplete, Worker Registration paused, and provider/converter/Gmail limitations truthful. Do not mark UI/UX Round 2 complete without the entire gate.
- [ ] **Step 6: Commit documentation synchronization.**

```powershell
git add docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md docs/HYDROQUALISENSE_CURRENT_HANDOFF.md docs/HYDROQUALISENSE_UI_UX_ROUND2_SIMPLIFICATION.md src/config/productFeatures.ts
git commit -m "docs: synchronize UI UX round two handoff"
```

- [ ] **Step 7: Push and open the focused PR, then stop.**

```powershell
git push -u origin codex/ui-ux-round2-simplification
gh pr create --base main --head codex/ui-ux-round2-simplification --title "UI/UX Round 2: simplify authenticated workspaces" --body "Implements the approved HydroQualiSense UI/UX Round 2 workflow-first simplification phase. The final handoff records the changed route groups, validation evidence, blocked workflows, compatibility notes, and remaining limitations."
```

The final handoff must state base SHA `746a4aacda9ccceff88a5093bfeb678b8b1046a8`, branch/final SHA/PR, changed route groups/components, navigation restructuring, four mandatory outcomes, tests actually run, affected selector result, lint/build/browser evidence, Workflow Map result or skip reason, blocked/not-tested workflows, deep-link exceptions, context selector `platform-tenancy` with Workflow Map match unavailable fallback, zero subagents, and remaining limitations. Do not merge the PR or start Wave 4D provider implementation in this run.

## Plan self-review

- Route coverage is sourced from `src/utils/routes.ts`, `src/utils/appRouting.ts`, `src/app/routes/AppRouter.tsx`, and nested project/email/payroll views; no old hardcoded count is authoritative.
- Navigation, shared primitives, Documents, Expenses, Project Allocation, Payroll, remaining routes, QA, and documentation synchronization each have a task with focused tests and an explicit stop boundary.
- All interfaces preserve existing domain data/callback contracts and introduce no database work.
- No step claims phase completion from tests alone; final acceptance remains evidence-based and keeps Wave 4D/Worker Registration sequencing truthful.
