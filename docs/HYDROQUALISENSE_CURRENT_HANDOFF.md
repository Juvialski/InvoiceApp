# HydroQualiSense Current Handoff

Status: **CURRENT — WAVE 3 IN PROGRESS / QA CERTIFICATION NOT READY**
Date: **2026-09-10**
Repository: `Juvialski/InvoiceApp`

Use this with `AGENTS.md`, `docs/AGENTS_BASELINE_20260909.md`, `docs/AGENT_EXECUTION_EFFICIENCY.md`, `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`, `docs/HYDROQUALISENSE_WORKFLOW_UX_AUDIT_20260909.md`, `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`, and `docs/HYDROQUALISENSE_DEPLOYMENT_RUNBOOK.md`. Live repository state remains authoritative.

## Wave 3 starting baseline

Wave 1A is complete through PR #126, Wave 1B is complete through PR #129, and Wave 2 cross-module routing and handoffs is complete through PR #131. This Wave 3 implementation starts from exact green `main`:

`18503d271b9a3081cc484c106a88e333e67e030c`

The prior Protected QA Release completed green, including migration parity and authenticated hosted QA. That evidence belongs to its exact certified SHA and does not certify Wave 3 application or migration changes.

The last retained successful Hosted QA application baseline predating Wave 1A remains:

`288940a196ff5886d352ed665f0d06dd998513b0`

The older retained Hosted QA artifact remains evidence only for `288940a...`; exact deployed-SHA identity, migration parity, and Hosted QA remain separate readiness facts for every later application-bearing SHA.

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

Wave 1A also repaired settlement-candidate lifecycle context for payroll so the shared lifecycle gate did not accidentally hide valid APPROVED/PAID payroll targets. Wave 3 now owns the dedicated payroll settlement semantics and certified subcontract payable bridge.

## Immediate user-prioritized product sequence

Unless the user reprioritizes again:

1. **Wave 1B — Client Receivable Lifecycle UX — COMPLETE**
2. **Wave 2 — Cross-module routing and handoffs — COMPLETE**
3. **Wave 3 — deliberate payroll/subcontract/PO workflow decisions — ACTIVE**
4. resume the broader approved product roadmap:
   - Email/SMS + Documents;
   - Worker Registration;
   - Site Attendance;
   - Face-Recognition Attendance after explicit privacy/security design;
   - final pre-production certification.

Do not jump directly from QA work to Email/SMS + Documents while ignoring this explicit UX reprioritization.

## Wave 1B — Client Receivable Lifecycle UX — COMPLETE

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

Delivered:

`Issued Client Invoice` → contextual `Record Collection` with exact billing selection → canonical ClientCollection allocation/recording → Cash & Banking with exact `CLIENT_COLLECTION` target → legitimate posted CREDIT transaction and explicit settlement → partial/full link state and history → direct return to the originating client invoice.

The client invoice detail now derives invoice amount, amount collected, amount remaining, collection state, associated collection history, and cash-link status from the existing records. ClientCollection remains commercial receivable truth; financial transaction matches remain separate settlement evidence and do not change project cost.

The same phase also corrects the production-like base-reporting projection: a source with USD 11.72 and authoritative PHP 760.16 is reported in PHP once, while its USD source evidence remains preserved; a foreign source without conversion evidence remains explicitly unconverted.

Do **not** include payroll payment redesign, subcontract payable design, PO close changes, Warehouse redesign, Worker Registration, Attendance, Face Recognition, or Email/SMS/Documents implementation in Wave 1B.

## Wave 2 — Cross-module routing and handoffs — COMPLETE

The bounded Wave 2 implementation kept existing domain authority intact while connecting exact records across the workflow:

- Supplier Invoices are exposed through normal navigation using the existing invoice register and RBAC contract.
- Expense rows and detail can continue to authoritative supplier invoice and purchase-order records only when persisted identifiers exist.
- Cash & Banking returns use target-aware labels and preserve the exact Expense context.
- Procurement receipt continuation opens the exact Warehouse receipt context; an existing persisted movement is preferred when available, while Warehouse posting remains an explicit human action.
- Warehouse movements link back to the exact persisted Procurement purchase-order receipt when source metadata exists.
- Missing entity links recover to the nearest authorized register without revealing inaccessible records; loader failures remain runtime errors rather than false not-found states.
- Email Intake remains unchanged after proof-first focused tests and deterministic demo browser evidence found no concrete continuation defect.

Wave 2 remains bounded to routing, discoverability, context, stale-link recovery, and targeted 390px usability. Its implementation is complete; payroll settlement, subcontract payable, PO close semantics, and subcontract responsive workflow are carried by active Wave 3.

## Wave 3 — deliberate payroll/subcontract/PO workflow decisions — ACTIVE

The current feature branch implements the bounded Wave 3 design:

- payroll approval remains separate from payment; direct APPROVED → PAID UI, Assistant, and database paths are blocked, while Cash & Banking settlement evidence drives partial/full disbursement and reversal history;
- approved subcontract claims themselves are settlement targets, using `net_certified_amount` as payable basis and preserving gross certified work as project-cost truth;
- zero-account payment flows show permission-aware account onboarding and keep the selected target in context;
- runtime evidence reproduced unsafe partial PO close, so the forward close guard blocks outstanding committed quantities while fully received POs may close with receipt history preserved;
- subcontract claim cards are responsive around 390px and expose certification, net payable, payment state, history, and return context.

The product implementation is complete on this feature branch pending PR review and exact-head CI. QA certification remains a separate readiness track.

## Remaining audit findings

- UX-003 — Expense/source relationship navigation: **RESOLVED for the delivered supplier invoice and purchase-order source links; further domains remain outside this wave.**
- UX-006 / UX-007 — client collection continuation/status/history: **RESOLVED in Wave 1B.**
- UX-008 — PO close guard: **RESOLVED in Wave 3** after local runtime reproduction and guarded partial-close fix.
- UX-009 — Procurement receipt → Warehouse continuation: **RESOLVED for exact receipt/movement continuation; automatic posting remains intentionally separate.**
- UX-010 — payroll manual-paid semantics: **REMEDIATED in Wave 3** through evidence-derived settlement.
- UX-011 — subcontract certified-payable bridge: **REMEDIATED in Wave 3** through the canonical claim target.
- UX-012 — Warehouse movement → source navigation: **RESOLVED where persisted purchase-order receipt metadata exists.**
- UX-013 — Email Intake post-import continuation: still `UNCERTAIN`; runtime/manual confirmation required.
- UX-014 — domain-aware stale/invalid deep-link recovery: **RESOLVED for the delivered invoice, Expense, project, Procurement, and Warehouse deep-link surfaces.**
- UX-015 — targeted Wave 1A mobile flows passed around 390px, but broader dense Expense/table states remain partially evidenced/open.
- UX-016 — subcontract mobile density: **REMEDIATED in Wave 3** with responsive claim cards and target-aware payment continuation.

The supplier-side routing handoff remains complete from Wave 2: the normal sidebar exposes `Supplier Invoices`, existing supplier invoices remain in the authoritative register, and the existing correction/history workflow remains the only legitimate reopen path.

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
