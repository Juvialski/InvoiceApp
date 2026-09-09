# HydroQualiSense Active Roadmap

Status: **ACTIVE — QA CERTIFICATION NOT READY**  
Repository: `Juvialski/InvoiceApp`  
Last updated: **2026-09-09**  
Product direction: `docs/HYDROQUALISENSE_PRODUCT_DIRECTION.md`  
Client deployment strategy: `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`  
Current handoff: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`

Live repository state and `AGENTS.md` override remembered chat summaries and historical Engoryx plans.

## Current QA certification baseline

Current repository/deployment checkpoint before this focused fix:

- exact merged `main`: `fbb924f40ef91c9d1e9154367dba0e04b092ef76`
- QA Render URL: `https://hydroqualisense-qa.onrender.com`
- QA Render service: `hydroqualisense-qa`
- QA Render deploy for `fbb924f40ef91c9d1e9154367dba0e04b092ef76`: **LIVE**
- QA Supabase ref: `vrpuznofrntyqsbugrib`
- QA migration head: `20260908235742_engineering_document_unlinked_storage_cleanup`
- Client A production Supabase ref: `qijjshdwiylojvqojxyz`
- production inspection during QA certification remains strictly read-only

Recent QA hardening:

- PR #109 — QA identity, initial AI bootstrap and hosted-certification hardening.
- PR #110 — persisted-auth fail-closed guard.
- PR #111 — exact-SHA binding for Hosted QA Certification.
- PR #112 — route-readiness stabilization and valid Engineering Storage byte probe.
- PR #113 — repository-derived migration-level truth; manual migration timestamp bookkeeping is no longer release authority.
- PRs #114/#115 — current QA checkpoint documentation and durable application-vs-docs SHA wording.

## Plan-tier policy

QA certification must distinguish a real defect from a provider capability that is unavailable on the current plan.

**Paid-only provider controls are not certification blockers merely because the QA deployment is on a Free tier.** Record them as accepted plan limitations and carry them into the final production-readiness review. Do not invent evidence that an unavailable control is enabled.

Free-tier alternatives that are technically available may still be required when they validate a safety property. Examples include a manual off-site database export/restore and a separate Storage byte backup/restore instead of paid managed PITR/backups.

## Migration and release-promotion gate — PASS

- Render build: `npm install && npm run build`
- Render start: `npm start`
- routine Render deployment contains no Supabase migration promotion command
- database promotion remains explicit through guarded `qa:db:push` / `qa:db:reset`
- expected migration level is derived from canonical repository migration filenames
- live QA migration history independently matches repository migration head `20260908235742`

Do not run a migration push merely because application code or documentation redeploys.

## Render exact-deployment gate — PASS

Render independently reports exact current checkpoint SHA `fbb924f40ef91c9d1e9154367dba0e04b092ef76` as **live**. The prior application-bearing PR #113 code is therefore present under the current documentation-bearing release identity.

## Supabase Auth URL/provider gate — PASS WITH FREE-TIER LIMITATION

Verified operator evidence:

- Site URL: `https://hydroqualisense-qa.onrender.com`
- redirect allow-list uses the QA deployment and exact application callback targets, including password recovery `/?auth=reset` and Gmail/Google OAuth `/email-intake`
- the unsafe catch-all `https://**` redirect was removed

Supabase's current official password-security documentation states that leaked-password protection is available on the **Pro Plan and above**. QA is on Free, so the advisor warning `Leaked Password Protection Disabled` is an **accepted Free-tier limitation and is non-blocking**.

Do not weaken application Auth/RBAC controls because this paid-only control is unavailable. Reassess it when a production deployment uses an eligible plan.

## Hosted authenticated QA gate — FIX IN PROGRESS

A manual `Hosted QA Certification` run was dispatched on exact live SHA `fbb924f40ef91c9d1e9154367dba0e04b092ef76`.

The run failed in authentication preflight before credential/session/route/Storage certification because `scripts/hosted-qa-auth-preflight.ts` waited a fixed 500 ms after protected-route navigation and then immediately required `#auth-email` to exist. The application intentionally renders a short `Checking your workspace session...` state while Supabase resolves authentication, so the fixed 500 ms assumption is not a valid hosted-readiness contract.

Current focused fix:

- replace the 500 ms assumption with a bounded visible-form readiness wait;
- keep production-host refusal and persisted-session checks unchanged;
- add regression coverage so the fixed 500 ms check cannot return;
- merge only after exact-head protected CI is green;
- after the new `main` is live on QA, dispatch Hosted QA once on that exact SHA and retain the artifact.

Required final Hosted QA evidence remains:

- authentication preflight PASS;
- persisted session after reload PASS;
- persisted session on fresh protected navigation PASS;
- exact health/repository/migration identity PASS;
- 7/7 authenticated route checks PASS;
- Engineering Storage byte probe PASS;
- Storage probe creates no leftover metadata row (`metadataRowsCreated=0`);
- no crash/page/console/request blocker.

## Initial AI bootstrap gate — PENDING

The privileged bootstrap contract is present and service-role-only, but live QA previously had no configured `company_ai_settings`/credential state for the synthetic company.

Before READY, use the normal authenticated Settings → Deployment AI bootstrap flow with an approved QA Gemini credential and run provider validation. The server must store only the encrypted envelope. Do not place plaintext provider secrets in SQL, repository files, browser storage, logs or handoff documentation.

## Recovery gate — PENDING FREE-TIER-ACHIEVABLE EVIDENCE

Supabase managed automatic daily backups/PITR that require a paid plan are **not QA blockers on Free**. Their absence is an accepted plan limitation.

QA still needs achievable recovery evidence for the data paths the product controls:

1. current off-site PostgreSQL export for QA;
2. restore drill into an isolated recovery target;
3. separate backup of representative Supabase Storage object bytes;
4. isolated byte restore/read/hash/path-permission verification;
5. deployment reconstruction/rollback notes using repository SHA, Render configuration names and migration state;
6. required secret/configuration ownership recorded by name only, never secret values.

Database backup evidence alone does not prove Storage object recovery.

## Production separation — PASS

Client A production remains read-only during QA certification. Its database was observed at migration head `20260908235742_engineering_document_unlinked_storage_cleanup`; no production DDL, DML, Auth, Storage, secret/configuration or side-effecting RPC mutation was performed by ChatGPT.

Application SHA and database migration level are independent release facts; do not infer one from the other.

## QA CERTIFICATION result

`QA CERTIFICATION: NOT READY`

Passed:

- exact repository/Render deployment synchronization at the current checkpoint;
- QA database health and migration parity;
- repository-derived migration truth;
- routine application deploy separated from database promotion;
- Auth Site URL and redirect allow-list corrected;
- leaked-password protection correctly classified as a non-blocking Free-tier limitation;
- production separation/read-only policy maintained.

Remaining achievable gates:

1. merge and deploy the bounded Hosted QA auth-readiness harness fix;
2. successful Hosted QA artifact on the new exact live `main`;
3. live QA initial AI bootstrap + provider validation;
4. Free-tier-achievable PostgreSQL export + isolated restore evidence;
5. separate Storage byte backup + isolated restore evidence;
6. deployment/configuration recovery notes.

Do **not** block READY on paid-only Supabase controls that cannot be enabled on the current Free plan. Do **not** mark READY until the remaining achievable gates above are evidenced.

## NEXT AFTER READY — Worker Registration foundation

Only after READY:

`project/site QR -> PENDING worker submission -> supervisor/admin duplicate/identity/project review -> canonical Worker/payroll/project assignment`

Rules:

- registration begins `PENDING`;
- ambiguous identity/duplicates require human review;
- approval creates or links canonical workforce truth;
- worker identity, project/site assignment and approval history remain auditable;
- uploaded images are evidence/enrollment input, not authoritative identity by themselves;
- face recognition is out of scope for this phase.

## Later phases

1. Site Attendance state machine + registered site/device + explicit time-in/time-out + duplicate-punch/offline/correction audit.
2. Face-Recognition Attendance only after explicit consent/privacy, retention/deletion, liveness, confidence/fallback, device binding, offline/concurrency and payroll-boundary design.
3. Other client-confirmed requirements.
4. Final pre-production security/data-integrity certification before broad rollout.

## Permanent invariants

1. `one deployment -> one client company -> active membership/RBAC -> permitted workflows`.
2. Unrelated clients do not share operational databases/Auth/Storage/secrets.
3. Keep company-scoped RLS, permissions, company-bound integrity, audit history and company-prefixed Storage paths.
4. Supplier evidence linked to an Expense must not become duplicate payable/Actual Cost truth.
5. Actual Cost and Committed Cost remain distinct.
6. Client Invoices/Collections remain distinct from supplier obligations/project Actual Cost.
7. Preserve original currency; never invent FX.
8. Finalized/auditable financial, inventory, engineering, payroll, document and future attendance history changes only through deliberate lifecycle/correction paths.
9. Imported/AI identity is evidence when ambiguous, not canonical truth by default.
10. Inventory stock remains explainable from authoritative movements.
11. Biometric attendance requires explicit privacy/identity/device/correction/audit semantics before production use.
12. Consequential AI-assisted mutations preserve prepare/validate/human-confirm/execute boundaries.

Still unresolved by design: VAT rate, VAT-inclusive vs VAT-exclusive contract value, withholding/BIR classification, automatic/external FX-provider policy and broader accounting-period policy. Do not infer them.
