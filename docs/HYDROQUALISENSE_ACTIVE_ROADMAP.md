# HydroQualiSense Active Roadmap

Status: **ACTIVE — R5 HARDENING NEXT**  
Repository: `Juvialski/InvoiceApp`  
Last updated: **2026-09-06**  
Product direction: `docs/HYDROQUALISENSE_PRODUCT_DIRECTION.md`  
Current handoff: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`

This file is the authoritative forward roadmap. Live repository state and `AGENTS.md` override stale chat summaries or historical Engoryx plans.

## Current handoff state

- Runtime/code baseline before the current documentation-only handoff commits: `5308e4feb51f922ba8f5153f341f565432d56bab`.
- No open pull requests were present when the handoff was written.
- R4 is complete and merged through PR #94.
- PR #94 exact-head Application Validation, Database Migration & Invariant Tests, Workflow Map Consistency, and Demo Visual QA were green before merge.
- Current next implementation phase is **R5 Cross-Module Integration & Data-Contract Hardening**.
- Astra is optional for a later audit; it is not a blocker for R5. Follow `AGENTS.md`: Codex lead, Luna explicitly enabled for bounded parallel work up to the current pre-demo limit.

## Product identity

The application is exclusively **HydroQualiSense** for **HydroQualiSense Solutions Corp.**

Canonical production domain:

`https://hydroqualisense.com`

The repository may remain named `InvoiceApp`; that is not product branding.

## Completed foundation

### R1 — HydroQualiSense branding and domain alignment

Status: **COMPLETE — 2026-09-06**

HydroQualiSense is the exclusive product identity. The official HydroQualiSense Solutions Corp. logo/company identity and `hydroqualisense.com` are authoritative.

### R3 — Unified supplier invoice, Expense, Purchase Order and Client Invoice workflow

Status: **COMPLETE — PR #93**

Authoritative financial meaning:

- incoming supplier invoices are preserved source evidence;
- verification creates/links one authoritative Expense/payable;
- linked supplier evidence does not become a second Actual Cost/payable truth;
- outgoing Client Invoices use the existing Client Billing/Collections receivables domain;
- Purchase Orders and Client Invoices use HydroQualiSense document generation and immutable issued-document snapshots;
- the generic top-level Invoice business branch is removed from normal navigation.

Known external limitation: a real Gmail send still requires a connected Google account/OAuth consent and was not exercised in CI.

### R4 — Whole-App Redundancy, Currency, Tax Classification & UX Declutter

Status: **COMPLETE — PR #94, 2026-09-06**

R4 established the baseline for deeper integration hardening:

- supplier documents expose Needs Review, Verified / Link Required, and Linked Expense states while Expense remains authoritative payable/Actual Cost truth;
- PHP/base reporting uses immutable FX snapshots with original amount/currency, rate/date/provenance, actor and base equivalent;
- unresolved foreign-currency records are excluded from PHP aggregates rather than relabelled or silently mixed;
- linked supplier Invoice and Expense share one frozen FX basis;
- FX visibility/confirmation is source-scoped by permissions;
- Projects use explicit `VAT`, `NON_VAT`, or transitional `UNCLASSIFIED` tax treatment and issued Client Invoices snapshot the treatment;
- VOID payroll periods are hidden by default but retained as auditable history;
- duplicate active payroll-period boundaries are DB-guarded;
- Dashboard/Reports/project surfaces received bounded decluttering without deleting mature capability/history.

Still intentionally unresolved and **must not be invented**:

- VAT rate;
- VAT-inclusive vs VAT-exclusive contract value;
- withholding/BIR classification;
- external/automatic FX provider policy;
- accounting-period policy beyond existing validated semantics.

Core product rule:

> **One concept -> one primary place -> one authoritative number.**

## NEXT — R5 Cross-Module Integration & Data-Contract Hardening

Priority: **NEXT — complete before Warehouse Inventory unless explicitly reprioritized**

R5 is a functional hardening phase, not another visual cleanup.

Governing rule:

> **One business entity -> one canonical identity -> every module references it.**

### R5.1 — Canonical Vendor master and supplier resolution

Known defect: the user-facing Vendor Directory can show supplier summaries derived from invoice evidence while Procurement selectors consume canonical `public.vendors`. A supplier can therefore appear under Vendors yet remain unusable for RFQ/Quotation/PO workflows.

Target contract:

`Supplier evidence -> human-confirmed Vendor resolution -> canonical vendor_id -> Expense / PO / RFQ / Quotation / Subcontract / Email Intake / Vendor Directory`

Requirements:

- `public.vendors` is the canonical supplier master;
- extracted supplier text remains source evidence, not a competing master record;
- safe exact authoritative matches may link under the existing authorization model;
- clearly new suppliers require explicit human-confirmed Vendor creation;
- ambiguous/conflicting identities remain unresolved;
- conflicting authoritative identifiers must never be silently merged;
- dependent selectors/summaries refresh immediately after create/link/edit without hard reload;
- historical invoices without `vendor_id` receive a safe reconciliation path preserving source history.

### R5.2 — Supplier Invoice / Expense / Procurement continuity

Harden both chains:

`Email/Upload -> Source Document -> Supplier Invoice -> Vendor -> Expense -> PO match -> Project/Cost Code -> Cash settlement`

`Vendor -> RFQ -> Supplier Quotation -> PO -> Receipt -> Supplier Invoice -> Expense`

Verify one non-void authoritative Expense per supplier invoice, provenance continuity, PO commitment semantics, project Actual Cost continuity, settlement linkage, and retry/double/concurrent idempotency.

### R5.3 — Financial-document discoverability

**Supplier Documents**

- provide an obvious canonical history entry point under Expenses/supplier workflows;
- previous source evidence, review/link history, Expense and PO provenance remain reachable when authorized.

**Client Invoices**

- preserve Project -> Client Invoices;
- provide/confirm a discoverable global Client Invoices directory across projects;
- allow users to find/create/open existing outgoing invoices, preview/download/send issued PDFs, inspect lifecycle/history, and navigate to Collections;
- reuse `client_billings` / Collections truth; do not create another receivables model.

### R5.4 — Master-data continuity audit

Trace canonical identity and downstream consumption for at least:

- Vendor;
- Project;
- Worker;
- Financial Account;
- Project Cost Code;
- represented client/billing contact data;
- any other shared selector discovered during the audit.

For each verify canonical ID/table, company-bound integrity, normalization, create-vs-link, duplicate handling, selector/list/detail consistency, immediate state propagation, lifecycle behavior, and historical snapshot behavior.

Derived summaries must not masquerade as master records.

### R5.5 — State propagation and mounted-UI convergence

Audit React state, workspace refresh groups/caches, dropdown data, KPIs, project summaries, linked detail panels, deep links, and demo/local vs Supabase behavior.

A successful DB mutation that leaves dependent UI stale until hard reload is an R5 defect.

### R5.6 — Lifecycle/history continuity

Trace representative records through:

`Create -> Edit -> Approve/Verify -> Issue -> Pay/Collect -> Void/Cancel/Reverse -> Restore/Reopen where allowed`

Preserve immutable issued documents, verified supplier evidence, Expense lifecycle, Collection vs Cash reconciliation separation, Payroll history, and audited correction/reversal paths.

### R5.7 — RBAC / RLS / RPC parity

For each cross-module action verify:

`UI permission -> service/application boundary -> RPC/server check -> RLS/company-bound FK`

Look for over-broad summaries, overly narrow legitimate linking, direct-table bypasses, SECURITY DEFINER/search-path problems, and missing company-bound validation.

### R5.8 — Database integrity / retries / concurrency

Audit consequential operations for double-clicks, retries, duplicate Vendor creation, concurrent verification/linking, PO-match races, stale optimistic updates, repeated lifecycle transitions, and related discovered races.

Use database constraints/locking/idempotent RPCs when integrity must survive concurrent clients; UI disabling alone is insufficient.

### R5.9 — End-to-end acceptance matrix

Before R5 is complete, prove compact representative flows for:

1. supplier intake -> Vendor resolution -> verification -> Expense -> optional PO/project provenance -> settlement context;
2. Vendor -> RFQ/Quotation -> PO -> Receipt -> supplier invoice match -> Expense;
3. Project -> Client Invoice -> issued snapshot/PDF -> Collection -> Cash reconciliation evidence;
4. Expense + committed PO + Payroll allocations -> correct distinct Actual/Committed semantics;
5. canonical master create/edit -> dependent selectors/summaries update without reload;
6. void/cancel/reverse -> history preserved and active truth updated correctly;
7. representative RBAC restrictions across shared entities and summaries.

For DB-affecting changes use real Docker/local Supabase validation: clean replay, pgTAP, migration tests, upgrade-path tests, and relevant runtime/concurrency tests.

## AFTER R5 — R2 Warehouse Inventory & Project Allocation

Status: **CONFIRMED MAJOR REQUIREMENT — after R5 unless reprioritized**

Minimum business need:

- know current warehouse inventory;
- track stock changes with traceable history;
- allocate/issue stock to projects;
- support returns/corrections;
- make project material use visible without losing warehouse stock truth.

Inventory stock must be explainable from authoritative movements or an equally rigorous source model. Project allocation must not be destructive balance editing.

Do **not** prematurely decide:

- single vs multiple warehouses/locations;
- valuation/costing method;
- reservation vs physical issue semantics;
- approval thresholds;
- serial/batch/lot tracking;
- reorder/minimum-stock rules;
- purchase-receipt automation;
- barcode/QR policy;
- adjustment authority/reason codes.

## LATER CONFIRMED MAJOR REQUIREMENT — Worker Registration & Face-Recognition Attendance

Status: **CONFIRMED — exact phase number TBD; likely a later pre-production phase after R5 and Inventory unless reprioritized**

This is a high-risk domain because it touches biometrics, payroll/workforce identity, site operations, offline devices, privacy, spoofing, corrections, and concurrency. Do not implement it as a quick UI feature.

### Intended worker enrollment flow

1. A project/site exposes a registration QR code.
2. Worker opens it, enters required details, and captures/uploads an enrollment image.
3. Submission creates a **PENDING registration** rather than immediately becoming authoritative payroll/workforce truth.
4. Supervisor/admin checks identity, duplicates and project/site context and approves.
5. Approval creates/links the canonical Worker/payroll record and project/site assignment.

### Intended attendance flow

1. A registered site device is bound to one project/site.
2. Worker presents their face at the shared terminal.
3. System resolves the canonical worker using face recognition.
4. High-confidence valid recognition records the appropriate time-in/time-out transition.
5. Uncertain or failed recognition uses an audited supervisor-assisted/manual fallback rather than guessing.

### Required design safeguards

- Prefer biometric template/embedding matching; retain raw photos only when necessary and with explicit retention/deletion/re-enrollment controls.
- Include liveness/anti-spoof protection so a printed/static image is not sufficient.
- Validate enrollment image quality and reject multiple/unclear faces.
- Use explicit confidence thresholds; uncertain matches require confirmation/fallback.
- Bind devices to project/site and audit device identity.
- Support a clear attendance state machine such as `NOT_IN -> CLOCKED_IN -> CLOCKED_OUT`, with controlled cross-day/overtime/correction behavior.
- Support secure offline queue/sync for poor site connectivity without duplicate punches.
- Audit registration, approval, re-enrollment, recognition/fallback result, device, timestamp, project/site, manual correction, reason and approving supervisor.
- Define privacy/consent/access/deletion policy before production biometric deployment.
- Test spoofing, PPE/lighting/camera failure, offline sync, retries/concurrency, payroll integration and correction history deeply.

## Permanent architecture and safety invariants

1. `one deployment -> one client company -> active membership/RBAC -> permitted workflows`.
2. Keep `company_id`, company-scoped RLS, permission checks, company-bound integrity and audit boundaries.
3. Preserve auditable financial, payroll, procurement, project, engineering, inventory, attendance and document history.
4. Keep project financial concepts source-based; do not invent competing totals.
5. Supplier invoice evidence linked to Expense must not create duplicate Actual Cost/payable truth.
6. Committed Purchase Orders remain distinct from Actual Cost.
7. Client Invoices/Collections remain distinct from supplier obligations and project Actual Cost.
8. Preserve original transaction currency; base reporting requires explicit authoritative conversion evidence.
9. Feature/navigation simplification is not authorization simplification.
10. Finalized/void/auditable history may be hidden/grouped for usability but not silently erased.
11. Consequential AI-assisted mutations remain prepare/validate/human-confirm/execute operations.
12. Canonical master data must not be silently created from ambiguous AI/import evidence.
13. Inventory stock must remain explainable from authoritative movement semantics.
14. Biometric identity/attendance data requires explicit access, retention, correction and audit semantics before production use.

## Explicit hold on old future plans

Old Engoryx planned/deferred phases are not implementation authority. In particular, Scheduling/Gantt/CPM, broad MRP/manufacturing expansion, transmittal/as-built expansion, autonomous AI posting, and other historical future plans remain out unless the client explicitly reconfirms them.

## Current implementation sequence

Unless the client reprioritizes:

1. **R5 — Cross-Module Integration & Data-Contract Hardening**
2. **R2 — Warehouse Inventory & Project Allocation**
3. **Worker Registration & Face-Recognition Attendance** — exact phase number/design after explicit planning and safety review
4. other later client-confirmed requirements

Do not start Inventory while R5 is active unless the user explicitly changes priority.