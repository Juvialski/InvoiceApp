# HydroQualiSense Active Roadmap

Status: **REQUIREMENTS RESET / ACTIVE INTAKE**  
Repository: `Juvialski/InvoiceApp`  
Date reset: **2026-09-05**  
Product direction: `docs/HYDROQUALISENSE_PRODUCT_DIRECTION.md`

This file is the authoritative product roadmap.

## Roadmap reset

The previous Engoryx future roadmap is no longer active. Completed functionality remains valid implementation history, but **all previously planned, deferred, or future product waves are cancelled as roadmap authority unless the client explicitly reconfirms them**.

Do not start a new feature phase from an older roadmap, phase document, prompt, or historical plan. New implementation sequencing will be created only after the current client requirements are collected.

## Product identity

The application is now exclusively the internal platform for the client company and is named **HydroQualiSense**.

Canonical public domain:

`https://hydroqualisense.com`

The product must no longer be positioned as a reusable Engoryx-branded platform for unrelated engineering companies. The repository may remain named `InvoiceApp`; repository naming is not product branding.

Active user-facing UI and production metadata now use **HydroQualiSense**. Historical documentation and stable technical identifiers may still retain legacy strings where renaming would create unnecessary migration, protocol, storage, or generated-theme churn.

## Confirmed next requirements

Only the following new directions are currently confirmed.

### R1 — HydroQualiSense branding and domain alignment

Implementation status: **COMPLETE — 2026-09-06**

Target outcome:

- remove Engoryx product branding from the application;
- use HydroQualiSense as the application name;
- treat `hydroqualisense.com` as the canonical production domain;
- align visible application identity, metadata, generated/exported product references, and user-facing assistant/product labels when implementation begins.

The supplied HydroQualiSense logo and company name are used for R1. No additional slogan, color-system redesign, email identity, or deployment-redirect behavior is implied by this phase.

### R2 — Warehouse inventory and project allocation

The client operates its own warehouse and requires a real inventory capability.

Confirmed business need:

- know current warehouse inventory;
- track stock changes with traceable history;
- allocate or issue inventory to specific projects;
- make project-level material allocation/usage visible without losing warehouse stock truth.

The implementation design should expect concepts such as an item/material catalog, units of measure, stock-on-hand, stock movements, project allocations/issues, returns or corrections, and auditable inventory history. However, exact workflow details are pending client clarification.

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

These will be specified after further client requirements are received.

### R3 — Invoice workflow simplification

The client does not want invoices to behave as an isolated top-level business branch.

Target direction:

- supplier/company-paid invoice activity should be connected directly to the relevant **expense/payable** workflow;
- invoices issued to clients and their payment/collection state should live directly in the **client billing/receivables** workflow;
- the user experience should avoid forcing users through a separate generic invoice branch when the business meaning is already expense-side or client-side.

This is currently a **workflow/domain simplification requirement**, not permission to rewrite financial truth casually.

Until the client provides more detail:

- preserve verified source documents and audit history;
- preserve existing project allocations and authoritative financial history;
- do not double-count a supplier invoice as both invoice cost and duplicate expense cost;
- do not redefine client billing or collection truth merely to simplify navigation;
- do not silently change finalized/paid/verified historical records;
- keep currency semantics explicit;
- treat the exact posting, payment, settlement, and lifecycle model as **TBD**.

## Existing capabilities

Completed capabilities remain in the codebase unless the client later asks to remove, hide, or replace them. The roadmap reset cancels **future authorization**, not working historical functionality.

Do not delete mature modules merely because they are absent from this temporary requirements list. Any large removal/consolidation should wait for the complete client requirements and a dependency/data-history review.

## Permanent architecture and safety invariants

Until explicitly changed by a later client-backed architecture decision:

1. `one deployment -> one client company -> active membership/RBAC -> permitted workflows` remains authoritative.
2. Keep `company_id`, company-scoped RLS, permission checks, and company-bound integrity as defense in depth.
3. Preserve auditable financial, payroll, procurement, project, engineering, inventory, and document history.
4. Keep project financial concepts source-based; do not invent competing totals.
5. Do not silently aggregate mixed currencies or invent FX.
6. Feature/navigation simplification is not authorization simplification.
7. Consequential AI-assisted mutations remain prepare/validate/human-confirm/execute operations.

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

## Next planning step

More client requirements are expected after this reset. Until they are provided:

- do not create a detailed implementation phase sequence;
- do not infer missing business rules;
- keep the confirmed requirements above as the only active forward plan;
- preserve the latest safe `main` and existing validated behavior.

After the remaining requirements are collected, create one coherent HydroQualiSense implementation roadmap that resolves overlaps between branding, inventory, expenses/payables, client billing/collections, projects, procurement, and existing historical data.
