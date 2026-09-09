# HydroQualiSense Active Roadmap

Status: **ACTIVE — QA CERTIFICATION NOT READY**  
Repository: `Juvialski/InvoiceApp`  
Last updated: **2026-09-09**  
Product direction: `docs/HYDROQUALISENSE_PRODUCT_DIRECTION.md`  
Client deployment strategy: `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`  
Current handoff: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`

Live repository state and `AGENTS.md` override remembered chat summaries and historical Engoryx plans.

## Certified application baseline for this checkpoint

Last application/runtime-bearing `main` certified before the PR #120 documentation/CI-orchestration update:

`288940a196ff5886d352ed665f0d06dd998513b0`

Certification facts for that application-bearing baseline:

- QA Render URL: `https://hydroqualisense-qa.onrender.com`
- QA Render service: `hydroqualisense-qa`
- application-bearing Render deploy at `288940a196ff5886d352ed665f0d06dd998513b0`: **verified LIVE at certification time**
- QA Supabase ref: `vrpuznofrntyqsbugrib`
- QA migration head: `20260909053311_company_ai_secret_key_rpc_compatibility`
- Client A production Supabase ref: `qijjshdwiylojvqojxyz`
- production inspection during QA certification remains strictly read-only

Documentation-only or CI-orchestration-only commits after the certified application SHA may advance repository `main` and Render's reported release SHA without changing the built application/runtime or database migration contract. Re-read live `main` and Render whenever current identity matters, but do **not** rerun Hosted QA solely to chase a docs-only SHA. A new application/runtime/migration change requires a new exact deployed SHA + migration-parity + Hosted QA cycle.

Recent QA hardening:

- PR #109 — QA identity, initial AI bootstrap and hosted-certification hardening.
- PR #110 — persisted-auth fail-closed guard.
- PR #111 — exact-SHA binding for Hosted QA Certification.
- PR #112 — route-readiness stabilization and valid Engineering Storage byte probe.
- PR #113 — repository-derived migration-level truth; manual migration timestamp bookkeeping is no longer release authority.
- PRs #114/#115 — current QA checkpoint documentation and durable application-vs-docs SHA wording.
- PRs #116/#117 — hosted authentication/readiness stabilization on the current application-bearing `main`.
- PR #119 — modern Supabase secret-key compatibility for the server-only AI RPC contract.
- PR #120 — QA evidence update, migration-first instructions, manual Hosted QA dispatch, and post-QA reprioritization; no application runtime or database migration source changed.

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
- guarded QA-only migration promotion completed through `npm.cmd run qa:db:push -- --project-ref vrpuznofrntyqsbugrib --confirm-qa`
- live QA migration history independently matches repository migration head `20260909053311`

For QA certification, application deployment and migration promotion remain separate release actions but are now orchestrated automatically by `.github/workflows/qa-release.yml`. Every protected `main` push derives the repository migration head, reads QA parity, waits for exact QA Render health, promotes QA through the guarded wrapper only when behind, independently verifies complete migration parity, and then invokes reusable Hosted QA for application/runtime- or migration-bearing changes. Docs/tests/CI-only changes with QA already at parity stop after the protected read-only check. Do not spend a hosted run proving an already-known stale-DB mismatch.

## Certified application deployment gate — PASS

During the successful post-promotion certification run, `/api/health` reported application-bearing SHA `288940a196ff5886d352ed665f0d06dd998513b0` with `environment=qa`, deployment `qa-hydroqualisense`, and migration level `20260909053311`.

A later docs/CI-only merge may advance Render's reported repository SHA without invalidating this application-runtime evidence. Do not represent `288940a...` as permanently current `main`; re-read current identity when needed.

## Supabase Auth URL/provider gate — PASS WITH FREE-TIER LIMITATION

Verified operator evidence:

- Site URL: `https://hydroqualisense-qa.onrender.com`
- redirect allow-list uses the QA deployment and exact application callback targets, including password recovery `/?auth=reset` and Gmail/Google OAuth `/email-intake`
- the unsafe catch-all `https://**` redirect was removed

Supabase's current official password-security documentation states that leaked-password protection is available on the **Pro Plan and above**. QA is on Free, so the advisor warning `Leaked Password Protection Disabled` is an **accepted Free-tier limitation and is non-blocking**.

Do not weaken application Auth/RBAC controls because this paid-only control is unavailable. Reassess it when a production deployment uses an eligible plan.

## Hosted authenticated QA gate — PASS

The manual application-bearing `Hosted QA Certification` run ([#34318578911](https://github.com/Juvialski/InvoiceApp/actions/runs/34318578911)) succeeded on SHA `288940a196ff5886d352ed665f0d06dd998513b0` against `https://hydroqualisense-qa.onrender.com` after QA migration promotion.

Evidence:

- exact-SHA readiness passed before authentication and scenario assertions;
- Authenticated session persisted through reload and fresh protected navigation;
- unauthenticated protected-route rejection passed;
- `/api/health` returned HTTP 200 with `environment=qa`, deployment `qa-hydroqualisense`, repository SHA `288940a196ff5886d352ed665f0d06dd998513b0`, and migration level `20260909053311`;
- 8/8 authenticated route checks passed, including Settings and Email Intake;
- Settings loaded healthy AI metadata and showed the legitimate unconfigured state;
- Engineering Storage byte upload/read/hash probe passed with `metadataRowsCreated=0` and cleanup PASS;
- no console errors, page errors, failed requests, or contract failures were recorded.

This artifact remains the certification evidence for the last application/runtime-bearing SHA. Docs/CI-only merges do not require a new hosted run solely because their repository SHA is newer.

## Browser QA layers

HydroQualiSense intentionally uses two browser-validation layers:

1. **Local PR/demo QA** builds the checked-out PR, serves the isolated `/demo` workspace locally, uses fictional session-local data, and performs deterministic rendering/navigation/interaction checks. It does not mount production Auth, Supabase queries, Storage, Gmail authorization, or company writes.
2. **Hosted QA browser regression** runs only against `https://hydroqualisense-qa.onrender.com` with the protected GitHub `qa` environment credentials. It verifies the exact application-bearing repository SHA under certification, deployment identity, canonical migration level, authenticated session persistence, real route data states, and the synthetic Storage byte probe.

Hosted QA remains directly dispatchable for manual recovery and is also called by the protected release workflow only after exact SHA readiness and independent migration parity. This prevents expensive browser setup and route checks from running against a knowingly stale database. Hosted mutations are limited to uniquely named temporary synthetic Storage objects, cleaned in `finally`, with no document metadata rows. Production hosts are rejected.

## Product-truth surface boundaries

- **Email Intake** supports read-only Gmail search/sync, user-selected preservation/import into existing invoice, statement, or expense review workflows, saved routing rules, and a manual forwarded-invoice fallback. It does not present SMS or broadcast automation. Issued-document email delivery remains in the owning issued-document workflow.
- **Engineering Documents** is a project-owned register for drawings, specifications, reports, calculations, submittals, and immutable source revisions. Supplier evidence, issued financial documents, and other attachments remain owned by their canonical workflows; the demo register is fictional and does not create a second production document source.
- **Internal feature status** remains repository/operator information and is no longer mounted in ordinary client Settings. Worker Registration, Attendance, and Face Recognition remain future phases and are not presented as active product features.
- **AI Settings** separates runtime/configuration status from one-time bootstrap. Loaded configured metadata shows provider, enabled state, validation, and last-tested information without exposing credentials. A load failure shows `AI configuration status is temporarily unavailable` and never opens a key form. The form remains limited to a loaded unconfigured state or the existing authorized invalid-initial-credential recovery path; server/RPC bootstrap authorization is unchanged.

## Initial AI bootstrap gate — PENDING

The privileged bootstrap contract is present and service-role-only. Read-only production inspection recorded a configured, enabled, provider-validated Gemini state for Client A; production was not mutated. Live QA still requires its own approved synthetic-company AI bootstrap and provider validation.

Before READY, use the normal authenticated Settings → initial AI setup flow with an approved QA Gemini credential and run provider validation. The server must store only the encrypted envelope. Do not place plaintext provider secrets in SQL, repository files, browser storage, logs or handoff documentation.

The post-promotion Hosted QA artifact confirmed healthy `NOT_CONFIGURED` / untested AI metadata in QA. No approved QA Gemini credential was available in the operator environment or protected QA secrets during this run, so bootstrap and provider validation were not attempted.

## Recovery gate — PARTIALLY EVIDENCED / NOT READY

Supabase managed automatic daily backups/PITR that require a paid plan are **not QA blockers on Free**. Their absence is an accepted plan limitation.

Evidence collected:

- a current QA PostgreSQL schema/data export for the `public,private` application scope was created outside the database;
- the export restored successfully into a fresh isolated PostgreSQL 17 target;
- representative restored counts matched QA (`companies=1`, `deployment_configuration=1`, `company_members=2`, `projects=1`), with the deployment resolver and AI bootstrap RPC present.

Remaining recovery evidence:

1. transfer/retain the PostgreSQL export in an approved off-site operator location;
2. separate backup of representative Supabase Storage object bytes;
3. isolated byte restore/read/hash/path-permission verification.

Deployment reconstruction/rollback facts are recorded in the current handoff using repository SHA, Render service/configuration names, migration state, and secret/configuration names only.

Database backup evidence alone does not prove Storage object recovery.

## Production separation — PASS

Client A production remains read-only during QA certification. Its database was observed at migration head `20260908235742_engineering_document_unlinked_storage_cleanup`; no production DDL, DML, Auth, Storage, secret/configuration or side-effecting RPC mutation was performed by ChatGPT.

Application SHA and database migration level are independent release facts; do not infer one from the other.

## QA CERTIFICATION result

`QA CERTIFICATION: NOT READY`

Passed:

- certified application-bearing SHA and then-current QA deployment synchronization;
- guarded QA-only migration promotion, QA database health, and migration parity;
- server-only AI RPC grant/definition compatibility verified after promotion;
- repository-derived migration truth;
- routine application deploy separated from database promotion;
- application-bearing Hosted QA artifact with 8/8 routes, Auth, and Storage probe passing;
- off-provider QA PostgreSQL export and isolated restore drill;
- Auth Site URL and redirect allow-list corrected;
- leaked-password protection correctly classified as a non-blocking Free-tier limitation;
- production separation/read-only policy maintained.

Remaining achievable gates:

1. live QA initial AI bootstrap + provider validation with an approved QA Gemini credential;
2. approved off-site retention of the QA PostgreSQL export;
3. separate Storage byte backup + isolated restore/read/hash/path-permission evidence.

Do **not** block READY on paid-only Supabase controls that cannot be enabled on the current Free plan. Do **not** mark READY until the remaining achievable gates above are evidenced.

## NEXT AFTER READY — Email/SMS + Documents phase

After QA reaches READY, the next implementation priority is the user-confirmed **Email/SMS + Documents phase**. Bound its exact implementation scope from the current product truth at phase start; do not jump directly to Worker Registration.

Current ordering after QA:

1. Email/SMS + Documents phase;
2. Worker Registration foundation;
3. Site Attendance state machine + registered site/device;
4. Face-Recognition Attendance only after explicit privacy/security/retention/liveness/confidence/fallback design;
5. final pre-production security/data-integrity certification before broad rollout.

## Third priority — Worker Registration foundation

Worker Registration follows the Email/SMS + Documents phase:

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
3. Final pre-production security/data-integrity certification before broad rollout.

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
