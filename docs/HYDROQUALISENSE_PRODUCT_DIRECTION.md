# HydroQualiSense Product Direction

Status: **ACTIVE PRODUCT DIRECTION — R5 HARDENING NEXT**  
Repository: `Juvialski/InvoiceApp`  
Architecture: **one deployment -> one client company**  
Canonical production domain: `https://hydroqualisense.com`

## Product position

HydroQualiSense is HydroQualiSense Solutions Corp.'s own operations platform. It is not being planned as a generic Engoryx product for unrelated companies.

The application already contains substantial project, finance, procurement, workforce/payroll, engineering, reporting, assistant, email-intake, document-generation, and audit functionality. The current direction is to make those capabilities fit the client's actual workflows more directly, remove redundant presentation/workflows, harden cross-module data continuity, and add new client-confirmed domains without sacrificing financial/security/history guarantees.

## Completed direction

### Company-specific identity

- Application name: **HydroQualiSense**.
- Company identity: **HydroQualiSense Solutions Corp.**
- Canonical production domain: `hydroqualisense.com`.
- The official HydroQualiSense logo/company identity is used across the application and financial documents.

### Unified supplier and client invoice workflow

R3 established the primary financial meaning of invoices:

**Supplier / payable side**

- supplier invoices are preserved source evidence;
- verification creates/links an authoritative Expense/payable;
- a linked supplier invoice must not become a second Actual Cost/payable record;
- supplier evidence remains auditable and may retain richer extracted data than the Expense itself.

**Client / receivable side**

- outgoing Client Invoices use the existing project Client Billing/Collections domain as receivables truth;
- issued document snapshots preserve the exact financial/document identity used at issuance;
- collections remain distinct from client invoice issuance and from Cash & Banking reconciliation evidence.

Purchase Orders and Client Invoices have HydroQualiSense PDF/document-generation support based on the company document profile and the supplied HSC PO visual reference.

### Whole-app cleanup, PHP reporting and project tax treatment

R4 established the post-R3 cleanup baseline:

- Expenses surfaces unresolved/legacy supplier-document states without treating those documents as parallel authoritative costs;
- PHP/base reporting requires explicit immutable FX evidence while preserving original currency and excluding unresolved foreign records from PHP aggregates;
- linked supplier Invoice/Expense records share consistent frozen FX evidence for one economic event;
- FX visibility and confirmation follow the relevant source-domain permission boundary;
- Projects support explicit `VAT`, `NON_VAT`, and transitional `UNCLASSIFIED` tax treatment, with issued Client Invoice snapshot preservation;
- VOID Payroll periods remain auditable but are hidden from normal history by default, with duplicate active boundaries guarded;
- Dashboard/Reports/project surfaces received bounded redundancy and empty-state cleanup without deleting mature workflows or history.

Still unresolved by design: VAT rate, VAT-inclusive versus VAT-exclusive contract value, withholding/BIR classification, automatic FX-provider policy, and accounting-period policy beyond existing validated semantics.

## Immediate priority — cross-module integration hardening

The next product phase is **R5 — Cross-Module Integration & Data-Contract Hardening**.

R5 must happen before Warehouse Inventory because the app now has enough mature interconnected domains that adding another major shared-data domain on top of inconsistent master-data or state-propagation contracts would compound risk.

The governing integration rules are:

> **One business entity -> one canonical identity -> every module references it.**

and:

> **One financial concept -> one authoritative source -> every derived surface agrees.**

This is a functional/data-contract hardening phase, not another cosmetic redesign.

### Canonical Vendor contract

A confirmed defect currently illustrates the need for R5:

- supplier names/TINs extracted from invoices can appear in the user-facing Vendor Directory;
- Procurement selectors use canonical records from `public.vendors`;
- therefore a supplier can appear to exist under Vendors but still be unavailable when creating a PO/RFQ/quotation;
- invoice verification may also reach Expense with unresolved canonical `vendor_id` provenance when the extracted supplier was never linked/created as a master Vendor.

The target direction is:

`Supplier evidence -> human-confirmed Vendor resolution -> canonical vendor_id -> Expense / Procurement / Email Intake / Vendor Directory`

Invoice-extracted supplier identity remains source evidence. It must not silently become authoritative master data merely because an AI extraction produced a name.

Existing historical supplier evidence without canonical Vendor links requires a safe reconciliation workflow. Exact authoritative matches can be proposed/linkable; ambiguous or conflicting identities must require human resolution.

### Cross-module continuity

R5 should trace and harden complete workflows rather than isolated pages:

- `Email/Upload -> Source Document -> Supplier Invoice -> Vendor -> Expense -> PO/Project -> Cash settlement`;
- `Vendor -> RFQ -> Supplier Quotation -> PO -> Receipt -> Supplier Invoice -> Expense`;
- `Expense/Payroll/PO -> Project Actual/Committed Cost -> Dashboard/Reports`;
- `Project -> Client Invoice -> issued PDF/snapshot -> Collection -> Cash reconciliation`.

For each workflow, creation/edit/link/void/reversal must propagate to every dependent selector, summary, detail page and report without requiring a logout or hard reload.

### Supplier-document and Client-Invoice discoverability

Removing the old ambiguous generic Invoice branch must not make valid history inaccessible.

HydroQualiSense needs clear discoverability for both meanings:

- **Supplier Documents**: incoming supplier invoice/source history remains accessible from the Expenses/supplier workflow, with source details, review history and Expense/PO provenance;
- **Client Invoices**: outgoing invoices remain backed by Client Billing/Collections, with a discoverable cross-project directory in addition to project-context views so users can create/find/open prior invoices, generate/download/send documents and reach payment/collection history.

Do not recreate a generic third invoice ledger.

### Master-data and state propagation

R5 should audit canonical identity and state continuity for shared entities including:

- Vendors;
- Projects;
- Workers;
- Financial Accounts;
- Project Cost Codes;
- client/billing contacts where represented;
- other shared selectors discovered during implementation.

Derived summaries can enrich master records but must not impersonate them.

A successful DB mutation whose dependent dropdown/list/card remains stale is an integration defect.

### Lifecycle, RBAC and concurrency

R5 must verify end-to-end lifecycle semantics and authorization parity across UI/service/RPC/RLS boundaries.

Preserve:

- supplier invoice evidence versus authoritative Expense ownership;
- PO commitment versus Actual Cost;
- Client Invoice versus Collection versus Cash reconciliation;
- immutable issued document snapshots;
- Payroll approved/paid/void history;
- company-bound RLS and permission checks;
- idempotency/locking for retry- or concurrency-sensitive operations.

Do not weaken RLS because this is a single-company deployment.

### Hardening execution strategy

Astra is optional, not required. If Astra allowance is insufficient, R5 should proceed with Luna Max as lead and bounded Luna subagents under the current pre-demo execution policy.

If Astra becomes available later, use it as a dedicated audit/review pass rather than making it a prerequisite for implementation.

## Warehouse inventory connected to projects

Warehouse inventory remains a confirmed major requirement and follows R5 unless the client reprioritizes it.

HydroQualiSense must ultimately answer:

- What materials/items are currently in the warehouse?
- What quantity is actually available?
- What entered or left stock, when, why, and by whom?
- What stock has been allocated, issued, returned, or otherwise associated with each project?
- What inventory remains after project allocations/issues?
- How does warehouse activity relate to procurement/delivery records without duplicating stock or cost truth?

Inventory must be auditable. Project allocation must not be represented by destructive edits to stock balances; balances should be explainable from authoritative movements or an equally rigorous source model.

Detailed warehouse rules remain pending client clarification.

## Existing foundation to preserve

A simpler and more integrated user experience may reuse authoritative sources rather than physically collapsing every table or lifecycle. Preserve meaning and history for:

- projects and project budgets/contract values;
- canonical supplier/vendor and procurement records;
- purchase orders and delivery/receipt evidence;
- supplier invoice source documents;
- authoritative Expenses/payables;
- project cost allocations;
- Client Invoices, collections and receivables history;
- Cash & Banking settlement/reconciliation evidence;
- payroll history and allocations;
- engineering/document history;
- Daily Site Logs and field evidence;
- immutable issued financial documents;
- RBAC, RLS, membership checks, audit records, and company-bound validation.

## Permanent financial/product principles

1. **No double counting.** One economic event must not become duplicate cost/payable/collection truth.
2. **Actual Cost and Committed Cost remain distinct.** Purchase Orders are commitments until downstream lifecycle rules create actual cost.
3. **Client receivables remain distinct from supplier obligations and project cost.**
4. **Payment/settlement evidence does not silently create a new cost or collection event.**
5. **Historical records stay auditable.** Finalized, verified, paid, collected, voided, reversed, issued, or otherwise consequential records are not silently rewritten or erased.
6. **Project allocation stays traceable.**
7. **Original currency stays explicit.** Base-currency reporting requires explicit conversion evidence; no invented FX.
8. **Tax treatment stays explicit.** Project VAT/Non-VAT classification must be authoritative and snapshotted where it affects issued Client Invoices.
9. **Presentation cleanup is not authorization cleanup.** RLS and permission boundaries remain authoritative.
10. **Imported/AI-extracted identity is evidence, not automatically master data.** Canonical shared entities require safe link/create semantics.
11. **Dependent modules must converge after canonical mutations.** Stale parallel state is a hardening defect, not expected behavior.

## Product-specific architecture

The deployment remains:

`one deployment -> HydroQualiSense company -> active membership/RBAC -> permitted workflows`

Keep company-scoped database controls even though the deployment serves only this company. Single-company deployment is not a reason to weaken RLS, permission checks, company-bound foreign keys, audit boundaries, or server-side credential controls.

## Current implementation sequence

Unless the client explicitly reprioritizes:

1. **R5 — Cross-Module Integration & Data-Contract Hardening**
2. **Warehouse Inventory & Project Allocation**
3. later client-confirmed major requirements after explicit planning and safety review.

Older Engoryx future plans remain non-authoritative unless the client reconfirms them.

The authoritative detailed forward plan is `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`.
