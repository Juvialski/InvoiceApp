# HydroQualiSense Active Roadmap

Status: **ACTIVE — WAVE 3 IN PROGRESS / QA CERTIFICATION NOT READY**
Repository: `Juvialski/InvoiceApp`  
Last updated: **2026-09-10**
Product direction: `docs/HYDROQUALISENSE_PRODUCT_DIRECTION.md`  
Client deployment strategy: `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`  
Current handoff: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`  
Workflow UX audit: `docs/HYDROQUALISENSE_WORKFLOW_UX_AUDIT_20260909.md`

Live repository state and `AGENTS.md` override remembered chat summaries and historical Engoryx plans.

## Wave 3 starting baseline and current workflow-remediation state

Wave 1A Supplier Payable Lifecycle UX is complete through merged PR #126. Wave 1B Client Receivable Lifecycle UX is complete through merged PR #129. Wave 2 cross-module routing and handoffs is complete through merged PR #131. The current Wave 3 starting baseline is the exact green `main` SHA:

`18503d271b9a3081cc484c106a88e333e67e030c`

The prior Protected QA Release completed green, including migration parity and authenticated hosted QA. That release evidence is a readiness fact for its exact SHA; it does not change the separate `QA CERTIFICATION NOT READY` product-readiness status or certify Wave 3 application or migration changes.

Wave 3 is **ACTIVE**. The detailed audit source of truth, finding IDs, classifications, and wave mapping live in `docs/HYDROQUALISENSE_WORKFLOW_UX_AUDIT_20260909.md`.

## Immediate user-prioritized product workflow sequence

The user explicitly reprioritized the broad UX/workflow audit remediation ahead of the remaining broader product phases:

1. **Wave 1A — Supplier Payable Lifecycle UX — COMPLETE**
2. **Wave 1B — Client Receivable Lifecycle UX — COMPLETE**
3. **Wave 2 — Cross-module routing and handoffs — COMPLETE**
4. **Wave 3 — deliberate payroll/subcontract/PO workflow decisions — ACTIVE**
5. Resume the broader approved product roadmap unless the user reprioritizes again:
   - Email/SMS + Documents;
   - Worker Registration foundation;
   - Site Attendance state machine + registered site/device;
   - Face-Recognition Attendance only after explicit privacy/security/retention/liveness/confidence/fallback design;
   - final pre-production security/data-integrity certification before broad rollout.

### Wave 1A — Supplier Payable Lifecycle UX — COMPLETE

Implemented pattern:

`Supplier Invoice -> authoritative linked Expense -> Record Payment -> Cash & Banking with exact EXPENSE target -> legitimate financial transaction -> explicit settlement -> partial/full state + history/reversal -> return navigation`

Permanent semantics preserved:

- linked Expense is the authoritative payable/cost after supplier-invoice verification;
- supplier invoice remains source evidence;
- no duplicate Actual Cost or payable;
- no manual paid flag;
- payment state derives from settlement/reconciliation evidence;
- partial/full settlement, reversals, history, RBAC, original currency, and FX semantics remain intact;
- canonical Expense detail/deep linking remains separate from the old correction-opening path.

### Wave 1B — Client Receivable Lifecycle UX — COMPLETE

Primary audit findings: UX-006 and UX-007.

Target pattern:

`Issued Client Invoice -> Record Collection -> Cash & Banking with exact client-invoice/collection target context -> legitimate bank/cash transaction -> explicit settlement -> partial/full collection state + history -> return to client invoice`

User-facing requirements:

- invoice amount;
- collected amount;
- remaining amount;
- collection state;
- collection history;
- reversals where supported;
- `Record Collection` only when permitted and lifecycle-eligible.

Delivered object-first journey:

`Issued Client Invoice` → `Record Collection` with the exact billing selected → canonical `ClientCollection` allocation and recording → Cash & Banking with exact `CLIENT_COLLECTION` context → legitimate posted CREDIT evidence and explicit settlement → partial/full collection-link state and history → direct return to the selected client invoice.

The detail view derives invoice amount, collected amount, remaining amount, collection state, related collection records, and available cash-link status from the existing authoritative records. ClientCollection commercial truth remains separate from cash settlement evidence and project Actual Cost.

### Wave 2 — Cross-module routing and handoffs — COMPLETE

**Status: COMPLETE on merged `main` through PR #131.**

Primary audit targets:

- remaining Expense relationship/source navigation (UX-003);
- any residual Cash -> Expense navigation issues (UX-004);
- Procurement receipt -> Warehouse continuation (UX-009);
- Warehouse movement -> source navigation (UX-012);
- Email Intake post-import continuation only after runtime confirmation (UX-013);
- domain-aware stale/invalid deep-link recovery without leaking unauthorized existence (UX-014);
- bounded mobile/discoverability work supported by actual runtime evidence.

Wave 2 must also make the existing supplier `Invoices` register obvious in normal sidebar navigation, improve discovery of existing supplier invoices, expose the verified-invoice reopen/correction continuation, and keep invoice breadcrumbs/back navigation consistent. This remains explicitly outside Wave 1B.

The current bounded implementation also carries exact Expense, Cash, Procurement, and Warehouse source context through centralized route contracts, recovers stale entity links to the nearest authorized register, and keeps Email Intake proof-first unless runtime evidence demonstrates a concrete continuation gap.

Keep this wave focused on navigation, context, discoverability, and truthful handoffs. Do not invent duplicate domain records to make navigation easier.

### Wave 3 — Deliberate business-workflow decisions

**Status: ACTIVE from exact merged `main` `18503d2`; implementation is complete on the current feature branch pending PR review and exact-head CI.**

These require explicit lifecycle/source-of-truth design rather than opportunistic routing polish:

- payroll settlement semantics (UX-010): approval remains separate from Cash & Banking disbursement evidence, with direct paid-status paths blocked;
- subcontract payable bridge (UX-011): `Approved/Certified Claim -> Net Certified Payable -> authoritative payable obligation -> settlement` without duplicate Expense/payable/Actual Cost truth;
- Purchase Order close guard (UX-008): runtime-confirmed partial/unreceived obligations block close while receipt history remains preserved;
- subcontract mobile workflow (UX-016), including responsive claim cards, settlement state/history, account onboarding, and return context.

## Parallel QA / release-readiness track

QA certification, recovery evidence, provider validation, deployment identity, migration parity, and production separation remain active operational gates in parallel with the UX sequence.

`QA CERTIFICATION: NOT READY`

UX development may continue without falsely declaring QA READY. Conversely, QA work must not silently erase the explicit Wave 1B -> Wave 2 -> Wave 3 product priority.

Production Supabase remains read-only unless explicitly authorized under repository policy.

## Certified application baseline for this checkpoint

The last retained successful hosted application/runtime certification baseline before the newer application-bearing Wave 1A merge remains:

`288940a196ff5886d352ed665f0d06dd998513b0`

Certification facts for that retained baseline:

- QA Render URL: `https://hydroqualisense-qa.onrender.com`
- QA Render service: `hydroqualisense-qa`
- application-bearing Render deploy at `288940a196ff5886d352ed665f0d06dd998513b0`: **verified LIVE at certification time**
- QA Supabase ref: `vrpuznofrntyqsbugrib`
- QA migration head recorded for that certification evidence: `20260909053311_company_ai_secret_key_rpc_compatibility`
- Client A production Supabase ref: `qijjshdwiylojvqojxyz`
- production inspection during QA certification remains strictly read-only

Documentation-only or CI-orchestration-only commits do not invalidate the most recent hosted runtime artifact. Application/runtime/migration-bearing changes do require a new exact deployed SHA + migration-parity + Hosted QA cycle before they become the new certified application baseline. Wave 1A was application-bearing, so `354cfd6a...` must not be represented as hosted-certified based on the older artifact.

Recent QA hardening remains recorded through PRs #109-#120, including QA identity, persisted-auth fail-closed behavior, exact-SHA binding, route-readiness stabilization, repository-derived migration truth, Auth URL correction, modern Supabase secret-key compatibility, migration-first release sequencing, and protected Hosted QA boundaries.

## Plan-tier policy

QA certification must distinguish a real defect from a provider capability unavailable on the current plan.

**Paid-only provider controls are not certification blockers merely because QA is on a Free tier.** Record them as accepted plan limitations and carry them into final production-readiness review. Do not invent evidence that an unavailable control is enabled.

Free-tier alternatives that can validate a safety property may still be required, such as manual off-site database export/restore and separate Storage byte backup/restore instead of paid managed PITR/backups.

## Migration and release-promotion gate — PASS / DURABLE RULE

- Render build: `npm install && npm run build`
- Render start: `npm start`
- routine Render deployment contains no Supabase migration promotion command
- database promotion remains explicit through guarded repository/connected-operator policy
- expected migration level is derived from canonical repository migration filenames
- application deployment and migration promotion remain separate release actions
- protected QA release sequencing must verify exact intended SHA and canonical migration parity before Hosted QA

Docs/tests/CI-only changes do not justify expensive hosted runtime certification merely to chase repository SHA. Application/runtime/migration changes do.

## Supabase Auth URL/provider gate — PASS WITH FREE-TIER LIMITATION

Verified operator evidence recorded for QA:

- Site URL: `https://hydroqualisense-qa.onrender.com`
- redirect allow-list uses exact QA application callback targets, including password recovery `/?auth=reset` and Gmail/Google OAuth `/email-intake`
- unsafe catch-all `https://**` redirect was removed

Leaked-password protection is unavailable on the current Free plan and is an accepted non-blocking plan limitation. Do not weaken application Auth/RBAC controls because the provider control is unavailable.

## Hosted authenticated QA gate — LAST RETAINED PASS

Hosted QA Certification run `#34318578911` succeeded on application-bearing SHA `288940a196ff5886d352ed665f0d06dd998513b0` against the QA deployment after migration promotion.

Retained evidence includes:

- exact-SHA readiness before authentication/scenarios;
- authenticated persistence and unauthenticated protected-route rejection;
- `/api/health` QA deployment identity and migration-level match for that baseline;
- 8/8 authenticated route checks, including Settings and Email Intake;
- healthy AI metadata in the legitimate unconfigured state;
- Engineering Storage byte upload/read/hash probe with cleanup;
- zero console errors, page errors, failed requests, or contract failures.

This artifact remains evidence for **that** application-bearing SHA only. It is not proof for the newer Wave 1A application-bearing `main`.

## Browser QA layers

HydroQualiSense intentionally uses two browser-validation layers:

1. **Local PR/demo QA** builds the checked-out PR, serves isolated `/demo` data, and performs deterministic rendering/navigation/interaction checks without production Auth/Supabase/Storage/Gmail/company writes.
2. **Hosted QA browser regression** targets only the protected QA deployment and verifies exact application-bearing repository SHA, deployment identity, canonical migration level, authenticated state, real route data states, and bounded synthetic Storage evidence.

Wave 1A's new supplier/Expense/Cash scenarios passed deterministic desktop and approximately 390px mobile browser QA on the final exact PR head. That evidence closes the targeted Wave 1A mobile flow but does not prove every existing dense Expense/table state is fully mobile-optimized; UX-015 therefore remains partially evidenced/open in the audit.

## Product-truth surface boundaries

- **Email Intake** supports read-only Gmail search/sync, user-selected preservation/import into existing invoice, statement, or Expense review workflows, saved routing rules, and a manual forwarded-invoice fallback. SMS/broadcast automation is not presented as active.
- **Engineering Documents** remains a project-owned register; supplier evidence, issued financial documents, and other attachments remain owned by canonical workflows.
- **Internal audit IDs/waves** are repository/operator information and must not be exposed in client Settings.
- **AI Settings** separates runtime/configuration status from one-time bootstrap and must never expose credentials.
- **Settings Features & Roadmap** reflects the actual Available supplier-payment and client-invoice collection behavior. Do not add internal audit IDs, PRs, CI, migration names, SHAs, or agent terminology there.

## Initial AI bootstrap gate — PENDING

The privileged bootstrap contract remains service-role-only. Live QA still requires its own approved synthetic-company AI bootstrap and provider validation before QA can be READY.

Use the normal authenticated Settings initial AI setup flow with an approved QA Gemini credential. Store only the encrypted credential envelope. Never place plaintext provider secrets in SQL, repository files, browser storage, logs, or handoff documentation.

## Recovery gate — PARTIALLY EVIDENCED / NOT READY

Paid managed automatic backup/PITR absence is not a Free-tier blocker.

Recorded completed evidence:

- QA PostgreSQL `public,private` schema/data export created outside the database;
- successful restore into fresh isolated PostgreSQL 17;
- representative restored counts matched recorded QA;
- deployment resolver and AI bootstrap RPC present in the restored schema.

Remaining achievable recovery evidence:

1. retain/transfer the PostgreSQL export in an approved off-site operator location;
2. separate backup of representative Supabase Storage object bytes;
3. isolated byte restore/read/hash/path-permission verification.

Database backup evidence does not prove Storage object recovery.

## Production separation — PASS

Client A production remains read-only during QA/readiness work unless explicitly authorized under repository policy. Application SHA and database migration level are independent release facts; do not infer one from the other.

## QA CERTIFICATION result

`QA CERTIFICATION: NOT READY`

Recorded passed/no-longer-blocking items include:

- prior certified application-bearing QA deployment synchronization;
- guarded QA migration/parity evidence for the retained baseline;
- server-only AI RPC compatibility checks;
- repository-derived migration truth;
- deployment/promotion separation and migration-first ordering;
- retained Hosted QA Auth/routes/Storage evidence;
- off-provider database export/restore drill;
- corrected QA Auth URL/redirect allow-list;
- leaked-password protection correctly classified as a non-blocking Free-tier limitation;
- production separation/read-only policy.

Remaining achievable gates:

1. live QA initial AI bootstrap + provider validation with an approved QA Gemini credential;
2. approved off-site retention of the QA PostgreSQL export;
3. separate Storage byte backup + isolated restore/read/hash/path-permission evidence;
4. because Wave 1A is a newer application-bearing main, establish the required exact deployed-SHA/migration-parity/Hosted-QA evidence for the current application before declaring that newer baseline certified.

Do **not** block READY on paid-only provider controls unavailable on the current Free plan. Do **not** mark READY until the achievable gates are evidenced.

## Broader approved product roadmap after audit waves

The audit reprioritization does not delete or cancel these phases:

1. Email/SMS + Documents improvements;
2. Worker Registration foundation: `project/site QR -> PENDING worker submission -> supervisor/admin duplicate/identity/project review -> canonical Worker/payroll/project assignment`;
3. Site Attendance state machine + registered site/device + explicit time-in/time-out + duplicate-punch/offline/correction audit;
4. Face-Recognition Attendance only after explicit consent/privacy, retention/deletion, liveness, confidence/fallback, device binding, offline/concurrency, and payroll-boundary design;
5. final pre-production security/data-integrity certification before broad rollout.

Worker registration begins `PENDING`; ambiguous identity/duplicates require human review; approval creates or links canonical workforce truth; uploaded images are evidence/enrollment input, not authoritative identity by themselves; face recognition is out of scope until its dedicated design phase.

## Permanent invariants

1. `one deployment -> one client company -> active membership/RBAC -> permitted workflows`.
2. Unrelated clients do not share operational databases/Auth/Storage/secrets.
3. Keep company-scoped RLS, permissions, company-bound integrity, audit history and company-prefixed Storage paths.
4. Supplier evidence linked to an Expense must not become duplicate payable/Actual Cost truth.
5. Actual Cost and Committed Cost remain distinct.
6. Client Invoices/Collections remain distinct from supplier obligations/project Actual Cost.
7. Cash/bank settlement/reconciliation evidence must not double-count collection or payable truth.
8. Preserve original currency; never invent FX.
9. Finalized/auditable financial, inventory, engineering, payroll, document and future attendance history changes only through deliberate lifecycle/correction paths.
10. Imported/AI identity is evidence when ambiguous, not canonical truth by default.
11. Inventory stock remains explainable from authoritative movements.
12. Biometric attendance requires explicit privacy/identity/device/correction/audit semantics before production use.
13. Consequential AI-assisted mutations preserve prepare/validate/human-confirm/execute boundaries.

Still unresolved by design: VAT rate, VAT-inclusive vs VAT-exclusive contract value, withholding/BIR classification, automatic/external FX-provider policy, and broader accounting-period policy. Do not infer them.
