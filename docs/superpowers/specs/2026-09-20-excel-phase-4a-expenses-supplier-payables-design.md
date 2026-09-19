# Excel Phase 4A — Expenses and Supplier Payables

Status: approved bounded implementation design

## Goal

Extend the existing Excel-native operations foundation to the Expenses register and the supplier-payable context that is directly related to Expense records. The rollout must support a real `.xlsx` export → external edit → upload → review/diff → explicit Apply → authoritative Expense mutation → re-export loop without creating a second financial ledger or making supplier-source data independently editable.

This is a bounded Phase 4A rollout. Client receivables, Cash & Banking, bank reconciliation, settlement redesign, Inventory/Equipment, Payroll, and unrelated UI cleanup remain out of scope.

## Live transaction boundary

The authoritative Expense mutation is the existing `saveExpenseToSupabase` path, reached from `App.tsx` through the existing Expense save callback. For an existing row, the database update includes the company and record identity plus an `updated_at` equality predicate and rejects an empty result as a stale-write conflict. The workbook Apply path will pass the fresh authoritative `updatedAt` token through this existing mutation; it will not write a table row directly from an Excel cell.

The workbook may apply only existing, unlinked, `DRAFT` Expenses. These are the records for which the normal `ExpenseForm` already permits ordinary attribute editing and the database correction guard permits business-field updates. Each Expense is an independent transaction group; Apply revalidates the complete workbook against fresh host state before invoking the existing save callback, and the save predicate closes a race that occurs after that review.

Supplier-derived Expenses are not workbook-editable. A verified supplier invoice creates its authoritative linked Expense through `verify_supplier_invoice_and_create_expense`; supplier provenance is unique and immutable, and supplier project/cost-code attribution is a projection of canonical `invoice_project_allocations`. The workbook therefore cannot change `supplierInvoiceId`, `vendorId`, `purchaseOrderId`, source-document identity, or linked supplier project attribution.

Supplier payment state is a read-only projection. `buildSupplierInvoiceSettlementProjections` combines the linked Expense, supplier invoice evidence, and confirmed Cash & Banking matches. Invoice-reported `amountPaid` remains evidence only; it never becomes an editable or authoritative workbook value.

## Workbook contract

The adapter will add one shared-schema workbook kind with these sheets:

- `Expenses`: all Expense rows available in the current authorized Expense context. Direct draft rows expose supported editable fields; linked, approved, paid, void, archived, source-backed, and derived fields remain visible but protected.
- `Supplier Payables`: only supplier invoices directly related to an Expense through `supplierInvoiceId` or `linkedExpenseId`. This is a read-only payable/source projection showing invoice identity, linked Expense identity, vendor/source context, project allocation context, payable basis, confirmed paid amount, outstanding amount, settlement state, authority conflict, and lifecycle/readiness state. Unlinked supplier documents remain in the existing in-app follow-up workflow and are not presented as payable authority by this sheet.
- `_HydroQualiSense`: hidden workbook/schema, company, record identity, fingerprint, and `updatedAt` synchronization metadata.

Stable IDs, company IDs, fingerprints, and version tokens are comparison evidence only. They are never authorization credentials. The export will use safe literal cell values and the existing parser limits/formula/external-link protections.

## Editable and protected fields

For an existing direct `DRAFT` Expense with no `supplierInvoiceId`, the workbook may propose:

- expense date;
- category;
- description;
- payee;
- amount, subject to the existing non-negative monetary rule;
- three-letter uppercase currency;
- payment method;
- reference number and notes;
- project reference resolved against the authorized project list; and
- cost-code reference resolved against the selected project and active cost-code list.

The workbook must protect and fail closed on status, payment/settlement/reconciliation state, lifecycle/archive/void fields, supplier invoice/source-document/vendor/purchase-order identity, created/history/audit metadata, derived payable values, linked supplier project attribution, company/user ownership, and any field on a supplier-derived Expense. The `Supplier Payables` sheet is entirely protected; a changed protected cell produces an explicit unsupported/protected proposal rather than being ignored.

Workbook rows without stable existing IDs are unsupported proposals. Missing rows are informational omissions and never deletions. No workbook row creates a new Expense or supplier invoice.

## Review and Apply behavior

The adapter will classify each Expense proposal as unchanged, workbook-only change, app-only change, stale conflict, invalid, unauthorized, unknown reference, protected-field change, or unsupported new record. It will validate dates, required text, non-negative amounts, currencies, project/cost-code relationships, duplicate identities, hidden metadata, company scope, and fingerprint consistency before any Apply control is enabled.

Apply will:

1. fetch the fresh Expense/project/cost-code/supplier/payable context when the host refresh hook is available;
2. rebuild the review from the original workbook bytes;
3. apply only explicitly selected safe Expense proposals;
4. invoke the existing parent-owned Expense save callback with the expected current version;
5. surface a stale-write or domain error without claiming that the proposal succeeded; and
6. refresh authoritative state and permit re-export verification.

Supplier-payable/source changes cannot be selected for Apply. Read-only users can inspect and review but cannot Apply. Local/demo mode may exercise the same proposal flow through its existing local callback, but it is not production or hosted authorization evidence.

## Web UX

The desktop Expense register will use `OperationsGrid` for dense scanning, stable columns, sorting, keyboard movement, protected-field indication, and row/detail actions. Existing filters, deep links, correction/payment/source actions, and settlement details remain parent-owned. Mobile and narrow layouts retain the existing card/detail experience rather than forcing dense spreadsheet behavior.

The import panel will reuse the existing Procurement/Projects review grammar: export action, upload-only staging, status summary, per-proposal current-versus-workbook changes, row selection, read-only messaging, explicit confirmation, Apply, errors, and post-Apply refresh.

## Validation boundary

Because the current implementation already supplies the atomic `updated_at` precondition and this design adds no migration, RLS, RPC, trigger, or schema change, Docker/Supabase replay is not required unless implementation reveals a missing database contract. Focused adapter, workbook-panel, grid, Expense-page wiring, financial-authority, and round-trip tests will run first, followed by `npm.cmd run test:affected:agent`, then relevant lint/typecheck/build checks. Database runtime evidence will be added if and only if the final diff crosses the database boundary.

The final documentation update must leave Phase 4 bounded and identify the next unfinished Finance slice rather than claiming all Finance is Excel-native.
