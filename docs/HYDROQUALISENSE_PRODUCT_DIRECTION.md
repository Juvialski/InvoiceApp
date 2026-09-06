# HydroQualiSense Product Direction

Status: **ACTIVE — R5 COMPLETE / WAREHOUSE NEXT**  
Repository: `Juvialski/InvoiceApp`  
Deployment architecture: **one source repository -> many isolated deployments; one client company per deployment**  
Canonical HydroQualiSense domain: `https://hydroqualisense.com`  
Current handoff: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`  
Client deployment strategy: `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`

## Product position

HydroQualiSense is an engineering/operations platform developed by HydroQualiSense Solutions Corp. The current deployment and demo identity remain HydroQualiSense, while the product architecture is intended to support additional client companies through **separate isolated deployments**, not through unrelated-company switching inside one operational application.

The governing architecture is:

`one repository -> many isolated client deployments`

and for every deployed operational instance:

`one deployment -> one client company -> active membership/RBAC -> permitted workflows`

Each client deployment uses its own Render service, Supabase project/database/Auth/Storage boundary, environment configuration and operational secrets. Keep company-scoped defense-in-depth controls even when a database serves only one active company.

The governing product rules are:

> **One concept -> one primary place -> one authoritative number.**

> **One business entity -> one canonical identity -> every module references it.**

## Product identity and client identity

- Product name: **HydroQualiSense**.
- Product/company owner identity: **HydroQualiSense Solutions Corp.**
- Canonical product domain: `hydroqualisense.com`.
- The current first-party deployment uses HydroQualiSense Solutions Corp. company identity.
- Future client deployments may use approved client company identity/configuration for operational records and issued documents while retaining the HydroQualiSense product architecture.
- Do not solve client variation by weakening authorization or adding an unrelated-company switcher.

## Completed financial and data direction

### Supplier / payable side

- supplier invoices are preserved source evidence;
- verification creates/links one authoritative Expense/payable;
- linked supplier evidence does not create a second Actual Cost/payable truth;
- canonical Vendor identity is shared across supplier/procurement workflows;
- Purchase Orders remain Committed Cost until validated downstream lifecycle rules establish actual cost;
- linked supplier-derived Expenses cannot silently drift from verified source truth.

### Client / receivable side

- outgoing Client Invoices reuse project Client Billing/Collections as receivables truth;
- immutable issued-document snapshots preserve issuance meaning;
- trusted server-rendered snapshot bytes are the authoritative emailed PDF artifact;
- Collections remain distinct from Cash & Banking reconciliation evidence.

### Base-currency and tax direction

- current company/base reporting currency is PHP unless an explicit client configuration contract later changes it;
- original source amount/currency remain explicit;
- base-currency totals require authoritative FX evidence;
- unresolved foreign currency is not silently relabelled or mixed;
- Projects support explicit `VAT`, `NON_VAT`, or transitional `UNCLASSIFIED` treatment;
- issued Client Invoices snapshot the treatment used.

Do not infer unresolved legal/accounting rules such as VAT rate, VAT-inclusive/exclusive contract value, withholding/BIR classification, external FX-provider policy or broader accounting-period policy.

### Payroll/history direction

- VOID payroll periods remain auditable while staying out of the default active view;
- duplicate active payroll boundaries are DB-guarded;
- payroll/detail visibility remains permission-scoped;
- future attendance integration may feed controlled payroll inputs but must not silently rewrite payroll history.

## R5 integration/security baseline

R5 is complete in PR #95 and is the baseline for future major domains.

It established:

- canonical Vendor master and guarded Vendor lifecycle;
- fail-closed supplier verification when accounting truth is unresolved;
- immutable supplier-derived Expense provenance/financial fields;
- DB-backed source/receipt idempotency and concurrency protection;
- actor/audit attribution integrity;
- null-preserving extraction semantics and removal of implicit VAT-rate validation;
- validated file bytes before direct AI extraction;
- durable AI request budgets and bounded Gmail processing;
- trusted issued-document rendering with durable send-intent/idempotency state;
- stronger RBAC/RLS/RPC/grant alignment;
- durable backup-registration visibility and isolated restore drills;
- production security headers and final DB security-inventory coverage.

Known external limitation: a real Gmail send still requires a connected Google account/OAuth consent and is not proven by CI alone.

## Immediate operational priority — Warehouse Inventory & Project Allocation

HydroQualiSense must answer:

- What material/item stock is currently available?
- What entered or left stock, when, why and by whom?
- What stock was allocated/issued/returned/corrected for each project?
- What inventory remains after project movements?
- How does warehouse activity connect to procurement/delivery evidence without duplicating stock or financial truth?

Inventory must be auditable. Project allocation is not destructive balance editing; current stock must remain explainable from authoritative movements or an equally rigorous source model.

Detailed warehouse decisions such as locations, valuation/costing, reservation-vs-issue semantics, serial/lot tracking, reorder policy, barcode/QR use, purchase-receipt automation and adjustment authority remain pending explicit business decisions.

## Parallel productization direction

Independent of Warehouse contracts, HydroQualiSense may build a bounded client-acquisition/deployment track:

- public landing and requirements intake separate from authenticated operational data;
- repeatable client provisioning;
- dedicated Render + Supabase resources per client;
- deployment/version inventory;
- controlled release promotion and upgrade/rollback handling;
- storage/backup growth monitoring and lifecycle optimization;
- client-specific role templates/configuration built on shared permission keys.

This track must not create a global operational tenant database or store client secrets in a central plaintext registry.

## Later — Worker Registration

Worker onboarding should be established before biometric attendance:

`project/site registration QR -> pending submission -> supervisor/admin review -> canonical Worker/payroll/project assignment`

Registration begins as `PENDING`. Imported/user-submitted identity is evidence until approved. Duplicate or ambiguous identities require review rather than silent merge/create.

## Later — Attendance and device foundation

Before face recognition, establish:

- registered site devices bound to project/site;
- explicit time-in/time-out state machine;
- audited manual corrections and reason codes;
- offline queue/sync without duplicate punches;
- device/user/project/timestamp provenance;
- payroll integration boundaries.

## Later — Face-Recognition Attendance

Face recognition is an identity-assistance layer and high-risk pre-production domain.

Required design principles:

- prefer biometric templates/embeddings over unnecessary raw-photo retention;
- explicit consent/access/retention/deletion/re-enrollment controls;
- liveness/anti-spoof protection;
- image-quality validation;
- confidence thresholds;
- uncertain recognition uses audited supervisor fallback rather than guessing;
- site/device binding;
- secure offline handling;
- full audit trail;
- deep spoofing, PPE/lighting/camera, concurrency, offline-sync and payroll-integration testing.

## Public landing / requirements funnel

A future public HydroQualiSense site may explain the product and collect bounded prospective-client requirements. It is not an operational client workspace.

Do not collect payroll records, financial source documents, biometrics, credentials or equivalent sensitive operational data through a generic marketing intake form without a separately designed secure workflow.

## Existing foundation to preserve

Presentation may evolve, but preserve authoritative meaning/history for:

- projects and distinct contract value/project budget semantics;
- canonical Vendor/procurement records;
- Purchase Orders and delivery/receipt evidence;
- supplier source documents;
- authoritative Expenses/payables;
- project cost allocations;
- Client Invoices, Collections and receivables history;
- Cash & Banking settlement/reconciliation evidence;
- payroll/workforce history and allocations;
- engineering/document history;
- Daily Site Logs/field evidence;
- immutable issued financial documents;
- RLS/RBAC/membership/audit/company-bound validation;
- future inventory movement/allocation history;
- future attendance/enrollment history under explicit privacy controls.

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
12. **Biometric attendance requires explicit privacy, identity, device, correction and audit semantics before production use.**
13. **One shared codebase does not mean shared client data.** Every unrelated client remains operationally isolated.

## Final pre-production certification

Before broad client rollout, run a final dedicated security/data-integrity certification after major domains stabilize. It must include DB security inventory, permission/cross-company tests, financial/inventory/attendance lifecycle and concurrency, backup/restore, secrets/configuration, dependency review, public endpoints/headers, external integration scopes, browser authorization/deep links, deployment upgrade/rollback, and biometric privacy review where applicable.

Security continues throughout implementation; the final certification is an additional release gate, not a substitute.

## Current implementation sequence

Unless explicitly reprioritized:

1. **Warehouse Inventory & Project Allocation**
2. **Public client funnel + repeatable isolated deployment/provisioning tooling** — bounded parallel work when independent
3. **Worker Registration foundation**
4. **Site Attendance state machine + device registration**
5. **Face-Recognition Attendance** after explicit privacy/security design
6. other client-confirmed requirements
7. **Final pre-production security/data-integrity certification**

Older Engoryx future plans remain non-authoritative unless explicitly reconfirmed.
