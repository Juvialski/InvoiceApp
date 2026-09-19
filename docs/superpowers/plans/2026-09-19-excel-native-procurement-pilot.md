# Excel-Native Procurement Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Excel Phase 0/readiness, a reusable OperationsGrid and workbook engine, and a bounded RFQ/Purchase Order `.xlsx` export-review-apply-re-export pilot without bypassing authoritative procurement mutations.

**Architecture:** Keep `ProcurementPage` as the parent-owned orchestration boundary. Add a generic accessible grid primitive, a generic SheetJS-backed workbook safety/metadata/parser layer, and a procurement adapter that turns workbook rows into typed proposed changes. The import panel may export and parse workbooks, but Apply revalidates current records and calls the existing `onSaveRFQ`/`onSavePO` callbacks only for reviewed draft updates.

**Tech Stack:** React 19, TypeScript 5.8, SheetJS `xlsx` 0.20.3 already installed, Node test runner with `tsx` for TSX tests, existing Tailwind/Astryx styling conventions.

**Spec:** `docs/superpowers/specs/2026-09-18-excel-native-operations-ux-design.md`

## Global Constraints

- Pull-first base is `c98c50c3d1487a88c55f6aa45488c2d475f09770`; do not merge the feature PR.
- Procurement is the only Excel-native implementation domain in this run; other domains receive only Phase 0 classifications.
- Workbook upload never mutates authoritative state; no cell maps directly to SQL or a database column.
- The pilot is update-only for existing draft RFQ/PO records; missing rows are not deletions and new records remain unsupported.
- Status, approval, issue/close/cancel history, selected quotation, receiving quantities, committed-cost history, totals, and audit metadata are protected.
- Company isolation, permission checks, original currencies, committed-cost semantics, and existing RFQ/PO history paths remain authoritative.
- No dependency or migration is added unless the live implementation proves an existing contract cannot satisfy the requirement.
- Do not force the desktop grid into mobile; retain the existing card fallback and detail/lifecycle actions.

## Review Focus

- Hidden/stable IDs or fingerprints edited in Excel must fail closed rather than selecting another record; covered by workbook security tests.
- Formula/macro/external-link or oversized workbook input must be rejected before domain parsing; covered by workbook safety tests.
- A stale workbook must distinguish app-only, workbook-only, and both-changed conflict states; covered by procurement proposal tests.
- Protected fields and missing rows must not become lifecycle changes or deletions; covered by proposal/apply tests.
- Read-only users must be able to upload for review but never apply a proposal; covered by permission/apply tests.

### Task 1: Shared workbook safety and typed contract

**Files:**
- Create: `src/lib/operationsWorkbook.ts`
- Create: `tests/operationsWorkbook.test.ts`

**Interfaces:**
- Produces `WorkbookSchema`, `WorkbookSheetDefinition`, `WorkbookExportArtifact`, `WorkbookParseResult`, `WorkbookImportIssue`, `exportOperationsWorkbook`, `parseOperationsWorkbook`, `downloadWorkbookArtifact`, and deterministic `fingerprintValue` helpers for the procurement adapter.

- [ ] **Step 1: Write failing tests** for typed cells, hidden metadata, stable fingerprints, formula/macro policy, exact sheet/header validation, duplicate metadata IDs, file/sheet/row/column limits, and malformed input rejection.
- [ ] **Step 2: Run `npx.cmd tsx --test tests/operationsWorkbook.test.ts` and verify the missing module/API failures are expected.
- [ ] **Step 3: Implement the minimal SheetJS workbook builder/parser with exact schema validation, hidden metadata support, formula/macro/external-link rejection, parser limits, safe text export, and no browser-only side effects in pure functions.
- [ ] **Step 4: Rerun the focused test and verify all workbook contract cases pass.

### Task 2: Procurement workbook schema, diff, and authoritative apply adapter

**Files:**
- Create: `src/lib/procurementWorkbook.ts`
- Create: `tests/procurementWorkbook.test.ts`

**Interfaces:**
- Consumes the workbook engine and existing `RFQ`, `RFQLine`, `PurchaseOrder`, `PurchaseOrderLine`, `Project`, and `Vendor` types.
- Produces `exportProcurementWorkbook`, `buildProcurementImportReview`, `applyProcurementImport`, `ProcurementImportReview`, `ProcurementProposal`, and proposal status/field-change types.

- [ ] **Step 1: Write failing tests** for the four-sheet workbook shape, stable IDs/fingerprints, date/number/currency preservation, reference resolution, duplicates, unknown/cross-company IDs, protected changes, stale conflicts, line identity, no implicit deletion, review-only upload, read-only denial, current-state revalidation, one-hop callback application, and re-exported authoritative values.
- [ ] **Step 2: Run `npx.cmd tsx --test tests/procurementWorkbook.test.ts` and verify it fails because the adapter is absent.
- [ ] **Step 3: Implement the update-only RFQ/PO adapter. Use draft-only editable fields, resolve project/vendor references from supplied authorized lists, retain omitted rows, classify unchanged/workbook-only/app-only/conflict/invalid/unauthorized/protected/missing-reference states, and apply only selected valid records through callback payloads after a fresh review against current records.
- [ ] **Step 4: Rerun the focused procurement workbook test and verify the contract passes.

### Task 3: Accessible reusable OperationsGrid

**Files:**
- Create: `src/components/ui/OperationsGrid.tsx`
- Create: `tests/operationsGrid.test.tsx`

**Interfaces:**
- Produces a typed React `OperationsGrid<T>` supporting stable columns, typed cell alignment/formatting, sorting, filtering-compatible rows, row/cell selection, keyboard navigation, controlled edit metadata, sticky headers, actions, accessible grid/table semantics, and density classes.

- [ ] **Step 1: Write failing server-rendered markup tests** for headers, numeric alignment, protected/editable semantics, selected rows, action buttons, and mobile fallback compatibility.
- [ ] **Step 2: Run `npx.cmd tsx --test tests/operationsGrid.test.tsx` and verify it fails because the component is absent.
- [ ] **Step 3: Implement the focused grid primitive without a third-party dependency; keep filtering and domain actions parent-owned and preserve a compact responsive fallback contract.
- [ ] **Step 4: Rerun the focused component test and verify it passes.

### Task 4: Phase 0 documentation and procurement register integration

**Files:**
- Modify: `src/components/procurement/RfqRegisterSection.tsx`
- Modify: `src/components/procurement/PurchaseOrderRegisterSection.tsx`
- Modify: `src/components/procurement/ProcurementPage.tsx`
- Modify: `tests/rfqProcurementUx.test.tsx`

**Interfaces:**
- Consumes `OperationsGrid` and keeps all existing parent-owned filtering, permissions, detail editors, previews, lifecycle actions, and receipt boundaries intact.

- [ ] **Step 1: Add failing assertions** proving RFQ/PO desktop registers expose the shared grid contract while mobile cards and existing actions remain rendered.
- [ ] **Step 2: Run the focused RFQ/PO UX test and verify the new grid assertions fail.
- [ ] **Step 3: Replace only the desktop register tables with `OperationsGrid`, define compact typed columns and row actions, and keep the existing card branches and parent callbacks untouched.
- [ ] **Step 4: Rerun the focused UX test and verify it passes.

### Task 5: Human-reviewed workbook import/export UI

**Files:**
- Create: `src/components/procurement/ProcurementWorkbookPanel.tsx`
- Modify: `src/components/procurement/ProcurementPage.tsx`
- Modify: `tests/rfqProcurementUx.test.tsx`

**Interfaces:**
- Consumes the procurement workbook adapter, current page records/reference data, `canManage`, and parent-owned save callbacks.
- Produces a visible export action, file upload/review surface, per-proposal field diff/status, selectable eligible changes, explicit confirmation control, and Apply handler.

- [ ] **Step 1: Add failing SSR assertions** for Export, Import/review, proposal status, explicit confirmation, and read-only messaging.
- [ ] **Step 2: Run the focused UX test and verify the new panel assertions fail.
- [ ] **Step 3: Implement download, upload parsing, review-only state, explicit confirmation, revalidation/apply, error handling, and truthful permission status; never call a save callback during file selection.
- [ ] **Step 4: Rerun the focused UX test and verify it passes.

### Task 6: Documentation synchronization and final verification

**Files:**
- Modify: `docs/superpowers/specs/2026-09-18-excel-native-operations-ux-design.md`
- Modify: `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`
- Modify: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`
- Modify: `docs/REPOSITORY_ARCHITECTURE_TRIAGE.md` only if the final shared boundary differs from the recorded triage.

- [ ] **Step 1: Add the real Phase 0 classification and pilot decisions: Procurement Hybrid; Projects/Engineering Hybrid; Expenses/Finance Hybrid; Inventory/Warehouse Hybrid; Equipment Hybrid; Workforce/Payroll Hybrid; Documents/communication registers Hybrid with purpose-built composition/preview; RFQ/PO update-only workbook; deterministic fingerprint; explicit review/apply.
- [ ] **Step 2: Run `npm.cmd run test:affected:agent`, `npm.cmd run lint`, and `npm.cmd run build` once on the integrated final diff, plus `npm.cmd run workflow-map:check` and `npm.cmd run workflow-map:consistency` if mapped source contracts changed.
- [ ] **Step 3: Review the complete diff for direct persistence, protected-field bypasses, stale holes, duplicated utilities, mobile regressions, and out-of-scope domains.
- [ ] **Step 4: Commit, push the feature branch, open a PR against current `main`, and report exact base/head SHAs, evidence, skipped DB/browser/provider checks, limitations, and the no-direct-cell-write invariant.
