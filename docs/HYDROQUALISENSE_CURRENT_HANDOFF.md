# HydroQualiSense Current Handoff

Status: **CURRENT — QA CERTIFICATION NOT READY**  
Date: **2026-09-09**  
Repository: `Juvialski/InvoiceApp`

Use this with `AGENTS.md`, `docs/AGENT_EXECUTION_EFFICIENCY.md`, `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`, `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`, and `docs/HYDROQUALISENSE_DEPLOYMENT_RUNBOOK.md`. Live repository state remains authoritative.

## Exact current checkpoint

Repository/deployment state before the focused Hosted QA fix:

- merged `main`: `fbb924f40ef91c9d1e9154367dba0e04b092ef76`
- open PRs at checkpoint start: none
- QA Render URL: `https://hydroqualisense-qa.onrender.com`
- QA Render service: `hydroqualisense-qa`
- Render deploy for `fbb924f40ef91c9d1e9154367dba0e04b092ef76`: **LIVE**
- QA Supabase ref: `vrpuznofrntyqsbugrib`
- QA migration head: `20260908235742_engineering_document_unlinked_storage_cleanup`
- Client A production Supabase ref: `qijjshdwiylojvqojxyz`
- production remains strictly read-only throughout QA certification

Recent hardening is complete through PR #115. PR #113 remains the last application-code-bearing hardening merge before the current Hosted QA harness fix; PRs #114/#115 were documentation-only.

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

Render independently reports exact current checkpoint SHA `fbb924f40ef91c9d1e9154367dba0e04b092ef76` as live.

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

## Hosted QA exact-head run — FAILED ON HARNESS READINESS, FIX IN PROGRESS

A manual Hosted QA Certification run was dispatched against exact live SHA:

`fbb924f40ef91c9d1e9154367dba0e04b092ef76`

GitHub run id: `34302642480`

The run failed during `Hosted QA authentication preflight` with:

`Hosted QA sign-in form was not available before authentication.`

Inspection showed the harness navigated to `/dashboard`, waited only 500 ms, then immediately required `#auth-email`. The application legitimately renders a short `Checking your workspace session...` state while Supabase resolves Auth, so the fixed 500 ms check is a harness timing defect rather than evidence of bad credentials, migration drift, Storage failure or route failure.

Focused correction in progress:

- `scripts/hosted-qa-auth-preflight.ts` now waits boundedly for the visible sign-in form instead of sleeping 500 ms;
- production-host refusal is unchanged;
- persisted Supabase session, reload persistence and fresh-navigation persistence checks remain unchanged;
- regression coverage prevents the fixed 500 ms assumption from returning.

After this fix merges and the new exact `main` is live, dispatch Hosted QA once on that exact SHA. Final acceptance requires auth PASS, health identity PASS, 7/7 routes PASS and Engineering Storage probe PASS with no leftover metadata row.

## QA initial AI bootstrap — PENDING

Live QA previously had no configured `company_ai_settings` / AI credential for the synthetic QA company.

The database bootstrap authority remains service-role-only. Before READY, the authorized QA operator must use Settings → Deployment AI bootstrap with an approved QA Gemini credential and run provider validation. The server stores only the encrypted credential envelope.

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

1. merge/deploy the bounded Hosted QA auth-readiness harness fix;
2. successful Hosted QA Certification artifact on the new exact live `main`;
3. live QA AI bootstrap + provider validation;
4. off-site QA PostgreSQL export + isolated restore drill;
5. separate Storage byte backup + isolated restore drill;
6. deployment/configuration recovery evidence.

Do not block READY on paid-only Supabase features unavailable to this Free project. Do not mark READY until the achievable blockers above are closed.

## Immediate sequence

1. Complete the focused Hosted QA preflight fix through exact-head PR CI and merge when safe.
2. Wait for Render QA to report the new exact `main` as live.
3. Manually dispatch `Hosted QA Certification` once on that exact SHA and retain its artifact.
4. Complete Settings → Deployment AI bootstrap and provider validation in QA.
5. Complete the Free-tier-achievable database and Storage recovery drills.
6. Re-check exact main/deploy/migration/Auth/Hosted QA/recovery evidence.
7. If all achievable gates pass, set `QA CERTIFICATION: READY`.
8. Immediately prepare Worker Registration foundation.

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
