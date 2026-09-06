# HydroQualiSense Current Handoff

Status: **CURRENT — use this with `AGENTS.md` and the active roadmap**  
Date: **2026-09-06**  
Repository: `Juvialski/InvoiceApp`

This is a compact takeover note for a fresh ChatGPT/Codex session. Repository state remains authoritative if anything below becomes stale.

## Baseline at handoff

- Runtime/code baseline before these documentation-only handoff commits: `5308e4feb51f922ba8f5153f341f565432d56bab`.
- No open pull requests were present when this handoff was written.
- R4 was merged in PR #94.
- PR #94 exact-head Application Validation, Database Migration & Invariant Tests, Workflow Map Consistency, and Demo Visual QA were green before merge.
- The documentation commits that follow this baseline do not intentionally change runtime behavior.

## Current next phase

**R5 — Cross-Module Integration & Data-Contract Hardening** is next and must complete before Warehouse Inventory unless the user/client reprioritizes.

Primary integration rule:

> **One business entity -> one canonical identity -> every module references it.**

R5 is functional hardening, not another cosmetic pass.

### First known defect to attack

Vendor identity is currently split across user-visible derived supplier summaries and canonical `public.vendors` records used by Procurement selectors. A supplier can therefore appear under Vendors yet remain unavailable for RFQ/Quotation/PO workflows.

R5 should establish:

`Supplier evidence -> human-confirmed Vendor resolution -> canonical vendor_id -> Expense / PO / RFQ / Quotation / Subcontract / Email Intake / Vendor Directory`

Do not silently create or merge canonical Vendor master data from ambiguous AI/extracted supplier text.

### Other R5 priorities

1. Supplier document -> Vendor -> Expense -> PO/project/cost-code -> settlement continuity.
2. Procurement-first Vendor -> RFQ -> Quotation -> PO -> Receipt -> supplier invoice -> Expense continuity.
3. Clear Supplier Documents history under the supplier/Expense workflow.
4. A discoverable global Client Invoices directory that reuses `client_billings` / Collections rather than creating a second receivables model.
5. Shared master-data continuity for Vendor, Project, Worker, Financial Account, Project Cost Code, and other shared selectors.
6. Immediate state/cache/selector refresh after create/edit/link/archive/restore without hard reload.
7. Lifecycle/history consistency across verify/issue/pay/collect/void/reverse/reopen paths.
8. UI permission -> service/RPC -> RLS/company-bound integrity parity.
9. DB-level retry/idempotency/concurrency protection for consequential cross-module mutations.
10. Compact end-to-end acceptance flows before declaring R5 complete.

For DB-affecting fixes, use real Docker/local Supabase validation: clean replay, pgTAP, migration tests, upgrade-path tests, and relevant runtime/concurrency tests.

## Agent/model policy for the next session

`AGENTS.md` remains authoritative.

- Codex is the lead implementation/integration owner.
- Luna is explicitly enabled for the accelerated pre-demo sprint, up to 5 concurrent bounded subagents.
- Five is a ceiling, not a quota.
- Astra is **not required** to begin or complete R5. If Astra usage is unavailable, do not block the phase waiting for it.
- Astra may be reserved for a later dedicated audit/review when allowance permits.
- The local implementation lead opens a PR but does not merge its own PR; ChatGPT reviews exact-head CI and merges automatically when safe if asked to check/finalize.

## Completed foundation that R5 must preserve

### R1

HydroQualiSense is the exclusive product identity. Canonical domain: `https://hydroqualisense.com`. Official HydroQualiSense Solutions Corp. branding/logo is authoritative.

### R3

- Incoming supplier invoices are preserved source evidence.
- Verification creates/links one authoritative Expense/payable.
- Linked supplier evidence must not become a second Actual Cost/payable truth.
- Outgoing Client Invoices use the existing Client Billing/Collections receivables domain.
- PO and Client Invoice document generation uses immutable issued-document snapshots.
- Generic top-level Invoice navigation was removed.

### R4

- Supplier documents are presented as Needs Review, Verified / Link Required, and Linked Expense states.
- PHP/base reporting uses immutable FX snapshots with original amount/currency and explicit rate/date/provenance.
- Missing FX is excluded from base-currency aggregates rather than silently mixed.
- Linked supplier Invoice and Expense share the same frozen FX evidence.
- FX visibility/confirmation is source-scoped by permissions.
- Projects have explicit `VAT`, `NON_VAT`, or transitional `UNCLASSIFIED` treatment; issued Client Invoices snapshot that treatment.
- VOID payroll periods are hidden by default but retained as auditable history.
- Duplicate active payroll-period boundaries are DB-guarded.
- Dashboard/Reports/project surfaces received bounded decluttering without deleting mature history.

Still intentionally unresolved: VAT rate, VAT-inclusive vs VAT-exclusive contract value, withholding/BIR classification, external/automatic FX provider policy, and accounting-period policy beyond existing validated semantics. Do not invent these rules.

Known external limitation: a real Gmail send still requires a connected Google account/OAuth consent and was not exercised in CI.

## Confirmed phase after R5 — Warehouse Inventory

Warehouse Inventory remains a confirmed major requirement.

Minimum business need:

- know current warehouse inventory;
- trace stock movements;
- allocate/issue stock to projects;
- support returns/corrections without destructive balance editing;
- keep project material usage traceable while preserving warehouse stock truth.

Do not prematurely decide warehouse count, valuation method, reservation-vs-issue semantics, approval thresholds, serial/lot tracking, reorder rules, purchase-receipt automation, barcode/QR policy, or adjustment authority until client rules are explicit.

## Confirmed later major requirement — Worker Registration & Face-Recognition Attendance

This requirement is confirmed but should be treated as a later major pre-production domain, likely after R5 and Warehouse Inventory unless reprioritized. Exact phase number remains TBD.

### Intended flow

1. A project/site has a registration QR code.
2. A worker opens it, enters required details, and captures/uploads an enrollment image.
3. Submission creates a **PENDING registration**, not an immediately authoritative payroll employee.
4. Supervisor/admin reviews for duplicate/fake/wrong-project registration and approves.
5. Approval creates/links the canonical Worker, payroll/workforce record, and project/site assignment.
6. A registered site device operates as a shared attendance terminal.
7. Worker presents their face; the system recognizes the canonical worker and records time-in/time-out against the terminal's project/site.

### Required safeguards/design expectations

- Prefer biometric templates/embeddings for matching; retain raw source photos only when genuinely necessary and with explicit retention/deletion controls.
- Add liveness/anti-spoof protection so a printed/static image is not enough.
- Bind each attendance terminal to a project/site so context is automatic and auditable.
- Use confidence thresholds; uncertain recognition must not guess.
- Provide supervisor-assisted/manual fallback with reason/audit trail for PPE, lighting, camera, or recognition failures.
- Validate enrollment image quality and reject multiple/unclear faces.
- Use a clear attendance state machine such as `NOT_IN -> CLOCKED_IN -> CLOCKED_OUT`, with controlled cross-day/overtime/correction behavior.
- Support secure offline queue/sync for site connectivity problems without duplicate punches.
- Audit registration, approval, face re-enrollment, device, timestamp, project/site, manual corrections, and approving supervisor.
- Design privacy/consent/access/deletion controls before production biometric deployment.
- Treat payroll integration, camera behavior, offline sync, concurrency, spoofing, and biometric privacy as high-risk test areas.

Do not implement this as a quick UI-only feature.

## Permanent invariants

1. `one deployment -> one client company -> active membership/RBAC -> permitted workflows`.
2. Keep company-scoped RLS, permission checks, company-bound integrity, and audit boundaries.
3. No double counting of supplier Invoice/Expense/PO/Client Billing/Collections/Cash truth.
4. Actual Cost and Committed Cost remain distinct.
5. Client receivables remain distinct from supplier obligations/project cost.
6. Preserve original currency; never silently mix currencies or invent FX.
7. Preserve finalized/verified/issued/paid/collected/voided/reversed history through audited lifecycle/correction paths.
8. Derived summaries must not masquerade as canonical master records.
9. Navigation simplification is not authorization simplification.
10. Consequential AI mutations remain prepare/validate/human-confirm/execute.

## Fresh-session bootstrap

Before implementing R5, the next session should:

1. read live `AGENTS.md`;
2. read `docs/AGENT_EXECUTION_EFFICIENCY.md`;
3. read `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`;
4. read this handoff;
5. inspect exact current `main`, open PRs, and exact-head CI if any;
6. generate one bounded `agent:context` packet;
7. inspect existing Vendor/supplier/Procurement implementation before designing.

Do not rely on an old chat summary if live repository state differs.