# HydroQualiSense Current Handoff

Status: **CURRENT — QA CERTIFICATION NOT READY**  
Date: **2026-09-09**  
Repository: `Juvialski/InvoiceApp`

Use this with `AGENTS.md`, `docs/AGENTS_BASELINE_20260909.md`, `docs/AGENT_EXECUTION_EFFICIENCY.md`, `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`, `docs/HYDROQUALISENSE_WORKFLOW_UX_AUDIT_20260909.md`, `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`, and `docs/HYDROQUALISENSE_DEPLOYMENT_RUNBOOK.md`. Live repository state remains authoritative.

## Repository/application baseline

This documentation update started from exact merged `main`:

`354cfd6ad9a834979c81ef990365f661b33fc829`

That commit is the merged Wave 1A application-bearing state from PR #126.

The last retained successful Hosted QA application baseline predating Wave 1A remains:

`288940a196ff5886d352ed665f0d06dd998513b0`

Do not confuse these facts. Wave 1A is complete as product implementation, but the newer application-bearing SHA is not covered automatically by the older Hosted QA artifact. Exact deployed-SHA identity, migration parity, and Hosted QA remain a separate readiness requirement for the newer application baseline.

## Workflow UX audit — persisted

The broad user-facing workflow audit now lives at:

`docs/HYDROQUALISENSE_WORKFLOW_UX_AUDIT_20260909.md`

It preserves:

- UX-001 through UX-016 with priorities and classifications;
- permanent financial/source-of-truth constraints;
- Wave 1A / 1B / 2 / 3 mapping;
- explicit out-of-scope boundaries;
- current remediation status;
- the rule that `UNCERTAIN — needs runtime/manual confirmation` findings are not defects until runtime evidence confirms them.

The audit is internal development documentation. Do not expose UX IDs, engineering waves, PRs, CI, migrations, SHAs, or agent terminology in the client-facing Settings roadmap.

## Wave 1A — Supplier Payable Lifecycle UX — COMPLETE

PR #126 is merged and its final exact-head required CI was green before merge.

Supported user journey:

`Supplier Invoice`  
→ authoritative linked `Expense`  
→ `Record Payment`  
→ `Cash & Banking` with exact `EXPENSE` target context  
→ legitimate existing cash/bank transaction evidence  
→ explicit settlement confirmation  
→ partial/full payment state + history/reversal  
→ return navigation to Expense or supplier invoice

Permanent semantics preserved:

- Expense is the authoritative payable/cost after supplier-invoice verification;
- supplier invoice remains source evidence;
- no duplicate payable or Actual Cost;
- no naive manual `Mark Paid` flag;
- payment state derives from settlement/reconciliation evidence;
- partial/full settlement, reversals, permissions, original currency, FX semantics, and auditability remain intact;
- canonical Expense deep linking is separate from the old correction-opening behavior.

Wave 1A also repaired settlement-candidate lifecycle context for payroll so the shared lifecycle gate did not accidentally hide valid APPROVED/PAID payroll targets. Payroll payment semantics themselves remain a dedicated later Wave 3 design item.

## Immediate user-prioritized product sequence

Unless the user reprioritizes again:

1. **Wave 1B — Client Receivable Lifecycle UX — NEXT**
2. **Wave 2 — Cross-module routing and handoffs**
3. **Wave 3 — deliberate payroll/subcontract/PO workflow decisions**
4. resume the broader approved product roadmap:
   - Email/SMS + Documents;
   - Worker Registration;
   - Site Attendance;
   - Face-Recognition Attendance after explicit privacy/security design;
   - final pre-production certification.

Do not jump directly from QA work to Email/SMS + Documents while ignoring this explicit UX reprioritization.

## Wave 1B — next intended UX implementation phase

Primary findings: UX-006 and UX-007.

Target:

`Issued Client Invoice`  
→ `Record Collection`  
→ `Cash & Banking` with exact client-invoice/collection target context  
→ legitimate bank/cash transaction  
→ explicit settlement confirmation  
→ partial/full collection state + history  
→ direct return to client invoice

Required user-facing information:

- invoice amount;
- collected amount;
- remaining amount;
- collection state;
- collection history;
- reversals where supported;
- contextual `Record Collection` only when permitted and lifecycle-eligible.

Reuse Wave 1A's object-first settlement-routing pattern. Client receivable truth must remain distinct from supplier obligations and project Actual Cost.

Do **not** include payroll payment redesign, subcontract payable design, PO close changes, Warehouse redesign, Worker Registration, Attendance, Face Recognition, or Email/SMS/Documents implementation in Wave 1B.

## Remaining audit findings

- UX-003 — Expense/source relationship navigation: partially remediated by Wave 1A; broader navigation remains Wave 2.
- UX-006 / UX-007 — client collection continuation/status/history: Wave 1B.
- UX-008 — PO close guard: still `UNCERTAIN`; runtime/database confirmation required before any fix.
- UX-009 — Procurement receipt → Warehouse continuation: Wave 2.
- UX-010 — payroll manual-paid semantics: Wave 3 deliberate design.
- UX-011 — subcontract certified-payable bridge: Wave 3 deliberate financial design.
- UX-012 — Warehouse movement → source navigation: Wave 2.
- UX-013 — Email Intake post-import continuation: still `UNCERTAIN`; runtime/manual confirmation required.
- UX-014 — domain-aware stale/invalid deep-link recovery: Wave 2.
- UX-015 — targeted Wave 1A mobile flows passed around 390px, but broader dense Expense/table states remain partially evidenced/open.
- UX-016 — subcontract mobile density: later subcontract workflow phase.

## Permanent financial invariants from the audit

Never solve payment/collection UX by introducing naive manual paid/collected flags.

Preserve:

- authoritative financial source ownership;
- partial/full settlement;
- reversals and history;
- permissions;
- original currency and explicit FX semantics;
- auditability;
- supplier invoice evidence separate from authoritative linked Expense cost/payable truth;
- client billing/collections separate from supplier obligations and project Actual Cost;
- cash/bank evidence without double-counting payable or receivable truth.

## QA / release-readiness track — parallel and still NOT READY

QA certification remains separate from the UX implementation sequence.

`QA CERTIFICATION: NOT READY`

The retained successful Hosted QA artifact for `288940a196ff5886d352ed665f0d06dd998513b0` recorded exact-SHA readiness, authenticated persistence, unauthenticated protected-route rejection, 8/8 authenticated route checks, healthy AI metadata in the legitimate unconfigured state, Engineering Storage byte upload/read/hash cleanup evidence, and no console/page/request/contract failures.

Because Wave 1A is a newer application-bearing `main`, the older Hosted QA artifact must not be used as proof for the Wave 1A SHA. The normal release sequence remains:

`exact intended app SHA -> verify QA identity/migration parity -> guarded QA promotion if required -> Hosted QA / provider checks`

Application deployment and database promotion remain separate release facts. Production promotion is never inferred from QA success.

### Remaining achievable QA blockers

1. establish the required exact deployed-SHA/migration-parity/Hosted-QA evidence for the current application-bearing main;
2. live QA initial AI bootstrap + provider validation with an approved QA Gemini credential;
3. approved off-site retention of the QA PostgreSQL export;
4. separate Supabase Storage byte backup + isolated restore/read/hash/path-permission evidence.

Paid-only leaked-password protection and managed backup/PITR controls unavailable on the current Free plan are accepted plan limitations and are not blockers by themselves.

## Recovery evidence

Recorded evidence already includes an off-provider QA PostgreSQL `public,private` export, successful isolated PostgreSQL 17 restore, representative restored counts, and presence of the deployment resolver and AI bootstrap RPC.

Database backup evidence does not prove Storage recovery. Separate Storage byte backup/restore evidence remains required.

## Production separation

Client A production remains read-only unless explicitly authorized under repository policy. No QA certification, merge, Render deploy, or generic PR review authorizes production DDL, DML, Auth, Storage, secret/configuration, or side-effecting RPC writes.

Current production facts previously recorded:

- URL: `https://hydroqualisense.com`
- Supabase ref: `qijjshdwiylojvqojxyz`
- observed production migration head at the recorded checkpoint: `20260908235742_engineering_document_unlinked_storage_cleanup`

Do not infer production application SHA from database migration head.

## Broader approved roadmap after audit waves

The audit reprioritization does not cancel:

1. Email/SMS + Documents improvements;
2. Worker Registration foundation: `project/site QR -> PENDING worker submission -> supervisor/admin duplicate/identity/project review -> canonical Worker/payroll/project assignment`;
3. Site Attendance state machine + registered site/device + explicit time-in/time-out + duplicate-punch/offline/correction audit;
4. Face-Recognition Attendance only after explicit consent/privacy, retention/deletion, liveness, confidence/fallback, device binding, offline/concurrency, and payroll-boundary design;
5. final pre-production security/data-integrity certification before broad rollout.

Worker registration begins `PENDING`; ambiguous identity/duplicates require human review; approval creates or links canonical workforce truth; uploaded images are evidence/enrollment input, not authoritative identity by themselves; face recognition remains out of scope until its dedicated design phase.

## Permanent repository invariants

1. `one deployment -> one client company -> active membership/RBAC -> permitted workflows`.
2. Unrelated clients do not share operational databases/Auth/Storage/secrets.
3. Keep company-scoped RLS, permission checks, company-bound integrity, audit boundaries, and company-prefixed Storage paths.
4. Supplier invoice evidence linked to Expense must not duplicate Actual Cost/payable truth.
5. Actual Cost and Committed Cost remain distinct.
6. Client billing/collections remain distinct from supplier obligations and project Actual Cost.
7. Preserve original currency; never invent FX.
8. Finalized/auditable financial, inventory, engineering, payroll, document, and future attendance history changes only through deliberate lifecycle/correction paths.
9. Imported/AI identity is evidence when ambiguous, not canonical truth by default.
10. Inventory balances remain explainable from authoritative movements.
11. Biometric attendance requires explicit privacy, identity, retention/deletion, device, correction, liveness, confidence/fallback, and audit semantics before production use.
12. Consequential AI mutations preserve prepare/validate/human-confirm/execute boundaries.

Still unresolved by design: VAT rate, VAT-inclusive vs VAT-exclusive contract value, withholding/BIR classification, automatic/external FX-provider policy, and broader accounting-period policy. Do not infer them.