# HydroQualiSense Current Handoff

Status: **CURRENT — QA CERTIFICATION NOT READY (EXTERNAL PROVIDER/RECOVERY GATES REMAIN)**  
Date: **2026-09-09**  
Repository: `Juvialski/InvoiceApp`

Use this with `AGENTS.md`, `docs/AGENT_EXECUTION_EFFICIENCY.md`, `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`, `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`, and `docs/HYDROQUALISENSE_DEPLOYMENT_RUNBOOK.md`. Live repository state remains authoritative.

## Exact repository baseline

Current merged `main` at this checkpoint:

`8f43ac9320ddaf4ce6076ee8f6f37fa4f9002eba`

There were no open PRs when this certification continuation began.

Recent QA-certification hardening:

- PR #109 — QA identity, exact initial-operator AI bootstrap, hosted certification hardening, and bounded invalid-credential recovery.
- PR #110 — hosted QA authentication persistence fails closed.
- PR #111 — Hosted QA Certification bound to the exact workflow SHA.
- PR #112 — route-readiness stabilization, valid Engineering Storage byte probe, uploader-scoped orphan cleanup, and migration `20260908235742_engineering_document_unlinked_storage_cleanup`.
- PR #113 — repository-derived migration-level truth in `/api/health` and Hosted QA; manual migration timestamp bookkeeping is no longer release authority.

PR #113 was reviewed at exact final head and merged only after all four protected checks passed. Its database suite successfully completed isolated local Supabase startup, clean migration replay, pgTAP, and historical upgrade-path validation.

## Deployment topology

HydroQualiSense remains:

`one source repository -> many isolated client deployments`

Each operational deployment remains:

`one deployment -> one client company -> active membership/RBAC -> permitted workflows`

Unrelated clients do not share operational databases, Auth, Storage, or secrets.

### QA

- URL: `https://hydroqualisense-qa.onrender.com`
- Render service: `hydroqualisense-qa`
- Supabase ref: `vrpuznofrntyqsbugrib`
- role: isolated QA + temporary synthetic demo environment
- Supabase project status: `ACTIVE_HEALTHY`
- exact live Render deploy: `8f43ac9320ddaf4ce6076ee8f6f37fa4f9002eba`
- observed QA migration head: `20260908235742_engineering_document_unlinked_storage_cleanup`

No migration push/reset was run simply because certification resumed. QA already matched the approved repository migration chain.

Current live QA data-level facts:

- one synthetic deployment company and singleton deployment configuration;
- two Auth users and two active company memberships at this checkpoint;
- no current `company_ai_settings` / configured AI credential for the synthetic QA company;
- `bootstrap_deployment_company(...)` and `bootstrap_deployment_company_ai_credential(...)` remain service-role-only `SECURITY DEFINER` functions.

Do not copy production financial, payroll, worker, Auth, document, or Storage data into QA.

### Client A production

- URL: `https://hydroqualisense.com`
- Supabase ref: `qijjshdwiylojvqojxyz`
- role: real Client A production
- Supabase project status: `ACTIVE_HEALTHY`
- read-only observed database migration head on 2026-09-09: `20260908235742_engineering_document_unlinked_storage_cleanup`

Production inspection in this continuation was SELECT/read-only only. No production DDL/DML, Auth/Storage mutation, secret/config write, reset, seed, or side-effecting RPC call was performed by ChatGPT.

A fresh production `/api/health` response body was not available through the connected runtime tools during this checkpoint, so do not infer current production Render release identity from database state alone.

## Release / migration truth — PASS

PR #113 removed the repeated migration-level bookkeeping hazard:

- application release metadata derives the expected migration level from canonical `supabase/migrations/*.sql` filenames in the exact repository checkout;
- Hosted QA derives its expected migration level from that same exact checkout;
- stale legacy migration env values do not override repository truth.

Database migration promotion remains independently verified against the live database migration history.

## Routine app deploy vs migration promotion — PASS

Connected Render QA configuration currently shows:

```text
build: npm install && npm run build
start: npm start
branch: main
auto deploy: yes
```

Repository scripts show:

```text
build -> theme build + vite build + esbuild server bundle
start -> node dist/server.cjs
qa:db:push -> guarded Supabase QA migration wrapper
qa:db:reset -> separately guarded QA reset wrapper
```

No migration promotion command is in routine Render build/start. App redeploy and database promotion remain separate decisions. Preserve this contract.

## Hosted QA evidence

The latest completed manual Hosted QA Certification artifact still belongs to older SHA `61addbfabf12493ef115e248c246f0b919aa8014`, so it cannot certify current `main`.

That older run established useful historical evidence:

- email/password auth preflight: PASS;
- persisted auth after reload: PASS;
- fresh-navigation auth persistence: PASS;
- health/deployment identity for that old exact SHA: PASS;
- five of seven route-readiness checks: PASS;
- two route-readiness failures had HTTP 200, correct final paths, and no crash text/page error/console error/failed-request signal;
- old Storage probe: FAIL.

PR #112 specifically replaced the brittle readiness timing and repaired the Storage probe to use a valid Engineering Document/Revision fixture and authorized byte upload/read. Those fixes are now merged and live.

**Still required:** dispatch a brand-new manual `Hosted QA Certification` workflow on current exact `main` and retain the artifact showing all seven authenticated routes plus Storage byte probe PASS. The connected GitHub capability used in this session can inspect/rerun existing jobs but cannot initiate a new `workflow_dispatch`; do not rerun an older SHA and call it current evidence.

## Supabase Auth provider state — BLOCKER

Fresh QA security-advisor output on 2026-09-09 still reports:

`Leaked Password Protection Disabled` — WARN

The current connected Supabase tools do not expose the provider Auth Site URL, redirect allow-list, or password-security settings for read/write management.

Before READY, an authorized operator must verify in the QA Supabase dashboard/provider configuration:

1. Site URL = `https://hydroqualisense-qa.onrender.com`.
2. Redirect allow-list covers the approved hosted confirmation/recovery URLs.
3. Leaked-password protection is enabled.
4. Fresh advisor/provider evidence is retained after the change.

Unavailable provider evidence is not a pass.

## QA initial AI bootstrap — BLOCKER

The repository-side AI bootstrap contract exists and its privileged database function is service-role-only, but live QA has no configured AI credential/settings record yet.

Required before READY:

1. initial authorized QA operator opens Settings → Deployment AI bootstrap;
2. submits an approved QA Gemini credential through the normal authenticated server workflow;
3. server encrypts and stores only the credential envelope;
4. provider validation is run and the bounded status is recorded;
5. no plaintext key is put in SQL, repository files, browser storage, logs, or handoff documentation.

Merged PR #109's bounded recovery path remains the authority if the initial credential is invalid.

## Recovery evidence — BLOCKER

The Supabase organization is currently on the **Free** plan.

Current provider documentation says:

- automatic daily backups are provided for Pro/Team/Enterprise projects;
- Free projects should regularly create their own off-site database exports;
- database backups do not restore Supabase Storage object bytes.

Current QA application recovery records are also empty:

```text
database_backup_runs = 0
database_restore_drills = 0
document_backup_replicas = 0
```

These empty tables do not prove provider backup absence or presence, but they provide no recovery certification evidence.

Before READY obtain and retain:

1. current off-site PostgreSQL backup/export for QA;
2. isolated PostgreSQL restore drill;
3. separate Storage-object backup;
4. byte-level Storage restore drill with permission/path behavior checked;
5. Render/Supabase/provider configuration and required-secret recovery ownership/inventory, names only in repo evidence;
6. deployment reconstruction/rollback evidence using the approved SHA and migration state.

Never treat database backup as Storage backup.

## Security advisor context

Fresh QA advisor inventory currently reports:

- 7 INFO RLS-enabled/no-policy tables;
- 2 WARN anonymous `SECURITY DEFINER` functions;
- 153 WARN authenticated `SECURITY DEFINER` functions;
- 1 WARN leaked-password protection disabled.

Known context:

- `public.rls_auto_enable()` is provider-owned rather than repository-owned.
- `submit_public_prospect(...)` is intentionally anonymous but remains behind the separate public-prospect database gate, which is not authorized for general QA use merely because QA exists.
- many authenticated `SECURITY DEFINER` RPCs are deliberately callable entrypoints and rely on explicit grants plus internal membership/permission guards.

Do not weaken RLS/RBAC or change function security semantics simply to reduce advisor counts. The leaked-password provider warning is a concrete unresolved configuration gate.

## QA certification verdict

`QA CERTIFICATION: NOT READY`

### Passed / verified

- exact current `main` and live QA deploy match;
- QA Supabase healthy;
- QA migration history independently matches repository migration head `20260908235742`;
- no unnecessary QA migration push/reset was performed;
- repository-derived migration-level bookkeeping is live;
- routine app deploy is separated from deliberate migration promotion;
- QA provider security advisor was freshly re-checked;
- AI bootstrap DB privilege boundary remains service-role-only;
- live QA AI bootstrap state was checked and is truthfully unconfigured;
- production Supabase was re-checked read-only and remains healthy;
- production database head was observed read-only at `20260908235742`.

### Blocking READY

1. QA Supabase Auth Site URL / redirect evidence.
2. QA leaked-password protection enabled and verified.
3. successful current-head manual Hosted QA Certification artifact after PR #112/#113.
4. live QA initial AI bootstrap + provider validation.
5. off-site PostgreSQL backup + isolated restore drill.
6. separate Storage-object backup + byte-level restore drill.
7. deployment/configuration/required-secret recovery evidence.

Do **not** start Worker Registration until these required certification gates are closed and the status is deliberately changed to `QA CERTIFICATION: READY`.

## Immediate operator sequence to reach READY

1. QA Supabase Dashboard → Auth URL configuration: verify QA Site URL and approved redirect URLs.
2. QA Supabase Auth password/security settings: enable leaked-password protection; retain evidence; re-run security advisor.
3. In authenticated QA Settings, complete Deployment AI bootstrap with the approved QA Gemini credential and run provider validation.
4. GitHub Actions → manually dispatch `Hosted QA Certification` on current `main`; require health, 7/7 routes, and Storage PASS; retain the generated artifact.
5. Create an off-site QA database dump and restore it to an isolated recovery target.
6. Back up representative QA Storage object bytes separately and complete an isolated restore/read/hash/permission drill.
7. Record deployment reconstruction/rollback and required configuration/secret ownership without recording secret values.
8. Re-check exact `main`, Render QA deploy, QA migration history, Auth advisor, current Hosted QA artifact, recovery evidence, and production separation.
9. Only then set `QA CERTIFICATION: READY` and prepare Worker Registration immediately.

## Next phase after READY — Worker Registration foundation

Target:

`project/site QR -> PENDING worker submission -> supervisor/admin duplicate/identity/project review -> canonical Worker/payroll/project assignment`

Rules:

- registration starts `PENDING`;
- ambiguous duplicates/identity require human review;
- approval creates or links canonical workforce truth;
- project/site assignment and approval history remain auditable;
- uploaded image is evidence/enrollment input, not authoritative identity by itself;
- no face-recognition implementation is authorized in this phase.

After Worker Registration, proceed to Site Attendance state machine/device registration, then Face Recognition only after explicit privacy/security/retention/liveness/confidence/fallback design.

## Permanent invariants

1. `one deployment -> one client company -> active membership/RBAC -> permitted workflows`.
2. Keep company-scoped RLS, permission checks, company-bound integrity, audit boundaries, and company-prefixed Storage paths.
3. Supplier invoice evidence linked to Expense must not duplicate Actual Cost/payable truth.
4. Actual Cost and Committed Cost remain distinct.
5. Client billing/collections remain distinct from supplier obligations and project Actual Cost.
6. Preserve original currency; never invent FX.
7. Finalized/auditable financial, inventory, engineering, payroll, document, and future attendance history changes only through deliberate lifecycle/correction paths.
8. Imported/AI identity is evidence when ambiguous, not canonical truth by default.
9. Inventory balances remain explainable from authoritative movements.
10. Biometric attendance requires explicit privacy, identity, retention/deletion, device, correction, liveness, confidence/fallback, and audit semantics before production use.
11. Consequential AI mutations preserve prepare/validate/human-confirm/execute boundaries.

Still unresolved by design: VAT rate, VAT-inclusive vs VAT-exclusive contract value, withholding/BIR classification, automatic/external FX-provider policy, and broader accounting-period policy. Do not infer them.
