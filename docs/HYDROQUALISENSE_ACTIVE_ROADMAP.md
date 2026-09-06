# HydroQualiSense Active Roadmap

Status: **ACTIVE — R4 NEXT**  
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

## NEXT PHASE — R4 Whole-App Redundancy, Currency, Tax Classification & UX Declutter

Implementation priority: **NEXT**

R4 is a deliberate whole-application cleanup pass after the R3 financial consolidation and before warehouse inventory implementation.

Core product rule:

> **One concept -> one primary place -> one authoritative number.**

R4 must audit the whole application for duplicate workflows, duplicate calculations, redundant cards/tabs, excessive empty fields, stale terminology, misleading history, and repeated information that survived earlier Engoryx-era implementation waves.

This is not permission to delete or rewrite auditable history. Simplify presentation and workflow ownership while preserving authoritative records, lifecycle states, permissions, RLS, and correction history.

### R4.1 — Semantic redundancy audit

Audit every major user-facing domain and trace displayed values back to their source of truth.

For each repeated concept determine:

- which location is canonical;
- which source is authoritative;
- whether another card/page/tab is merely repeating the same fact;
- whether a secondary surface should become a shortcut/deep link instead of a second full workflow;
- whether old Invoice-era labels or calculations remain after R3.

Priority domains:

- Dashboard;
- Cash & Banking;
- Expenses and supplier source documents;
- Email Intake;
- Projects;
- Procurement/Purchase Orders;
- Payroll;
- Reports;
- Settings;
- project workspaces and their tabs/cards.

Do not merge distinct financial concepts merely because their numbers happen to be similar. Actual Cost, Committed Cost, Client Invoices/Receivables, Collections, and Cash settlement remain distinct.

### R4.2 — PHP base reporting and explicit foreign-currency conversion

HydroQualiSense operates with **PHP as its company/base reporting currency**.

Foreign-currency source transactions must preserve their original economic evidence:

- original amount;
- original currency;
- transaction/document date;
- explicit FX rate used for reporting;
- FX rate date;
- FX rate source or manual-entry provenance;
- resulting PHP/base-currency equivalent.

Company-level dashboards, VAT summaries, management totals and other reports that are intended to show one company-wide total should use the authoritative PHP/base equivalent rather than visually combining unrelated currencies.

Important invariants:

- **never relabel USD amounts as PHP**;
- **never silently sum mixed currencies**;
- **never invent an exchange rate**;
- if a foreign-currency record lacks an authoritative conversion rate, show an actionable `FX rate required` / equivalent state and exclude it from PHP aggregate totals until resolved;
- historical conversion snapshots must not change merely because a later exchange rate changes;
- original-currency detail remains visible for audit/reconciliation.

The current example where a USD invoice and PHP VAT/reporting amounts appear side-by-side without a coherent conversion basis is specifically in scope.

The implementation design must inspect existing currency/settings/reporting contracts before deciding whether FX data belongs on the source record, a reusable rate table, or both. Any new FX source must have explicit provenance and deterministic snapshot semantics.

### R4.3 — Project VAT / Non-VAT classification

Projects must be explicitly classifiable by tax treatment:

- `VAT`
- `NON_VAT`

This is a first-class **project business classification**, not an inferred property from a supplier invoice.

Required behavior:

- new projects must choose a tax treatment;
- existing projects must not be silently guessed; they should require explicit confirmation before the classification is treated as authoritative;
- project lists/details should show the classification compactly where useful;
- Client Invoice creation should inherit the project tax treatment as its default tax context;
- an issued Client Invoice must snapshot the tax treatment used so later Project edits cannot rewrite historical invoice meaning;
- Non-VAT projects should not show irrelevant VAT UI or automatically add VAT;
- VAT projects may expose the relevant validated VAT invoice fields/calculations;
- supplier invoice/Expense tax characteristics remain independent evidence and must not be overwritten by the project's outgoing billing classification.

Still **TBD / do not infer**:

- whether `projects.contract_value` is VAT-inclusive or VAT-exclusive;
- the applicable VAT percentage/rate solely from this classification;
- withholding treatment;
- BIR/legal document classification beyond already validated application semantics.

R4 should create the classification and propagation/snapshot contract without inventing those unanswered tax rules.

### R4.4 — Payroll period history declutter

VOID payroll periods are auditable history but must not dominate the normal payroll-period screen.

Desired behavior:

- active/current/completed usable periods are the default history view;
- VOID periods are hidden by default or grouped in a collapsed **Voided history** section;
- provide an explicit `Include voided` / history filter for authorized users;
- do not delete VOID periods merely to declutter the screen;
- if no real usable payroll period has been generated yet, the normal period list should look empty rather than appearing populated by repeated VOID/test/correction history;
- preserve all lifecycle and audit protections for approved/paid/void payroll records.

Also investigate why repeated identical VOID period rows were created. If the repetition reflects a real creation/idempotency defect rather than valid history, fix the creation path and add regression coverage. Do not erase existing auditable rows merely to hide the symptom.

### R4.5 — Navigation and workflow consolidation

Reduce feature redundancy across the shell and project workspaces.

Examples of the target direction:

- supplier invoice/source evidence belongs under Expenses/Procurement rather than reappearing as a competing financial module;
- project cost surfaces should emphasize **Actual Expenses/Actual Cost** and **Committed Purchase Orders** rather than promoting verified supplier invoices as a separate cost category after R3;
- Client Invoices remain receivable-side and should not be mixed into supplier/project Actual Cost presentation;
- secondary project tabs that only duplicate a canonical module should become context links, summaries, or shortcuts where appropriate;
- Vendor, supplier-document and PO evidence should remain reachable without recreating duplicate workflows.

Do not remove a mature capability solely to make the sidebar shorter. Consolidation requires dependency/history/permission review.

### R4.6 — Dashboard and Reports declutter

Audit KPI cards, summaries and reports for repeated or misleading facts.

Prefer:

- fewer high-value metrics;
- clear source semantics;
- drill-down to the canonical workflow;
- PHP/base reporting totals only when conversion is authoritative;
- foreign-currency exceptions surfaced separately;
- zero-value/empty sections hidden when they add no decision value.

Preserve detailed reporting where users genuinely need it; decluttering is not removal of audit evidence.

### R4.7 — Forms and detail-page progressive disclosure

Apply the R3 supplier-review principle more broadly:

- optional + empty fields should normally not consume permanent screen space;
- required-but-missing data should appear as an actionable exception;
- full optional fields remain available through Edit/More Details when legitimate correction is needed;
- avoid giant forms where most inputs are blank;
- group related actions and remove duplicate buttons that lead to the same result.

### R4.8 — Demo/sample residue and empty-state truth

Separate demonstration richness from real-workspace truth.

- Demo mode may retain representative data needed for the Thursday presentation.
- A real company workspace should not look operationally populated because of sample/test/void residue.
- Empty states should reflect actual authoritative records.
- Do not delete legitimate production/audit data merely because it makes a screen busy.

### R4 validation expectations

R4 may include both UI-only and DB-affecting work.

Use focused -> affected validation throughout. If R4 introduces or changes:

- project tax-treatment schema;
- FX conversion/rate schema;
- financial reporting contracts;
- payroll period lifecycle/idempotency DB guards;
- RLS/RPC/trigger behavior;

then real Docker/local Supabase validation is required, including clean replay, pgTAP, migration tests, upgrade-path tests, and relevant runtime/concurrency checks.

Do not run the historical full suite merely because R4 is broad; use it only when affected analysis falls back or a concrete shared-contract reason justifies it.

## R2 — Warehouse inventory and project allocation

Implementation priority: **AFTER R4 unless the client reprioritizes it**

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
12. Inventory stock must ultimately be explainable from authoritative movements or an equally rigorous source model.

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

1. **R4 — Whole-App Redundancy, Currency, Tax Classification & UX Declutter**
2. **R2 — Warehouse inventory and project allocation**
3. later client-confirmed major requirements after explicit planning and safety review.

Do not start Inventory while R4 is still the active next phase unless the user explicitly changes priority.
