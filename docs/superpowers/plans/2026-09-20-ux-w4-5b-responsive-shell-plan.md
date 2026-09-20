# UX-W4.5B Shared Responsive Shell & Worksheet Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the shared mobile shell/dialog and worksheet presentation problems identified by UX-W4.5A while preserving desktop spreadsheet behavior, parent-owned persistence, protected semantics, and all domain authority boundaries.

**Architecture:** Extend the existing `useDialogFocus` primitive with reference-counted document scroll locking and keep the application shell's sticky header as the only shell chrome. Evolve `WorksheetEditor` into one parent-controlled editing model with desktop table rendering and a CSS-selected mobile row/field rendering that reuses the same state, parser, validation, navigation, clipboard, and row-operation handlers. Normalize only the representative worksheet modal wrappers whose current overlay/body scroll ownership is conflicting.

**Tech Stack:** React 19, TypeScript, Tailwind utility classes, Node test runner with `tsx`/`renderToStaticMarkup`, existing Demo Visual QA scripts.

**Spec:** `docs/superpowers/specs/2026-09-20-worksheet-density-clarity-correction.md`, `docs/superpowers/specs/2026-09-20-selective-workbook-editing-ux-direction.md`, and `artifacts/ui-ux-audit/UX-W4.5A-REPORT.md`.

## Global Constraints

- `OperationsGrid` remains a browse/read/register primitive; `WorksheetEditor` remains the shared edit primitive.
- Save/Apply, lifecycle actions, permissions, validation, history, concurrency, provenance, and financial authority remain parent/domain-owned.
- Protected/read-only cells retain `aria-readonly`, `data-worksheet-protected`, `data-worksheet-readonly`, state attributes, non-editable behavior, and restrained visual distinction.
- Ordinary cells do not render repetitive visible `PROTECTED` or `READ-ONLY` pills; error, warning, conflict, unresolved, stale, and decision-relevant manual-correction states remain prominent.
- Desktop/laptop table, keyboard movement, copy/paste, frozen identity columns, dirty state, validation, conflict state, and row-operation rules remain intact.
- Phone layouts use a compact row/field fallback; tablet layouts keep the desktop grid when practical; no page-level worksheet overflow is introduced.
- Modal-style workflows lock background document scrolling, have one deliberate dialog/editor scroll owner, preserve focus containment/return, and keep actions reachable.
- No database, migration, RLS/RPC, provider, production, UX-W5, page hierarchy, Supplier Invoice hierarchy, or new spreadsheet engine work is included.

## Review Focus

- A protected field must remain uneditable and machine-readable after the visible badge is removed; covered by `tests/worksheetEditor.test.tsx`.
- A mobile row card must expose every field label/value and route edits through the same parser/validation callbacks; covered by `tests/worksheetEditor.test.tsx`.
- An active input's invalid value must remain associated with its own field and block the parent action; covered by existing worksheet behavior tests plus the mobile rendering regression.
- A modal opened while the page is scrolled must lock the document and restore the exact prior scroll styles after close; covered by source-contract assertions and representative modal integration assertions.
- Desktop table markup and controlled row operations must remain present alongside the mobile fallback; covered by the existing and expanded worksheet/responsive tests.

---

### Task 1: Shared shell and dialog scroll ownership

**Files:**
- Modify: `src/components/ui/useDialogFocus.ts`
- Modify: `src/app/AppShell.tsx`
- Modify: `src/components/Header.tsx`
- Modify: `src/components/projects/ProjectDetailsWorksheet.tsx`
- Modify: `src/components/expenses/ExpensesPage.tsx`
- Modify: `src/components/procurement/RFQEditorModal.tsx`
- Modify: `src/components/procurement/PurchaseOrderEditorModal.tsx`
- Test: `tests/uiUxResponsive.test.ts`

**Interfaces:**
- `useDialogFocus` continues to return the same callback ref and focus behavior while adding document scroll-lock cleanup that is safe for nested dialogs.
- App shell exposes stable `data-app-shell`, `data-app-shell-header`, and `data-app-shell-main` markers and scroll-padding behavior for focused content.
- Representative worksheet dialogs preserve their existing close/save callbacks and only change layout ownership/classes.

- [ ] **Step 1: Write failing regression assertions** for document scroll-lock markers/cleanup, shell scroll-padding/header markers, Expense use of `useDialogFocus`, and modal overlays using `overflow-hidden` with a single body scroll owner.
- [ ] **Step 2: Run the focused responsive test** and confirm the new assertions fail because the current hook, shell, and wrappers do not provide the contract.
- [ ] **Step 3: Add reference-counted body/document scroll locking** to `useDialogFocus`, preserving Escape, Tab trapping, initial focus, and focus restoration.
- [ ] **Step 4: Add shell metadata and focus-safe scroll padding** without changing routing or sidebar behavior.
- [ ] **Step 5: Apply the shared dialog contract** to Project Details, Expense Draft, RFQ, and Purchase Order wrappers; add Expense’s missing focus hook; retain lifecycle/footer behavior.
- [ ] **Step 6: Run the focused responsive test** and verify the new assertions pass.
- [ ] **Step 7: Commit** with `fix: contain responsive worksheet dialog scrolling`.

### Task 2: WorksheetEditor mobile fallback and quiet protected presentation

**Files:**
- Modify: `src/components/ui/WorksheetEditor.tsx`
- Modify: `tests/worksheetEditor.test.tsx`
- Modify: `tests/uiUxResponsive.test.ts`

**Interfaces:**
- `WorksheetEditorProps<T>` remains source-compatible for all current consumers.
- Existing model functions and callbacks remain authoritative: `applyWorksheetCellEdit`, `applyWorksheetPaste`, `onRowsChange`, `onCellChange`, `onSave`, `onApply`, `onCancel`, `onAddRow`, and `onRemoveRow` are reused.
- Existing desktop `role="grid"`, cell IDs, row keys, aria attributes, and data attributes remain available.

- [ ] **Step 1: Add failing SSR tests** proving the default markup has no visible per-cell `Protected`/`Read-only` pills, retains protected/read-only attributes, renders a mobile fallback with labelled row fields, keeps editable mobile controls, and still renders desktop grid semantics/actions.
- [ ] **Step 2: Run `npx.cmd tsx --test tests/worksheetEditor.test.tsx tests/uiUxResponsive.test.ts`** and confirm the new assertions fail against the current desktop-only/pill-rendering implementation.
- [ ] **Step 3: Extract shared cell view/state and editing-control helpers** inside `WorksheetEditor` so desktop and mobile renderings share state derivation, parsers, validation, issue association, and handlers.
- [ ] **Step 4: Remove default visible protected/read-only pills** while retaining titles, `aria-readonly`, data attributes, protected styling, and exceptional issue rendering.
- [ ] **Step 5: Add the CSS-selected mobile row/field fallback** below the desktop grid: identity context, labelled values, focused editable inputs/selects, local validation messages, conflict/warning/error states, Add Row and Remove Row actions, and no forced horizontal overflow.
- [ ] **Step 6: Keep desktop table behavior contained** at the existing breakpoint and preserve keyboard, copy/paste, frozen-column, dirty-state, and Save/Apply paths.
- [ ] **Step 7: Run the focused worksheet/responsive tests** and verify the red-green cycle plus existing worksheet assertions.
- [ ] **Step 8: Commit** with `fix: add responsive worksheet editing fallback`.

### Task 3: Representative consumer contracts and static integration coverage

**Files:**
- Modify: `tests/uiUxResponsive.test.ts`
- Modify: `tests/worksheetEditor.test.tsx` when a shared regression needs a direct assertion
- Inspect/modify only if required: `src/components/projects/ProjectCostCodesWorksheet.tsx`, `src/components/projects/ClientBillingDraftWorksheet.tsx`, `src/components/expenses/ExpenseDraftWorksheet.tsx`, `src/components/invoices/SupplierInvoiceWorksheet.tsx`

**Interfaces:**
- Project Details, Cost Codes, Client Billing, Expense Draft, RFQ/PO, and Supplier Invoice continue to supply their existing columns, validation, protected fields, and parent-owned actions.

- [ ] **Step 1: Add failing representative source-contract assertions** for mobile fallback consumption, explicit worksheet scroll markers, protected Supplier Invoice rendering, and unchanged Save/Apply ownership across Project Details, Cost Codes, Client Billing, Expense, RFQ, and PO.
- [ ] **Step 2: Run the focused integration tests** and confirm missing markers/contracts fail before any consumer-specific adjustment.
- [ ] **Step 3: Make only bounded consumer layout adjustments** needed to expose the shared fallback and keep action/scroll ownership stable; do not change domain data or persistence logic.
- [ ] **Step 4: Run the focused representative test group** and verify all six consumer contracts.
- [ ] **Step 5: Commit** with `test: cover UX-W4.5B worksheet consumers`.

### Task 4: Targeted visual evidence and synchronized handoff

**Files:**
- Modify: `artifacts/ui-ux-audit/UX-W4.5A-REPORT.md`
- Modify: `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`
- Modify: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`
- Create/modify: `artifacts/ui-ux-audit/screenshots/ux-w4-5b/README.md` and only the sanitized targeted screenshots actually captured

**Interfaces:**
- Evidence records exact base/final SHA, safe-demo environment, route/state, viewport, screenshot paths, and separate automated versus visual judgments.
- Roadmap and handoff state only the findings actually resolved/partial/deferred and derive the next slice from the final live report.

- [ ] **Step 1: Run focused tests, `npm.cmd run test:affected:agent`, and relevant lint/build checks** on the integrated diff.
- [ ] **Step 2: Run targeted Demo Visual QA** for Project Details, Cost Codes/Budget Control, Client Billing, Expense Draft, RFQ or PO, SMS/long workflow scroll containment, and a desktop WorksheetEditor state at phone/tablet/desktop viewports where available.
- [ ] **Step 3: Open and inspect the resulting screenshots** and classify UX45A-002, UX45A-003, UX45A-006, and UX45A-010 as resolved, partial, or deferred; keep UX45A-004 page-specific work explicitly deferred.
- [ ] **Step 4: Update the durable evidence/report, roadmap, and handoff** with exact final-head evidence and no UX-W4.5/UX-W5 overclaim.
- [ ] **Step 5: Run the final focused evidence commands and inspect the complete diff.**
- [ ] **Step 6: Commit** with `docs: record UX-W4.5B responsive evidence`.

## Delivery

After the final diff is verified, push `codex/ux-w4-5b-responsive-shell` and open a PR into `main`. Do not merge the PR. Report base SHA `774512d9bf6ed30a1ab2e87c8ccdaf48697b023a`, final head SHA, PR URL, focused/affected tests, targeted visual evidence, resolved/partial/deferred UX45A findings, and that DB validation was not applicable unless the final diff unexpectedly crosses a database contract.
