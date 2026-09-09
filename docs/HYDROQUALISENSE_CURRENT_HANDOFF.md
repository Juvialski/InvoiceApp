# HydroQualiSense Current Handoff

Status: **CURRENT — QA CERTIFICATION NOT READY**  
Date: **2026-09-09**  
Repository: `Juvialski/InvoiceApp`

Use this with `AGENTS.md`, `docs/AGENT_EXECUTION_EFFICIENCY.md`, `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`, `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`, and `docs/HYDROQUALISENSE_DEPLOYMENT_RUNBOOK.md`. Live repository state remains authoritative.

## Exact current checkpoint

Repository/deployment state before this focused product-truth and Hosted QA expansion:

- merged `main`: `e0c89e5cb8bbe1b59471d380fab28347c8e2542d`
- open PRs at checkpoint start: none
- QA Render URL: `https://hydroqualisense-qa.onrender.com`
- QA Render service: `hydroqualisense-qa`
- Render deploy for `e0c89e5cb8bbe1b59471d380fab28347c8e2542d`: **LIVE**
- QA Supabase ref: `vrpuznofrntyqsbugrib`
- QA migration head: `20260908235742_engineering_document_unlinked_storage_cleanup`
- Client A production Supabase ref: `qijjshdwiylojvqojxyz`
- production remains strictly read-only throughout QA certification

Recent hardening is complete through PR #117. PRs #116/#117 contain the bounded Hosted QA readiness stabilization. This new focused product-truth, Settings, and browser-QA phase is not yet merged or deployed to QA.

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

Render independently reports exact current checkpoint SHA `e0c89e5cb8bbe1b59471d380fab28347c8e2542d` as live.

Routine app deploy and database promotion remain separate:

```text
Render build: npm install && npm run build
Render start: npm start
DB promotion: explicit guarded qa:db:push / qa:db:reset only
```

PR #113 made migration-level release truth repository-derived. Stale legacy migration environment values do not override the canonical repository migration head.

## QA migration parity — PASS

QA Supabase is healthy and independently reports migration head:

`20260908235742_engineering_document_unlinked_storage_cleanup`

No migration push/reset was run simply because certification continued or documentation redeployed.

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

## Hosted QA exact-head run — CURRENT BASELINE PASS / FOCUSED EXPANSION PENDING

Hosted QA Certification run #34305523363 succeeded against exact live SHA:

`e0c89e5cb8bbe1b59471d380fab28347c8e2542d`

The retained baseline artifact recorded the following successful checks:

- authenticated email/session state persisted through reload and fresh protected navigation;
- QA environment, deployment ID, repository SHA, and migration level matched;
- 7/7 baseline routes passed;
- Engineering Storage byte upload/read/hash/cleanup passed with `metadataRowsCreated=0`;
- zero console errors, page errors, or failed requests.

The focused phase adds a shared exact-SHA readiness poll before authentication, semantic AppShell loading detection, route-specific loaded-state assertions for the seven baseline routes plus Email Intake, and an unauthenticated protected-route check. It also removes arbitrary fixed waits from local demo scenario actions. These additions require a new post-merge QA artifact; the current baseline artifact is not evidence for the new branch.

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

## Recovery evidence — PENDING ACHIEVABLE FREE-TIER DRILLS

Paid managed daily backups/PITR are not required for this Free-tier QA certification.

Still required because they are achievable on Free and directly test recoverability:

1. current off-site PostgreSQL export of QA;
2. isolated PostgreSQL restore drill;
3. separate backup of representative Supabase Storage object bytes;
4. isolated byte restore/read/hash/path-permission check;
5. deployment reconstruction/rollback notes using repository SHA, migration state and configuration/secret names only;
6. clear ownership for required provider secrets/configuration without recording their values.

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
- QA Supabase healthy and migration parity confirmed;
- repository-derived migration truth;
- app deployment separated from database promotion;
- QA Auth Site URL confirmed;
- redirect allow-list corrected to exact application callback targets;
- leaked-password protection correctly reclassified as an accepted, non-blocking Free-tier limitation;
- paid managed backup/PITR availability is not a Free-tier blocker;
- production remains read-only and isolated.

### Remaining achievable blockers

1. merge/deploy the focused product-truth, Settings, and hosted-browser expansion;
2. successful Hosted QA Certification artifact on the new exact live `main`;
3. live QA AI bootstrap + provider validation;
4. off-site QA PostgreSQL export + isolated restore drill;
5. separate Storage byte backup + isolated restore drill;
6. deployment/configuration recovery evidence.

Do not block READY on paid-only Supabase features unavailable to this Free project. Do not mark READY until the achievable blockers above are closed.

## Immediate sequence

1. Complete the focused product-truth, Settings, and hosted-browser expansion through exact-head PR CI and merge when safe.
2. Let the automatic post-`main` Hosted QA workflow wait for Render QA to expose the new exact `main`, then retain its artifact. Use manual `workflow_dispatch` only for an explicit rerun/debugging need.
3. Complete Settings → initial AI setup and provider validation in QA.
4. Complete the Free-tier-achievable database and Storage recovery drills.
5. Re-check exact main/deploy/migration/Auth/Hosted QA/recovery evidence.
6. If all achievable gates pass, set `QA CERTIFICATION: READY`.
7. Immediately prepare Worker Registration foundation.

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
