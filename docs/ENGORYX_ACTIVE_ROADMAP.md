# Engoryx Active Roadmap

Status: **ACTIVE**  
Repository: `Juvialski/InvoiceApp`  
Product direction: `docs/ENGORYX_PROJECT_CONTROLS_PRODUCT_DIRECTION.md`

This file is the current high-level implementation roadmap. Older phase plans remain useful historical/domain references, but when their status language conflicts with this file, this roadmap defines the current product priority.

## Architectural baseline

`one deployment -> one client company -> active membership/RBAC -> permitted workflows`

Keep company isolation, `company_id`, RLS, permissions, immutable/auditable history, and provider/server-side credential boundaries intact in every wave.

## Current product priority

Engoryx remains an Engineering Operations Platform. Current product emphasis is:

**Project Controls + Finance + Field Operations + Engineering Documents**

The project should become the main operational context without collapsing existing authoritative Finance, Payroll, Engineering, or document domains into one denormalized table.

## Completed infrastructure program

### S1 — Storage audit and provider-neutral foundation

Status: **COMPLETE**

Established current-state storage/database audit, provider-neutral storage contracts, company-scoped object keys, SHA-256/dedup rules, and migration architecture.

### S2 — External primary storage pilot

Status: **COMPLETE**

Implemented Supabase/S3-compatible provider support and the bounded manual-invoice source-document external-storage pilot with private access and legacy compatibility.

### S3 — Shared document migration and independent object backup

Status: **COMPLETE**

Implemented resumable storage migration, conservative physical deduplication, independent S3-compatible replicas, backup manifests, verification, reconciliation, and guarded object restore drills.

### S4 — Database growth and encrypted database backups

Status: **COMPLETE**

Implemented database-growth analysis/index improvements, encrypted logical PostgreSQL application-data backups to independent S3-compatible storage, durable backup/restore manifests, real non-production `psql` restore verification, and bounded retention candidate discovery.

Important final S4 rules are recorded in `docs/ENGORYX_S4_DATABASE_BACKUP_FINAL_NOTES.md`.

### S5 — Storage/backup operations and lifecycle readiness

Status: **PLANNED INFRASTRUCTURE FOLLOW-UP**

S5 remains valuable but is no longer the only next product priority. It can proceed as a bounded infrastructure wave alongside/after Project Controls work.

Target scope:

- storage and backup usage metrics;
- replication backlog/failure visibility;
- objects missing verified backup;
- last successful DB backup and restore drill;
- conservative lifecycle/orphan candidates;
- reviewed retention policies and deletion execution only after domain/object-reference rules are proven;
- cleanup/restore operator audit trail;
- recovery documentation and production RPO/RTO based on real operational requirements;
- large-archive streaming/multipart hardening if measured database-backup size justifies it.

Do not turn S5 into unbounded automatic deletion.

---

# Product Alignment Program

## A0 — Product-direction documentation alignment

Status: **COMPLETE when this documentation PR merges**

Goals:

- replace the old blanket feature-expansion freeze with the current Project Controls priority;
- preserve Engineering capabilities for current/future clients;
- establish deployment/module visibility rather than deleting unused modules;
- document project financial terminology and source-of-truth rules;
- establish the implementation waves below.

No schema/UI feature expansion belongs in A0.

## P1 — Project Controls Foundation

Status: **COMPLETE**

Primary objective: make the existing Project domain a trustworthy management/control surface before adding large new commercial modules.

### P1A — Module visibility and project summary contract
Status: **COMPLETE**

### P1B — Cost codes and budget control
Status: **COMPLETE**

### P1C — Project management UX
Status: **COMPLETE**

## P2 — Procurement + Commercial Operations

Status: **ACTIVE**

P2 is split into bounded implementation waves:

### P2A — Suppliers, quotations, Purchase Orders, deliveries

- **P2A-1 Purchase Orders Foundation & Commitments**: **COMPLETE** (Vendor reuse, PO lines, DRAFT/APPROVED/ISSUED/CLOSED/CANCELLED lifecycle, Committed Cost calculation, RBAC, module gating).
- **P2A-2 Delivery / Goods Receipt Tracking**: **COMPLETE** (receipt headers & lines, over-receipt triggers with row-locking, status/progress tracking, voiding workflow, Project Lifecycle preflight integration).
- **P2A-3 Supplier Invoice ↔ Purchase Order Matching**: **COMPLETE** (match header & line mapping, candidate ranking engine with deterministic signals, delivery/receipt progress integration, cross-company & currency & lifecycle validation, guarded RPCs, unmatching with mandatory reason, dual-permission RLS & UI integration in Invoice Verification and Procurement).
- **P2A-4 RFQ & Supplier Quotation Comparison**: **COMPLETE** (company-scoped RFQ domain, line items with cost-code context, supplier quotation submissions, deterministic side-by-side comparison with lowest-bid highlighting and technical/commercial warnings, auditable human supplier selection, conversion to uncommitted DRAFT purchase orders, strict pre-commitment financial invariants preserving Actual and Committed Cost separation, and full Project Workspace procurement integration).

Financial rule: an approved commitment is not automatically an Actual Cost until the authoritative posting/invoice/payment rule says it is. Receipts are operational delivery records and do NOT generate Actual Cost or duplicate supplier invoices.

### P2B — Subcontracts, variations, client billing

Target domain:

- subcontractors and scopes;
- subcontract commitments;
- progress claims;
- retention where contractually relevant;
- change orders / variations;
- approved revised contract value;
- client progress billing;
- collections/settlements linkage;
- project billed/collected/outstanding values.

P2B is split into bounded implementation waves:
- **P2B-1 Subcontract Packages & Commitment Foundation**: **COMPLETE** (company-scoped trade contractor subcontracts, line-level cost codes, committed liability calculation, DRAFT/APPROVED/ACTIVE/CLOSED/CANCELLED lifecycle, project lifecycle protection).
- **P2B-2 Subcontract Progress Claims & Retention**: **COMPLETE** (progress claim valuation headers and lines, line-level and contract-level cumulative over-claim guards, configurable retention calculation, commercial status lifecycle DRAFT/SUBMITTED/APPROVED/REJECTED/CANCELLED/VOIDED, remaining subcontract commitment reduction, certified subcontract work & retention tracking without altering Actual Cost, dedicated claims register drawer and valuation editor, project budget control and performance integration, migration & project lifecycle preflight blocker).
- **P2B-3 Subcontract Variations / Change Orders & Revised Commitments**: **COMPLETE** (DRAFT/SUBMITTED/APPROVED/REJECTED variation lifecycle, approved-only revised subcontract value, remaining commitment integration after certified progress, and preserved separation from project contract value, project budget, Actual Cost, invoice, payment, and settlement truth).
- **P2B-4 Client Progress Billing Foundation**: **COMPLETE** (company-scoped project billing headers and line-derived totals, DRAFT/SUBMITTED/ISSUED/CANCELLED/VOIDED lifecycle, issued-only billed-to-date, project-lock cumulative over-billing protection, append-only billing history, project lifecycle integration, and Project Workspace commercial visibility). Client collections and cash settlement remain separate downstream financial-evidence waves.
- **P2B-5 Client Collections / Receivables**: **COMPLETE** (company-scoped client collections and allocation-derived totals, DRAFT/RECORDED/REVERSED lifecycle, reason-gated reversal, deterministic row-level locks and over-collection protection, authoritative Collected to Date and Outstanding Billed Amount commercial truth, project lifecycle preflight blocker, and Project Workspace commercial visibility). Cash settlement evidence is linked separately through the P2B-6 settlement workflow.
- **P2B-6 Client Collection ↔ Cash & Banking Settlement Linkage**: **COMPLETE** (existing financial transaction/match model extended for recorded client collections, CREDIT-only incoming settlement validation, allocation-derived partial and multi-match ceilings, canonical link-state summaries, guarded auditable reversal, collection reversal dependency protection, Project Workspace/Cash & Banking workflows, and preserved commercial/cost separation).

Do not infer legal/accounting/tax treatment beyond explicit product requirements.

## P3 — Project Operations UX

Status: **ACTIVE / IN PROGRESS**

### P3A — Project dashboard and risk visibility

- **P3A-1 Portfolio Management Dashboard**: **COMPLETE** (permission-scoped portfolio management over existing project financial summaries, grouped-by-currency contract/budget/Actual/Committed/billing/collection/outstanding/remaining-to-bill values, visible available/partial/unavailable states, deterministic search/filter/sort controls, responsive project table/cards, project Workspace drilldown, and deterministic demo coverage).
- **P3A-2 Project Financial Control Dashboard**: **NOT YET COMPLETE** (actual-vs-budget control detail and later project-controls extensions remain separately bounded).
- **P3A-3 Explainable Projects-at-Risk**: **NOT YET COMPLETE** (factual evidence and explainable risk signals remain a later wave; no opaque AI risk score is the source of financial truth).

Forecast/EAC and Expected Margin remain deferred until an authoritative permission-correct forecasting source exists.

### P3B — Materials and equipment

- project materials/equipment register where useful;
- delivery/use/allocation relationships;
- avoid premature full inventory/ERP complexity;
- connect procurement records where available.

### P3C — Enhanced Daily Site Operations

Extend existing Daily Site Logs around:

- manpower;
- work accomplished;
- equipment used;
- deliveries;
- weather;
- delays/issues;
- safety events;
- safe attachments/photos where the existing storage model supports them;
- project/cost-code/work-package relationships where useful.

### P3D — Engineering integration

Strengthen Project navigation into existing:

- Engineering Documents and immutable revisions;
- RFIs;
- Submittals;
- future transmittal/as-built workflows if separately prioritized.

Engineering history remains auditable and independent from generic project notes.

---

# Deferred / not automatically authorized

The current direction does not automatically authorize:

- Scheduling/Gantt/CPM;
- full inventory/warehouse ERP;
- manufacturing/MRP;
- aggressive automatic retention/deletion;
- accounting-ledger replacement;
- multi-company switching inside one deployment;
- broad AI autonomous financial posting without confirmation and permissions.

These require separate evidence and prioritization.

## Agent/model execution guidance

For implementation agents:

- maximum 2 concurrent subagents remains a hard repository limit;
- use WM-5 narrow context before broad exploration;
- Project Controls P1 is architecture/financial-integrity sensitive and should receive the strongest practical implementation/review path;
- P2 may be split into smaller bounded waves when using a medium-capability model;
- infrastructure S5 is suitable for a bounded implementation agent provided high-risk deletion remains review-gated;
- lead agent owns shared contracts, RLS/security interpretation, conflict-heavy integration, and final exact-head validation.

## Definition of roadmap success

The product should reach a state where management can answer from Engoryx, without manually recomputing spreadsheets:

- What is each project's current contract value?
- What is its approved cost budget?
- What has actually been spent?
- What has already been committed?
- What is forecast to be spent at completion?
- What has been billed to the client?
- What has been collected?
- What is the expected project margin?
- What operational or engineering items need attention?

Those answers must come from traceable, permission-correct source records rather than manually maintained dashboard totals.
