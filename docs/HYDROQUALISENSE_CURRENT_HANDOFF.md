# HydroQualiSense Current Handoff

Status: **CURRENT — QA CERTIFICATION NOT READY**  
Date: **2026-09-09**  
Repository: `Juvialski/InvoiceApp`

Use this with `AGENTS.md`, `docs/AGENT_EXECUTION_EFFICIENCY.md`, `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`, `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`, and `docs/HYDROQUALISENSE_DEPLOYMENT_RUNBOOK.md`. Live repository state remains authoritative.

## Exact current checkpoint

Repository/deployment state verified after the focused product-truth and Hosted QA expansion:

- merged `main`: `288940a196ff5886d352ed665f0d06dd998513b0`
- open PRs at checkpoint start: none
- QA Render URL: `https://hydroqualisense-qa.onrender.com`
- QA Render service: `hydroqualisense-qa`
- Render deploy for `288940a196ff5886d352ed665f0d06dd998513b0`: **LIVE**
- QA Supabase ref: `vrpuznofrntyqsbugrib`
- QA migration head: `20260909053311_company_ai_secret_key_rpc_compatibility`
- Client A production Supabase ref: `qijjshdwiylojvqojxyz`
- production remains strictly read-only throughout QA certification

Recent hardening is complete through merged PR #119. The guarded QA migration promotion and post-promotion Hosted QA certification for this checkpoint are recorded below.

## Deployment model

HydroQualiSense remains:

`one source repository -> many isolated client deployments`

Each operational deployment remains:

`one deployment -> one client company -> active membership/RBAC -> permitted workflows`

Unrelated clients do not share operational databases, Auth, Storage or secrets.

## Plan-tier certification rule

Provider features that are impossible on the active Free plan are **not blockers merely because they are unavailable**. Record them explicitly as accepted plan limitations and re-evaluate them for production when an eligible plan is used.

Do not convert an unavailable paid-only feature into a false PASS. Conversely, do not hold QA indefinitely for a control the plan cannot enable.

Where a Free-tier alternative can validate the same operational recovery property, use that achievable evidence instead. For this QA environment that means manual database export/restore and separate Storage byte backup/restore rather than paid managed backup/PITR requirements.

## QA Render/release identity — PASS

`/api/health` reports exact current checkpoint SHA `288940a196ff5886d352ed665f0d06dd998513b0` as live with `environment=qa`, deployment `qa-hydroqualisense`, and migration level `20260909053311`.

Routine app deploy and database promotion remain separate:

```text
Render build: npm install && npm run build
Render start: npm start
DB promotion: explicit guarded qa:db:push / qa:db:reset only
```

PR #113 made migration-level release truth repository-derived. Stale legacy migration environment values do not override the canonical repository migration head.

## QA migration parity — PASS

The repository-approved guarded command completed successfully:

```text
npm.cmd run qa:db:push -- --project-ref vrpuznofrntyqsbugrib --confirm-qa
```

QA Supabase is healthy and independently reports migration head:

`20260909053311_company_ai_secret_key_rpc_compatibility`

Production remains at `20260908235742_engineering_document_unlinked_storage_cleanup`; `20260909053311` is not applied there. No production migration, DDL, DML, Auth, Storage, secret/configuration or side-effecting RPC mutation was performed.

## AI RPC compatibility promotion — PASS

Post-promotion QA catalog checks confirmed for all five server-only AI RPCs:

- legacy `request.jwt.claim.role` and `current_user` caller checks are absent;
- `anon` and `authenticated` do not have `EXECUTE`;
- `service_role` retains `EXECUTE`;
- deployment-company guards remain present;
- bootstrap, metadata lookup and test recording remain `SECURITY DEFINER` with empty `search_path`;
- credential resolution and invalidation remain `SECURITY INVOKER` with empty `search_path`.

The post-promotion security advisor reported no finding for these five RPCs. Its broader existing warnings remain recorded as provider/application hardening follow-up; the single leaked-password warning is an accepted Free-tier limitation.

## Supabase Auth URL configuration — PASS

Operator-provided QA dashboard evidence confirms:

- Site URL = `https://hydroqualisense-qa.onrender.com`
- approved exact QA redirect targets include:
  - `https://hydroqualisense-qa.onrender.com/?auth=reset`
  - `https://hydroqualisense-qa.onrender.com/email-intake`
- the prior unsafe `https://**` catch-all redirect was removed
- a Render-preview wildcard may remain only as a preview-environment allowance; it is not relied upon for the live service

Application source uses `/` for normal confirmation, `/?auth=reset` for password recovery, and `/email-intake` for Google/Gmail OAuth callback handling.

## Leaked-password protection — ACCEPTED FREE-TIER LIMITATION / NON-BLOCKING

Supabase's current official password-security documentation states that leaked-password protection is available on **Pro Plan and above**.

QA is on Free. Therefore the security-advisor warning:

`Leaked Password Protection Disabled`

is expected on this plan and does **not** block QA certification. Preserve normal password/Auth/RBAC controls and re-evaluate leaked-password protection for an eligible production plan.

## Hosted QA exact-head run — PASS

Manual Hosted QA Certification run [#34318578911](https://github.com/Juvialski/InvoiceApp/actions/runs/34318578911) succeeded against exact live SHA:

`288940a196ff5886d352ed665f0d06dd998513b0`

The retained artifact recorded:

- exact-SHA readiness before authentication and scenario assertions;
- authenticated email/session state persisted through reload and fresh protected navigation;
- unauthenticated protected-route rejection;
- QA environment, deployment ID, repository SHA, and migration level matched;
- 8/8 authenticated routes passed, including Settings and Email Intake;
- Settings loaded healthy AI metadata in the legitimate unconfigured state;
- Engineering Storage byte upload/read/hash passed with `metadataRowsCreated=0` and cleanup PASS;
- zero console errors, page errors, failed requests, or contract failures.

The production-host refusal and protected GitHub `qa` credential boundary remain unchanged.

## Browser QA layers

Pre-merge `qa:demo` targets a locally built PR at `/demo` with fictional session-local data and no production Auth/Supabase/Storage/Gmail/company writes. Post-deploy `qa:hosted` targets only `https://hydroqualisense-qa.onrender.com`, uses protected GitHub `qa` environment credentials, waits for exact `/api/health` repository/deployment/migration identity, and then exercises real authenticated routes and the safe synthetic Storage byte probe. Hosted temporary objects are namespaced and cleaned; no auditable metadata rows are created.

The hosted workflow retains explicit `workflow_dispatch` and also runs on pushes to `main`; the latter is bounded by the exact-SHA readiness poll and does not replace pull-request validation.

## Product-truth and Settings correction

- Email Intake now describes the actual read-only Gmail discovery/sync, source-preserving review routing, saved rules, and forwarded-invoice fallback. SMS/broadcast automation is not presented; issued-document email delivery remains with the owning document workflow.
- Engineering Documents is presented as a project-owned register for supported drawings/specifications/reports/calculations/submittals and immutable revisions. Supplier evidence, issued financial documents, and other attachments remain in their owning workflows. The demo shortcut is explicitly fictional.
- The internal feature registry is no longer mounted in client Settings. Worker Registration, Attendance, and Face Recognition remain future work and are not client-facing active features.
- AI Settings now loads safe metadata for settings readers, displays configured/validated Gemini state without credential material, shows a bounded temporary-unavailable state on metadata failure, and only renders the bootstrap key form after a loaded unconfigured/authorized-candidate state or the existing authorized invalid-initial-credential recovery state. The server-only AI RPCs now use exact `service_role` execution grants as their caller boundary, so modern Supabase `sb_secret_...` keys work without relying on legacy JWT request-role claims; deployment-company and bootstrap guards remain in force.

## QA initial AI bootstrap — PENDING

The database bootstrap authority remains service-role-only. The supported QA Render server-key contract is the modern Supabase `sb_secret_...` key; the legacy JWT `service_role` API key is not required. A QA deployment with no credential may validly return `status = NOT_CONFIGURED` and `credentialConfigured = false` from healthy metadata loading; that state is not the same as a metadata-load failure. Production inspection recorded a configured, enabled, provider-validated Gemini state and remained read-only. Before READY, the authorized QA operator must use Settings → initial AI setup with an approved QA Gemini credential and run provider validation for the synthetic QA company. The server stores only the encrypted credential envelope.

Do not put plaintext AI credentials in SQL, repository files, browser storage, logs or this handoff.

No approved QA Gemini credential was present in the operator environment or protected QA secrets during this run. The healthy `NOT_CONFIGURED` / untested state is therefore recorded, but bootstrap and provider validation remain pending and were not attempted.

## Recovery evidence — PARTIALLY EVIDENCED / NOT READY

Paid managed daily backups/PITR are not required for this Free-tier QA certification.

Completed evidence:

- a current `public,private` QA PostgreSQL schema/data export was created outside the database;
- the export restored successfully into a fresh isolated PostgreSQL 17 target;
- representative restored counts matched QA: `companies=1`, `deployment_configuration=1`, `company_members=2`, `projects=1`;
- the deployment resolver and AI bootstrap RPC were present in the restored schema.

Still required:

1. transfer/retain the PostgreSQL export in an approved off-site operator location;
2. separate backup of representative Supabase Storage object bytes;
3. isolated byte restore/read/hash/path-permission check.

The export files were kept in an operator-controlled local temporary location for this drill; that local copy is not being represented as off-site retention. The Hosted QA Storage probe is application smoke evidence only and does not substitute for this separate recovery gate.

### Deployment reconstruction and rollback facts

Reconstruction target:

- repository SHA: `288940a196ff5886d352ed665f0d06dd998513b0`;
- Render service: `hydroqualisense-qa`;
- QA URL: `https://hydroqualisense-qa.onrender.com`;
- QA Supabase project ref: `vrpuznofrntyqsbugrib`;
- migration level: `20260909053311_company_ai_secret_key_rpc_compatibility`;
- required non-secret identity/configuration names: `HYDROQUALISENSE_ENVIRONMENT`, `HYDROQUALISENSE_DEPLOYMENT_ID`, `HYDROQUALISENSE_QA_PROJECT_REF`, `HYDROQUALISENSE_PRODUCTION_PROJECT_REF`, `VITE_HYDROQUALISENSE_ENVIRONMENT`, `VITE_HYDROQUALISENSE_DEPLOYMENT_ID`, `VITE_HYDROQUALISENSE_PUBLIC_FUNNEL_ENABLED`, `VITE_ENABLE_SAMPLE_INVOICES`;
- required secret/configuration names only: `AI_CREDENTIALS_MASTER_KEY`, `SUPABASE_AI_SERVER_KEY`, `QA_E2E_EMAIL`, `QA_E2E_PASSWORD`, `QA_E2E_SUPABASE_PUBLISHABLE_KEY`.

Rollback remains application-build rollback only when compatible with the forward database state. Applied migrations are forward-only; no production rollback or promotion was attempted.

The current app-level recovery evidence tables were previously empty; do not manufacture rows. Database backup evidence never substitutes for Storage byte recovery evidence.

## Production separation — PASS

Client A production:

- URL: `https://hydroqualisense.com`
- Supabase ref: `qijjshdwiylojvqojxyz`
- observed migration head: `20260908235742_engineering_document_unlinked_storage_cleanup`

All production inspection in this QA phase has been read-only. No production DDL, DML, Auth, Storage, secrets/configuration or side-effecting RPC mutation was performed by ChatGPT.

Do not infer production application SHA from the production database migration head.

## QA certification verdict

`QA CERTIFICATION: NOT READY`

### Passed / no longer blocking

- exact current checkpoint repository SHA deployed live to QA;
- QA Supabase healthy and guarded migration parity confirmed;
- five server-only AI RPC definitions/grants verified after promotion;
- repository-derived migration truth;
- app deployment separated from database promotion;
- exact-head Hosted QA artifact with 8/8 routes, Auth, and Storage probe passing;
- off-provider QA PostgreSQL export and isolated restore drill;
- QA Auth Site URL confirmed;
- redirect allow-list corrected to exact application callback targets;
- leaked-password protection correctly reclassified as an accepted, non-blocking Free-tier limitation;
- paid managed backup/PITR availability is not a Free-tier blocker;
- production remains read-only and isolated.

### Remaining achievable blockers

1. live QA AI bootstrap + provider validation with an approved QA Gemini credential;
2. approved off-site retention of the QA PostgreSQL export;
3. separate Storage byte backup + isolated restore drill.

Do not block READY on paid-only Supabase features unavailable to this Free project. Do not mark READY until the achievable blockers above are closed.

## Immediate sequence

1. Complete Settings → initial AI setup and provider validation in QA when an approved QA Gemini credential is available.
2. Transfer the current PostgreSQL export to an approved off-site operator location.
3. Complete the separate Storage byte backup/restore/path-permission drill using protected QA credentials.
4. Re-check exact main/deploy/migration/Auth/Hosted QA/recovery evidence.
5. If all achievable gates pass, set `QA CERTIFICATION: READY`.
6. Immediately prepare Worker Registration foundation.

## Next phase after READY — Worker Registration foundation

Target:

`project/site QR -> PENDING worker submission -> supervisor/admin duplicate/identity/project review -> canonical Worker/payroll/project assignment`

Rules:

- registration starts `PENDING`;
- ambiguous identity/duplicates require human review;
- approval creates or links canonical workforce truth;
- project/site assignment and approval history remain auditable;
- uploaded image is evidence/enrollment input, not authoritative identity by itself;
- no face-recognition implementation is authorized in this phase.

After Worker Registration: Site Attendance state machine/device registration, then Face Recognition only after explicit privacy/security/retention/liveness/confidence/fallback design.

## Permanent invariants

1. `one deployment -> one client company -> active membership/RBAC -> permitted workflows`.
2. Keep company-scoped RLS, permission checks, company-bound integrity, audit boundaries and company-prefixed Storage paths.
3. Supplier invoice evidence linked to Expense must not duplicate Actual Cost/payable truth.
4. Actual Cost and Committed Cost remain distinct.
5. Client billing/collections remain distinct from supplier obligations and project Actual Cost.
6. Preserve original currency; never invent FX.
7. Finalized/auditable financial, inventory, engineering, payroll, document and future attendance history changes only through deliberate lifecycle/correction paths.
8. Imported/AI identity is evidence when ambiguous, not canonical truth by default.
9. Inventory balances remain explainable from authoritative movements.
10. Biometric attendance requires explicit privacy, identity, retention/deletion, device, correction, liveness, confidence/fallback and audit semantics before production use.
11. Consequential AI mutations preserve prepare/validate/human-confirm/execute boundaries.

Still unresolved by design: VAT rate, VAT-inclusive vs VAT-exclusive contract value, withholding/BIR classification, automatic/external FX-provider policy and broader accounting-period policy. Do not infer them.
