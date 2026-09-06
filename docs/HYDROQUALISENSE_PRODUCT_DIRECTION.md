# HydroQualiSense Product Direction

Status: **ACTIVE — R5 HARDENING NEXT**  
Repository: `Juvialski/InvoiceApp`  
Architecture: **one deployment -> one client company**  
Canonical production domain: `https://hydroqualisense.com`  
Current handoff: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`

## Product position

HydroQualiSense is HydroQualiSense Solutions Corp.'s own operations platform. It is not being planned as a generic Engoryx product for unrelated companies.

The application already contains substantial project, finance, procurement, workforce/payroll, engineering, reporting, assistant, email-intake, document-generation and audit capability. Current development should strengthen continuity between those capabilities before adding another large domain.

The governing product rules are:

> **One concept -> one primary place -> one authoritative number.**

> **One business entity -> one canonical identity -> every module references it.**

## Completed direction

### Company-specific identity

- Application name: **HydroQualiSense**.
- Company identity: **HydroQualiSense Solutions Corp.**
- Canonical domain: `hydroqualisense.com`.
- Official HydroQualiSense logo/company identity is authoritative across the application and issued financial documents.

### Unified supplier/client financial meaning

**Supplier / payable side**

- supplier invoices are preserved source evidence;
- verification creates/links one authoritative Expense/payable;
- linked supplier evidence must not create a second Actual Cost/payable truth;
- Purchase Orders remain Committed Cost until validated downstream lifecycle rules create actual cost.

**Client / receivable side**

- outgoing Client Invoices use the existing project Client Billing/Collections domain as receivables truth;
- immutable issued-document snapshots preserve issuance meaning;
- Collections remain distinct from Cash & Banking reconciliation evidence.

### Base-currency and tax direction

- HydroQualiSense base/company reporting currency is PHP.
- Original source amount/currency remain explicit.
- Base-currency totals require authoritative FX evidence; never silently mix currencies or invent rates.
- Projects support explicit `VAT`, `NON_VAT`, or transitional `UNCLASSIFIED` treatment.
- Issued Client Invoices snapshot the treatment used.

Do not infer unresolved legal/accounting rules such as VAT rate, VAT-inclusive/exclusive contract value, withholding/BIR classification, external FX provider policy or broader accounting-period policy.

### Payroll history direction

VOID payroll periods remain auditable but are hidden/grouped away from the default active history view. Duplicate active period boundaries are protected by database-level integrity.

## Immediate priority — R5 Cross-Module Integration & Data-Contract Hardening

Do not start Warehouse Inventory until R5 establishes a reliable current baseline unless the client/user explicitly reprioritizes.

R5 must prove that entities created/resolved in one domain are the same canonical entities consumed everywhere else, and that mutations propagate without stale/parallel state.

Primary targets:

- canonical Vendor master and supplier identity resolution;
- Supplier Document -> Vendor -> Expense -> PO/project/cost-code -> settlement continuity;
- Vendor -> RFQ -> Quotation -> PO -> Receipt -> supplier invoice -> Expense continuity;
- Supplier Documents and Client Invoices remain clearly discoverable without recreating a generic competing Invoice ledger;
- Vendor, Project, Worker, Financial Account, Project Cost Code and other shared master data remain consistent across selectors/lists/details;
- consequential mutations update mounted UI/caches immediately without hard reload;
- lifecycle/history behavior stays consistent across verify/issue/pay/collect/void/reverse/reopen paths;
- UI permissions, service/RPC checks, RLS and company-bound integrity remain aligned;
- retries, double-clicks and concurrent clients cannot create duplicate consequential records.

Known first defect: supplier summaries may appear in the user-facing Vendor Directory without a corresponding canonical `public.vendors` record, while Procurement selectors rely on canonical Vendor rows. R5 must resolve this split instead of allowing derived supplier summaries to masquerade as master data.

Astra is optional for a later audit/review and is not a prerequisite to R5. Agent/model execution follows live `AGENTS.md`: Codex remains lead; Luna is available for bounded parallel subagent work under the current pre-demo policy.

## Confirmed next major domain — Warehouse Inventory & Project Allocation

After R5, Warehouse Inventory remains a confirmed requirement.

HydroQualiSense must ultimately answer:

- What material/item stock is currently available?
- What entered or left stock, when, why and by whom?
- What stock was allocated/issued/returned/corrected for each project?
- What inventory remains after project movements?
- How does warehouse activity connect to procurement/delivery evidence without duplicating stock or cost truth?

Inventory must be auditable. Project allocation must not be implemented as destructive edits to a stock balance; stock must remain explainable from authoritative movements or an equally rigorous source model.

Detailed warehouse rules such as location count, costing/valuation, reservation-vs-issue semantics, serial/lot tracking, reorder policy, barcode/QR use, purchase-receipt automation and adjustment authority remain pending explicit client decisions.

## Confirmed later major domain — Worker Registration & Face-Recognition Attendance

A later major requirement is worker onboarding and site attendance with face recognition. This should be planned as a high-risk pre-production domain rather than a quick UI enhancement.

Intended direction:

- project/site registration QR;
- worker submits required details and enrollment image;
- registration begins as **PENDING**;
- supervisor/admin approves before authoritative Worker/payroll/project assignment is created or linked;
- registered site device operates as a shared attendance terminal bound to a project/site;
- face recognition resolves the canonical worker and records controlled time-in/time-out state transitions;
- uncertain recognition uses audited fallback rather than guessing.

Required design principles before production:

- biometric templates/embeddings preferred over unnecessary raw-photo retention;
- explicit retention/deletion/re-enrollment controls;
- liveness/anti-spoof protection;
- confidence thresholds and image-quality validation;
- audited supervisor-assisted/manual fallback;
- site/device binding;
- clear attendance state machine and controlled corrections;
- secure offline queue/sync for unreliable site connectivity;
- full audit trail for registration, approval, recognition/fallback, corrections, device, project/site and supervisor actions;
- explicit privacy/consent/access policy;
- deep testing of spoofing, PPE/lighting/camera failure, concurrency, offline sync and payroll integration.

Exact phase number and final biometric architecture remain TBD and should be decided after R5/Inventory planning unless reprioritized.

## Existing foundation to preserve

A simpler experience may consolidate presentation, but preserve authoritative meaning/history for:

- projects and distinct contract value/project budget semantics;
- Vendor/procurement records;
- Purchase Orders and delivery/receipt evidence;
- supplier source documents;
- authoritative Expenses/payables;
- project cost allocations;
- Client Invoices, Collections and receivables history;
- Cash & Banking settlement/reconciliation evidence;
- payroll/workforce history and allocations;
- engineering/document history;
- Daily Site Logs and field evidence;
- immutable issued financial documents;
- RLS, RBAC, membership, audit and company-bound validation;
- future inventory movement/allocation history;
- future biometric attendance/enrollment history under explicit privacy controls.

## Permanent financial/product principles

1. **No double counting.** One economic event must not become duplicate cost/payable/collection truth.
2. **Actual Cost and Committed Cost remain distinct.**
3. **Client receivables remain distinct from supplier obligations and project cost.**
4. **Payment/settlement evidence does not silently create a new cost or collection event.**
5. **Historical records stay auditable.** Finalized/verified/paid/collected/voided/reversed/issued records are not silently rewritten or erased.
6. **Project allocation stays traceable.**
7. **Original currency stays explicit.** Base reporting requires explicit authoritative conversion evidence.
8. **Tax treatment stays explicit.**
9. **Presentation cleanup is not authorization cleanup.**
10. **Derived summaries are not canonical master data.**
11. **Inventory balances require explainable movement truth.**
12. **Biometric attendance requires explicit privacy, identity, correction and audit semantics before production use.**

## Product-specific architecture

Deployment remains:

`one deployment -> HydroQualiSense company -> active membership/RBAC -> permitted workflows`

Keep company-scoped database controls even though the deployment serves only this company. Single-company deployment is not a reason to weaken RLS, permission checks, company-bound foreign keys, audit boundaries or server-side credential controls.

## Current implementation sequence

Unless the client explicitly reprioritizes:

1. **R5 — Cross-Module Integration & Data-Contract Hardening**
2. **Warehouse Inventory & Project Allocation**
3. **Worker Registration & Face-Recognition Attendance** — later major phase after explicit design/safety review
4. other later client-confirmed requirements

Older Engoryx future plans remain non-authoritative unless the client reconfirms them.

The detailed forward plan is `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`.