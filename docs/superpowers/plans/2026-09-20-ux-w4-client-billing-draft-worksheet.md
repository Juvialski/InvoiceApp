# UX-W4 Client Billing Draft Worksheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Client Billing draft form with a shared worksheet editing surface while preserving one aggregate Save draft boundary, protected receivable/lifecycle fields, and authoritative stale-write protection.

**Architecture:** Extract a focused `ClientBillingDraftWorksheet` component from `ClientBillingPanel`. It will stage one header/details row and repeated line rows through the existing `WorksheetEditor` primitive, keep editor-local draft state and synchronous refs for aggregate save, and pass only explicit safe fields to the existing parent save callback. Extend the existing Client Billing RPC with an expected `updated_at` precondition and fold draft metadata into that same transaction; keep lifecycle, collection, document preview, and Cash & Banking controls in the parent.

**Tech Stack:** React + TypeScript, shared `WorksheetEditor`, Node test runner/TSX, Supabase Postgres migrations and pgTAP, Playwright-style demo scenario definitions.

**Spec:** `docs/superpowers/specs/2026-09-20-selective-workbook-editing-ux-direction.md` and `docs/superpowers/specs/2026-09-18-excel-native-operations-ux-design.md`, with UX-W4 requirements in the implementation handoff request.

## Global Constraints

- Preserve **browse visually -> edit like a spreadsheet -> execute sensitive workflows deliberately**.
- Only Client Billing DRAFT create/edit is worksheet-native; Submit, Issue, Cancel, Void, preview, Collections, Cash & Banking, and history remain explicit workflows.
- Project identity, project currency, tax treatment, lifecycle/status, calculated totals, collected/outstanding amounts, audit/history, and settlement state remain protected.
- Save through `saveClientBillingToSupabase` / `create_or_update_client_billing` and the existing local/demo equivalents; do not add a second persistence path.
- Temporary worksheet row identities are UI-only and must never enter authoritative billing-line persistence.
- Add Row and draft-only Remove Row remain domain-controlled; Add Column/custom SQL fields are out of scope.
- Preserve company binding, permission/RLS, lifecycle, contract-ceiling, original-currency, and immutable history rules.
- Use focused -> affected validation; do not run `test:full` unless impact selection or a concrete failure justifies it.
- Because the RPC contract changes, run applicable Docker/Supabase replay, pgTAP, migration, upgrade, and concurrency checks when the environment permits; never claim skipped runtime evidence as passed.

## Review Focus

- Stale draft save: a concurrent header/line/metadata change must fail atomically with SQLSTATE `40001` and leave the authoritative aggregate unchanged.
- Aggregate save boundary: a cell being edited in either worksheet must be reflected in the single parent Save draft operation; no competing Save buttons may persist partial state.
- Protected financial semantics: project/currency/tax/status/derived/collection/settlement values must render as protected and cannot be serialized as editable input.
- Temporary row identity: Add Row may create a synthetic UI key, but the authoritative line payload must contain only description, amount, and notes.
- Responsive containment: desktop density and keyboard/paste behavior must remain inside worksheet scroll surfaces without page-level overflow.

### Task 1: Add failing focused worksheet and persistence-contract tests

**Files:**
- Create: `tests/clientBillingDraftWorksheet.test.tsx`
- Modify: `tests/clientProgressBilling.test.ts`
- Modify: `tests/clientProgressBillingMigration.test.ts`

**Interfaces:**
- Tests will consume the planned `ClientBillingDraftWorksheet` render contract and an exported `clientBillingLinesForPersistence` helper.
- Tests will assert the planned `ClientBillingInput.expectedUpdatedAt` and local stale-save behavior.

- [x] **Step 1: Write the failing tests**
  - Render create/edit worksheet markup with representative project and draft billing fixtures.
  - Assert the shared editor count/labels, safe metadata and line columns, Add Row, draft-only Remove Row, protected project/currency/tax/status/derived cells, one aggregate Save draft, and absence of Submit/Issue/Cancel/Void/Collection controls inside the worksheet.
  - Assert responsive contained scrolling markers and that serializing a synthetic `draft-*` line key produces no synthetic identity field.
  - Assert the local builder rejects an edit whose `expectedUpdatedAt` differs from the existing billing.
  - Assert the new forward migration defines the three-argument version-aware RPC, metadata fields inside the RPC, `40001`, row locking, and authenticated-only execution.

- [x] **Step 2: Run the focused tests to verify the expected failures**

  Run:

  ```text
  npx.cmd tsx --test tests/clientBillingDraftWorksheet.test.tsx tests/clientProgressBilling.test.ts tests/clientProgressBillingMigration.test.ts
  ```

  Expected: the new component/helper and expected-version behavior are missing, so the focused suite fails for those specific assertions rather than because of a test-loader error.

### Task 2: Implement the Client Billing worksheet component and local stale guard

**Files:**
- Create: `src/components/projects/ClientBillingDraftWorksheet.tsx`
- Modify: `src/components/projects/ClientBillingPanel.tsx`
- Modify: `src/lib/clientBilling.ts`
- Modify: `src/App.tsx`
- Modify: `src/demo/DemoWorkspace.tsx`

**Interfaces:**
- `ClientBillingDraftWorksheet` accepts `project`, optional draft `billing`, `onSave(input, lines)`, `onCancel`, `isSaving`, and `errorMessage`.
- `ClientBillingInput` gains optional `expectedUpdatedAt?: string` for edit freshness evidence.
- `clientBillingLinesForPersistence(rows)` returns `ClientBillingLineInput[]` containing only `description`, `amount`, and `notes`.

- [x] **Step 1: Implement the minimum component shape**
  - Initialize one details row from either the draft billing or project defaults and line rows with stable UI-only keys.
  - Define worksheet columns for supported safe details and lines, with required/date/email/non-negative validation.
  - Add protected context columns for project, currency, tax treatment, status, calculated total, collected amount, and remaining/outstanding amount; keep these values display-only.
  - Render two contained `WorksheetEditor` surfaces without editor-level Save buttons, plus one parent-owned Save draft and Cancel action.
  - Keep line Add Row enabled and Remove Row enabled only when more than one draft line remains.
  - Use refs updated synchronously by `onRowsChange` so the aggregate save reads the latest committed header and lines after editor blur.

- [x] **Step 2: Integrate the component into the parent**
  - Replace the inline conventional draft form with the extracted component.
  - Keep `ClientBillingPanel` ownership of selected records, busy/error lifecycle, `onSave`, and all collection/lifecycle/preview/history surfaces.
  - Ensure the worksheet is only entered for new or DRAFT billings and that edit snapshots retain the original `updatedAt` token.

- [x] **Step 3: Preserve local/demo authority and stale behavior**
  - Map editable worksheet values explicitly into `ClientBillingInput` and force project-owned `projectId`, `currency`, and `taxTreatment` from the parent project.
  - Include `expectedUpdatedAt` for edits and reject local/demo edits when the current record version differs; do not include worksheet IDs in saved lines.

- [x] **Step 4: Run the focused component/domain tests**

  Run:

  ```text
  npx.cmd tsx --test tests/clientBillingDraftWorksheet.test.tsx tests/clientProgressBilling.test.ts tests/clientProgressBillingMigration.test.ts
  ```

  Expected: focused worksheet, local stale-guard, and existing Client Billing tests pass.

### Task 3: Add the authoritative version-aware Client Billing RPC migration

**Files:**
- Create via `npx.cmd supabase migration new client_billing_draft_concurrency_and_metadata`
- Modify: `supabase/migrations/20260920071201_client_billing_draft_concurrency_and_metadata.sql`
- Create: `supabase/tests/database/42_client_billing_concurrency.test.sql`
- Modify: `src/lib/clientBilling.ts`

**Interfaces:**
- Replace the old two-argument RPC signature with `create_or_update_client_billing(p_billing jsonb, p_lines jsonb default '[]'::jsonb, p_expected_updated_at timestamptz default null)` while preserving two-argument create calls through the default.
- Existing-record updates require a non-null matching `updated_at`; stale mismatch raises SQLSTATE `40001` with `EXPECTED_VERSION_MISMATCH` detail.

- [x] **Step 1: Implement the smallest forward migration**
  - Drop the old two-argument signature before creating the three-argument defaulted signature, following the existing RFQ/PO concurrency pattern.
  - Preserve authentication, company/project permission, project lock, draft-only lifecycle, currency, period, line validation, line replacement, audit/event history, and returned aggregate shape.
  - Parse and persist due date, payment terms, billing contact, billing email, and billing address inside the same RPC transaction.
  - Lock the existing billing row, require the expected timestamp for updates, and leave creates valid with a null expected timestamp.
  - Revoke public/anon execution and grant the new exact signature to authenticated.

- [x] **Step 2: Update the client persistence adapter**
  - Send `p_expected_updated_at: input.expectedUpdatedAt || null` with the existing RPC call.
  - Remove the follow-up metadata `UPDATE`; the RPC response is the complete authoritative saved aggregate.
  - Fail closed client-side when editing an existing Supabase billing without freshness evidence.

- [x] **Step 3: Add runtime pgTAP coverage**
  - Create isolated authenticated/company/project/draft fixtures.
  - Prove matching-version update persists header metadata and replacement lines atomically.
  - Prove stale update raises `40001` and leaves header metadata and lines unchanged.
  - Prove create remains supported, anonymous/public execution is denied, and the existing lifecycle/permission boundaries remain represented.

- [x] **Step 4: Run static migration checks and, if Docker is available, real DB checks**

  Run the focused migration test first. Then, when local Supabase is available, run `docker info`, clean local reset/replay, pgTAP, migration tests, upgrade tests, and the focused Client Billing runtime test. If Docker is unavailable, record the exact blocker and leave the protected CI/runtime gate authoritative.

### Task 4: Add bounded demo visual QA and synchronize product truth

**Files:**
- Modify: `scripts/qa/demoScenarios.ts`
- Modify: `tests/uiUxResponsive.test.ts`
- Modify: `src/config/productFeatures.ts`
- Modify: `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`
- Modify: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`

- [x] **Step 1: Add the Client Billing draft worksheet scenario**
  - Open the known demo DRAFT client billing at desktop, tablet, and mobile/tablet breakpoints.
  - Assert one worksheet surface, two contained editors, safe field labels, Add Row, protected cells, one Save draft, and no lifecycle/collection action inside the worksheet.
  - Use scoped stable test IDs and exact labels; do not rely on ambiguous global button text.

- [x] **Step 2: Add focused responsive/source assertions**
  - Assert worksheet containment, stable test IDs, and that the parent still owns lifecycle and collection surfaces.

- [x] **Step 3: Synchronize truthful product/docs state**
  - Update the available Client Billing feature copy only to describe usable draft editing; do not claim app-wide Excel support.
  - Record UX-W4 Client Billing as implemented only after the final behavior and applicable evidence are checked.
  - Derive and record the next approved slice from the live roadmap rather than inventing a new phase.

### Task 5: Final integrated validation and delivery

**Files:**
- Review complete branch diff and generated migration history.

- [x] **Step 1: Run focused tests**

  ```text
  npx.cmd tsx --test tests/clientBillingDraftWorksheet.test.tsx tests/clientProgressBilling.test.ts tests/wave1bClientReceivableUx.test.ts tests/worksheetEditor.test.tsx tests/uiUxResponsive.test.ts
  ```

- [x] **Step 2: Run the affected selector once**

  ```text
  npm.cmd run test:affected:agent
  ```

- [x] **Step 3: Run stabilized lint and build**

  ```text
  npm.cmd run lint
  npm.cmd run build
  ```

- [x] **Step 4: Review applicable browser/database evidence**
  - Run the bounded demo/browser scenario if the local QA harness is available.
  - Run the applicable Docker/Supabase replay/pgTAP/upgrade checks for the migration; otherwise report the exact unavailable runtime gate.
  - Inspect exact-head CI after push; do not reuse older-head evidence.

- [ ] **Step 5: Review final diff and deliver**
  - Confirm no worksheet can mutate lifecycle/collection/settlement truth and no synthetic line identity reaches persistence.
  - Commit the focused branch, push it, open a PR into `main`, include base/final SHAs and actual validation, attach the PR artifact, and stop without merging.
