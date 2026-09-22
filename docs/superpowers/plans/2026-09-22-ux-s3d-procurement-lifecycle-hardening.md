# UX-S3D Procurement Lifecycle Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make the existing Procurement RFQ and Purchase Order lifecycle visibly stage `prepare/edit -> review -> human confirm -> execute -> result/continue` without changing financial, persistence, permission, history, receipt, or workbook authority.

**Architecture:** Keep `ProcurementPage` as the lifecycle/orchestration owner and keep `RfqRegisterSection` / `PurchaseOrderRegisterSection` presentation-only. Add one focused RFQ Issue confirmation component that calls the existing authoritative transition callback, make the PO editor expose approval only for an already-persisted draft, and use the existing PO number/filter state for a lightweight draft-PO continuation after quotation conversion.

**Tech Stack:** React 19, TypeScript, server-rendered JSX regression tests with `node:test`, existing `WorksheetEditor`, existing lifecycle/domain callbacks, existing demo visual QA.

**Spec:** User-provided UX-S3D Procurement Lifecycle Workflow Hardening brief; supporting evidence in `artifacts/ui-ux-audit/UX-S3A-RESEARCH-AND-INSTRUCTION-DENSITY-AUDIT.md` and the current Procurement/workbook contracts in `docs/superpowers/specs/2026-09-18-excel-native-operations-ux-design.md` and `docs/superpowers/specs/2026-09-20-selective-workbook-editing-ux-direction.md`.

**Execution status:** Tasks 1-4 complete; final delivery remains open until the feature branch is pushed and the PR is created.

## Global Constraints

- Preserve `prepare -> review -> human confirm -> execute` for consequential Procurement actions.
- A new unsaved PO may be saved as `DRAFT`, but must not expose an approval control or silently interpret approval as save.
- Persisted PO approval remains a separate authoritative `APPROVED` transition using the existing `procurement.approve` boundary.
- RFQ Issue remains separate from quotation entry, comparison, supplier selection, and draft PO creation.
- Selected quotation conversion creates only a `DRAFT` PO; it never approves, issues, receives, closes, cancels, selects a supplier, or applies workbook changes.
- Preserve existing PO receipt truth, Warehouse continuation, close guard, committed-cost semantics, source/history/RBAC/RLS/concurrency boundaries, original currency, and no invented FX.
- Preserve workbook `Import -> Review proposals -> select -> confirm -> Apply`; workbook edits remain proposal-only and cannot perform lifecycle transitions.
- Do not add migrations, RPCs, schema changes, new Procurement domains, or unrelated UI cleanup.
- Use zero subagents, keep the branch open, and do not merge the PR.

## Review Focus

- New PO with `canApprove=true` and no persisted ID: only truthful draft-save controls appear.
- Persisted `DRAFT` PO with `canApprove=true`: approval remains visible and is not folded into Save Draft.
- RFQ Issue failure: confirmation remains open and the register does not claim `ISSUED`.
- Issued PO with outstanding receipt quantity: Close remains visibly unavailable while the existing authoritative transition guard remains intact.
- Quotation conversion failure: no draft-PO success/continuation state appears and comparison review remains available.

---

### Task 1: Truthful Purchase Order draft and close staging

**Files:**
- Modify: `src/components/procurement/PurchaseOrderEditorModal.tsx`
- Test: `tests/rfqProcurementUx.test.tsx`

**Interfaces:**
- Consumes: existing `PurchaseOrderEditorModalProps`, `PurchaseOrderStatus`, `calculatePOReceiptProgress`, and `hasOutstandingReceiptQuantity`.
- Produces: an editor where approval is rendered only for persisted drafts, new drafts explain the required save boundary, and issued POs expose the receipt-dependent close guard.

- [ ] **Step 1: Write the failing tests.**

  Add focused server-rendered assertions for (a) a new PO with approval permission rendering `Save Draft` plus a save-before-approval explanation and no `Approve PO`, (b) the existing persisted draft still rendering `Approve PO`, and (c) the demo issued PO with outstanding receipt quantity rendering a disabled close control and the receipt-dependent explanation.

- [ ] **Step 2: Run the focused test to verify RED.**

  Run:

  ```text
  npx.cmd tsx --test tests/rfqProcurementUx.test.tsx
  ```

  Expected: the new unsaved-PO assertion fails because the current modal renders `Approve PO` for `purchaseOrder={undefined}`; the close-guard assertion also fails because the current close control is enabled and has no guard explanation.

- [ ] **Step 3: Implement the smallest truthful boundary.**

  Keep `handleSaveDraft` as the only available action for an unsaved PO. Change the approval control condition to require `isEditing`, make the defensive no-ID approval handler report that the draft must be saved rather than saving it, add a concise visible save-before-approval note for new drafts, and disable the close control only when the derived receipt progress has outstanding quantity. Keep the existing `onTransition` callback and server/domain guard authoritative.

- [ ] **Step 4: Run the focused test to verify GREEN.**

  Run the same `npx.cmd tsx --test tests/rfqProcurementUx.test.tsx` command and confirm all tests pass, including the persisted-draft approval assertion.

- [ ] **Step 5: Commit the task.**

  ```text
  git add src/components/procurement/PurchaseOrderEditorModal.tsx tests/rfqProcurementUx.test.tsx
  git commit -m "UX-S3D: stage purchase order draft approval truthfully"
  ```

### Task 2: Explicit RFQ Issue confirmation

**Files:**
- Create: `src/components/procurement/RFQIssueConfirmationModal.tsx`
- Modify: `src/components/procurement/ProcurementPage.tsx`
- Test: `tests/rfqProcurementUx.test.tsx`

**Interfaces:**
- Consumes: `RFQ`, the existing `onTransitionRFQ` callback, `useDialogFocus`, and the register's existing `onIssueRfq` presentation callback.
- Produces: a keyboard/touch-reachable confirmation stage that calls the existing transition only after explicit confirmation and preserves failure context.

- [ ] **Step 1: Write the failing test.**

  Add a focused render test for `RFQIssueConfirmationModal` asserting `role="dialog"`, the RFQ identity, `Confirm Issue`, `Back`, and copy stating that Issue sends the RFQ out for quotation but does not select a supplier or create a PO.

- [ ] **Step 2: Run the focused test to verify RED.**

  Run `npx.cmd tsx --test tests/rfqProcurementUx.test.tsx` and confirm the import/render test fails because the component does not yet exist.

- [ ] **Step 3: Implement the confirmation stage.**

  Create the small modal with `useDialogFocus`, an in-flight disabled state, error alert, Escape/back handling, and explicit `Confirm Issue`. In `ProcurementPage`, replace the direct register transition with an `issueRfqTarget` state and mount the modal. Only the modal's confirmed callback calls `handleTransitionRFQInternal`; catch failures in the modal so the RFQ remains visibly unissued and retryable.

- [ ] **Step 4: Run the focused test to verify GREEN.**

  Run the same focused test and confirm the confirmation markup and existing Procurement tests pass.

- [ ] **Step 5: Commit the task.**

  ```text
  git add src/components/procurement/RFQIssueConfirmationModal.tsx src/components/procurement/ProcurementPage.tsx tests/rfqProcurementUx.test.tsx
  git commit -m "UX-S3D: confirm RFQ issue transitions"
  ```

### Task 3: Selected quotation to draft PO continuation and hierarchy evidence

**Files:**
- Create: `src/components/procurement/ProcurementDraftPOContinuation.tsx`
- Modify: `src/components/procurement/ProcurementPage.tsx`
- Test: `tests/rfqProcurementUx.test.tsx`

**Interfaces:**
- Consumes: existing `handleConvertToPOInternal`, `activeTab`, register filters, quotation identifiers, and `ProcurementWorkbookPanel` placement.
- Produces: after a successful conversion, the page selects Purchase Orders, filters to the generated PO number, and shows a concise uncommitted-draft result notice; failures leave the comparison flow untouched.

- [ ] **Step 1: Write the failing test.**

  Extend the Procurement UX assertions to pin the already-correct register-before-workbook order and the distinct `Create Draft PO` / pre-commitment language. Add a source-level assertion for the continuation contract only if the rendered result cannot be reached without a browser event; do not fabricate a converted PO in a fixture.

- [ ] **Step 2: Run the focused test to verify RED if a new assertion is added.**

  Run `npx.cmd tsx --test tests/rfqProcurementUx.test.tsx` and confirm any new continuation assertion fails against the current implementation before editing it.

- [ ] **Step 3: Implement the continuation.**

  After the existing authoritative conversion callback or local fallback resolves, record the selected quotation number, switch to the Purchase Orders tab, reset lifecycle filters, set the search query to the requested PO number, and render a `role="status"` message explaining that the created PO is an uncommitted draft awaiting review/save/approval. Do not set this state before the callback succeeds. Leave the existing workbook panel after the active register.

- [ ] **Step 4: Run the focused test to verify GREEN.**

  Run the focused Procurement UX test and verify the register/workbook order and draft-only copy remain green.

- [ ] **Step 5: Commit the task.**

  ```text
  git add src/components/procurement/ProcurementPage.tsx tests/rfqProcurementUx.test.tsx
  git commit -m "UX-S3D: continue from quotation into draft PO review"
  ```

### Task 4: Integrated validation, evidence, and handoff

**Files:**
- Modify: `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`
- Modify: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`
- Modify: this plan/evidence record

**Interfaces:**
- Consumes: the exact final diff, focused tests, deterministic affected-test selection, lint/build output, and targeted local browser/demo evidence.
- Produces: a truthful phase record with the starting SHA, actual friction, actual changes, preserved invariants, validation, Jev fallback, DB applicability, and remaining S3D scope.

- [ ] **Step 1: Run the focused and affected validation ladder.**

  Run the final focused Procurement/RFQ/PO/workbook tests, `npm.cmd run test:affected:agent`, `npm.cmd run lint`, and `npm.cmd run build`. Do not start Docker/Supabase because no database, RPC, RLS, migration, or persistence contract changes are planned.

- [ ] **Step 2: Run targeted browser/demo evidence.**

  Run the local production-server Demo Visual QA at the final application head and inspect representative Procurement register, RFQ Issue confirmation, comparison/draft-PO, persisted PO draft/approval, issued receipt/close-guard, and phone states. Record exact counts and any skipped hosted/provider/production evidence.

- [ ] **Step 3: Run the one completion/evidence Jev check.**

  Submit sanitized metadata covering the changed UI files, focused/affected/lint/build/browser results, preserved invariants, and DB non-applicability. Record the returned diagnostic without treating it as a merge decision.

- [ ] **Step 4: Review and synchronize documentation.**

  Inspect the complete final diff, update this record plus the roadmap and current handoff with the actual final branch/head and remaining Payroll S3D scope, and verify no Settings capability status or workflow-map contract requires a change.

- [ ] **Step 5: Push and open the PR without merging.**

  Run exact diff/status checks, push `codex/ux-s3d-procurement-lifecycle`, open a PR titled `UX-S3D: harden Procurement lifecycle stages`, and report the exact PR number/head SHA and validation summary.

## Scope decisions recorded before implementation

- The historical workbook-before-register finding is already resolved in the synchronized source; no reorder-only change will be manufactured.
- RFQ Issue is the only direct register lifecycle mutation in this slice that lacks a visible confirmation stage; cancellation already has a reason-confirmation modal.
- No PO callback return-type expansion or new routing contract is needed for draft continuation; the existing PO number and register filter provide the bounded continuation.
- No database validation is applicable unless source inspection proves a persistence/RPC/RLS/locking change is required; UI/domain callback staging alone does not authorize starting Supabase.

## Execution evidence — 2026-09-22

- Task 1 committed as `32db483`: focused Procurement UX suite **15/15** after
  the red-green cycle.
- Task 2 committed as `455434c`: focused Procurement UX suite **16/16** after
  the red-green cycle.
- Task 3 committed as `6f7a59f`: focused Procurement UX suite **17/17** after
  the red-green cycle.
- Demo evidence wiring committed as `7baa892`: demo route coverage **7/7**;
  seeded RFQ/quotation evidence is now passed into the demo router.
- Final focused/domain suite: **68/68**; deterministic affected selector:
  **359/359**, **55/368** selected, database fallback disabled.
- Final `npm.cmd run lint`: ESLint and TypeScript passed. Final build passed
  with the repository's existing Astryx font/chunk-size and CJS `import.meta`
  warnings.
- Final exact-head demo manifest at `artifacts/demo-visual-qa-s3d-final3`:
  application/evidence SHA `7baa892c090ccdf17e0ad32fa2688b28ea3f5b44`,
  **127/127** scenarios, **36** routes, **4** viewports, **108** interaction
  scenarios, **127** screenshots, zero console/page/request/overflow failures.
- Jev context: no Workflow Map match, no candidates, zero live requests, and
  deterministic fallback. Jev completion/evidence: sanitized live attempt
  returned `TypeError` before a response; no Jev judgment was used.
- DB applicability: no migration, RPC, RLS, schema, persistence, locking, or
  financial/inventory guard changed; Docker/Supabase, hosted QA, provider, and
  production checks were not run.
- Scope ruling: the demo router was wired to its already-seeded RFQ and
  quotation data because the new RFQ confirmation could not otherwise be
  exercised in browser evidence; this changes demo evidence availability only,
  not production persistence or lifecycle authority. Cost if wrong: a broader
  demo-surface diff than necessary, with no customer-data or production impact.
