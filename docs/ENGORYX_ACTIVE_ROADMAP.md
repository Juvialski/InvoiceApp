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
- **P2A-3 Supplier Invoice ↔ Purchase Order Matching**: **IMPLEMENTED** (match header & line mapping, candidate ranking engine with deterministic signals, delivery/receipt progress integration, cross-company & currency & lifecycle validation, guarded RPCs, unmatching with mandatory reason, dual-permission RLS & UI integration in Invoice Verification and Procurement).

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

Do not infer legal/accounting/tax treatment beyond explicit product requirements.

## P3 — Project Operations UX

Status: **AFTER CORE P2 COMMERCIAL CONTRACTS**

### P3A — Project dashboard and risk visibility

- management project portfolio dashboard;
- actual vs budget/forecast;
- committed-cost visibility;
- billing/collections status;
- explainable Projects-at-Risk signals;
- no opaque AI risk score as the source of financial truth.

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
