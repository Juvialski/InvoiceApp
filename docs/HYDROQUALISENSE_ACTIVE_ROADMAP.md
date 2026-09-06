# HydroQualiSense Active Roadmap

Status: **ACTIVE — R5 HARDENING NEXT**  
Repository: `Juvialski/InvoiceApp`  
Date reset: **2026-09-05**  
Last updated: **2026-09-06**  
Product direction: `docs/HYDROQUALISENSE_PRODUCT_DIRECTION.md`

This file is the authoritative product roadmap.

## Roadmap reset

The previous Engoryx future roadmap is no longer active. Completed functionality remains valid implementation history, but **all previously planned, deferred, or future product waves are cancelled as roadmap authority unless the client explicitly reconfirms them**.

Do not start a new feature phase from an older roadmap, phase document, prompt, or historical plan.

## Product identity

The application is exclusively the internal platform for **HydroQualiSense Solutions Corp.** and is named **HydroQualiSense**.

Canonical public domain:

`https://hydroqualisense.com`

The repository may remain named `InvoiceApp`; repository naming is not product branding.

## Completed current phases

### R1 — HydroQualiSense branding and domain alignment

Implementation status: **COMPLETE — 2026-09-06**

HydroQualiSense is the active application identity and `hydroqualisense.com` is the canonical production domain. The supplied company logo and full company name are the authoritative visual/company identity.

### R3 — Unified supplier invoice, Expense, Purchase Order and Client Invoice workflow

Implementation status: **COMPLETE — merged in PR #93 on 2026-09-06**

Implemented source-of-truth direction:

- incoming supplier invoices are preserved source evidence;
- verification creates/links one authoritative Expense/payable record;
- linked supplier invoices no longer create a second Actual Cost or payable truth;
- legacy unlinked verified invoices retain bounded fallback semantics so historical cost does not disappear;
- supplier invoice review is exception-driven and decluttered, with optional/empty details hidden from normal review and available through Edit Details / expanded evidence;
- the generic top-level Invoice branch is removed from normal navigation and supplier-document workflows live with Expenses/Email Intake/Procurement;
- outgoing client invoices reuse the existing Client Billing/Collections financial domain as the authoritative receivables model;
- Purchase Orders and Client Invoices support HydroQualiSense document preview/PDF generation and immutable issued-document snapshots;
- the company document profile centralizes HydroQualiSense letterhead data;
- Gmail sending is confirmation-gated and send audit history is implemented.

Known validation limitation carried forward: a real live Gmail send still requires a connected Google account with the required OAuth consent and was not exercised in PR #93 CI/local validation.

### R4 — Whole-App Redundancy, Currency, Tax Classification & UX Declutter

Implementation status: **COMPLETE — merged in PR #94 on 2026-09-06**

R4 established the cleanup and reporting baseline required before deeper integration hardening:

- the Expenses workspace exposes supplier documents as explicit Needs Review, Verified / Link Required, and Linked Expense states while keeping Expense as the authoritative payable/Actual Cost source;
- linking legacy verified supplier invoices remains explicit, idempotent, provenance-preserving, and does not change economic project Actual Cost merely because ownership transfers to Expense;
- PHP/base reporting uses immutable transaction-level FX snapshots while preserving original amount/currency and explicit rate/date/provenance;
- unresolved foreign-currency records are excluded from PHP aggregates rather than being relabelled or silently mixed;
- review hardening scopes FX snapshot visibility to the actual source domain and requires source-read authority as well as settings-management authority to confirm FX;
- a linked supplier Invoice and authoritative Expense share the same frozen FX evidence transactionally, preventing the same economic event from requiring contradictory or duplicate conversion confirmation for supplier-tax/reporting views;
- Projects carry explicit `VAT`, `NON_VAT`, or transitional `UNCLASSIFIED` treatment; new/edited projects require confirmation, Client Invoice drafts inherit project context, and issued documents snapshot the treatment without inventing VAT rate or inclusive/exclusive semantics;
- Payroll period screens hide VOID history by default while retaining audit access, and duplicate active date boundaries are guarded without deleting historical VOID rows;
- Dashboard/Reports/project surfaces received bounded decluttering and source/currency boundary cleanup without deleting mature workflows or auditable history.

PR #94 exact-head review additionally hardened FX RLS/source scope and linked supplier Invoice/Expense conversion continuity. Exact-head Application Validation, Database Migration & Invariant Tests (clean replay, pgTAP, upgrade-path suite), Workflow Map Consistency, and Demo Visual QA were green before merge.

Still intentionally unresolved: VAT rate, VAT-inclusive versus VAT-exclusive contract values, withholding/BIR classification, automatic FX provider policy, and accounting-period policy beyond existing validated semantics.

Core product rule carried forward:

> **One concept -> one primary place -> one authoritative number.**

## NEXT PHASE — R5 Cross-Module Integration & Data-Contract Hardening

Implementation priority: **NEXT — before Warehouse Inventory**

R5 is a deep functional hardening pass. Its purpose is not another cosmetic cleanup. It must prove that entities created or resolved in one HydroQualiSense domain are the same canonical entities consumed by every dependent domain, that mutations propagate without stale/parallel state, and that lifecycle/RBAC/RLS/financial contracts remain consistent end to end.

Governing integration rule:

> **One business entity -> one canonical identity -> every module references it.**

R5 should use the current green R4 `main` as its trusted baseline and focus on concrete cross-module continuity. Do not start Inventory until this baseline is hardened.

### R5.1 — Canonical Vendor master and supplier resolution

A known integration defect is already confirmed and must be addressed first:

- the current user-facing Vendor Directory can derive/display supplier summaries from invoice contents;
- Procurement vendor selectors consume canonical `public.vendors` records;
- therefore a supplier may visibly appear under Vendors but still be unavailable for a Purchase Order/RFQ/quotation because no canonical Vendor row exists;
- supplier invoice persistence currently attempts to find an existing vendor but can leave `vendor_id` unresolved when the extracted supplier is new;
- a linked Expense can therefore also lack canonical Vendor provenance.

Target contract:

`Supplier evidence -> human-confirmed Vendor resolution -> canonical vendor_id -> Expense / PO / RFQ / Quotation / Subcontract / Email Intake / Vendor Directory`

Required hardening:

- treat `public.vendors` as the canonical supplier master;
- invoice-extracted supplier text remains immutable/source evidence and must not itself become a competing master record;
- exact TIN/master matches may link safely under the existing authorization model;
- clearly new suppliers require explicit human-confirmed Vendor creation rather than silent AI-driven master-data creation;
- ambiguous/conflicting identities must remain unresolved until a user resolves them;
- normalization/TIN matching must not merge suppliers with conflicting authoritative identifiers;
- after Vendor creation/linking, dependent selectors and summaries must refresh without logout/hard reload;
- existing historical supplier invoices without `vendor_id` need a safe reconciliation workflow that preserves source history.

The Vendor Directory should ultimately display canonical vendors enriched by supplier activity, with unresolved supplier identities presented separately rather than masquerading as master vendors.

### R5.2 — Supplier Invoice / Expense / Procurement continuity

Trace and harden the complete chain:

`Email/Upload -> Source Document -> Supplier Invoice -> Vendor -> Expense -> PO match -> Project/Cost Code -> Cash settlement`

And procurement-first:

`Vendor -> RFQ -> Supplier Quotation -> PO -> Receipt -> Supplier Invoice -> Expense`

Verify at minimum:

- one supplier invoice can create/link only one non-void authoritative Expense;
- Vendor, PO, Project, and Cost Code provenance survives the transition;
- supplier invoice evidence remains reachable after linking;
- PO remains Committed Cost rather than becoming duplicate Actual Cost;
- project Actual Cost does not jump merely because legacy invoice fallback transfers to Expense ownership;
- cash settlement attaches to the authoritative payable path and does not recreate supplier-invoice payable truth;
- retried/double/concurrent actions remain idempotent.

### R5.3 — Invoice and financial-document discoverability

R3 removed the ambiguous generic top-level Invoice business branch, but mature history and document-generation workflows must remain discoverable.

Harden navigation so users can clearly reach both meanings without recreating a competing generic Invoice ledger:

**Supplier Documents**

- preserved incoming supplier invoice history should have an obvious canonical entry point under the Expenses/supplier workflow;
- users must be able to open previous supplier invoice source details, review history, linkage/provenance, and associated Expense/PO where authorized.

**Client Invoices**

- existing Project -> Client Invoices remains the project-context workflow;
- provide or confirm a discoverable global Client Invoices directory across projects where users can find/create/open prior outgoing invoices, preview/download/send issued PDFs, inspect lifecycle/history, and navigate to collections/payments;
- reuse the existing `client_billings` / Client Collections source of truth; do not create a second outgoing-invoice model.

### R5.4 — Master-data continuity audit

Trace canonical identity and downstream consumption for:

- Vendor;
- Project;
- Worker;
- Financial Account;
- Project Cost Code;
- client/billing contact where represented;
- other shared selectors discovered during the audit.

For each, verify:

1. canonical table/model and ID;
2. company-bound uniqueness/integrity;
3. normalization where applicable;
4. create-vs-link behavior;
5. duplicate handling;
6. selector/list/detail consistency;
7. immediate state propagation after create/edit/archive/restore;
8. historical snapshot behavior where later master edits must not rewrite issued/finalized history.

Derived display summaries must not pretend to be master records.

### R5.5 — State propagation and cache/refresh hardening

For consequential mutations, verify that both database truth and the currently mounted UI converge without requiring a hard reload.

Audit:

- React state updates;
- workspace refresh groups/caches;
- dropdown/select data;
- counters/KPIs;
- project summaries;
- linked detail panels;
- route/deep-link resolution;
- demo/local behavior versus Supabase behavior.

A mutation succeeding in the DB while a dependent selector/page remains stale is a hardening defect.

### R5.6 — Lifecycle / history continuity

Trace representative records through:

`Create -> Edit -> Approve/Verify -> Issue -> Pay/Collect -> Void/Cancel/Reverse -> Restore/Reopen where allowed`

Dependent modules must interpret lifecycle consistently.

Preserve:

- immutable issued PO/Client Invoice snapshots;
- verified supplier source history;
- authoritative Expense lifecycle;
- Collection versus Cash reconciliation separation;
- Payroll approved/paid/void history;
- auditable correction/reversal paths.

Do not solve presentation inconsistencies by erasing history.

### R5.7 — RBAC / RLS / RPC parity

For each cross-module action, verify the full authorization chain:

`UI permission -> application/service boundary -> RPC/server check -> RLS/company-bound FK`

Look specifically for:

- one module loading a shared entity more broadly than another;
- overly broad derived summaries exposing source-detail information;
- overly narrow permission composition that breaks legitimate canonical linking;
- direct table writes bypassing an intended guarded RPC;
- SECURITY DEFINER scope/search-path problems;
- missing company-bound validation.

Single-company deployment is not permission to weaken RLS.

### R5.8 — Database integrity / retries / concurrency

Audit important cross-module operations for:

- double-click duplicate creation;
- retries;
- concurrent verification/linking;
- duplicate Vendor creation;
- PO matching races;
- stale optimistic updates;
- repeated lifecycle transitions;
- Payroll period duplication;
- other operations found during the hardening audit.

Prefer database constraints/locking/idempotent RPCs for invariants that must survive concurrent clients. UI-only disabling is not sufficient for financial/master-data integrity.

### R5.9 — End-to-end acceptance flows

R5 should finish with a compact but serious integration matrix proving at least:

1. **Supplier path:** upload/email supplier document -> resolve/create Vendor -> verify -> Expense -> optional PO/project provenance -> settlement context.
2. **Procurement path:** canonical Vendor -> RFQ/Quotation -> PO -> Receipt -> supplier invoice match -> authoritative Expense.
3. **Client revenue path:** Project -> Client Invoice -> issued snapshot/PDF -> Collection -> Cash reconciliation evidence.
4. **Project cost path:** Expense + committed PO + Payroll allocations produce the expected distinct Actual/Committed cost semantics.
5. **Master-data propagation:** create/edit a canonical Vendor/Project/other shared entity and confirm dependent selectors/summaries update without hard reload.
6. **Lifecycle/history:** void/cancel/reverse representative records and verify dependent screens preserve history while excluding them from active truth as appropriate.
7. **RBAC:** representative restricted roles cannot gain cross-domain detail merely because a summary or shared entity is visible.

For DB-affecting fixes use real Docker/local Supabase validation including clean replay, pgTAP, migration tests, upgrade-path tests, and relevant runtime/concurrency checks. Static SQL/string tests are not sufficient.

### R5 execution strategy

Astra is **not required** for R5. If the user's Astra allowance is unavailable, proceed with Luna Max as lead plus bounded Luna subagents under the current pre-demo policy.

Astra may be used later, when allowance permits, as a dedicated audit/review pass; it must not be treated as a prerequisite to establishing a hardened baseline.

Keep the lead responsible for architecture, source-of-truth decisions, migrations/RLS/RPCs, shared integration, final diff review, and validation.

## R2 — Warehouse inventory and project allocation

Implementation priority: **AFTER R5 unless the client reprioritizes it**

The client operates its own warehouse and requires a real inventory capability.

Confirmed business need:

- know current warehouse inventory;
- track stock changes with traceable history;
- allocate or issue inventory to specific projects;
- make project-level material allocation/usage visible without losing warehouse stock truth.

The implementation design should expect concepts such as an item/material catalog, units of measure, stock-on-hand, stock movements, project allocations/issues, returns or corrections, and auditable inventory history. Exact workflow details are still pending client clarification.

Do **not** prematurely decide:

- single vs multiple warehouses/locations;
- valuation/costing method;
- reservation vs physical issue semantics;
- approval thresholds;
- serial/batch/lot tracking;
- reorder/minimum-stock rules;
- purchase-receipt automation;
- barcode/QR requirements;
- adjustment authority and reason codes.

## Permanent architecture and safety invariants

1. `one deployment -> one client company -> active membership/RBAC -> permitted workflows` remains authoritative.
2. Keep `company_id`, company-scoped RLS, permission checks, and company-bound integrity as defense in depth.
3. Preserve auditable financial, payroll, procurement, project, engineering, inventory, and document history.
4. Keep project financial concepts source-based; do not invent competing totals.
5. Supplier invoice evidence linked to an Expense must not create duplicate Actual Cost/payable truth.
6. Committed Purchase Orders remain distinct from Actual Cost.
7. Client Invoices/Collections remain distinct from supplier obligations and project Actual Cost.
8. Preserve original transaction currency. Do not silently aggregate mixed currencies or invent FX; base-currency reporting requires explicit authoritative conversion evidence.
9. Feature/navigation simplification is not authorization simplification.
10. VOID/finalized/auditable history may be hidden or grouped for usability but must not be silently erased.
11. Consequential AI-assisted mutations remain prepare/validate/human-confirm/execute operations.
12. Canonical master data must not be silently created from unverified AI/import evidence when identity is ambiguous.
13. Inventory stock must ultimately be explainable from authoritative movements or an equally rigorous source model.

## Explicit hold on previous future plans

The following are **not currently authorized merely because older documents mention them**:

- Scheduling / Gantt / CPM;
- transmittals or as-built expansion;
- additional generic engineering-platform expansion;
- old infrastructure follow-up waves that are not required for current safety/operations;
- manufacturing/MRP expansion beyond the warehouse inventory need confirmed above;
- broad autonomous AI posting;
- any other previously deferred or future Engoryx phase.

They may return only if the client requirements justify them.

## Current implementation sequence

Unless the client reprioritizes:

1. **R5 — Cross-Module Integration & Data-Contract Hardening**
2. **R2 — Warehouse inventory and project allocation**
3. later client-confirmed major requirements after explicit planning and safety review.

Do not start Inventory while R5 is still the active next phase unless the user explicitly changes priority.
