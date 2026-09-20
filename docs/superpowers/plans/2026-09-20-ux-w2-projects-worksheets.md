# UX-W2 Projects Card-First Portfolio + Worksheets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Projects card-first for browsing and use the shared `WorksheetEditor` for Project Details and Cost Code maintenance while preserving parent-owned authority, lifecycle workflows, and workbook interchange.

**Architecture:** Keep `ProjectsPage` responsible for project-derived views, filters, permissions, validation, lifecycle orchestration, and the existing `onSaveProject` callback. Keep `ProjectPortfolioRegisterSection` presentation-only, add focused worksheet components for the two edit surfaces, and let `ProjectBudgetControlPanel` continue to own authoritative cost derivation while passing staged edits through the existing per-row `onSaveCostCode` callback.

**Tech Stack:** React, TypeScript, `WorksheetEditor`, existing HydroQualiSense project/cost-code validators and callbacks, Node test runner with TSX, Tailwind-style utility classes.

**Spec:** `docs/superpowers/specs/2026-09-20-selective-workbook-editing-ux-direction.md` plus the workbook authority contract in `docs/superpowers/specs/2026-09-18-excel-native-operations-ux-design.md`.

## Global Constraints

- **Browse visually -> edit like a spreadsheet -> execute sensitive workflows deliberately.**
- `OperationsGrid` remains a browse/read/register primitive; `WorksheetEditor` is the edit/data-entry primitive.
- Project lifecycle actions and derived Actual Cost, Committed Cost, and variance values remain protected and outside ordinary cell editing.
- `projects.contract_value` remains distinct from `projects.project_budget`; original currencies stay explicit and mixed currencies are never silently summed.
- Workbook upload remains proposal-only with validation, review, stale/conflict handling, explicit human confirmation, grouped authoritative Apply, and refresh before/after Apply.
- No database migrations, RLS changes, RPC changes, custom fields, Add Custom Column, provider work, production mutation, or UX-W3 work.
- Project and cost-code persistence remains parent-owned through `onSaveProject`, `onSaveCostCode`, `onArchiveCostCode`, and `onReactivateCostCode`.
- Default to zero subagents; the lead owns integration, financial semantics, final diff, validation, push, and PR creation.

## Review Focus

- Card activation must open the Project Workspace from a keyboard-focusable primary region without nesting Edit or lifecycle controls inside that region; tests pin the card markup and accessible action labels in Task 1.
- Card and portfolio financial cues must keep Contract Value, Approved Budget, Actual Cost, and Committed Cost distinct while preserving partial/unavailable and currency-group truth; tests pin the required labels and existing view-model contract in Task 1.
- Worksheet protected columns and explicit lifecycle actions must not become ordinary editable cells; tests pin Cost Code `WorksheetEditor` usage, protected derived fields, and archive/reactivate callbacks in Task 3.
- A per-row cost-code save failure must retain the other staged edits, stable IDs, and `updatedAt` values instead of dropping them; tests pin the source contract and staged-save behavior in Task 3.
- Project Details must keep every current editable field and route validation through the parent save authority, including required code/name, VAT/NON_VAT classification, numeric normalization, and shared New/Edit editor behavior; tests pin the worksheet fields and callback wiring in Task 2.

---

### Task 1: Card-first Projects portfolio and secondary workbook tools

**Files:**
- Modify: `src/components/projects/ProjectPortfolioRegisterSection.tsx`
- Modify: `src/components/projects/ProjectsPage.tsx`
- Modify: `tests/projectsPageArchitecture.test.ts`
- Modify: `tests/projectManagementUX.test.ts`
- Modify: `tests/projectsWorkbookUx.test.tsx`

**Interfaces:**
- Consumes: `displayedViews`, portfolio summaries, filter/sort callbacks, `onOpenProject`, `onEditProject`, and `onOpenLifecycle` from the existing `ProjectPortfolioRegisterSectionProps`.
- Produces: a default `Cards` view, an accessible `Compact List` toggle using the same `displayedViews`, card-level primary navigation, and a collapsed `Excel import/export` disclosure around the unchanged `ProjectsWorkbookPanel`.

- [ ] **Step 1: Write the failing tests**

Add assertions that the Projects surface has:

```ts
assert.match(projectRegisterSectionSource, /useState<.*cards.*list/);
assert.match(projectRegisterSectionSource, /aria-pressed/);
assert.match(projectRegisterSectionSource, /Edit project details/);
assert.match(projectRegisterSectionSource, /Open project workspace/i);
assert.match(projectRegisterSectionSource, /grid-cols-1/);
assert.match(projectsPageSource, /Excel import\/export/);
```

Replace obsolete assertions that require desktop-only `hidden lg:block` and mobile-only `lg:hidden` as the only presentation contract. Keep assertions for filters, `displayedViews`, financial labels, `OperationsGrid`, and workbook callbacks.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npx.cmd tsx --test tests/projectsPageArchitecture.test.ts tests/projectManagementUX.test.ts tests/projectsWorkbookUx.test.tsx`

Expected: FAIL on the new card-first/toggle/disclosure assertions while the existing portfolio/model assertions remain diagnostic.

- [ ] **Step 3: Implement the minimal presentation change**

In `ProjectPortfolioRegisterSection.tsx`:

```tsx
const [viewMode, setViewMode] = useState<"cards" | "list">("cards");

<button type="button" aria-pressed={viewMode === "cards"} onClick={() => setViewMode("cards")}>Cards</button>
<button type="button" aria-pressed={viewMode === "list"} onClick={() => setViewMode("list")}>Compact List</button>
{viewMode === "list" ? <ProjectPortfolioOperationsGrid displayedViews={displayedViews} ... /> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">...</div>}
```

Make the card’s main content one full-width, focus-visible button that calls `onOpenProject`, with a dominant project name (`text-lg`/`text-xl`) and only the identity, manager/status, four distinct core financial cues, and at most two attention indicators. Keep Edit project details and lifecycle actions outside that button; put lifecycle access in a restrained More actions disclosure. Do not change `displayedViews`, filter state, summary derivation, or grid columns’ protected status.

In `ProjectsPage.tsx`, wrap the existing `ProjectsWorkbookPanel` in a closed `<details>` disclosure labeled `Excel import/export`; pass every existing workbook prop unchanged.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `npx.cmd tsx --test tests/projectsPageArchitecture.test.ts tests/projectManagementUX.test.ts tests/projectsWorkbookUx.test.tsx`

Expected: PASS, with the existing workbook render test still finding export/import/review messaging and the portfolio tests still finding the same filters, sorting, currencies, and protected financial cues.

- [ ] **Step 5: Commit**

```text
git add src/components/projects/ProjectPortfolioRegisterSection.tsx src/components/projects/ProjectsPage.tsx tests/projectsPageArchitecture.test.ts tests/projectManagementUX.test.ts tests/projectsWorkbookUx.test.tsx
git commit -m "feat: make projects portfolio card first"
```

---

### Task 2: Project Details worksheet editor

**Files:**
- Create: `src/components/projects/ProjectDetailsWorksheet.tsx`
- Modify: `src/components/projects/ProjectsPage.tsx`
- Modify: `tests/projectsPageArchitecture.test.ts`
- Modify: `tests/projectDraft.test.ts`
- Modify: `tests/projectManagementUX.test.ts`

**Interfaces:**
- Consumes: `Project`, `ProjectStatus`, `WorksheetEditor`, `isClassifiedProjectTaxTreatment`, and the parent-owned project save/close callbacks.
- Produces: `ProjectDetailsWorksheet` with a one-row typed worksheet containing all fields from the current project editor and an `onSave` callback that returns `false` when the parent rejects validation.

- [ ] **Step 1: Write the failing tests**

Add source-level assertions for the new component and parent integration:

```ts
assert.match(projectsPageSource, /ProjectDetailsWorksheet/);
assert.doesNotMatch(projectsPageSource, /project-dialog-title/);
assert.match(detailsSource, /WorksheetEditor/);
for (const field of ["Project Code", "Project Name", "Currency", "Tax Treatment", "Contract Value", "Approved Cost Budget", "Client Name", "Project Manager", "Billing Contact", "Billing Email", "Billing Address", "Location \/ City", "Status", "Operational Notes \/ Scope"]) {
  assert.match(detailsSource, new RegExp(field));
}
assert.match(detailsSource, /kind:\s*["']select["']/);
assert.match(detailsSource, /onSaveProject|onSave/);
```

Keep the existing `createProjectDraft()` assertion and change the creation/edit assertion to the shared worksheet title rather than the removed stacked-form heading.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npx.cmd tsx --test tests/projectsPageArchitecture.test.ts tests/projectDraft.test.ts tests/projectManagementUX.test.ts`

Expected: FAIL because the worksheet component and parent integration do not yet exist.

- [ ] **Step 3: Implement the worksheet editor and parent save bridge**

Create a wide responsive dialog/workspace around `WorksheetEditor` with one row and typed columns. Use select columns for Tax Treatment (`VAT`, `NON_VAT`) and Status, numeric/currency columns for Contract Value and Approved Cost Budget, text columns for the remaining current fields, and wide minimum widths for Billing Address and Operational Notes / Scope. Keep worksheet scrolling contained and retain Cancel/Save actions.

The parent should replace the old stacked form with:

```tsx
<ProjectDetailsWorksheet
  project={editing}
  projectStatuses={PROJECT_STATUSES}
  errorMessage={formError}
  onClose={() => setEditing(null)}
  onSave={saveProject}
/>;
```

`saveProject` remains in `ProjectsPage.tsx`; it trims code/name, uppercases currency, clamps non-negative numeric values, requires code/name, requires classified VAT/NON_VAT, and calls the existing `onSaveProject` callback. The worksheet may provide cell-level required/numeric feedback but must not create a persistence path or reinterpret tax/lifecycle rules. New Project and Edit Project both use this component, and lifecycle remains in its separate dialog.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `npx.cmd tsx --test tests/projectsPageArchitecture.test.ts tests/projectDraft.test.ts tests/projectManagementUX.test.ts`

Expected: PASS with no assertion requiring the removed stacked modal and with parent save/lifecycle ownership intact.

- [ ] **Step 5: Commit**

```text
git add src/components/projects/ProjectDetailsWorksheet.tsx src/components/projects/ProjectsPage.tsx tests/projectsPageArchitecture.test.ts tests/projectDraft.test.ts tests/projectManagementUX.test.ts
git commit -m "feat: edit project details in worksheet"
```

---

### Task 3: Cost Codes worksheet maintenance

**Files:**
- Create: `src/components/projects/ProjectCostCodesWorksheet.tsx`
- Modify: `src/components/projects/ProjectBudgetControlPanel.tsx`
- Modify: `tests/projectCostCodeGrid.test.tsx`
- Modify: `tests/projectCostCodesAndBudgetControl.test.ts`
- Modify: `tests/projectsExcelConcurrency.test.ts`

**Interfaces:**
- Consumes: `CostCodeFinancialSummary`, source `ProjectCostCode` rows, `validateProjectCostCodeInput`, the project budget, and existing `onSaveCostCode`/archive/reactivate callbacks.
- Produces: staged multi-row worksheet maintenance that saves only dirty/new rows, preserves each existing `id`/`updatedAt`, validates the staged group before saving, and retains unsaved rows after a per-row failure.

- [ ] **Step 1: Write the failing tests**

Update the cost-code tests to assert the normal maintenance surface uses the shared worksheet and no longer requires the old desktop/mobile presentation or `ProjectCostCodeModal` import. Add assertions for editable fields, protected derived fields, Add Row, the validator, stable version fields, and explicit lifecycle callbacks:

```ts
assert.match(panelSource, /ProjectCostCodesWorksheet/);
assert.match(worksheetSource, /WorksheetEditor/);
for (const field of ["Code", "Work Package", "Description", "Approved Budget", "Forecast Amount"]) assert.match(worksheetSource, new RegExp(field));
for (const field of ["Actual Cost", "Committed Cost", "Actual Variance", "Forecast Variance"]) assert.match(worksheetSource, new RegExp(field));
assert.match(worksheetSource, /validateProjectCostCodeInput/);
assert.match(worksheetSource, /updatedAt/);
assert.match(worksheetSource, /onArchiveCostCode|onReactivateCostCode/);
```

Add one behavioral test around the exported staged-save helper (or the component’s extracted pure helper) showing a failed second save leaves that row dirty and keeps its `id`/`updatedAt`.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npx.cmd tsx --test tests/projectCostCodeGrid.test.tsx tests/projectCostCodesAndBudgetControl.test.ts tests/projectsExcelConcurrency.test.ts`

Expected: FAIL on the new WorksheetEditor/component/helper assertions.

- [ ] **Step 3: Implement the worksheet and panel integration**

Create a worksheet row shape that combines the authoritative source fields (`id`, `updatedAt`, `projectId`, code, name, description, approved budget, forecast, status) with the existing calculated summary fields. Configure editable columns only for Code, Work Package, Description, Approved Budget, and Forecast Amount. Configure Status, Actual Cost, Committed Cost, Actual Variance, Forecast Variance, and any other derived financial context as protected/read-only; new staged rows render derived values as pending rather than invented financial totals.

Use `WorksheetEditor` Add Row to append an unsaved active row. Do not pass arbitrary row removal. Track dirty row/cell keys from worksheet callbacks. Before any persistence, build a staged snapshot, normalize code consistently, validate every staged row using `validateProjectCostCodeInput` against the staged project set, then call `onSaveCostCode` only for dirty/new rows. Keep existing `id` and `updatedAt` on edits; omit `id` for new rows. If one callback rejects, remove only successful rows from the dirty set, retain the remaining staged rows, and show an error without claiming atomic multi-row persistence. Lifecycle buttons remain explicit row actions and call the existing archive/reactivate callbacks.

Keep Budget Control’s summary/filters and all actual/committed/foreign-currency derivation parent-owned; replace only the old `OperationsGrid`/mobile-card/modal maintenance block with the worksheet component.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `npx.cmd tsx --test tests/projectCostCodeGrid.test.tsx tests/projectCostCodesAndBudgetControl.test.ts tests/projectsExcelConcurrency.test.ts`

Expected: PASS with all existing domain validator/concurrency tests still green and the worksheet contract assertions satisfied.

- [ ] **Step 5: Commit**

```text
git add src/components/projects/ProjectCostCodesWorksheet.tsx src/components/projects/ProjectBudgetControlPanel.tsx tests/projectCostCodeGrid.test.tsx tests/projectCostCodesAndBudgetControl.test.ts tests/projectsExcelConcurrency.test.ts
git commit -m "feat: edit project cost codes in worksheet"
```

---

### Task 4: Source-of-truth synchronization and final validation

**Files:**
- Modify: `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`
- Modify: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`
- Modify: `tests/projectsWorkbookUx.test.tsx` if final workbook-disclosure assertions need a focused adjustment

**Interfaces:**
- Consumes: the exact final implementation and focused test evidence from Tasks 1–3.
- Produces: synchronized phase status stating UX-W2 is implemented, workbook interchange is retained, and the exact next phase is UX-W3 Supplier Invoice source-on-top + extracted-data worksheet review.

- [ ] **Step 1: Review the exact final diff and source-of-truth docs**

Run: `git diff --stat origin/main...HEAD` and inspect the complete diff for card accessibility, field preservation, protected financial/lifecycle semantics, staged-save retention, workbook availability, responsive overflow, and scope boundaries. Reconcile the final behavior against both UX contracts before editing the roadmap/handoff.

- [ ] **Step 2: Update only current roadmap/handoff status**

Record that UX-W2 is implemented with card-first Projects, Project Details worksheet, Cost Codes worksheet, preserved `.xlsx` export/import/review/Apply, and no DB/migration change. Preserve the existing provider/QA qualifications and state the exact next implementation phase as **UX-W3 — Supplier Invoice source-on-top + extracted-data worksheet review**. Do not mark UX-W3 complete or rewrite unrelated history.

- [ ] **Step 3: Run the required final validation ladder once**

Run the focused Projects test group, then exactly once:

```text
npm.cmd run test:affected:agent
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

Run one cheap targeted Projects browser route check only if the existing harness supports it; otherwise record that browser validation was left to exact-head protected Demo Visual QA. Do not start Docker/Supabase because the final diff has no database contract changes.

- [ ] **Step 4: Perform final verification and commit documentation**

Use the verification-before-completion gate: read every command’s exit code and output, inspect `git status --short`, verify no migration/database files changed, and review the final diff against every explicit out-of-scope item. Commit the synchronized docs and any necessary test adjustment:

```text
git add docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md docs/HYDROQUALISENSE_CURRENT_HANDOFF.md tests/projectsWorkbookUx.test.tsx
git commit -m "docs: record UX-W2 projects worksheet rollout"
```

- [ ] **Step 5: Push and open the PR without merging**

```text
git push -u origin codex/ux-w2-projects-worksheets
gh pr create --base main --head codex/ux-w2-projects-worksheets --title "UX-W2: card-first Projects and worksheet editing" --body "Implements UX-W2: card-first Projects browsing, Project Details worksheet editing, and Cost Codes worksheet maintenance. Preserves the existing reviewed .xlsx workbook flow and authoritative save/lifecycle callbacks. Focused and final validation results are recorded in the Codex handoff."
```

Expected: a PR targeting current `main`; do not merge it locally or remotely.
