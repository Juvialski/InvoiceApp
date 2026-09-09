# HydroQualiSense Active Roadmap

Status: **ACTIVE — QA CERTIFICATION NOT READY (EXTERNAL PROVIDER/RECOVERY GATES REMAIN)**  
Repository: `Juvialski/InvoiceApp`  
Last updated: **2026-09-09**  
Product direction: `docs/HYDROQUALISENSE_PRODUCT_DIRECTION.md`  
Client deployment strategy: `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`  
Current handoff: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`

Live repository state and `AGENTS.md` override remembered chat summaries and historical Engoryx plans.

## Application baseline for this checkpoint

Last application-code-bearing `main` merged before this documentation checkpoint:

`8f43ac9320ddaf4ce6076ee8f6f37fa4f9002eba`

Documentation-only commits after that SHA may advance repository and Render release identity without changing application/database contracts. Always re-read live `main` and the current Render deploy before dispatching current-head Hosted QA.

Recent QA-certification hardening completed through:

- PR #109 — QA identity / initial AI bootstrap / hosted certification hardening.
- PR #110 — hosted QA persisted-auth fail-closed guard.
- PR #111 — exact-SHA binding for Hosted QA Certification.
- PR #112 — hosted QA route-readiness and Engineering Storage probe repair plus forward cleanup migration.
- PR #113 — automatic repository-derived migration-level truth for `/api/health` and Hosted QA, removing the manual migration-level bookkeeping dependency.

All four protected checks were green on PR #113's exact final head before merge, including isolated local Supabase startup, clean migration replay, pgTAP, historical upgrade-path validation, application validation/build, Chromium demo QA, and Workflow Map consistency.

## Live QA state — 2026-09-09

QA topology remains:

- Render URL: `https://hydroqualisense-qa.onrender.com`
- Render service: `hydroqualisense-qa`
- Supabase project ref: `vrpuznofrntyqsbugrib`
- role: isolated QA + temporary synthetic demo environment only

Verified live state:

- The application-code-bearing PR #113 deploy at `8f43ac9320ddaf4ce6076ee8f6f37fa4f9002eba` was verified `live` before this documentation update. Documentation-only commits may subsequently advance the reported repository SHA; use the current live SHA for Hosted QA evidence.
- QA Supabase is `ACTIVE_HEALTHY`.
- QA migration head is independently `20260908235742_engineering_document_unlinked_storage_cleanup`.
- No `qa:db:push` was run merely to continue certification.
- QA contains the synthetic deployment company/configuration and currently has two Auth users / two active company memberships.
- Initial deployment AI bootstrap has **not** been completed in live QA: no current `company_ai_settings` / credential state exists for the synthetic QA company.
- `bootstrap_deployment_company(...)` and `bootstrap_deployment_company_ai_credential(...)` remain `SECURITY DEFINER` functions executable only by `postgres` / `service_role`, not browser roles.

## Migration / release-promotion gate — PASS

Routine application deployment is separated from database promotion:

- Render build command: `npm install && npm run build`
- Render start command: `npm start`
- repository `build` / `start` scripts contain no Supabase migration push
- database promotion remains the explicit guarded `qa:db:push` / `qa:db:reset` operator path
- PR #113 derives the expected migration level from canonical `supabase/migrations/*.sql` filenames in the exact checkout rather than requiring a manually copied timestamp in Render/GitHub variables

This separation must remain intact for future QA and production releases.

## Hosted authenticated QA gate — CURRENT-HEAD EVIDENCE STILL REQUIRED

The most recent completed manual Hosted QA Certification run predates PRs #112/#113. That older run proved:

- email/password authentication preflight passed;
- persisted session reload passed;
- fresh-navigation auth persistence passed;
- health identity passed for that old exact SHA;
- five of seven route-readiness checks passed;
- no application crash, page error, console error, or failed-request signal was observed on the two route-readiness false negatives;
- the old Storage probe failed.

PR #112 specifically replaced the brittle route-settle logic and repaired the Storage probe to create a valid Engineering Document/Revision fixture, verify authorized byte upload/read, and clean up correctly. Those repairs are merged and deployed, but a **new manual Hosted QA Certification run on exact current `main`** is still required before this gate can be marked PASS.

The GitHub-connected review capability in the 2026-09-09 certification session could inspect prior runs/artifacts but could not initiate a new `workflow_dispatch`; therefore absence of a current-head run is recorded as an external/operator execution gate, not silently waived.

## Supabase Auth provider gate — BLOCKED

Fresh QA Supabase security-advisor evidence on 2026-09-09 still reports:

- **Leaked Password Protection Disabled** — WARN

The connected Supabase capability does not expose Auth Site URL / redirect allow-list / password-security mutation or inspection endpoints. Therefore the following provider-side checks remain required and cannot be certified from repository/database state alone:

1. Site URL is `https://hydroqualisense-qa.onrender.com`.
2. Allowed redirect URLs cover the approved hosted QA confirmation/recovery flows.
3. Leaked-password protection is enabled.
4. Re-run the security advisor and retain provider evidence after the change.

Do not treat this unavailable provider setting as a pass.

## Recovery gate — BLOCKED ON FREE-TIER RECOVERY EVIDENCE

The Supabase organization is currently on the **Free** plan.

Current Supabase backup documentation states that automatic daily backups are provided for Pro, Team, and Enterprise projects; Free projects should regularly create their own off-site database exports. The same provider documentation states that database backups do **not** restore Supabase Storage object bytes.

Current QA application evidence tables also contain no completed recovery proof:

- `database_backup_runs`: 0 rows
- `database_restore_drills`: 0 rows
- `document_backup_replicas`: 0 rows

Therefore QA recovery is not certified yet. Required evidence remains:

1. a current off-site PostgreSQL backup/export for QA;
2. a restore drill into an isolated recovery target without damaging QA;
3. a separate Storage-object backup and byte-level restore drill;
4. documented recovery of required Render/Supabase/provider configuration and secret names/ownership without storing secret values in the repository;
5. deployment reconstruction/rollback evidence using the known repository SHA, Render configuration, and migration state.

Database backup evidence alone never closes the Storage recovery gate.

## Initial AI bootstrap gate — NOT YET VERIFIED LIVE

Repository/migration authorization is present and restricted correctly, but the live synthetic QA company has no configured AI credential/settings record yet.

Before QA can be READY:

1. the authorized initial QA operator must complete the one-time Settings → Deployment AI bootstrap with an approved QA Gemini credential;
2. the server must store only the encrypted credential envelope;
3. provider validation must be run and its bounded status recorded;
4. no browser/client secret exposure is allowed;
5. invalid-initial-credential recovery remains bounded by the merged PR #109 recovery contract.

Do not insert or inspect plaintext provider secrets through SQL or repository files.

## Security-advisor checkpoint

Fresh QA advisor results still include:

- 7 INFO `rls_enabled_no_policy` findings on deliberately closed/service-owned tables;
- 2 WARN anonymous `SECURITY DEFINER` findings (`rls_auto_enable()` provider-owned and `submit_public_prospect(...)` intentional anonymous intake with the QA DB gate disabled);
- 153 WARN authenticated `SECURITY DEFINER` findings across the RPC surface;
- 1 WARN Auth leaked-password protection disabled.

The broad `SECURITY DEFINER` count is an inventory signal, not automatic proof of a vulnerability; authorization remains governed by explicit grants plus function-internal membership/permission guards. Do not weaken RLS/RBAC to silence advisor counts. The leaked-password warning is a concrete provider configuration blocker and remains unresolved.

## Production separation — READ-ONLY CONFIRMED

Client A production remains:

- Supabase ref: `qijjshdwiylojvqojxyz`
- public URL: `https://hydroqualisense.com`
- project status: `ACTIVE_HEALTHY`

During the 2026-09-09 continuation, production was queried **read-only only**. Its observed migration head is now also `20260908235742_engineering_document_unlinked_storage_cleanup`. No production DDL, DML, Auth, Storage, secret, or side-effecting RPC mutation was performed by ChatGPT.

A fresh production `/api/health` body was not obtained by the connected tools during this checkpoint, so runtime release identity must not be inferred from the database head alone.

## QA CERTIFICATION result

`QA CERTIFICATION: NOT READY`

Passed now:

- the last application-code-bearing baseline and its then-current QA deploy were verified before the documentation checkpoint; exact SHA must be re-read after docs-only merges;
- no open PRs at checkpoint start;
- QA database is healthy and independently matches repository migration level `20260908235742`;
- migration-level bookkeeping is repository-derived;
- routine Render app deploy is separated from deliberate database migration promotion;
- production inspection remained read-only;
- current QA provider security advisor was re-checked;
- live AI-bootstrap state was checked and truthfully remains unconfigured.

Blocking READY:

1. Supabase Auth provider URL/redirect evidence and leaked-password protection enabled.
2. One successful manual Hosted QA Certification run on exact current `main` after PR #112/#113.
3. Live initial AI bootstrap/provider validation in QA.
4. PostgreSQL backup + isolated restore evidence.
5. Separate Storage-object backup + byte-level restore evidence.
6. Deployment/configuration/secret recovery ownership and reconstruction evidence.

Worker Registration remains blocked until all required certification gates are evidenced and the status is explicitly changed to `QA CERTIFICATION: READY`.

## NEXT AFTER QA — Worker Registration foundation

Only after READY, implement:

`project/site QR -> PENDING worker submission -> supervisor/admin duplicate/identity/project review -> canonical Worker/payroll/project assignment`

Rules:

- registration begins `PENDING`;
- ambiguous identity/duplicates require review;
- approval creates or links canonical workforce truth;
- worker identity, project/site assignment, and approval history remain auditable;
- uploaded images are evidence/enrollment input, not authoritative identity by themselves.

## Later phases

1. Site Attendance state machine + registered site/device + explicit time-in/time-out + duplicate-punch/offline/correction audit.
2. Face-Recognition Attendance only after explicit consent/privacy, template/raw-photo retention/deletion, liveness, confidence/fallback, device binding, offline/concurrency, and payroll-boundary design.
3. Other client-confirmed requirements.
4. Final pre-production security/data-integrity certification before broad multi-client rollout.

## Permanent invariants

1. `one deployment -> one client company -> active membership/RBAC -> permitted workflows`.
2. One repository may serve many isolated deployments; unrelated clients do not share operational databases.
3. Keep company-scoped RLS, permissions, company-bound integrity, audit history, and company-prefixed Storage paths.
4. Supplier evidence linked to an Expense must not become duplicate payable/Actual Cost truth.
5. Actual Cost and Committed Cost remain distinct.
6. Client Invoices/Collections remain distinct from supplier obligations/project Actual Cost.
7. Preserve original currency; never invent FX.
8. Finalized/verified/issued/paid/collected/voided/reversed history changes only through deliberate auditable lifecycle/correction paths.
9. Imported/AI identity is evidence, not automatically canonical identity when ambiguous.
10. Inventory stock remains explainable from authoritative movements.
11. Biometric attendance requires explicit privacy/identity/device/correction/audit semantics before production use.
12. Consequential AI-assisted mutations preserve prepare/validate/human-confirm/execute boundaries.

Still unresolved by design: VAT rate, VAT-inclusive vs VAT-exclusive contract value, withholding/BIR classification, automatic/external FX-provider policy, and broader accounting-period policy. Do not infer them.
