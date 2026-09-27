# HydroQualiSense Operations Workbook — WB-CERT

- Status: **WB-CERT implementation and local certification complete for the recorded scope; PR #271 open**
- Synchronized base `main`: `32d30f15e8ed89c3dcca0e2249e05a0e21220b3a`
- Implementation source commit: `b566795c96cf701d77a51150c95292f5cd24f6ef`
- Branch: `codex/wb-cert-round-trip-certification`
- Pull request: [#271](https://github.com/Juvialski/InvoiceApp/pull/271)

## Certified boundary

WB-CERT covers the existing Operations Workbook workflow:

`export -> edit -> import review -> domain Apply -> authoritative refresh`

The five production in-app editing sheets remain Projects, Cost Codes, Direct
Expenses, RFQs, and Purchase Orders. The combined XLSX retains its existing
eight-sheet contract in deterministic order:

1. Projects
2. Cost Codes
3. Expenses
4. Supplier Payables, only when `invoices.read` is present
5. RFQs
6. RFQ Lines
7. Purchase Orders
8. PO Lines
9. Hidden `_HydroQualiSense` synchronization and contract metadata

The combined workbook composes the existing Projects, Expenses/Supplier
Payables, and Procurement standalone schemas and review/Apply paths. It adds no
domain sheet, permission, persistence authority, or workbook-wide transaction.
No Supplier Invoice in-app sheet or line editor was added. RFQ/PO lines,
Supplier Payable evidence, lifecycle transitions, and history remain owned by
their current domain workflows.

## Defects corrected

- Formula-like business strings were being prefixed with an apostrophe while
  the combined review adapter delegated data back through a standalone export.
  Export now retains their exact string values as typed string cells; import
  still rejects actual formula cells, macros, and external links.
- Projects app-only edits are classified from workbook-versus-exported values,
  so they remain distinguishable from workbook proposals and stale conflicts.
- A saved Expense whose current values already match the imported workbook no
  longer returns as a stale conflict after authoritative refresh.
- Partial sequential Apply now refreshes the failed domain and removes
  no-longer-applicable proposal IDs from the retry selection. If the refresh
  fails, the review closes so stale selections cannot be reused.
- Combined reviews are bound to a company/access/demo context generation and
  disappear synchronously when that context changes. Callback guards stop
  later writes if the context changes during a multi-record Apply.
- Unchanged rows remain inspectable under collapsed per-domain summaries, so
  changed, protected, conflicted, and application-only proposals stay visible
  without expanding every unchanged record by default.

## Authorization and authority evidence

- `projects.read`, `expenses.read`, and `procurement.read` independently gate
  their own export and review rows. Manage-only and `procurement.approve`-only
  exports contain no domain rows; write permission never substitutes for read.
- `invoices.read` independently gates Supplier Payables and linked invoice
  values. Without it, Supplier Payables are omitted and invoice references and
  synchronization identities are withheld from Expense export/review.
- Company identity, read/write permissions, and demo/production scope invalidate
  prior review state. Tests revoke permissions after review and attempt to apply
  company-A proposals in company B; no unauthorized callback runs.
- Workbook edits remain proposals until explicit per-domain confirmation.
  Apply refreshes and revalidates with the current domain state. Omitted rows are
  preserved; changed projects retain per-project groups; Expenses and
  Procurement remain sequential; retries use refreshed state.
- Protected lifecycle, source, calculated, settlement, identity, and history
  fields remain non-applicable. RFQ/PO header saves preserve line and
  invitation identity and history.

## Validation

| Evidence | Result |
| --- | --- |
| Focused combined, parser, transfer, Projects, Expenses, and Procurement tests | **47/47 passed** |
| `npm.cmd run test:affected:agent` | **560 passed, 0 failed, 0 skipped** across **84/394 selected files (21.3%)**; no selector fallback |
| `npm.cmd run lint` and typecheck | Passed |
| `npm.cmd run build` | Passed; existing Inter font, large-chunk, and CommonJS `import.meta` warnings remain |
| Local Supabase pgTAP: `41_excel_project_concurrency`, `45_wb3c_header_only_procurement_saves`, `46_wb_cert_expense_company_version_guard` | **52/52 passed** |
| Local synthetic Operations Workbook Demo QA | **16/16 scenarios passed** at desktop, constrained laptop, tablet, and phone; the combined round trip runs inside the four existing workbook layout scenarios; zero horizontal page overflow, console errors, page errors, or failed requests |
| Manually inspected WB-CERT captures | Desktop, constrained laptop, and phone captures inspected at source SHA `44e26302c80c9f6153d0b32be0a1f488055f14ea`; see [visual evidence](evidence/wb-cert/manifest.json) |

The real local database tests prove project grouped optimistic concurrency,
RFQ/PO expected-version and draft guards, RFQ line/invitation and PO line
preservation, plus company-scoped and stale-version Expense updates. No SQL
authority or migration was changed, so a clean migration replay and full pgTAP
corpus were not run for WB-CERT.

The browser evidence is local synthetic Demo Workspace evidence. It is not
authenticated-company, hosted QA, provider, production, or release
certification. The demo correctly keeps Apply disabled. No QA database promotion
or production write was performed.

## TypeSafe/Jev diagnostics

- One bounded `agent:context` packet found no Workflow Map match and fell back
  to deterministic navigation context.
- Start/context preflight: zero candidates, zero live requests, fallback due
  `no-candidates`.
- Test triage: Jev `jev-1.13.0` retained all **84/84** deterministic required
  tests in two chunks (**46 + 38**); **10,971 input tokens**, **1,248 output
  tokens**, **1,088 ms total latency**, no fallback. Recommendations did not
  remove required tests.

## Intentional limitations

No production workbook domain was added. Supplier Invoices, Materials,
Equipment, Warehouse, Vendors, Payroll, Client Billing, quotation selection,
inventory movement, and lifecycle/approval/receiving/settlement actions remain
outside the supported workbook. WB-3D+ remains deferred. No hosted or
authenticated production certification is claimed.
