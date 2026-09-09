# HydroQualiSense Active Roadmap

Status: **ACTIVE — QA CERTIFICATION NOT READY**  
Repository: `Juvialski/InvoiceApp`  
Last updated: **2026-09-09**  
Product direction: `docs/HYDROQUALISENSE_PRODUCT_DIRECTION.md`  
Client deployment strategy: `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`  
Current handoff: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`

Live repository state and `AGENTS.md` override remembered chat summaries and historical Engoryx plans.

## Current QA certification baseline

Current repository/deployment checkpoint before this focused phase:

- exact merged `main`: `e0c89e5cb8bbe1b59471d380fab28347c8e2542d`
- QA Render URL: `https://hydroqualisense-qa.onrender.com`
- QA Render service: `hydroqualisense-qa`
- QA Render deploy for `e0c89e5cb8bbe1b59471d380fab28347c8e2542d`: **LIVE**
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
- PRs #116/#117 — hosted authentication/readiness stabilization on the current exact `main`.

This focused product-truth, Settings, and hosted-browser hardening phase is being developed from that checkpoint; its new UI and hosted assertions are not certified against QA until the merged SHA is deployed there.

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

Render independently reports exact current checkpoint SHA `e0c89e5cb8bbe1b59471d380fab28347c8e2542d` as **live**. The current application-bearing hardening is therefore present under the current release identity.

## Supabase Auth URL/provider gate — PASS WITH FREE-TIER LIMITATION

Verified operator evidence:

- Site URL: `https://hydroqualisense-qa.onrender.com`
- redirect allow-list uses the QA deployment and exact application callback targets, including password recovery `/?auth=reset` and Gmail/Google OAuth `/email-intake`
- the unsafe catch-all `https://**` redirect was removed

Supabase's current official password-security documentation states that leaked-password protection is available on the **Pro Plan and above**. QA is on Free, so the advisor warning `Leaked Password Protection Disabled` is an **accepted Free-tier limitation and is non-blocking**.

Do not weaken application Auth/RBAC controls because this paid-only control is unavailable. Reassess it when a production deployment uses an eligible plan.

## Hosted authenticated QA gate — CURRENT BASELINE PASS / FOCUSED EXPANSION PENDING

The current exact-main `Hosted QA Certification` run (#34305523363) succeeded on live SHA `e0c89e5cb8bbe1b59471d380fab28347c8e2542d` against `https://hydroqualisense-qa.onrender.com`.

Baseline evidence:

- Authenticated session persisted through reload and fresh protected navigation.
- `/api/health` reported `environment=qa`, deployment `qa-hydroqualisense`, repository SHA `e0c89e5cb8bbe1b59471d380fab28347c8e2542d`, and migration level `20260908235742`.
- 7/7 baseline authenticated route checks passed.
- Engineering Storage byte probe passed with matching SHA-256 bytes, `metadataRowsCreated=0`, and cleanup PASS.
- No console errors, page errors, or failed requests were recorded.

The focused phase extends this contract with:

- exact-SHA readiness polling before any hosted authentication or scenario assertion;
- fast refusal for non-QA or wrong-deployment identities;
- semantic workspace/application readiness, including the AppShell loading state;
- route-specific loaded-state assertions for Dashboard, Projects, Expenses, Procurement, Warehouse, Payroll, Settings, and Email Intake;
- an unauthenticated protected-route check;
- sanitized evidence and the existing production-host refusal.

The expanded suite remains pending until the merged SHA is live on QA and a new artifact is retained. A successful older SHA is not evidence for the focused branch.

## Browser QA layers

HydroQualiSense intentionally uses two browser-validation layers:

1. **Local PR/demo QA** builds the checked-out PR, serves the isolated `/demo` workspace locally, uses fictional session-local data, and performs deterministic rendering/navigation/interaction checks. It does not mount production Auth, Supabase queries, Storage, Gmail authorization, or company writes.
2. **Hosted QA browser regression** runs only against `https://hydroqualisense-qa.onrender.com` with the protected GitHub `qa` environment credentials. It verifies the exact live repository SHA, deployment identity, canonical migration level, authenticated session persistence, real route data states, and the synthetic Storage byte probe.

The hosted workflow supports both `workflow_dispatch` and bounded post-`main` push execution. It waits for Render to expose the exact expected SHA and fails clearly if the deployment is not ready; it never replaces pre-merge branch validation. Hosted mutations are limited to uniquely named temporary synthetic Storage objects, cleaned in `finally`, with no document metadata rows. Production hosts are rejected.

## Product-truth surface boundaries

- **Email Intake** supports read-only Gmail search/sync, user-selected preservation/import into existing invoice, statement, or expense review workflows, saved routing rules, and a manual forwarded-invoice fallback. It does not present SMS or broadcast automation. Issued-document email delivery remains in the owning issued-document workflow.
- **Engineering Documents** is a project-owned register for drawings, specifications, reports, calculations, submittals, and immutable source revisions. Supplier evidence, issued financial documents, and other attachments remain owned by their canonical workflows; the demo register is fictional and does not create a second production document source.
- **Internal feature status** remains repository/operator information and is no longer mounted in ordinary client Settings. Worker Registration, Attendance, and Face Recognition remain future phases and are not presented as active product features.
- **AI Settings** separates runtime/configuration status from one-time bootstrap. Loaded configured metadata shows provider, enabled state, validation, and last-tested information without exposing credentials. A load failure shows `AI configuration status is temporarily unavailable` and never opens a key form. The form remains limited to a loaded unconfigured state or the existing authorized invalid-initial-credential recovery path; server/RPC bootstrap authorization is unchanged.

## Initial AI bootstrap gate — PENDING

The privileged bootstrap contract is present and service-role-only. Read-only production inspection recorded a configured, enabled, provider-validated Gemini state for Client A; production was not mutated. Live QA still requires its own approved synthetic-company AI bootstrap and provider validation.

Before READY, use the normal authenticated Settings → initial AI setup flow with an approved QA Gemini credential and run provider validation. The server must store only the encrypted envelope. Do not place plaintext provider secrets in SQL, repository files, browser storage, logs or handoff documentation.

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

1. merge and deploy this focused product-truth, Settings, and hosted-browser expansion;
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
