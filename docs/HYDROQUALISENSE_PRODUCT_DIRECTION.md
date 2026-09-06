# HydroQualiSense Product Direction

Status: **ACTIVE PRODUCT DIRECTION — R4 NEXT**  
Repository: `Juvialski/InvoiceApp`  
Architecture: **one deployment -> one client company**  
Canonical production domain: `https://hydroqualisense.com`

## Product position

HydroQualiSense is HydroQualiSense Solutions Corp.'s own operations platform. It is not being planned as a generic Engoryx product for unrelated companies.

The application already contains substantial project, finance, procurement, workforce/payroll, engineering, reporting, assistant, email-intake, document-generation, and audit functionality. The current direction is to make those capabilities fit the client's actual workflows more directly, remove redundant presentation/workflows, and add new client-confirmed domains without sacrificing financial/security/history guarantees.

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

Purchase Orders and Client Invoices now have HydroQualiSense PDF/document-generation support based on the company document profile and the supplied HSC PO visual reference.

## Immediate priority — whole-app simplification

The next product phase is a cross-application redundancy and decluttering pass.

The governing usability rule is:

> **One concept -> one primary place -> one authoritative number.**

This means HydroQualiSense should not retain duplicate modules, duplicate financial summaries, repeated forms, or multiple competing presentations solely because those surfaces accumulated during earlier implementation waves.

Simplification must preserve the underlying audit/history/security contracts. Hiding, grouping, linking, or consolidating a workflow is not permission to delete finalized history or weaken authorization.

### Base-currency reporting

HydroQualiSense's company/base reporting currency is **PHP**.

Foreign-currency transactions/documents remain valid source evidence in their original currency. Where a company-level dashboard, VAT summary, management report, or other aggregate needs a single PHP figure, the conversion must use explicit authoritative FX evidence.

Preserve at least:

- original amount and currency;
- conversion rate;
- conversion/rate date;
- rate source or manual-entry provenance;
- resulting PHP equivalent.

Never relabel a USD amount as PHP, silently add USD and PHP, or invent an exchange rate. Missing conversion evidence should produce an actionable unresolved state rather than a misleading total.

### Project tax treatment

Projects must support an explicit tax-treatment classification:

- `VAT`
- `NON_VAT`

This classification belongs to the project/client-invoice business context. It must not overwrite the independent tax evidence of incoming supplier invoices/Expenses.

Client Invoice creation should inherit the Project tax treatment by default and issued Client Invoices must snapshot the tax treatment used.

Do not infer:

- whether contract value is VAT-inclusive or VAT-exclusive;
- the VAT percentage solely from the project classification;
- withholding rules or other unresolved legal/tax semantics.

Existing projects must not be silently guessed as VAT or Non-VAT; they require explicit confirmation.

### Payroll history usability

VOID payroll periods remain auditable history, but they should not dominate the normal payroll-period experience.

Normal payroll history should focus on usable/current/completed periods. VOID records should be hidden by default or placed in an explicit/collapsed historical view. If no real usable periods exist, the main list should present an honest empty state.

Repeated identical VOID periods must also be investigated for an underlying creation/idempotency defect. Fix the creation path if a defect exists, but do not erase auditable rows merely to make the screen cleaner.

### Cross-app redundancy

The cleanup should specifically evaluate:

- navigation modules and secondary routes;
- project workspace tabs;
- supplier invoice/source-document surfaces after R3;
- Expense/Procurement overlap;
- Project cost cards and Purchase Order commitment cards;
- Client Invoice/collection summaries;
- Dashboard and Reports KPIs;
- duplicate buttons/actions;
- large forms dominated by empty optional fields;
- demo/test/void residue that makes real workspaces look populated when they are not.

Prefer canonical workflows with context links/deep links over duplicate full implementations.

## Warehouse inventory connected to projects

Warehouse inventory remains a confirmed major requirement and follows the cleanup phase unless the client reprioritizes it.

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

A simpler user experience may reuse authoritative sources rather than physically collapsing every table or lifecycle. Preserve meaning and history for:

- projects and project budgets/contract values;
- supplier/vendor and procurement records;
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

## Product-specific architecture

The deployment remains:

`one deployment -> HydroQualiSense company -> active membership/RBAC -> permitted workflows`

Keep company-scoped database controls even though the deployment serves only this company. Single-company deployment is not a reason to weaken RLS, permission checks, company-bound foreign keys, audit boundaries, or server-side credential controls.

## Current implementation sequence

Unless the client explicitly reprioritizes:

1. **R4 — Whole-App Redundancy, Currency, Tax Classification & UX Declutter**
2. **Warehouse Inventory & Project Allocation**
3. later client-confirmed major requirements after explicit planning and safety review.

Older Engoryx future plans remain non-authoritative unless the client reconfirms them.

The authoritative detailed forward plan is `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`.
