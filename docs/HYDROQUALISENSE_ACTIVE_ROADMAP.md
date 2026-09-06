# HydroQualiSense Active Roadmap

Status: **ACTIVE — R5 COMPLETE, WAREHOUSE NEXT**  
Repository: `Juvialski/InvoiceApp`  
Last updated: **2026-09-06**  
Product direction: `docs/HYDROQUALISENSE_PRODUCT_DIRECTION.md`  
Client deployment strategy: `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`  
Current handoff: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`

This file is the authoritative forward roadmap. Live repository state and `AGENTS.md` override stale chat summaries or historical Engoryx plans.

## Current state

- R4 is complete through PR #94.
- **R5 Cross-Module Integration & Data-Contract Hardening is complete in PR #95.**
- The reviewed R5 runtime head passed Application Validation, Database Migration & Invariant Tests, Workflow Map Consistency, and Demo Visual QA before this documentation-only follow-up.
- R5 closed the known canonical Vendor split and hardened supplier verification, supplier-derived Expense integrity, issued-document sending, extraction uncertainty, source/receipt idempotency, backup registration, AI/Gmail resource limits, actor integrity, RBAC/RLS/RPC parity, and final database security inventory coverage.
- The next operational domain is **Warehouse Inventory & Project Allocation** unless explicitly reprioritized.
- The repository is the shared product codebase; production remains **one isolated deployment per client company**, with a separate Render service and Supabase project per client. See the client deployment strategy document.

Core rules remain:

> **One concept -> one primary place -> one authoritative number.**

> **One business entity -> one canonical identity -> every module references it.**

## Completed foundation

### R1 — HydroQualiSense branding and domain alignment

Status: **COMPLETE — 2026-09-06**

HydroQualiSense is the authoritative product identity. The repository may remain named `InvoiceApp`.

### R3 — Unified supplier invoice, Expense, Purchase Order and Client Invoice workflow

Status: **COMPLETE — PR #93**

- incoming supplier invoices are preserved source evidence;
- verification creates/links one authoritative Expense/payable;
- linked supplier evidence does not become a second Actual Cost/payable truth;
- outgoing Client Invoices reuse Client Billing/Collections receivables truth;
- Purchase Orders and Client Invoices use immutable issued-document snapshots.

### R4 — Whole-App Redundancy, Currency, Tax Classification & UX Declutter

Status: **COMPLETE — PR #94**

- source/Expense presentation was clarified;
- original currency and immutable FX evidence were preserved;
- unresolved foreign currency is excluded from PHP aggregates instead of silently mixed;
- Projects use explicit `VAT`, `NON_VAT`, or transitional `UNCLASSIFIED` treatment;
- VOID payroll history remains auditable but is hidden by default;
- duplicate active payroll-period boundaries are DB-guarded;
- major surfaces were decluttered without deleting mature history.

Still intentionally unresolved and never to be invented:

- VAT rate;
- VAT-inclusive vs VAT-exclusive contract value;
- withholding/BIR classification;
- external/automatic FX-provider policy;
- broader accounting-period policy.

### R5 — Cross-Module Integration & Data-Contract Hardening

Status: **COMPLETE — PR #95, 2026-09-06**

R5 established the reliable baseline required before new major domains.

Key outcomes:

- `public.vendors` is the canonical Vendor master consumed by supplier/procurement workflows;
- Vendor create/update/deactivate behavior is guarded, company-scoped, normalized and auditable;
- supplier verification fails closed when canonical Vendor, date, amount, currency, category or other required accounting facts are unresolved;
- supplier-derived Expenses preserve authoritative source/provenance fields and cannot silently drift from verified supplier evidence;
- receipt/source-document duplicate prevention is backed by DB integrity rather than client-only checks;
- invoice-review actors are bound to the authenticated user;
- unknown extracted financial values remain unresolved rather than silently becoming zero;
- no implicit VAT rate is used for validation;
- direct extraction validates bytes/MIME before AI processing and AI usage is bounded by durable company/user budgets;
- issued PO/Client Invoice email delivery uses trusted server-rendered immutable snapshot bytes, durable send intents and idempotent audit state;
- Gmail history/import work is bounded;
- staged email-review state is scoped to the authenticated user/company and bounded by TTL;
- backup registration failures are observable and restore drills use isolated server-generated targets;
- private SECURITY DEFINER exposure and legacy anonymous mutation grants were tightened;
- production security headers and public diagnostic exposure were hardened;
- a final-catalog database security inventory and runtime pgTAP/concurrency coverage were added.

Known external limitation: a real Gmail send still requires a connected Google account/OAuth consent and is not proven by CI alone.

## NEXT — Warehouse Inventory & Project Allocation

Status: **NEXT MAJOR OPERATIONAL DOMAIN**

Minimum business need:

- know current warehouse inventory;
- record every stock increase/decrease with traceable history;
- allocate/issue materials to projects;
- support returns and controlled corrections;
- expose project material usage without losing warehouse stock truth;
- connect procurement/delivery evidence without double-counting stock or financial truth.

Primary invariant:

> **Inventory stock must be explainable from authoritative movements or an equally rigorous source model.**

Project allocation must not be implemented as destructive edits to a balance.

Before implementation, explicitly resolve or preserve as undecided:

- single vs multiple warehouse/location model;
- valuation/costing method;
- reservation vs physical issue semantics;
- approval thresholds;
- serial/batch/lot tracking;
- reorder/minimum-stock rules;
- purchase-receipt automation;
- barcode/QR policy;
- adjustment authority/reason codes.

### Warehouse acceptance direction

At minimum prove:

1. opening/received stock -> authoritative movement -> current balance;
2. issue/allocation to Project -> project material history without destructive stock edits;
3. return/correction -> auditable compensating movement;
4. concurrency/double-click protection against duplicate movements;
5. company/RBAC/RLS protection of inventory actions;
6. procurement receipt linkage without creating duplicate cost truth;
7. inventory summaries reconcile to movement history.

DB-affecting work requires clean local migration replay, pgTAP, upgrade-path tests, relevant runtime/concurrency tests, focused tests and exact-head CI.

## Parallel post-R5 track — Public client funnel and deployment tooling

A bounded infrastructure/productization track may proceed alongside Warehouse only when it does not compete for the same shared financial/inventory contracts.

Direction:

- public HydroQualiSense landing/requirements intake separate from authenticated operational data;
- one shared source repository;
- one isolated Render service + Supabase project per client company;
- repeatable provisioning/checklists or guarded automation;
- deployment inventory/version tracking without storing plaintext secrets;
- deliberate release promotion across client deployments;
- storage/backup growth monitoring and lifecycle optimization without deleting authoritative evidence.

See `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md` for the full contract.

## Later — Worker Registration foundation

Worker onboarding should precede face-recognition attendance.

Target sequence:

`project/site QR -> pending worker submission -> supervisor approval -> canonical Worker/payroll/project assignment`

Rules:

- registration begins as `PENDING`;
- identity duplicates/ambiguity require review;
- approval creates/links canonical workforce truth;
- worker identity and project/site assignment remain auditable;
- do not treat an uploaded face photo as authoritative worker identity by itself.

## Later — Site Attendance state machine and device registration

Before biometric recognition, establish controlled attendance truth:

- registered site device bound to a project/site;
- explicit time-in/time-out state transitions;
- controlled correction/reason workflow;
- offline queue/sync without duplicate punches;
- audit actor/device/site/project/timestamp/correction provenance;
- payroll integration boundaries that do not rewrite payroll history silently.

## Later — Face-Recognition Attendance

Face recognition is a high-risk identity-assistance layer, not a quick UI feature.

Before production use define and validate:

- consent/access policy;
- biometric template vs raw-photo retention;
- deletion/re-enrollment controls;
- liveness/anti-spoof protection;
- image-quality checks;
- confidence thresholds;
- uncertain-match/manual-supervisor fallback;
- PPE, lighting and camera failure behavior;
- site/device binding;
- offline behavior;
- concurrency/duplicate-punch handling;
- payroll integration and correction audit.

Uncertain recognition must never guess.

## Final pre-production security/data-integrity certification

After major operational domains stabilize and before broad client production rollout, run a dedicated certification phase covering at least:

- final DB RLS/grants/SECURITY DEFINER/RPC/trigger/constraint/index inventory;
- permission and cross-company attack tests;
- financial/history mutation and idempotency tests;
- inventory/attendance concurrency and correction tests;
- storage backup/restore verification;
- secrets/configuration review;
- dependency audit/remediation decisions;
- public endpoint/security-header review;
- external integration scopes/tokens;
- browser authorization/deep-link testing;
- deployment upgrade/rollback drill;
- biometric/privacy review once biometrics exist.

This final certification is not a substitute for security during each phase.

## Permanent architecture and safety invariants

1. `one deployment -> one client company -> active membership/RBAC -> permitted workflows`.
2. One repository may serve many isolated client deployments; unrelated clients do not share an operational deployment/database.
3. Keep `company_id`, company-scoped RLS, permission checks, company-bound integrity and audit boundaries.
4. Preserve auditable financial, payroll, procurement, project, engineering, inventory, attendance and document history.
5. Actual Cost and Committed Cost remain distinct.
6. Supplier invoice evidence linked to Expense must not create duplicate Actual Cost/payable truth.
7. Client Invoices/Collections remain distinct from supplier obligations/project Actual Cost.
8. Preserve original currency; base reporting requires explicit authoritative FX evidence.
9. Finalized/verified/issued/paid/collected/voided/reversed history changes only through deliberate lifecycle/correction paths.
10. Derived summaries are not canonical master records.
11. Consequential AI-assisted mutations preserve prepare/validate/human-confirm/execute boundaries.
12. Canonical identity must not be silently created from ambiguous imported/AI evidence.
13. Inventory balances require explainable movement truth.
14. Biometric attendance requires explicit privacy, identity, correction, device and audit semantics before production use.
15. Navigation simplification is not authorization simplification.

## Explicit hold on historical plans

Old Engoryx planned/deferred phases are not implementation authority. Scheduling/Gantt/CPM, broad MRP/manufacturing expansion, autonomous accounting/AI posting and other historical future plans remain out unless explicitly reconfirmed.

## Current implementation sequence

Unless explicitly reprioritized:

1. **Warehouse Inventory & Project Allocation**
2. **Public client funnel + repeatable isolated deployment/provisioning tooling** — bounded parallel work allowed when independent
3. **Worker Registration foundation**
4. **Site Attendance state machine + device registration**
5. **Face-Recognition Attendance** after explicit privacy/security design
6. other client-confirmed requirements
7. **Final pre-production security/data-integrity certification** before broad rollout
