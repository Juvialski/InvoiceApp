# Excel Phase 4A — Expenses and Supplier Payables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a controlled Expenses workbook round trip, a read-only supplier-payables context sheet, and a dense desktop Expense register while preserving the existing Expense, supplier-invoice, allocation, settlement, permission, and history authorities.

**Architecture:** `src/lib/expensesWorkbook.ts` will adapt the existing `WorkbookSchema`/`OperationsGrid` foundation into one domain-aware `Expenses` plus `Supplier Payables` contract. The adapter produces proposals only; `ExpensesWorkbookPanel` handles review and explicit confirmation; `ExpensesPage` owns the register/grid and passes narrow callbacks; `App.tsx` continues to own persistence, permissions, refresh, and authoritative mutation. Existing `saveExpenseToSupabase` remains the mutation boundary because its `updated_at` predicate already closes the post-review race.

**Tech Stack:** React, TypeScript, SheetJS (`xlsx`), Node test runner with `tsx`, existing Supabase persistence/RLS/trigger contracts, Tailwind utility classes.

**Spec:** `docs/superpowers/specs/2026-09-20-excel-phase-4a-expenses-supplier-payables-design.md`

## Global Constraints

- Supplier invoice evidence remains separate from the linked authoritative Expense payable/cost record.
- Confirmed Cash & Banking matches derive paid/outstanding state; invoice-reported `amountPaid` is evidence only.
- Supplier-derived Expense provenance and canonical invoice project allocations remain protected and are never workbook-editable.
- Workbook IDs, company IDs, fingerprints, and version tokens are comparison evidence, not authorization credentials.
- Upload is proposal-only; no database mutation occurs before review and explicit Apply.
- Missing workbook rows never delete records; rows without stable existing identity never create records in this rollout.
- Company isolation, effective permissions, RLS, domain validation, lifecycle/history, and currency semantics remain authoritative.
- No direct Excel-cell-to-database-column writer is introduced; Apply calls the existing parent-owned Expense save callback.
- Desktop uses `OperationsGrid`; mobile retains the existing card/detail experience.
- Client receivables, Cash & Banking redesign, reconciliation redesign, Inventory/Equipment, Payroll, RI-4+, and unrelated UI cleanup remain out of scope.

## Review Focus

- A linked supplier-derived Expense is edited in `Expenses`: the review must classify the change as protected and never call the save callback.
- A project/cost-code display reference or hidden stable identity is tampered with: the review must resolve authorized references or fail closed as invalid/unauthorized.
- The application record changes after export but before Apply: the review/save path must surface a stale conflict and never overwrite the newer record.
- A workbook contains mixed currencies, a negative amount, an invalid currency, or an invalid date: the review must preserve original currency and reject the invalid proposal without silently converting or zeroing it.
- A row is missing, newly added, or reviewed by a read-only user: omissions must not delete, new rows must remain unsupported, and Apply must be unavailable.

---

### Task 1: Domain workbook adapter and review/apply contract

**Files:**
- Create: `src/lib/expensesWorkbook.ts`
- Test: `tests/expensesWorkbook.test.ts`

**Interfaces:**
- Consumes: `Expense`, `Project`, `ProjectCostCode`, `InvoiceData`, `PurchaseOrder`, `Vendor`, `SupplierInvoiceSettlementProjection`, `SupplierInvoiceSettlementMatch`, and the shared `exportOperationsWorkbook`, `parseOperationsWorkbook`, and `fingerprintValue` functions.
- Produces: `EXPENSES_WORKBOOK_SCHEMA`, `ExpensesWorkbookRecords`, `ExpensesWorkbookExportInput`, `ExpensesImportContext`, `ExpensesProposalStatus`, `ExpensesFieldChange`, `ExpensesProposal`, `ExpensesImportReview`, `ExpensesApplyCallbacks`, `exportExpensesWorkbook`, `buildExpensesImportReview`, `applyExpensesImport`, and `settlementForExpenseWorkbook` for the UI tasks.

- [ ] **Step 1: Write the failing adapter tests.**

Create fixtures for one direct `DRAFT` Expense, one linked supplier-derived `DRAFT` Expense, one approved Expense, two projects, two cost codes, one supplier invoice, and settlement matches. Add tests that:

```ts
test("exports Expenses and related Supplier Payables with stable metadata", () => {
  const artifact = exportExpensesWorkbook(records({ expectedCompanyId: COMPANY_ID }));
  assert.deepEqual(readSheetNames(artifact.bytes), ["Expenses", "Supplier Payables", "_HydroQualiSense"]);
  const review = buildExpensesImportReview(artifact.bytes, context(), { fileName: artifact.fileName });
  assert.equal(review.proposals.every((proposal) => proposal.status === "UNCHANGED"), true);
});

test("permits direct draft attribute and allocation edits but protects supplier and lifecycle authority", () => {
  const bytes = setExpenseCells(exportedBytes(), {
    "Date": "2026-09-21",
    "Category": "Fuel",
    "Description": "Revised site fuel",
    "Amount": 1250,
    "Currency": "PHP",
    "Project": "PRJ-002",
    "Cost Code": "MECH",
  }, 0);
  const review = buildExpensesImportReview(bytes, context());
  const direct = proposalFor(review, DIRECT_EXPENSE_ID);
  assert.equal(direct.status, "WORKBOOK_ONLY_CHANGE");
  assert.equal(direct.canApply, true);

  const linkedEdit = setExpenseCells(bytes, { "Amount": 99999, Status: "APPROVED" }, 1);
  const linkedReview = buildExpensesImportReview(linkedEdit, context());
  assert.equal(proposalFor(linkedReview, LINKED_EXPENSE_ID).status, "UNSUPPORTED_PROTECTED_FIELD");
  assert.equal(proposalFor(linkedReview, LINKED_EXPENSE_ID).canApply, false);
});

test("fails closed for stale state, hidden identity tampering, bad references, invalid money, and unauthorized company", () => {
  const edited = setExpenseCells(exportedBytes(), { Description: "Workbook edit" }, 0);
  assert.equal(proposalFor(buildExpensesImportReview(edited, context({ expenses: [changedDirectExpense()] })), DIRECT_EXPENSE_ID).status, "STALE_CONFLICT");
  assert.equal(proposalFor(buildExpensesImportReview(setHiddenCell(edited, "EXPENSE", DIRECT_EXPENSE_ID, "other-company"), context()), DIRECT_EXPENSE_ID).status, "UNAUTHORIZED");
  assert.equal(proposalFor(buildExpensesImportReview(setExpenseCells(exportedBytes(), { Project: "UNKNOWN" }, 0), context()), DIRECT_EXPENSE_ID).status, "UNKNOWN_REFERENCE");
  assert.equal(proposalFor(buildExpensesImportReview(setExpenseCells(exportedBytes(), { Amount: -1 }, 0), context()), DIRECT_EXPENSE_ID).status, "INVALID");
});

test("keeps mixed currencies explicit and treats missing/new rows as non-destructive unsupported states", () => {
  const review = buildExpensesImportReview(removeExpenseRow(addNewExpenseRow(exportedBytes())), context());
  assert.equal(review.omittedExpenseIds.includes(DIRECT_EXPENSE_ID), true);
  assert.equal(review.proposals.some((proposal) => proposal.status === "UNSUPPORTED_NEW_RECORD"), true);
  const rows = review.proposals.filter((proposal) => proposal.expense);
  assert.equal(rows.some((proposal) => proposal.expense?.currency === "USD" && proposal.expense?.amount === 25), true);
});

test("read-only context cannot apply and Apply revalidates before calling the authoritative callback", async () => {
  const edited = setExpenseCells(exportedBytes(), { Description: "Approved workbook edit" }, 0);
  const review = buildExpensesImportReview(edited, context());
  const calls: Expense[] = [];
  const result = await applyExpensesImport(review, context(), { saveExpense: async (expense) => { calls.push(expense); } }, [proposalFor(review, DIRECT_EXPENSE_ID).id]);
  assert.deepEqual(result.appliedProposalIds, [proposalFor(review, DIRECT_EXPENSE_ID).id]);
  assert.equal(calls[0]?.updatedAt, DIRECT_UPDATED_AT);
  await assert.rejects(() => applyExpensesImport(review, context({ canWrite: false }), { saveExpense: async () => {} }), /permission/i);
});

test("real XLSX round trip re-exports the authoritative applied direct Expense state", async () => {
  let authoritative = records().expenses.map((expense) => ({ ...expense }));
  const edited = setExpenseCells(exportExpensesWorkbook(records()).bytes, { Description: "Authoritative re-export" }, 0);
  const review = buildExpensesImportReview(edited, context({ expenses: authoritative }));
  await applyExpensesImport(review, context({ expenses: authoritative }), {
    saveExpense: async (expense) => { authoritative = authoritative.map((item) => item.id === expense.id ? { ...expense, updatedAt: NEXT_UPDATED_AT } : item); },
  });
  const reexported = exportExpensesWorkbook(records({ expenses: authoritative }));
  assert.equal(proposalFor(buildExpensesImportReview(reexported.bytes, context({ expenses: authoritative })), DIRECT_EXPENSE_ID).status, "UNCHANGED");
});
```

The test helpers must edit actual SheetJS cells, not mock the adapter or assert only on call counts.

- [ ] **Step 2: Run the focused tests to verify the intended RED state.**

Run: `npx.cmd tsx --test tests/expensesWorkbook.test.ts`

Expected: FAIL because `src/lib/expensesWorkbook.ts` and its exported workbook/review APIs do not yet exist.

- [ ] **Step 3: Implement the minimal shared workbook adapter.**

Define the schema with these headers and hidden synchronization columns:

```ts
const EXPENSE_HEADERS = [
  "Date", "Category", "Description", "Payee", "Amount", "Currency",
  "Payment Method", "Reference", "Notes", "Project", "Cost Code",
  "Status", "Archived", "Supplier Invoice", "Vendor", "Purchase Order",
  "Confirmed Paid", "Outstanding", "Settlement State",
  "__HQ Record ID", "__HQ Company ID", "__HQ Fingerprint", "__HQ Updated At",
  "__HQ Project ID", "__HQ Cost Code ID",
] as const;

const SUPPLIER_PAYABLE_HEADERS = [
  "Invoice Number", "Invoice Date", "Due Date", "Vendor", "Currency",
  "Invoice Total", "Linked Expense", "Expense Amount", "Confirmed Paid",
  "Outstanding", "Payment State", "Review State", "Invoice Lifecycle",
  "Project", "Authority Conflict", "__HQ Record ID", "__HQ Company ID",
  "__HQ Fingerprint", "__HQ Updated At", "__HQ Linked Expense ID",
] as const;
```

Implement deterministic state builders for an Expense and related supplier payable. Resolve editable project/cost-code cells against authorized records, validate date `YYYY-MM-DD`, uppercase three-letter currencies, non-negative finite amount, required description/category, project/cost-code parent identity, and active cost-code status for changed references. Compare current state to metadata state and to workbook values before assigning `WORKBOOK_ONLY_CHANGE`, `APP_ONLY_CHANGE`, `STALE_CONFLICT`, `UNSUPPORTED_PROTECTED_FIELD`, `INVALID`, `UNAUTHORIZED`, or `UNKNOWN_REFERENCE`.

Only direct unlinked `DRAFT` rows with no protected changes may carry `canApply=true` when `context.canWrite` is true. Build Supplier Payables proposals from invoices that have a linked Expense identity and mark every changed field non-editable. Use `settlementForExpenseWorkbook` to prefer the existing supplier projection for linked Expenses and otherwise derive direct-Expense settlement from confirmed matches; never use invoice `amountPaid` to reduce outstanding.

`applyExpensesImport` must rebuild the review from the original bytes using the fresh context, reject any selected proposal that is no longer safe, and invoke `saveExpense` once per selected Expense proposal with the proposal's fresh `updatedAt`. It must never invoke the callback for Supplier Payables proposals, protected rows, omitted rows, or unsupported new rows.

- [ ] **Step 4: Run the focused adapter tests to verify GREEN.**

Run: `npx.cmd tsx --test tests/expensesWorkbook.test.ts`

Expected: all adapter tests pass, including the real SheetJS export/edit/upload/review/apply/re-export cycle.

- [ ] **Step 5: Commit the adapter and tests.**

```powershell
git add src/lib/expensesWorkbook.ts tests/expensesWorkbook.test.ts
git commit -m "feat: add Expenses workbook review contract"
```

### Task 2: Expense workbook review panel

**Files:**
- Create: `src/components/expenses/ExpensesWorkbookPanel.tsx`
- Test: `tests/expensesWorkbookUx.test.tsx`

**Interfaces:**
- Consumes: `ExpensesWorkbookRecords`, `exportExpensesWorkbook`, `buildExpensesImportReview`, `applyExpensesImport`, and `downloadWorkbookArtifact` from Task 1.
- Produces: `ExpensesWorkbookPanelProps` and the parent callback contract used by `ExpensesPage`.

- [ ] **Step 1: Write the failing panel tests.**

Add a static-render test that renders the panel as a read-only user and asserts `Excel-native Expenses workbook`, `Export editable workbook`, `Import workbook`, `Upload is available for review only`, and `Review before Apply`. Add source-contract assertions that the panel calls `buildExpensesImportReview`, `applyExpensesImport`, `onRefreshExpenses`, and `onApplyExpenseWorkbook`, and never calls a Supabase client or direct database update.

- [ ] **Step 2: Run the panel tests to verify RED.**

Run: `npx.cmd tsx --test tests/expensesWorkbookUx.test.tsx`

Expected: FAIL because `ExpensesWorkbookPanel.tsx` does not exist.

- [ ] **Step 3: Implement the panel.**

Use this typed prop shape:

```ts
export interface ExpensesWorkbookPanelProps extends ExpensesWorkbookRecords {
  companyId?: string;
  canManage: boolean;
  onRefreshExpenses?: () => Promise<ExpensesWorkbookRecords>;
  onApplyExpenseWorkbook: (expense: Expense) => Promise<void> | void;
}
```

Implement browser download from `exportExpensesWorkbook`, an `.xlsx`-only file input, upload-only review staging, proposal selection limited to `proposal.canApply`, a human confirmation checkbox, and an Apply button disabled for read-only users, empty selection, or missing confirmation. On import/apply, use `onRefreshExpenses` when provided and otherwise the current records. Render warnings, proposal statuses, each current-versus-workbook change, omitted-row count, protected supplier-payable notice, and errors without claiming success before the callback resolves. After Apply, refresh the records and rebuild the review so the next export reflects authoritative state.

- [ ] **Step 4: Run the panel tests to verify GREEN.**

Run: `npx.cmd tsx --test tests/expensesWorkbookUx.test.tsx`

Expected: all panel markup and source-contract assertions pass.

- [ ] **Step 5: Commit the panel and tests.**

```powershell
git add src/components/expenses/ExpensesWorkbookPanel.tsx tests/expensesWorkbookUx.test.tsx
git commit -m "feat: add Expenses workbook review panel"
```

### Task 3: OperationsGrid Expense register integration

**Files:**
- Modify: `src/components/expenses/ExpensesPage.tsx`
- Test: `tests/expensesRegisterGrid.test.tsx`

**Interfaces:**
- Consumes: `ExpensesWorkbookPanel`, `settlementForExpenseWorkbook`, `OperationsGrid`, and the existing Expense page filters/detail/action callbacks.
- Produces: new Expense page props for settlement projection context, workbook refresh, and workbook Apply; preserves existing route/deep-link and mobile contracts.

- [ ] **Step 1: Write the failing grid/page tests.**

Add source-contract tests that assert `ExpensesPage.tsx` imports and renders `OperationsGrid` and `ExpensesWorkbookPanel`, keeps `ExpenseRegisterCard`, keeps `FinancialSettlementCard`, and declares the workbook refresh/Apply props. Render a minimal `OperationsGrid`-backed page contract fixture if practical; the source assertions must also verify that the grid columns mark direct draft fields editable and supplier/settlement fields protected.

- [ ] **Step 2: Run the grid/page tests to verify RED.**

Run: `npx.cmd tsx --test tests/expensesRegisterGrid.test.tsx`

Expected: FAIL because the current page uses a raw desktop table and has no workbook panel or workbook callback props.

- [ ] **Step 3: Implement the desktop grid and preserve mobile/detail behavior.**

Add page props:

```ts
settlementProjections?: ReadonlyMap<string, SupplierInvoiceSettlementProjection>;
settlementMatches?: readonly SupplierInvoiceSettlementMatch[];
supplierSettlementToday?: string;
companyId?: string;
onRefreshExpenses?: () => Promise<ExpensesWorkbookRecords>;
onApplyExpenseWorkbook?: (expense: Expense) => Promise<void> | void;
```

Render `ExpensesWorkbookPanel` near the Expense page header. Replace only the `lg` desktop raw table with `OperationsGrid`; retain the existing mobile/tablet `ExpenseRegisterCard` branch and all source, correction, FX, cash, and deep-link actions. Use stable columns for date/description, project, category/payee, source/PO, amount/currency, settlement, and status. For direct unlinked `DRAFT` rows, mark ordinary editable fields as editable; mark linked supplier, status, settlement, source, and derived columns protected. Use `settlementForExpenseWorkbook` for confirmed paid/outstanding/state display and never sum mixed currencies into a single register total.

The panel must receive an authoritative `onApplyExpenseWorkbook` callback; if it is absent, show the existing truthful unavailable/configuration behavior and do not enable Apply. Preserve the existing list filters and selected-expense detail panel.

- [ ] **Step 4: Run the grid/page tests to verify GREEN.**

Run: `npx.cmd tsx --test tests/expensesRegisterGrid.test.tsx`

Expected: all grid, protected-field, panel, mobile-preservation, and settlement-contract assertions pass.

- [ ] **Step 5: Commit the page/grid integration.**

```powershell
git add src/components/expenses/ExpensesPage.tsx tests/expensesRegisterGrid.test.tsx
git commit -m "feat: use OperationsGrid for Expenses register"
```

### Task 4: Route and authoritative App wiring

**Files:**
- Modify: `src/app/routes/ExpensesRoute.tsx`
- Modify: `src/app/routes/AppRouter.tsx`
- Modify: `src/App.tsx`
- Test: `tests/expensesWorkbookRouting.test.ts`

**Interfaces:**
- Consumes: `ExpensesWorkbookRecords`, `ExpensesWorkbookPanelProps`, existing `loadExpensesFromSupabase`, `loadProjectsFromSupabase`, `loadProjectCostCodesFromSupabase`, `loadInvoicesFromSupabase`, `fetchPurchaseOrders`, `fetchVendors`, `loadInvoiceProjectAllocationsFromSupabase`, `buildSupplierInvoiceSettlementProjections`, `saveExpenseToSupabase`, and existing permission/company/session state.
- Produces: route-level `onRefreshExpenses` and `onApplyExpenseWorkbook` contracts with App-owned permission checks and authoritative persistence.

- [ ] **Step 1: Write the failing route/App contract tests.**

Add source assertions that:

```ts
assert.match(read("src/app/routes/ExpensesRoute.tsx"), /onRefreshExpenses/);
assert.match(read("src/app/routes/ExpensesRoute.tsx"), /onApplyExpenseWorkbook/);
assert.match(read("src/app/routes/AppRouter.tsx"), /settlementProjections/);
assert.match(read("src/app/routes/AppRouter.tsx"), /onRefreshExpenses/);
assert.match(read("src/App.tsx"), /loadExpensesFromSupabase/);
assert.match(read("src/App.tsx"), /saveExpenseToSupabase/);
assert.match(read("src/App.tsx"), /onApplyExpenseWorkbook/);
```

Also assert that the Apply callback checks `PERMISSION_KEYS.expensesWrite`, passes the existing `updatedAt` into the persisted Expense object, and does not call a lifecycle/cash/supplier-link mutation.

- [ ] **Step 2: Run the route/App tests to verify RED.**

Run: `npx.cmd tsx --test tests/expensesWorkbookRouting.test.ts`

Expected: FAIL because the new route props, refresh callback, and App callback do not exist.

- [ ] **Step 3: Wire fresh context and the existing save mutation.**

Extend `ExpensesRouteProps`, `AppRouterProps`, and the Expenses route invocation with settlement projections/matches/today, active company ID, workbook records, and callbacks. In `App.tsx`, add `handleRefreshExpensesWorkbook` that refreshes Expenses and the reference/source collections needed by the workbook in the authenticated company context, then recomputes supplier settlement projections from the current/loaded matches. In local/demo mode it returns the current in-memory records without claiming hosted authority.

Refactor the existing Expense save handler into a small `persistExpense(expense): Promise<Expense>` helper that performs the existing permission check, calls `saveExpenseToSupabase` for the authenticated remote path or the existing local update path, updates App state, and returns the saved record. Keep the existing form handler's notification/error behavior. Add `handleApplyExpenseWorkbook` that calls `persistExpense`, rethrows failure to the workbook panel, and reports success only after persistence. It must not invoke correction, supplier verification, project-allocation replacement, payment, or settlement operations.

- [ ] **Step 4: Run the route/App tests to verify GREEN.**

Run: `npx.cmd tsx --test tests/expensesWorkbookRouting.test.ts`

Expected: all route and App source-contract assertions pass.

- [ ] **Step 5: Run the focused integrated UI/domain tests.**

Run: `npx.cmd tsx --test tests/expensesWorkbook.test.ts tests/expensesWorkbookUx.test.tsx tests/expensesRegisterGrid.test.tsx tests/expensesWorkbookRouting.test.ts`

Expected: all new workbook, panel, grid, and route tests pass together.

- [ ] **Step 6: Commit the route/App wiring.**

```powershell
git add src/App.tsx src/app/routes/AppRouter.tsx src/app/routes/ExpensesRoute.tsx tests/expensesWorkbookRouting.test.ts
git commit -m "feat: wire Expenses workbook Apply to authoritative save"
```

### Task 5: Product truth and roadmap synchronization

**Files:**
- Modify: `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`
- Modify: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`
- Modify: `docs/superpowers/specs/2026-09-18-excel-native-operations-ux-design.md`
- Modify: `src/config/productFeatures.ts` only if the final usable capability requires a client-facing description change
- Test: `tests/expensesWorkbookDocs.test.ts`

**Interfaces:**
- Consumes: final implemented adapter/page/App behavior and the approved Phase 4A design note.
- Produces: truthful phase status stating that Phase 4A Expenses + supplier-payables context is implemented only to the bounded scope, with the next Finance slice explicitly remaining.

- [ ] **Step 1: Write the failing documentation synchronization test.**

Assert that the roadmap and handoff contain the Phase 4A bounded status, mention the Expenses/Supplier Payables workbook boundary, do not claim all Finance is Excel-native, and identify client receivables followed by Cash & Banking/reconciliation as remaining Finance work. Assert that the design spec status records the shared foundation, Procurement, Projects, and bounded Expenses rollout without claiming app-wide Excel capability.

- [ ] **Step 2: Run the documentation test to verify RED.**

Run: `npx.cmd tsx --test tests/expensesWorkbookDocs.test.ts`

Expected: FAIL because the live roadmap/handoff/spec still stop at Projects as the next Excel-native rollout.

- [ ] **Step 3: Update only the stale product-truth statements.**

Add a dated Phase 4A entry to the roadmap and handoff describing the real workbook sheets, editable direct-DRAFT boundary, read-only supplier-payables context, existing `updated_at` stale protection, focused evidence, and any skipped hosted/database/provider certification. Update the Excel design status and Phase 4 entry to reflect the bounded implementation. Update `productFeatures.ts` only if its user-facing Supplier Invoices & Expenses description would otherwise omit the now-available controlled workbook workflow; never copy migration names, SHAs, tests, or internal implementation terms into Settings.

- [ ] **Step 4: Run the documentation test to verify GREEN.**

Run: `npx.cmd tsx --test tests/expensesWorkbookDocs.test.ts`

Expected: all roadmap, handoff, design-status, and client-facing truth assertions pass.

- [ ] **Step 5: Commit the synchronized documentation.**

```powershell
git add docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md docs/HYDROQUALISENSE_CURRENT_HANDOFF.md docs/superpowers/specs/2026-09-18-excel-native-operations-ux-design.md src/config/productFeatures.ts tests/expensesWorkbookDocs.test.ts
git commit -m "docs: record bounded Excel Phase 4A rollout"
```

### Task 6: Integrated validation and delivery preparation

**Files:**
- Modify only files required by concrete test failures or final documentation synchronization.
- Test: existing affected-test selector and applicable lint/typecheck/build checks.

**Interfaces:**
- Consumes: all prior task commits and the final integrated diff.
- Produces: exact validation evidence and a review-ready feature branch; no merge or production promotion.

- [ ] **Step 1: Run the complete new focused suite.**

Run: `npx.cmd tsx --test tests/expensesWorkbook.test.ts tests/expensesWorkbookUx.test.tsx tests/expensesRegisterGrid.test.tsx tests/expensesWorkbookRouting.test.ts tests/expensesWorkbookDocs.test.ts`

Expected: all new tests pass.

- [ ] **Step 2: Run focused adjacent financial/workbook tests.**

Run: `npx.cmd tsx --test tests/operationsWorkbook.test.ts tests/operationsGrid.test.tsx tests/supplierPayablesSettlementConsistency.test.ts tests/supplierInvoiceReadiness.test.ts tests/financialSettlement.test.ts tests/projectCostingHardening.test.ts`

Expected: all existing shared workbook, grid, supplier-payable, settlement, and project-cost authority tests pass.

- [ ] **Step 3: Run the affected selector once on the integrated final diff.**

Run: `npm.cmd run test:affected:agent`

Expected: the selector completes with no failures attributable to this branch; any unrelated baseline failure is recorded precisely rather than relabeled as a pass.

- [ ] **Step 4: Run relevant static/runtime checks after code stabilizes.**

Run: `npm.cmd run lint`; `npm.cmd run typecheck`; `npm.cmd run build`; `git diff --check`.

Expected: lint, typecheck, build, and whitespace checks pass. Do not start Docker/Supabase because this plan intentionally adds no database contract; if implementation changes that boundary, record a ruling and run the required migration/pgTAP/concurrency ladder instead.

- [ ] **Step 5: Inspect the complete final diff and forbidden-scope boundaries.**

Run: `git diff --stat f8e242aa4c32fef3a10e42e5f559a16cdd9dc5e0..HEAD`; `git diff --name-only f8e242aa4c32fef3a10e42e5f559a16cdd9dc5e0..HEAD`; `git status --short`.

Expected: changes are limited to the Phase 4A adapter, panel, Expense register/route/App wiring, tests, and truthful documentation; no client receivable, Cash redesign, inventory, payroll, provider, production, or unrelated UI files have entered the branch.

- [ ] **Step 6: Commit only justified verification fixes, push the feature branch, and open a PR.**

Use the branch `codex/excel-phase-4a-expenses-supplier-payables`, push it to `origin`, and open a PR against `main`. Report the exact base SHA `f8e242aa4c32fef3a10e42e5f559a16cdd9dc5e0`, final head SHA, changed files, tests actually run, skipped DB/browser/provider evidence, and the next remaining Finance slice. Do not merge the PR or promote anything to production.
